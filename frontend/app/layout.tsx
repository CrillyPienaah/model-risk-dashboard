import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Model Risk Dashboard — OSFI E-23",
  description: "Continuous model monitoring and drift detection aligned to OSFI Guideline E-23",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
