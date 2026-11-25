/* PAYOPS AI Copilot (IDS 517, Tanjiba Sultana)
   M3 settlement dashboard, totals, AI day summary
   Owner: Tanjiba Sultana
   Load order: see index.html */
"use strict";

/* =====================================================================
   M3  Settlement dashboard and AI day summary   (owner: Tanjiba)
   ===================================================================== */
const TYPES = ["card", "wallet", "bank", "chargeback"];
function totals() {
  const rows = TYPES.map(t => {
    const xs = S.payments.filter(p => p.type === t);
    const settledLike = xs.filter(p => ["SETTLED", "CHARGED_BACK", "REFUNDED"].includes(p.status));
    return { type: TYPE_NAME[t], count: xs.length, settled: settledLike.length,
      held: xs.filter(p => p.status === "PENDING_REVIEW").length, rejected: xs.filter(p => p.status === "REJECTED").length, contested: xs.filter(p => p.status === "CONTESTED").length, refunds: round2(xs.reduce((a, p) => a + (p.refunded || 0), 0)),
      grossSettled: round2(settledLike.reduce((a, p) => a + p.amount, 0)), fees: round2(settledLike.reduce((a, p) => a + p.fee, 0)),
      net: round2(xs.reduce((a, p) => a + netOf(p), 0)), avgRisk: xs.length ? Math.round(xs.reduce((a, p) => a + p.risk, 0) / xs.length) : 0 };
  });
  const sum = k => round2(rows.reduce((a, r) => a + r[k], 0));
  rows.push({ type: "Total", count: sum("count"), settled: sum("settled"), held: sum("held"), rejected: sum("rejected"), contested: sum("contested"), refunds: sum("refunds"), grossSettled: sum("grossSettled"), fees: sum("fees"), net: sum("net"),
    avgRisk: S.payments.length ? Math.round(S.payments.reduce((a, p) => a + p.risk, 0) / S.payments.length) : 0 });
  return rows;
}
async function aiDaySummary() {
  const t = totals();
  const held = queue().map(p => ({ id: p.id, type: TYPE_NAME[p.type], amount: p.amount, risk: p.risk, reasons: p.reasons }));
  const prompt = `You are writing the end-of-day brief for a payments operations manager using PayOps. Use only these figures; do not calculate new totals.\nTotals by type: ${JSON.stringify(t)}\nStill held for review: ${JSON.stringify(held)}\nRejected today: ${S.payments.filter(p => p.status === "REJECTED").length}\nWrite exactly 5 short bullet lines, each starting with "- ": net settlement and fees, volume by type, what is still held and why, the main risk to watch, one recommended action for tomorrow. Plain text, no headings.`;
  const { text } = await AI(prompt, { modelTier: "quick", cache: false });
  audit("AI", "DAY_SUMMARY", text.slice(0, 300));
  return text;
}
function csv(rows) { return rows.map(r => r.map(v => { const s = String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(",")).join("\n"); }
