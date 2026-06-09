"use client";
import { useEffect, useState, useRef } from "react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

// ── Types ─────────────────────────────────────────────────────────────────────
interface MonthlyMetric {
  month: number; date: string; n_samples: number;
  psi: number; psi_status: string; auc: number; accuracy: number; avg_score: number;
  demographic_parity: { group_rates: Record<string, number>; disparity_gap: number; status: string };
  equal_opportunity: { group_tprs: Record<string, number>; tpr_gap: number; status: string };
  missing_pct: number; outlier_pct: number;
}
interface Alert { type: string; message: string; }
interface DashboardData {
  model_name: string; compliance_score: number; risk_rating: string;
  alert_count: number; alerts: Alert[]; monthly_metrics: MonthlyMetric[];
  summary: string;
  osfi_e23_status: Record<string, string>;
}

// ── Palette ───────────────────────────────────────────────────────────────────
const C = {
  bg: "#080C10", surface: "#0D1117", border: "#1C2333",
  accent: "#00D4AA", warn: "#F59E0B", danger: "#EF4444",
  muted: "#4B5563", text: "#E2E8F0", dim: "#94A3B8",
  drift: "#F97316",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function riskColor(r: string) {
  if (r === "Low") return C.accent;
  if (r === "Medium") return C.warn;
  if (r === "High") return C.drift;
  return C.danger;
}
function statusBadge(s: string) {
  const ok = s === "Compliant" || s === "Stable" || s === "Pass";
  return ok ? C.accent : C.danger;
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 20 }}
      className={className}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: "0.15em",
      color: C.dim, textTransform: "uppercase", marginBottom: 12 }}>
      {children}
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
      border: `1px solid ${color}30`, borderRadius: 4, background: `${color}10` }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      <span style={{ fontFamily: "monospace", fontSize: 11, color: C.dim }}>{label}</span>
      <span style={{ fontFamily: "monospace", fontSize: 12, color, fontWeight: 700 }}>{value}</span>
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 6, padding: "10px 14px", fontFamily: "monospace", fontSize: 11 }}>
      <div style={{ color: C.dim, marginBottom: 6 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: <strong>{typeof p.value === "number" ? p.value.toFixed(4) : p.value}</strong>
        </div>
      ))}
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const loadDemo = async () => {
    setLoading(true); setError("");
    try {
      const r = await fetch(`${API}/demo`);
      setData(await r.json());
    } catch { setError("Cannot reach API. Make sure the backend is running."); }
    setLoading(false);
  };

  useEffect(() => { loadDemo(); }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true); setError("");
    const fd = new FormData(); fd.append("file", file);
    try {
      const r = await fetch(`${API}/analyze`, { method: "POST", body: fd });
      if (!r.ok) { const j = await r.json(); throw new Error(j.detail); }
      setData(await r.json());
    } catch (err: any) { setError(err.message); }
    setUploading(false);
  };

  if (loading) return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex",
      alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontFamily: "monospace", color: C.accent, fontSize: 13 }}>
        Loading model telemetry…
      </div>
    </div>
  );

  const metrics = data?.monthly_metrics ?? [];
  const chartData = metrics.map(m => ({
    date: m.date, month: `M${m.month}`,
    psi: m.psi, auc: m.auc, accuracy: m.accuracy,
    avg_score: m.avg_score,
    dp_gap: m.demographic_parity?.disparity_gap ?? 0,
    eo_gap: m.equal_opportunity?.tpr_gap ?? 0,
  }));

  const score = data?.compliance_score ?? 0;
  const risk = data?.risk_rating ?? "Unknown";

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.text,
      fontFamily: "'Inter', system-ui, sans-serif" }}>

      {/* ── Header ── */}
      <header style={{ borderBottom: `1px solid ${C.border}`, padding: "14px 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 28, height: 28, background: `${C.accent}20`,
            border: `1px solid ${C.accent}50`, borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 14 }}>⬡</span>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.02em" }}>
              Model Risk Dashboard
            </div>
            <div style={{ fontSize: 10, fontFamily: "monospace", color: C.dim, letterSpacing: "0.1em" }}>
              OSFI E-23 ALIGNED · CONTINUOUS MONITORING
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <a href="https://osfi-navigator-frontend.vercel.app" target="_blank" rel="noreferrer"
            style={{ fontFamily: "monospace", fontSize: 10, color: C.dim,
              textDecoration: "none", padding: "5px 10px", border: `1px solid ${C.border}`,
              borderRadius: 4 }}>
            OSFI Navigator ↗
          </a>
          <a href="https://osfi-audit-copilot-frontend.vercel.app" target="_blank" rel="noreferrer"
            style={{ fontFamily: "monospace", fontSize: 10, color: C.dim,
              textDecoration: "none", padding: "5px 10px", border: `1px solid ${C.border}`,
              borderRadius: 4 }}>
            Audit Copilot ↗
          </a>
          <button onClick={loadDemo}
            style={{ fontFamily: "monospace", fontSize: 10, color: C.accent,
              background: `${C.accent}15`, border: `1px solid ${C.accent}40`,
              borderRadius: 4, padding: "5px 12px", cursor: "pointer" }}>
            ↺ Demo Data
          </button>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }}
            onChange={handleUpload} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            style={{ fontFamily: "monospace", fontSize: 10, color: C.text,
              background: C.border, border: `1px solid ${C.muted}`,
              borderRadius: 4, padding: "5px 12px", cursor: "pointer" }}>
            {uploading ? "Analyzing…" : "↑ Upload CSV"}
          </button>
        </div>
      </header>

      {error && (
        <div style={{ margin: "12px 32px", padding: "10px 16px",
          background: `${C.danger}15`, border: `1px solid ${C.danger}40`,
          borderRadius: 6, fontFamily: "monospace", fontSize: 11, color: C.danger }}>
          ⚠ {error}
        </div>
      )}

      <main style={{ padding: "24px 32px", maxWidth: 1400, margin: "0 auto" }}>

        {/* ── Model identity bar ── */}
        <div style={{ marginBottom: 24, display: "flex", alignItems: "center",
          justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>
              {data?.model_name}
            </div>
            <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{data?.summary}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.entries(data?.osfi_e23_status ?? {}).map(([k, v]) => (
              <StatPill key={k} label={k.replace(/_/g, " ")} value={v}
                color={statusBadge(v)} />
            ))}
          </div>
        </div>

        {/* ── Score + Alerts row ── */}
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, marginBottom: 16 }}>
          <Card>
            <SectionLabel>Compliance Score</SectionLabel>
            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <div style={{ fontSize: 52, fontWeight: 900, lineHeight: 1,
                color: riskColor(risk), fontVariantNumeric: "tabular-nums" }}>
                {score}
              </div>
              <div style={{ fontSize: 11, fontFamily: "monospace", color: C.dim,
                marginTop: 4, letterSpacing: "0.05em" }}>/ 100</div>
              <div style={{ marginTop: 12, display: "inline-block", padding: "3px 12px",
                background: `${riskColor(risk)}20`, border: `1px solid ${riskColor(risk)}50`,
                borderRadius: 4, fontSize: 11, fontFamily: "monospace",
                color: riskColor(risk), letterSpacing: "0.1em" }}>
                {risk.toUpperCase()} RISK
              </div>
              <div style={{ marginTop: 16, height: 4, borderRadius: 2,
                background: C.border, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${score}%`,
                  background: riskColor(risk), transition: "width 0.6s ease" }} />
              </div>
            </div>
          </Card>

          <Card>
            <SectionLabel>Active Alerts — {data?.alert_count} Issues Detected</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {data?.alerts.length === 0 && (
                <div style={{ color: C.accent, fontFamily: "monospace", fontSize: 12 }}>
                  ✓ No active alerts
                </div>
              )}
              {data?.alerts.map((a, i) => (
                <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start",
                  padding: "8px 12px", borderRadius: 5,
                  background: a.type === "Critical" ? `${C.danger}10` : `${C.warn}10`,
                  border: `1px solid ${a.type === "Critical" ? C.danger : C.warn}30` }}>
                  <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700,
                    color: a.type === "Critical" ? C.danger : C.warn,
                    whiteSpace: "nowrap", marginTop: 1 }}>
                    {a.type === "Critical" ? "● CRIT" : "▲ WARN"}
                  </span>
                  <span style={{ fontSize: 12, color: C.text, lineHeight: 1.5 }}>
                    {a.message}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ── Charts row 1: Drift + Performance ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <Card>
            <SectionLabel>Population Stability Index — Drift Monitor</SectionLabel>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="psiGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.drift} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={C.drift} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="month" tick={{ fill: C.dim, fontSize: 10, fontFamily: "monospace" }} />
                <YAxis tick={{ fill: C.dim, fontSize: 10, fontFamily: "monospace" }} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0.1} stroke={C.warn} strokeDasharray="4 2"
                  label={{ value: "Moderate", fill: C.warn, fontSize: 9, fontFamily: "monospace" }} />
                <ReferenceLine y={0.25} stroke={C.danger} strokeDasharray="4 2"
                  label={{ value: "Critical", fill: C.danger, fontSize: 9, fontFamily: "monospace" }} />
                <Area type="monotone" dataKey="psi" name="PSI"
                  stroke={C.drift} fill="url(#psiGrad)" strokeWidth={2} dot={{ fill: C.drift, r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <SectionLabel>Model Performance — AUC & Accuracy Trend</SectionLabel>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="month" tick={{ fill: C.dim, fontSize: 10, fontFamily: "monospace" }} />
                <YAxis domain={[0.4, 0.75]} tick={{ fill: C.dim, fontSize: 10, fontFamily: "monospace" }} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0.65} stroke={C.danger} strokeDasharray="4 2"
                  label={{ value: "Min AUC", fill: C.danger, fontSize: 9, fontFamily: "monospace" }} />
                <Line type="monotone" dataKey="auc" name="AUC"
                  stroke={C.accent} strokeWidth={2} dot={{ fill: C.accent, r: 3 }} />
                <Line type="monotone" dataKey="accuracy" name="Accuracy"
                  stroke={C.dim} strokeWidth={1.5} strokeDasharray="4 2"
                  dot={{ fill: C.dim, r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* ── Charts row 2: Bias + Score dist ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <Card>
            <SectionLabel>Bias & Fairness — Demographic Parity Gap</SectionLabel>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="month" tick={{ fill: C.dim, fontSize: 10, fontFamily: "monospace" }} />
                <YAxis tick={{ fill: C.dim, fontSize: 10, fontFamily: "monospace" }} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine y={0.1} stroke={C.danger} strokeDasharray="4 2"
                  label={{ value: "Threshold", fill: C.danger, fontSize: 9, fontFamily: "monospace" }} />
                <Bar dataKey="dp_gap" name="DP Gap" fill={C.warn} radius={[2, 2, 0, 0]} />
                <Bar dataKey="eo_gap" name="EO Gap" fill={C.drift} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <SectionLabel>Average Score Distribution — Score Inflation Detector</SectionLabel>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.accent} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={C.accent} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="month" tick={{ fill: C.dim, fontSize: 10, fontFamily: "monospace" }} />
                <YAxis domain={[0.3, 0.6]} tick={{ fill: C.dim, fontSize: 10, fontFamily: "monospace" }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="avg_score" name="Avg Score"
                  stroke={C.accent} fill="url(#scoreGrad)" strokeWidth={2}
                  dot={{ fill: C.accent, r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* ── Monthly breakdown table ── */}
        <Card>
          <SectionLabel>Monthly Monitoring Log — OSFI E-23 §4 Surveillance Record</SectionLabel>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse",
              fontFamily: "monospace", fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {["Period", "Samples", "PSI", "Drift Status", "AUC", "Accuracy",
                    "DP Gap", "EO Gap", "Bias Status"].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "8px 12px",
                      color: C.dim, fontWeight: 600, letterSpacing: "0.05em" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.map((m, i) => {
                  const dpFail = m.demographic_parity?.status === "Fail";
                  const driftBad = m.psi_status !== "Stable";
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${C.border}20`,
                      background: driftBad || dpFail ? `${C.danger}05` : "transparent" }}>
                      <td style={{ padding: "8px 12px", color: C.text }}>{m.date}</td>
                      <td style={{ padding: "8px 12px", color: C.dim }}>{m.n_samples}</td>
                      <td style={{ padding: "8px 12px",
                        color: m.psi >= 0.25 ? C.danger : m.psi >= 0.1 ? C.warn : C.accent }}>
                        {m.psi.toFixed(4)}
                      </td>
                      <td style={{ padding: "8px 12px",
                        color: m.psi_status === "Stable" ? C.accent :
                          m.psi_status === "Moderate Shift" ? C.warn : C.danger }}>
                        {m.psi_status}
                      </td>
                      <td style={{ padding: "8px 12px",
                        color: m.auc < 0.65 ? C.danger : m.auc < 0.72 ? C.warn : C.accent }}>
                        {m.auc.toFixed(4)}
                      </td>
                      <td style={{ padding: "8px 12px", color: C.dim }}>
                        {m.accuracy.toFixed(4)}
                      </td>
                      <td style={{ padding: "8px 12px",
                        color: (m.demographic_parity?.disparity_gap ?? 0) > 0.1 ? C.danger : C.dim }}>
                        {(m.demographic_parity?.disparity_gap ?? 0).toFixed(4)}
                      </td>
                      <td style={{ padding: "8px 12px",
                        color: (m.equal_opportunity?.tpr_gap ?? 0) > 0.1 ? C.warn : C.dim }}>
                        {(m.equal_opportunity?.tpr_gap ?? 0).toFixed(4)}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        <span style={{ color: statusBadge(m.demographic_parity?.status ?? ""),
                          letterSpacing: "0.05em" }}>
                          {m.demographic_parity?.status ?? "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ── Footer ── */}
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${C.border}`,
          display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: C.muted }}>
            OSFI E-23 Model Risk Dashboard · AI Governance Stack · Chris Pienaah
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            {["OSFI Navigator", "Audit Copilot", "CanFinBench-SFT", "GenAI Reliability Framework"].map(t => (
              <span key={t} style={{ fontFamily: "monospace", fontSize: 10, color: C.muted }}>
                {t}
              </span>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
