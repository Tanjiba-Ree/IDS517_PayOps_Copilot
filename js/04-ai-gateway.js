/* PAYOPS AI Copilot (IDS 517, Tanjiba Sultana)
   AI gateway: connection to Claude and the read-only AI tools
   Owner: Tanjiba Sultana
   Load order: see index.html */
"use strict";

/* =====================================================================
   Shared: AI gateway (claude.ai artifact runtime, capability "sample")
   ===================================================================== */
let AI = null, AI_TOOLS = false;
const AI_OFF_MSG = () => window.claude
  ? "AI is still connecting or was not allowed. Wait a few seconds or refresh; if claude.ai asks to allow Claude, choose Allow."
  : "AI runs only when you open this app from its claude.ai link. This is a downloaded copy, so AI features are off here.";
function aiError(e) {
  const c = e && e.code;
  if (c === "not_granted" || c === "sampling_disabled" || c === "capability_disabled") { return "AI is turned off for this view. The rest of the app still works."; }
  if (c === "rate_limited") return "AI is busy or your usage limit was reached. Try again in a minute.";
  if (c === "invalid_json") return "The AI reply could not be read as data. Try again.";
  if (c === "cancelled") return "Stopped.";
  return "The AI request failed. Try again.";
}
const slim = p => p && ({ id: p.id, type: TYPE_NAME[p.type], party: p.party, amount: p.amount, createdAt: p.createdAt, status: p.status, fee: p.fee, net: netOf(p), riskScore: p.risk, riskReasons: p.reasons, details: p.details, rejectReason: p.rejectReason || undefined });
function partyHistory(party) {
  const xs = S.payments.filter(x => x.party.toLowerCase() === String(party).toLowerCase());
  return { party, count: xs.length, total: round2(xs.reduce((a, x) => a + x.amount, 0)),
    byStatus: xs.reduce((a, x) => (a[x.status] = (a[x.status] || 0) + 1, a), {}),
    chargebacks: xs.filter(x => x.status === "CHARGED_BACK").map(x => x.id),
    payments: xs.slice(-10).map(x => ({ id: x.id, type: TYPE_NAME[x.type], amount: x.amount, status: x.status, risk: x.risk })) };
}
/* Tools the AI may call. They only READ data; people change data. */
const TOOLS = {
  get_transaction: { description: "Returns one payment by id (e.g. CRD-0004): masked details, fee, net, rule-based risk score and reasons, status.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    execute: ({ id }) => { const p = S.payments.find(x => x.id === String(id).toUpperCase().trim()); if (!p) throw new Error("No payment with id " + id); return slim(p); } },
  get_party_history: { description: "Returns a customer's or payer's payment history: count, total, statuses, chargebacks and their last 10 payments.",
    inputSchema: { type: "object", properties: { party: { type: "string" } }, required: ["party"] },
    execute: ({ party }) => partyHistory(String(party)) },
  get_risk_rules: { description: "Returns PayOps limits, risk thresholds (held at 70+, medium 40-69), the risk point rules per payment type, fee rules, refund and undo rules.",
    execute: () => RULES },
  get_review_queue: { description: "Returns payments held for manual review, oldest first.",
    execute: () => queue().map(slim) },
  get_dispute_playbook: { description: "Returns the team's playbook for a card dispute reason code (10.4, 13.1, 13.3, 12.6, 13.6): evidence to collect, when to contest, when to accept, and the response time.",
    inputSchema: { type: "object", properties: { reasonCode: { type: "string" } }, required: ["reasonCode"] },
    execute: ({ reasonCode }) => { const k = String(reasonCode || "").trim(); if (!PLAYBOOK[k]) throw new Error("Unknown reason code " + reasonCode); return Object.assign({ reasonCode: k, name: REASON_CODES[k] }, PLAYBOOK[k]); } },
  find_drive_evidence: { description: "Searches the team's Google Drive (through the Google Drive MCP connector) for evidence files named 'PAYOPS evidence <payment id>' and returns their titles, short excerpts and dates. Read-only.",
    inputSchema: { type: "object", properties: { paymentId: { type: "string" } }, required: ["paymentId"] },
    execute: async ({ paymentId }) => {
      if (!MCP) throw new Error("Google Drive is not connected in this view");
      const files = await findDriveEvidence(String(paymentId || "").toUpperCase().trim());
      return files.map(f => ({ title: f.title, excerpt: f.snippet, modified: f.modified }));
    } },
  get_totals: { description: "Returns today's settlement totals by payment type: count, settled, held, rejected, gross settled, fees, net, average risk.",
    execute: () => totals() },
  quote_payment: { description: "Calculates the exact fee and risk score with the rules engine for a hypothetical payment. type is card, wallet, bank or chargeback.",
    inputSchema: { type: "object", properties: { type: { type: "string" }, amount: { type: "number" }, online: { type: "boolean" }, international: { type: "boolean" }, newDevice: { type: "boolean" }, rail: { type: "string" }, newBeneficiary: { type: "boolean" }, reasonCode: { type: "string" } }, required: ["type", "amount"] },
    execute: (a) => { const type = String(a.type).toLowerCase(); const p = { type, amount: Number(a.amount), details: { online: !!a.online, international: !!a.international, newDevice: !!a.newDevice, rail: a.rail === "ACH" ? "ACH" : "RTP", newBeneficiary: !!a.newBeneficiary, reasonCode: String(a.reasonCode || "13.1") } };
      if (!PREFIX[type]) throw new Error("type must be card, wallet, bank or chargeback");
      const lim = type === "bank" ? RULES.limits[p.details.rail] : RULES.limits[type]; const r = riskOf(p);
      return { fee: feeOf(p), riskScore: r.score, riskReasons: r.reasons, decision: r.score >= 70 ? "HELD for review" : r.score >= 40 ? "SETTLED, medium flag" : "SETTLED", withinLimit: lim ? p.amount <= lim : true, limit: lim || null }; } }
};
const toolList = names => names.map(n => ({ name: n, description: TOOLS[n].description, inputSchema: TOOLS[n].inputSchema, execute: (input) => { const out = TOOLS[n].execute(input || {}); audit("AI", "TOOL_CALL", `${n} ${JSON.stringify(input || {})}`); return out; } }));
