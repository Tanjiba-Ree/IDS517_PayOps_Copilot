/* PAYOPS AI Copilot (IDS 517, Tanjiba Sultana)
   M4 dispute assistant: reason code, playbook-based draft, escalation
   Owner: Tanjiba Sultana
   Load order: see index.html */
"use strict";

/* =====================================================================
   M4  AI chargeback dispute assistant   (owner: Tanjiba)
   ===================================================================== */
let draftCase = null;
async function classify(paymentId, complaint) {
  const p = S.payments.find(x => x.id === paymentId);
  const codes = Object.entries(REASON_CODES).map(([k, v]) => `${k}: ${v}`).join("\n");
  const prompt = `Classify a card dispute for PayOps. Choose exactly one reason code from this list:\n${codes}\nDisputed payment: ${JSON.stringify(slim(p))}\nCustomer complaint: """${complaint.slice(0, 2000)}"""\nReply with only JSON: {"reasonCode":"13.1","rationale":"one sentence","evidenceNeeded":["item","item"]}`;
  const r = await AI.json(prompt, { modelTier: "quick", cache: false });
  if (!r || !REASON_CODES[r.reasonCode]) throw { code: "invalid_json" };
  audit("AI", "DISPUTE_CLASSIFY", `${paymentId}: ${r.reasonCode} – ${r.rationale}`);
  return r;
}
async function draftResponse(c, onText) {
  const p = S.payments.find(x => x.id === c.paymentId);
  const prompt = `Draft a short dispute response (under 160 words) from the merchant's payments team for a ${REASON_CODES[c.reasonCode]} (reason code ${c.reasonCode}) dispute.\nPayment record: ${JSON.stringify(slim(p))}\nCustomer complaint: """${c.complaint.slice(0, 2000)}"""\nState the facts from the payment record, list the evidence the team will attach (${(c.evidenceNeeded || []).join(", ") || "order and delivery records"}), and say whether the team recommends accepting or contesting the dispute and why. Use the masked card number only. Plain text.`;
  const pb = PLAYBOOK[c.reasonCode] || {};
  const ev = (driveEvidence && driveEvidence.paymentId === c.paymentId) ? driveEvidence.files.map(f => ({ title: f.title, excerpt: f.snippet })) : [];
  const { text } = await AI(prompt + `\nTeam playbook for this reason code (use it for the evidence list and the accept or contest recommendation): ${JSON.stringify(pb)}${ev.length ? `\nEvidence found in the team's Google Drive (use it and cite the file titles): ${JSON.stringify(ev)}` : ""}`, { cache: false, onText });
  audit("AI", "DISPUTE_DRAFT", `${c.paymentId}: draft of ${text.length} characters`);
  return text;
}
function escalate(paymentId, complaint, reasonCode, draft) {
  const p = S.payments.find(x => x.id === paymentId);
  const reviewId = "REV-CBK-" + nowStr().replace(/[-:]/g, "").replace(" ", "-");
  const r = submit("chargeback", { party: p.party, amount: refundable(p), originalId: paymentId, reasonCode, reviewId });
  S.cases.push({ paymentId, chargebackId: r.p.id, complaint, reasonCode, draft: draft || "", reviewId, time: nowStr(), outcome: r.out, by: ME.name || "", evidence: (driveEvidence && driveEvidence.paymentId === paymentId) ? driveEvidence.files.map(f => ({ title: f.title, url: f.url })) : [] });
  audit("DISPUTE", "ESCALATE", `${reviewId}: ${paymentId} → ${r.p.id} (${reasonCode}) ${r.out}`);
  save();
  return { reviewId, r };
}
