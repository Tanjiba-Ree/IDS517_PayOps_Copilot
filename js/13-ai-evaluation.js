/* PAYOPS AI Copilot (IDS 517, Tanjiba Sultana)
   Automated AI evaluation of the 12 HW8 questions (FR-20)
   Owner: Tanjiba Sultana
   Load order: see index.html */
"use strict";

/* =====================================================================
   Shared: automated AI evaluation (FR-20): the HW8 test set as an eval
   ===================================================================== */
const EVAL_CASES = [
  { id: "R1", q: "Can I take a $12,000 card payment?", label: "No: card limit is $10,000", expect: [/10,000|10000/] },
  { id: "R2", q: "What is the mobile wallet limit per payment?", label: "$2,500", expect: [/2,500|2500/] },
  { id: "R3", q: "Can I refund an RTP bank transfer?", label: "No: bank transfers cannot be refunded", expect: [/\b(no|cannot|can't|not)\b/i, /irrevocable|cannot be refunded|can't be refunded|not refundable|no refund/i] },
  { id: "F1", q: "What is the fee on a $3,000 online, international card payment?", label: "$117.30", expect: [/117\.30/] },
  { id: "F2", q: "What is the fee on a $500 in-store card payment?", label: "$11.10", expect: [/11\.10/] },
  { id: "F3", q: "What is the fee on an $800 mobile wallet payment?", label: "$12.00", expect: [/\$12(\.00)?\b/] },
  { id: "K1", q: "What risk score does a $3,000 online, international card payment get, and is it held?", label: "75, held", expect: [/\b75\b/, /held|review/i] },
  { id: "K2", q: "What risk score does a $1,200 mobile wallet payment from a new device get, and is it held?", label: "70, held", expect: [/\b70\b/, /held|review/i] },
  { id: "K3", q: "What risk score does a $30,000 ACH transfer to a known beneficiary get?", label: "25, settled", expect: [/\b25\b/, /settle/i] },
  { id: "E1", q: "A payment was held for review. What happens next?", label: "It waits in the review queue; an analyst decides", expect: [/queue|review/i, /analyst|person|human|staff/i] },
  { id: "E2", q: "Can a review decision be reopened after the payment was refunded?", label: "No: the payment changed", expect: [/\b(no|cannot|can't|not)\b/i] },
  { id: "E3", q: "A $1,500 chargeback with reason code 10.4 arrives. What is its risk score and does it need review?", label: "80; an analyst reviews it", expect: [/\b80\b/, /review|held|analyst/i] }
];
let evalStop = false, lastEval = null;
async function runEval(progress) {
  evalStop = false; const results = [];
  for (const c of EVAL_CASES) {
    if (evalStop) break;
    progress(`Asking ${c.id} (${results.length + 1} of ${EVAL_CASES.length})…`);
    let answer = "", pass = false, stop = false;
    try {
      const turns = [{ role: "user", content: CHAT_RULES + "\nAnswer in at most three sentences.\nQuestion: " + c.q }];
      const opts = { cache: false };
      if (AI_TOOLS) opts.tools = toolList(["get_transaction", "get_party_history", "get_risk_rules", "get_review_queue", "get_totals", "quote_payment", "get_dispute_playbook"]);
      else turns[0].content += "\nRules: " + JSON.stringify(RULES);
      answer = (await AI(turns, opts)).text || "";
      pass = c.expect.every(rx => rx.test(answer));
    } catch (e) { answer = "Error: " + aiError(e); stop = !!(e && (e.code === "rate_limited" || e.code === "not_granted")); }
    results.push({ id: c.id, q: c.q, expected: c.label, answer: answer.slice(0, 400), pass });
    renderEvalTable(results);
    if (stop) break;
  }
  const passed = results.filter(r => r.pass).length;
  const run = { time: nowStr(), by: ME.name || "", passed, total: results.length, results };
  S.evalRuns = (S.evalRuns || []).slice(-4).concat([run]); save();
  audit("AI", "EVALUATION", `${passed} of ${results.length} HW8 test questions answered correctly`);
  lastEval = run; return run;
}
function renderEvalTable(results) {
  const pass = results.filter(r => r.pass).length;
  $("#eval-kpis").innerHTML = [[results.length, "Questions asked"], [pass, "Answered correctly"], [results.length ? Math.round(pass / results.length * 100) + "%" : "–", "Pass rate"]]
    .map(([v, l]) => `<div class="kpi"><div class="v">${esc(v)}</div><div class="l">${l}</div></div>`).join("");
  $("#eval-table").innerHTML = `<thead><tr><th>ID</th><th>Question</th><th>Expected</th><th>AI answer</th><th>Result</th></tr></thead><tbody>${results.map(r => `<tr><td class="id">${esc(r.id)}</td><td style="white-space:normal;min-width:200px">${esc(r.q)}</td><td style="white-space:normal;min-width:140px">${esc(r.expected)}</td><td style="white-space:normal;min-width:260px">${esc(r.answer)}</td><td>${r.pass ? '<span class="chip st-SETTLED">Pass</span>' : '<span class="chip st-REJECTED">Fail</span>'}</td></tr>`).join("")}</tbody>`;
}
let evalRunning = false;
function renderEval() {
  const last = lastEval || (S.evalRuns || []).slice(-1)[0];
  if (last && !evalRunning) renderEvalTable(last.results);
  $("#eval-history").innerHTML = (S.evalRuns || []).slice().reverse().map(r => `<li>${esc(r.time)} · ${r.passed} of ${r.total} correct${r.by ? " · run by " + esc(r.by) : ""}</li>`).join("") || `<li class="note">No runs yet.</li>`;
  $("#eval-go").disabled = evalRunning || !AI || !can("evaluate");
  $("#eval-lock").textContent = !AI ? AI_OFF_MSG() : (can("evaluate") ? "" : lockText("evaluate"));
  $("#eval-export").disabled = !last;
}
$("#eval-go").onclick = async () => {
  if (!AI || !can("evaluate") || evalRunning) return;
  evalRunning = true; $("#eval-go").disabled = true; $("#eval-stop").hidden = false;
  try { const run = await runEval(t => { $("#eval-status").textContent = t; }); $("#eval-status").textContent = `Finished: ${run.passed} of ${run.total} answered correctly.`; }
  finally { evalRunning = false; $("#eval-stop").hidden = true; renderAll(); }
};
$("#eval-stop").onclick = () => { evalStop = true; $("#eval-status").textContent = "Stopping after the current question…"; };
$("#eval-export").onclick = () => { const last = lastEval || (S.evalRuns || []).slice(-1)[0]; if (last) exportFile("payops_ai_evaluation.csv", csv([["id", "question", "expected", "ai_answer", "result"], ...last.results.map(r => [r.id, r.q, r.expected, r.answer, r.pass ? "Pass" : "Fail"])]), "#eval-status"); };
