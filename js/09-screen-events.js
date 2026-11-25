/* PAYOPS AI Copilot (IDS 517, Tanjiba Sultana)
   Button actions for Ledger, Review, Dashboard and Disputes
   Owner: Tanjiba Sultana
   Load order: see index.html */
"use strict";

/* ---------- Ledger events (M1) ---------- */
$("#ptype").onchange = renderForm;
$("#fill").onclick = () => { const t = $("#ptype").value, v = TEST[t]; for (const el of $("#pform").elements) { if (el.type === "checkbox") el.checked = !!v[el.name]; else el.value = v[el.name] ?? ""; } };
$("#submit").onclick = () => {
  if (!can("capture")) { $("#presult").innerHTML = `<div class="result err">${esc(lockText("capture"))}</div>`; return; }
  const t = $("#ptype").value;
  try { const { p, out } = submit(t, readForm()); save();
    $("#presult").innerHTML = `<div class="result ${p.status === "PENDING_REVIEW" ? "warn" : "ok"}"><b>${p.id}: ${out}.</b> Fee ${money(p.fee)} · risk ${p.risk} (${esc(p.reasons.join("; "))})</div>`;
    renderForm(); renderAll();
  } catch (e) {
    if (!e || !e.rule) throw e;
    audit("PAYMENT", "REJECTED_AT_VALIDATION", `${e.rule}: ${e.message}`);
    $("#presult").innerHTML = `<div class="result err"><b>Not submitted (${esc(e.rule)}).</b> ${esc(e.message)}</div>`; renderAudit();
  }
};
/* Load the sample day once. If data exists, ask first: loading again would duplicate payments. */
function doLoadSample(replace) {
  if (replace) {
    const before = S.payments.length, keep = S.audit; // the audit log is append-only, so it is kept
    S = blank(); S.audit = keep; advice = {}; reopening = null; draftCase = null;
    audit("SYSTEM", "CLEAR_DATA", `${before} payments, decisions and disputes cleared before loading a fresh sample day`);
  }
  const n = loadSampleDay(); save();
  $("#presult").innerHTML = `<div class="result ok">${replace ? "Cleared the old data and loaded" : "Loaded"} ${n} sample payments. ${queue().length} are waiting in the review queue.</div>`;
  renderAll();
}
$("#sample").onclick = () => {
  if (!can("sample")) { $("#presult").innerHTML = `<div class="result err">${esc(lockText("sample"))}</div>`; return; }
  if (!S.payments.length) return doLoadSample(false);
  const loads = S.audit.filter(a => a.action === "LOAD_SAMPLE_DAY").length;
  const what = loads ? `The sample day is already loaded${loads > 1 ? ` (${loads} times)` : ""}.` : `There are already ${S.payments.length} payments.`;
  $("#presult").innerHTML = `<div class="result warn"><b>${what}</b> Loading it again would add duplicate payments. Replace everything with one fresh sample day? This clears payments, decisions and disputes; the audit log keeps a record.
    <div class="toolbar" style="margin:10px 0 0"><button class="btn" type="button" id="sample-replace">Replace with a fresh sample day</button><button class="btn ghost" type="button" id="sample-cancel">Keep current data</button></div></div>`;
  $("#sample-replace").onclick = () => doLoadSample(true);
  $("#sample-cancel").onclick = () => { $("#presult").innerHTML = ""; };
  $("#sample-cancel").focus();
};
let resetArmed = null;
$("#reset").onclick = () => {
  if (!can("reset")) { const b0 = $("#reset"); b0.textContent = "Managers only"; setTimeout(() => { b0.textContent = "Reset all data"; }, 2500); return; }
  const b = $("#reset");
  if (!resetArmed) { b.textContent = "Click again to delete all data"; resetArmed = setTimeout(() => { resetArmed = null; b.textContent = "Reset all data"; }, 4000); return; }
  clearTimeout(resetArmed); resetArmed = null; b.textContent = "Reset all data";
  S = blank(); advice = {}; chatTurns = []; reopening = null; $("#chat-log").innerHTML = ""; save(); renderAll();
};

$("#rf-go").onclick = () => {
  if (!can("refund")) { $("#rf-result").innerHTML = `<div class="result err">${esc(lockText("refund"))}</div>`; return; }
  try {
    const p = refund($("#rf-payment").value, $("#rf-amount").value, $("#rf-reason").value.trim());
    $("#rf-result").innerHTML = `<div class="result ok"><b>${p.id}</b>: refunded. ${money(refundable(p))} left; status ${chip(p.status)}</div>`;
    $("#rf-amount").value = ""; $("#rf-reason").value = ""; renderAll();
  } catch (e) { if (!e || !e.rule) throw e; $("#rf-result").innerHTML = `<div class="result err"><b>Not refunded (${esc(e.rule)}).</b> ${esc(e.message)}</div>`; }
};
$("#ledger-filter").onchange = renderLedger;

/* ---------- Review events (M2) ---------- */
$("#triage-go").onclick = async () => {
  if (!AI) { $("#triage-status").textContent = AI_OFF_MSG(); return; }
  if (!can("decide")) { $("#triage-status").textContent = lockText("decide"); return; }
  $("#triage-go").disabled = true; $("#triage-stop").hidden = false;
  try {
    const r = await runTriage(t => { $("#triage-status").textContent = t; });
    $("#triage-status").textContent = r.total ? `Agent finished: ${r.done} of ${r.total} held payments now have a recommendation${r.failed ? `; ${r.failed} could not be checked` : ""}${r.stopped ? " (stopped early)" : ""}. You decide each one.` : "Every held payment already has a recommendation.";
  } finally { $("#triage-stop").hidden = true; renderAll(); }
};
$("#triage-stop").onclick = () => { triageStop = true; $("#triage-status").textContent = "Stopping after the current payment…"; };
let reopening = null; // decision id whose reopen form is open
$("#decision-list").onclick = (ev) => {
  const t = ev.target.closest("button"); if (!t) return;
  if (t.dataset.reopen) { reopening = t.dataset.reopen; renderReview(); return; }
  if (t.dataset.cancel) { reopening = null; renderReview(); return; }
  if (t.dataset.confirm) {
    if (!can("reopen")) return;
    const r = reopen(t.dataset.confirm, ($("#reopen-note") ? $("#reopen-note").value.trim() : ""));
    reopening = null; $("#undo-result").innerHTML = `<p class="note">${esc(r.msg)}</p>`; renderAll();
  }
};
$("#undo").onclick = () => { if (!can("reopen")) return; const m = undo(); $("#undo-result").innerHTML = `<p class="note">${esc(m)}</p>`; renderAll(); };

/* ---------- Dashboard events (M3) ---------- */
$("#summary").onclick = async () => {
  const b = $("#summary"); b.disabled = true; $("#summary-out").innerHTML = `<p class="status-line">Writing the summary…</p>`;
  try { const text = await aiDaySummary(); S.lastSummary = text; save(); $("#summary-out").innerHTML = `<div class="ai-card"><div class="who">AI end-of-day summary</div><div style="white-space:pre-wrap">${esc(text)}</div></div>`; renderAudit(); }
  catch (e) { $("#summary-out").innerHTML = `<p class="note">${esc(aiError(e))}</p>`; }
  b.disabled = false;
};
async function exportFile(name, data, noteSel = "#export-note") {
  const note = $(noteSel);
  const dl = window.claude ? await window.claude.use("downloads").catch(() => null) : null;
  if (!dl) {
    if (window.claude) { note.textContent = "Downloads are not available in this view."; return; }
    // Running from a file or website: a normal browser download works
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([data], { type: "text/csv" })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    note.textContent = "Saved " + name + "."; audit("SYSTEM", "EXPORT", name); renderAudit(); return;
  }
  try { await dl.save({ filename: name, data }); note.textContent = "Saved " + name + "."; audit("SYSTEM", "EXPORT", name); renderAudit(); }
  catch (e) { note.textContent = e && e.code === "declined" ? "Download cancelled." : "Download failed."; }
}
$("#export-tx").onclick = () => exportFile("payops_transactions.csv", csv([["id","created_at","type","party","amount","fee","net","risk_score","status","details","reject_reason"], ...S.payments.map(p => [p.id, p.createdAt, TYPE_NAME[p.type], p.party, p.amount, p.fee, netOf(p), p.risk, p.status, describe(p), p.rejectReason])]));
$("#export-audit").onclick = () => exportFile("payops_audit_log.csv", csv([["timestamp","user","category","action","details"], ...auditEntries().map(a => [a.time, a.actor || "", a.category, a.action, a.details])]));
function buildReport() {
  const t = totals(), L = [];
  L.push("# PAYOPS AI end-of-day report", "", `Generated ${nowStr()} by ${ME.name || "unknown"}`, "", "## Totals", "",
    "| Type | Count | Settled | Held | Rejected | Contested | Refunds | Gross settled | Fees | Net |", "|---|---|---|---|---|---|---|---|---|---|");
  t.forEach(r => L.push(`| ${r.type} | ${r.count} | ${r.settled} | ${r.held} | ${r.rejected} | ${r.contested} | ${money(r.refunds)} | ${money(r.grossSettled)} | ${money(r.fees)} | ${money(r.net)} |`));
  L.push("", "## Still held for review", ""); const q = queue(); if (!q.length) L.push("None.");
  q.forEach(p => { const r = getAdvice(p.id); L.push(`- ${p.id} ${TYPE_NAME[p.type]} ${money(p.amount)}, risk ${p.risk}${r ? ` (AI: ${adviceLabel(p, r)}, ${Math.round(r.confidence * 100)}%)` : ""}`); });
  L.push("", "## Decisions", ""); if (!S.decisions.length) L.push("None.");
  S.decisions.forEach(d => L.push(`- ${d.id} ${d.paymentId}: ${d.action.toLowerCase()}${d.by ? " by " + d.by : ""} at ${d.time.slice(11, 16)}${d.reason ? " – " + d.reason : ""}${d.reopenedAt ? " (reopened)" : ""}`));
  L.push("", "## Disputes", ""); if (!S.cases.length) L.push("None.");
  S.cases.forEach(c => L.push(`- ${c.reviewId}: ${c.paymentId} → ${c.chargebackId}, reason ${c.reasonCode}${c.by ? ", by " + c.by : ""}`));
  if (S.lastSummary) L.push("", "## AI end-of-day summary", "", S.lastSummary);
  const ev = (S.evalRuns || []).slice(-1)[0]; if (ev) L.push("", "## Latest AI evaluation", "", `${ev.passed} of ${ev.total} answered correctly (${ev.time}, run by ${ev.by || "unknown"})`);
  return L.join("\n");
}
$("#export-report").onclick = () => exportFile("payops_end_of_day_report.md", buildReport());

/* ---------- Dispute events (M4) ---------- */
/* S1-27: a new dispute clears the previous escalation message */
$("#d-payment").addEventListener("change", () => { $("#d-result").innerHTML = ""; $("#d-drive-out").innerHTML = ""; driveEvidence = null; });
$("#d-complaint").addEventListener("input", () => { $("#d-result").innerHTML = ""; });
$("#d-classify").onclick = async () => {
  $("#d-result").innerHTML = "";
  const id = $("#d-payment").value, complaint = $("#d-complaint").value.trim();
  if (!id || !complaint) { $("#d-ai").innerHTML = `<p class="note">Choose a payment and enter the complaint first.</p>`; return; }
  const b = $("#d-classify"); b.disabled = true; $("#d-ai").innerHTML = `<p class="status-line">Reading the complaint…</p>`;
  try { const r = await classify(id, complaint); draftCase = { paymentId: id, complaint, ...r }; $("#d-code").value = r.reasonCode; $("#d-draft").disabled = false;
    $("#d-ai").innerHTML = `<div class="ai-card"><div class="who">AI suggests reason code ${esc(r.reasonCode)}: ${esc(REASON_CODES[r.reasonCode])}</div><div>${esc(r.rationale || "")}</div>${Array.isArray(r.evidenceNeeded) && r.evidenceNeeded.length ? `<div class="note" style="margin-top:6px">Evidence to gather: ${esc(r.evidenceNeeded.join(", "))}</div>` : ""}</div>`; renderAudit(); }
  catch (e) { $("#d-ai").innerHTML = `<p class="note">${esc(aiError(e))}</p>`; }
  b.disabled = false;
};
$("#d-draft").onclick = async () => {
  if (!draftCase) return; draftCase.reasonCode = $("#d-code").value;
  const b = $("#d-draft"); b.disabled = true;
  const box = document.createElement("div"); box.className = "ai-card"; box.innerHTML = `<div class="who">AI draft response (edit before sending)</div><textarea id="d-draft-text" style="min-height:160px">Writing…</textarea>`;
  $("#d-ai").appendChild(box);
  try { const text = await draftResponse(draftCase, ({ text }) => { $("#d-draft-text").value = text; }); $("#d-draft-text").value = text; draftCase.draft = text; renderAudit(); }
  catch (e) { $("#d-draft-text").value = e && e.text ? e.text : ""; box.insertAdjacentHTML("beforeend", `<p class="note">${esc(aiError(e))}</p>`); }
  b.disabled = false;
};
$("#d-escalate").onclick = () => {
  if (!can("escalate")) { $("#d-result").innerHTML = `<div class="result err">${esc(lockText("escalate"))}</div>`; return; }
  const id = $("#d-payment").value, complaint = $("#d-complaint").value.trim();
  if (!id || !complaint) { $("#d-result").innerHTML = `<div class="result err">Choose a payment and enter the complaint first.</div>`; return; }
  const draft = $("#d-draft-text") ? $("#d-draft-text").value : "";
  try { const { reviewId, r } = escalate(id, complaint, $("#d-code").value, draft);
    $("#d-result").innerHTML = `<div class="result ${r.p.status === "PENDING_REVIEW" ? "warn" : "ok"}"><b>${esc(reviewId)}</b>: chargeback ${r.p.id} created, ${esc(r.out.toLowerCase())}. Risk ${r.p.risk}.</div>`;
    draftCase = null; $("#d-complaint").value = ""; $("#d-ai").innerHTML = ""; $("#d-draft").disabled = true; renderAll();
  } catch (e) { if (!e || !e.rule) throw e; $("#d-result").innerHTML = `<div class="result err">${esc(e.message)}</div>`; }
};
