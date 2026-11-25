/* PAYOPS AI Copilot (IDS 517, Tanjiba Sultana)
   Ops chat: Claude assistant with ledger tools
   Owner: Tanjiba Sultana
   Load order: see index.html */
"use strict";

/* =====================================================================
   Shared: Ops chat (HW8 assistant, now with ledger tools)
   ===================================================================== */
let chatTurns = [];
const CHAT_RULES = `You are the PayOps Ops Assistant inside a payments operations app. Answer questions about PayOps rules and today's payments. Use your tools to look up payments, history, the review queue and totals, and use quote_payment for any fee, limit or risk number: never calculate fees or risk scores yourself. You explain and recommend; you never approve, reject or refund. Never ask for full card numbers or CVVs. Keep answers short and name the rule you used.`;
function renderChatAvail() {
  const ok = !!AI; $("#chat-input").disabled = $("#chat-send").disabled = !ok;
  if (!ok && !$("#chat-log").children.length) $("#chat-status").textContent = AI_OFF_MSG();
  else if (ok && $("#chat-status").textContent === AI_OFF_MSG()) $("#chat-status").textContent = "";
}
function addMsg(who, text) { const d = document.createElement("div"); d.className = "msg " + who; d.textContent = text; $("#chat-log").appendChild(d); $("#chat-log").scrollTop = 1e9; return d; }
$("#chat-form").onsubmit = async (ev) => {
  ev.preventDefault(); const q = $("#chat-input").value.trim(); if (!q || !AI) return;
  $("#chat-input").value = ""; addMsg("me", q); chatTurns.push({ role: "user", content: q });
  const bubble = addMsg("bot", "Thinking…"); $("#chat-send").disabled = true;
  try {
    const turns = [{ role: "user", content: CHAT_RULES }, ...chatTurns.slice(-10)];
    const opts = { onText: ({ text }) => { bubble.textContent = text; } };
    if (AI_TOOLS) { opts.tools = toolList(["get_transaction", "get_party_history", "get_risk_rules", "get_review_queue", "get_totals", "quote_payment", "get_dispute_playbook"]); $("#chat-status").textContent = "The assistant may look up the ledger."; }
    else { opts.cache = false; turns[0] = { role: "user", content: CHAT_RULES + "\nRules: " + JSON.stringify(RULES) + "\nTotals: " + JSON.stringify(totals()) }; }
    const { text } = await AI(turns, opts);
    bubble.textContent = text; chatTurns.push({ role: "assistant", content: text });
    audit("AI", "CHAT", q.slice(0, 120)); renderAudit();
  } catch (e) { bubble.textContent = (e && e.text) || aiError(e); chatTurns.pop(); }
  $("#chat-send").disabled = false; $("#chat-status").textContent = "";
};
