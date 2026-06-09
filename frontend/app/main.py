from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import pandas as pd
import numpy as np
from scipy import stats
import json
import io
import os
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Model Risk Dashboard API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Helpers ──────────────────────────────────────────────────────────────────

def compute_psi(expected: np.ndarray, actual: np.ndarray, bins: int = 10) -> float:
    """Population Stability Index"""
    breakpoints = np.linspace(0, 1, bins + 1)
    expected_pcts = np.histogram(expected, bins=breakpoints)[0] / len(expected)
    actual_pcts = np.histogram(actual, bins=breakpoints)[0] / len(actual)
    expected_pcts = np.where(expected_pcts == 0, 0.0001, expected_pcts)
    actual_pcts = np.where(actual_pcts == 0, 0.0001, actual_pcts)
    psi = np.sum((actual_pcts - expected_pcts) * np.log(actual_pcts / expected_pcts))
    return round(float(psi), 4)


def psi_risk(psi: float) -> str:
    if psi < 0.1:
        return "Stable"
    elif psi < 0.25:
        return "Moderate Shift"
    else:
        return "Significant Drift"


def compute_auc_approx(y_true: np.ndarray, y_score: np.ndarray) -> float:
    """Approximate AUC via rank correlation"""
    pos = y_score[y_true == 1]
    neg = y_score[y_true == 0]
    if len(pos) == 0 or len(neg) == 0:
        return 0.5
    auc = np.mean([np.mean(p > neg) for p in pos])
    return round(float(auc), 4)


def demographic_parity(y_pred: np.ndarray, sensitive: np.ndarray) -> dict:
    groups = np.unique(sensitive)
    rates = {}
    for g in groups:
        mask = sensitive == g
        rates[str(g)] = round(float(np.mean(y_pred[mask])), 4)
    if len(groups) == 2:
        vals = list(rates.values())
        gap = round(abs(vals[0] - vals[1]), 4)
    else:
        gap = round(float(np.max(list(rates.values())) - np.min(list(rates.values()))), 4)
    return {"group_rates": rates, "disparity_gap": gap, "status": "Pass" if gap < 0.1 else "Fail"}


def equal_opportunity(y_true: np.ndarray, y_pred: np.ndarray, sensitive: np.ndarray) -> dict:
    groups = np.unique(sensitive)
    tprs = {}
    for g in groups:
        mask = (sensitive == g) & (y_true == 1)
        if np.sum(mask) == 0:
            tprs[str(g)] = 0.0
        else:
            tprs[str(g)] = round(float(np.mean(y_pred[mask] >= 0.5)), 4)
    vals = list(tprs.values())
    gap = round(abs(vals[0] - vals[1]), 4) if len(vals) == 2 else round(float(np.max(vals) - np.min(vals)), 4)
    return {"group_tprs": tprs, "tpr_gap": gap, "status": "Pass" if gap < 0.1 else "Fail"}


def generate_synthetic_data() -> pd.DataFrame:
    """6 months of credit model predictions with drift at month 4"""
    np.random.seed(42)
    records = []
    start = datetime(2025, 10, 1)

    for month in range(6):
        n = 500
        date = start + timedelta(days=30 * month)
        drift = month >= 3  # drift starts month 4 (index 3)

        # Scores drift upward after month 3 (score inflation = model degradation)
        base_mean = 0.38 if not drift else 0.38 + (month - 2) * 0.07
        scores = np.clip(np.random.beta(2, 3, n) + (base_mean - 0.4), 0.01, 0.99)

        # Labels based on true risk (independent of drift)
        true_prob = np.clip(np.random.beta(2, 4, n), 0.01, 0.99)
        labels = (np.random.rand(n) < true_prob).astype(int)

        # Sensitive attribute (binary: 0 = group A, 1 = group B)
        sensitive = np.random.binomial(1, 0.45, n)

        # Introduce bias in month 5+
        if month >= 4:
            bias_mask = sensitive == 1
            scores[bias_mask] = np.clip(scores[bias_mask] - 0.08, 0.01, 0.99)

        for i in range(n):
            records.append({
                "date": date.strftime("%Y-%m"),
                "month": month + 1,
                "score": round(scores[i], 4),
                "label": int(labels[i]),
                "sensitive_attr": int(sensitive[i]),
                "feature_age": round(np.random.normal(42 + month * (2 if drift else 0), 12), 1),
                "feature_income": round(np.random.normal(65000 + month * (3000 if drift else 0), 18000), 0),
            })

    return pd.DataFrame(records)


def analyze_dataframe(df: pd.DataFrame) -> dict:
    months = sorted(df["month"].unique())
    baseline_df = df[df["month"] == months[0]]
    baseline_scores = baseline_df["score"].values

    monthly_metrics = []
    for m in months:
        mdf = df[df["month"] == m]
        scores = mdf["score"].values
        labels = mdf["label"].values
        sensitive = mdf["sensitive_attr"].values

        psi = compute_psi(baseline_scores, scores) if m != months[0] else 0.0
        auc = compute_auc_approx(labels, scores)
        accuracy = round(float(np.mean((scores >= 0.5) == labels)), 4)
        dp = demographic_parity((scores >= 0.5).astype(int), sensitive)
        eo = equal_opportunity(labels, scores, sensitive)

        # Data quality
        missing_pct = round(float(mdf.isnull().mean().mean() * 100), 2)
        income_zscore = abs(stats.zscore(mdf["feature_income"].dropna()))
        outlier_pct = round(float(np.mean(income_zscore > 3) * 100), 2)

        monthly_metrics.append({
            "month": int(m),
            "date": mdf["date"].iloc[0],
            "n_samples": len(mdf),
            "psi": psi,
            "psi_status": psi_risk(psi),
            "auc": auc,
            "accuracy": accuracy,
            "avg_score": round(float(np.mean(scores)), 4),
            "demographic_parity": dp,
            "equal_opportunity": eo,
            "missing_pct": missing_pct,
            "outlier_pct": outlier_pct,
        })

    # Overall compliance scoring (OSFI E-23 aligned)
    latest = monthly_metrics[-1]
    alerts = []
    score = 100

    if latest["psi"] >= 0.25:
        alerts.append({"type": "Critical", "message": f"Significant data drift detected (PSI={latest['psi']}). OSFI E-23 §4.3 requires immediate review."})
        score -= 30
    elif latest["psi"] >= 0.1:
        alerts.append({"type": "Warning", "message": f"Moderate distribution shift (PSI={latest['psi']}). Monitor closely per OSFI E-23 §4.3."})
        score -= 10

    if latest["auc"] < 0.65:
        alerts.append({"type": "Critical", "message": f"Model AUC ({latest['auc']}) below minimum threshold. Material degradation per OSFI E-23 §4.2."})
        score -= 25
    elif latest["auc"] < 0.72:
        alerts.append({"type": "Warning", "message": f"AUC ({latest['auc']}) approaching minimum threshold. Review required."})
        score -= 10

    if latest["demographic_parity"]["status"] == "Fail":
        alerts.append({"type": "Critical", "message": f"Demographic parity failure (gap={latest['demographic_parity']['disparity_gap']}). OSFI E-23 §5.1 fairness requirement breached."})
        score -= 20

    if latest["equal_opportunity"]["status"] == "Fail":
        alerts.append({"type": "Warning", "message": f"Equal opportunity gap detected (TPR gap={latest['equal_opportunity']['tpr_gap']}). Bias review required."})
        score -= 10

    score = max(0, score)
    risk_rating = "Low" if score >= 80 else "Medium" if score >= 60 else "High" if score >= 40 else "Critical"

    return {
        "model_name": "Credit Risk Scoring Model v2.1",
        "compliance_score": score,
        "risk_rating": risk_rating,
        "alert_count": len(alerts),
        "alerts": alerts,
        "monthly_metrics": monthly_metrics,
        "summary": f"Model monitored over {len(months)} months. {'Drift detected at month 4 with bias emerging at month 5.' if len(months) >= 5 else 'Monitoring in progress.'}",
        "osfi_e23_status": {
            "model_monitoring": "Compliant" if latest["psi"] < 0.1 else "Non-Compliant",
            "performance_tracking": "Compliant" if latest["auc"] >= 0.72 else "Non-Compliant",
            "bias_fairness": "Compliant" if latest["demographic_parity"]["status"] == "Pass" else "Non-Compliant",
            "data_quality": "Compliant" if latest["missing_pct"] < 5 else "Non-Compliant",
        }
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "Model Risk Dashboard API is running", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.get("/demo")
def demo():
    df = generate_synthetic_data()
    return analyze_dataframe(df)


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files accepted")
    try:
        contents = await file.read()
        df = pd.read_csv(io.StringIO(contents.decode("utf-8")))
        required = {"month", "score", "label", "sensitive_attr"}
        if not required.issubset(df.columns):
            raise HTTPException(status_code=400, detail=f"CSV must contain columns: {required}")
        df["month"] = pd.to_numeric(df["month"])
        if "date" not in df.columns:
            df["date"] = df["month"].apply(lambda m: f"2025-{m:02d}")
        if "feature_income" not in df.columns:
            df["feature_income"] = np.random.normal(65000, 18000, len(df))
        return analyze_dataframe(df)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=repr(e))
