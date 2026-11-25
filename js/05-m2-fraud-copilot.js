/* PAYOPS AI Copilot (IDS 517, Tanjiba Sultana)
   M2 fraud and chargeback copilot, review queue, Reopen, AI triage agent
   Owner: Tanjiba Sultana
   Load order: see index.html */
"use strict";

/* =====================================================================
   M2  AI fraud review copilot   (owner: Tanjiba)
   ===================================================================== */
const queue = () => S.payments.filter(p => p.status === "PENDING_REVIEW").sort((a, b) => a.qkey - b.qkey);
let advice = {}; // paymentId -> recommendation (also saved in S.aiAdvice so the team sees it)
const getAdvice = id => advice[id] || (S.aiAdvice || {})[id];
const adviceLabel = (p, r) => (p && p.type === "chargeback") ? (r.decision === "approve" ? "accept" : "contest") : r.decision;
async function askAI(id, statusEl) {
  const p = S.payments.find(x => x.id === id);
  const format = 'Reply with only JSON: {"decision":"approve"|"reject","confidence":0.0-1.0,"reasons":["short reason", "..."],"checksUsed":["tool or data you used"],"suggestedRejectReason":"short text, or empty if approving"}';
  const intro = `You are the fraud-review copilot in PayOps, a payments operations app. Payment ${id} is held for manual review because its rule-based risk score is 70 or more. Recommend approve or reject for the analyst; the analyst makes the final decision. Base every reason on the data, not on assumptions. Never ask for card numbers.`;
  let prompt, opts = {};
  const isCb = p.type === "chargeback";
  const theIntro = !isCb ? intro : `You are the disputes copilot in PayOps, a payments operations app. Chargeback ${id} (reason code ${p.details.reasonCode}) against payment ${p.details.originalId} is waiting for an analyst. Recommend "approve" to ACCEPT the chargeback (the cardholder is refunded) or "reject" to CONTEST it with evidence. Call get_dispute_playbook for the reason code, get_transaction for ${id} and for ${p.details.originalId}, and get_party_history${MCP ? `, and find_drive_evidence for ${p.details.originalId} (evidence files in the team's Google Drive)` : ""}. The analyst makes the final decision. Base every reason on the data.`;
  if (AI_TOOLS) {
    prompt = `${theIntro}\nInvestigate with your tools: get_transaction for ${id}, get_party_history for its party, and get_risk_rules if useful.\n${format}`;
    opts.tools = toolList(["get_transaction", "get_party_history", "get_risk_rules"].concat(isCb ? ["get_dispute_playbook"].concat(MCP ? ["find_drive_evidence"] : []) : []));
  } else {
    prompt = `${theIntro}\nPayment: ${JSON.stringify(slim(p))}\nCustomer history: ${JSON.stringify(partyHistory(p.party))}\nRules: ${JSON.stringify(RULES)}\n${format}`;
    opts.cache = false;
  }
  statusEl.textContent = "Copilot is checking the payment and the customer’s history…";
  const rec = await AI.json(prompt, opts);
  if (!rec || !["approve", "reject"].includes(rec.decision)) throw { code: "invalid_json" };
  rec.confidence = Math.max(0, Math.min(1, Number(rec.confidence) || 0));
  rec.reasons = Array.isArray(rec.reasons) ? rec.reasons.map(String).slice(0, 6) : [];
  rec.by = ME.name || ""; rec.time = nowStr();
  advice[id] = rec; S.aiAdvice = S.aiAdvice || {}; S.aiAdvice[id] = rec; save();
  audit("AI", "FRAUD_RECOMMENDATION", `${id}: ${rec.decision} (${Math.round(rec.confidence * 100)}%) – ${rec.reasons.join("; ")}`);
  return rec;
}
function decide(id, action, reason) {
  const p = S.payments.find(x => x.id === id);
  if (!p || p.status !== "PENDING_REVIEW") return;
  if (action === "APPROVED") settle(p);
  else { p.status = action === "CONTESTED" ? "CONTESTED" : "REJECTED"; p.rejectReason = reason || (action === "CONTESTED" ? "Contested by analyst" : "Rejected by analyst"); }
  const rec = getAdvice(id);
  S.decisions.push({ id: "D" + String(S.decisions.length + 1).padStart(4, "0"), paymentId: id, action, reason: action !== "APPROVED" ? p.rejectReason : "", time: nowStr(), statusAfter: p.status,
    refundedAt: p.refunded || 0, by: ME.name || "", byId: ME.id || "", aiRecommendation: rec ? adviceLabel(p, rec) : null, reopenedAt: null, reopenNote: "" });
  audit("REVIEW", action, `${id}${rec ? ` (AI advised ${adviceLabel(p, rec)})` : " (no AI advice)"}${action !== "APPROVED" ? ": " + p.rejectReason : ""}`);
  save();
}
/* Reopen ANY past decision (not only the last one) when it is still safe.
   Returns "" when allowed, otherwise the reason it is blocked. */
function reopenCheck(d) {
  if (!d) return "decision not found";
  if (d.reopenedAt) return "already reopened";
  const later = S.decisions.find(x => x.paymentId === d.paymentId && x.id > d.id);
  if (later) return `a newer decision (${later.id}) exists for this payment`;
  const p = S.payments.find(x => x.id === d.paymentId);
  if (!p) return "payment not found";
  if ((p.refunded || 0) !== (d.refundedAt || 0)) return "the payment was refunded after this decision";
  if (p.status !== d.statusAfter) return `payment is now ${p.status.replace("_", " ").toLowerCase()}, so it changed after this decision`;
  if (p.type === "chargeback" && p.status === "SETTLED") return "money already went back to the cardholder";
  return "";
}
function reopen(decisionId, note) {
  const d = S.decisions.find(x => x.id === decisionId);
  const why = reopenCheck(d);
  if (why) return { ok: false, msg: "Cannot reopen: " + why + "." };
  const p = S.payments.find(x => x.id === d.paymentId);
  p.status = "PENDING_REVIEW"; p.rejectReason = ""; p.qkey = Math.min(0, ...queue().map(x => x.qkey)) - 1;
  d.reopenedAt = nowStr(); d.reopenNote = note || ""; d.reopenedBy = ME.name || "";
  audit("REVIEW", "REOPEN", `${p.id}: ${d.action.toLowerCase()} decision ${d.id} from ${d.time} reopened${note ? " – " + note : ""}; back to the front of the queue`);
  save();
  return { ok: true, msg: `${p.id} reopened and moved to the front of the queue.` };
}
/* Undo = reopen the most recent decision that is still active. */
function undo() {
  const d = [...S.decisions].reverse().find(x => !x.reopenedAt);
  if (!d) return "Nothing to undo.";
  return reopen(d.id, "undo last decision").msg;
}

/* AI triage agent: works through the whole queue on its own and leaves a recommendation
   on every held payment. It never decides; an analyst decides each one. */
let triageStop = false;
async function runTriage(progress) {
  triageStop = false;
  const items = queue().filter(p => !getAdvice(p.id));
  let done = 0, failed = 0;
  for (const p of items) {
    if (triageStop) break;
    progress(`Agent is investigating ${p.id} (${done + failed + 1} of ${items.length})…`);
    try { await askAI(p.id, { textContent: "" }); done++; }
    catch (e) { failed++; if (e && (e.code === "rate_limited" || e.code === "not_granted")) { progress(aiError(e)); break; } }
    renderReview();
  }
  audit("AI", "TRIAGE_AGENT", `${done} of ${items.length} held payments triaged${triageStop ? " (stopped)" : ""}`);
  return { done, failed, total: items.length, stopped: triageStop };
}
