/* PAYOPS AI Copilot (IDS 517, Tanjiba Sultana)
   Draws every screen
   Owner: Tanjiba Sultana
   Load order: see index.html */
"use strict";

/* =====================================================================
   Rendering
   ===================================================================== */
const FIELDS = {
  card: [["party","Customer name","text"],["amount","Amount (USD)","number"],["cardNumber","Card number (test numbers only)","text"],["expiry","Expiry MM/YY","text"],["cvv","CVV","password"],["online","Online (card not present)","checkbox"],["international","International","checkbox"]],
  wallet: [["party","Customer name","text"],["amount","Amount (USD)","number"],["provider","Provider","select:Apple Pay,Google Pay,PayPal,Venmo,Samsung Pay"],["walletId","Wallet ID (email or phone)","text"],["newDevice","New device","checkbox"]],
  bank: [["party","Payer","text"],["beneficiary","Beneficiary","text"],["amount","Amount (USD)","number"],["rail","Rail","select:RTP,ACH"],["routing","Routing number","text"],["account","Account number","text"],["newBeneficiary","New beneficiary","checkbox"]]
};
const TEST = {
  card: { party: "Ava Thompson", amount: 3000, cardNumber: "4111 1111 1111 1111", expiry: "12/29", cvv: "123", online: true, international: true },
  wallet: { party: "Zara Ahmed", amount: 1200, provider: "Apple Pay", walletId: "zara@example.com", newDevice: true },
  bank: { party: "Northside Builders", beneficiary: "Loop Tech Supplies", amount: 30000, rail: "RTP", routing: "021000021", account: "12345678", newBeneficiary: true }
};
function renderForm() {
  const t = $("#ptype").value;
  $("#pform").innerHTML = FIELDS[t].map(([k, l, kind]) => {
    if (kind === "checkbox") return `<label class="check"><input type="checkbox" name="${k}"> ${esc(l)}</label>`;
    if (kind.startsWith("select:")) return `<label>${esc(l)}<select name="${k}">${kind.slice(7).split(",").map(o => `<option>${esc(o)}</option>`).join("")}</select></label>`;
    return `<label>${esc(l)}<input name="${k}" type="${kind}" ${kind === "number" ? 'step="0.01" min="0"' : ""}></label>`;
  }).join("");
}
function readForm() {
  const o = {}; for (const el of $("#pform").elements) o[el.name] = el.type === "checkbox" ? el.checked : el.value; return o;
}
function chip(s) { return `<span class="chip st-${s}">${s.replace("_", " ").toLowerCase().replace(/^./, c => c.toUpperCase())}</span>`; }
function riskCell(v) { return `<span class="risk ${v >= 70 ? "hi" : v >= 40 ? "md" : ""}">${v}</span>`; }
function describe(p) {
  const d = p.details;
  if (p.type === "card") return `${d.network} ${d.maskedPan} · ${d.online ? "online" : "in-store"}${d.international ? " · international" : ""}`;
  if (p.type === "wallet") return `${d.provider} ${d.walletId}${d.newDevice ? " · new device" : ""}`;
  if (p.type === "bank") return `${d.rail} to ${d.beneficiary} · acct ${d.account}${d.newBeneficiary ? " · new beneficiary" : ""}`;
  return `dispute on ${d.originalId} · ${d.reasonCode}${d.reviewId ? " · " + d.reviewId : ""}`;
}
function renderLedger() {
  const f = $("#ledger-filter").value;
  const xs = S.payments.filter(p => !f || p.status === f).slice().reverse();
  $("#ledger-count").textContent = `${xs.length} of ${S.payments.length} payments`;
  const note = p => p.rejectReason || (p.refunded ? `Refunded ${money(p.refunded)}` : "") || (p.chargedBack ? `Charged back ${money(p.chargedBack)}` : "");
  $("#ledger-table").innerHTML = xs.length ? `<thead><tr><th>ID</th><th>Time</th><th>Type</th><th>Party</th><th class="num">Amount</th><th class="num">Fee</th><th class="num">Risk</th><th>Status</th><th>Note</th><th>Captured by</th><th>Details</th></tr></thead><tbody>${
    xs.map(p => `<tr><td class="id">${p.id}</td><td>${esc(p.createdAt.slice(11, 16))}</td><td>${TYPE_NAME[p.type]}</td><td>${esc(p.party)}</td><td class="num">${money(p.amount)}</td><td class="num">${money(p.fee)}</td><td class="num">${riskCell(p.risk)}</td><td>${chip(p.status)}</td><td style="white-space:normal;min-width:140px">${esc(note(p))}</td><td>${esc(p.createdByName || "")}</td><td>${esc(describe(p))}</td></tr>`).join("")}</tbody>`
    : `<tbody><tr><td class="empty">${S.payments.length ? "No payments with this status." : "No payments yet. Submit one above or load the sample business day."}</td></tr></tbody>`;
  const sel = $("#rf-payment"), cur = sel.value;
  const ok = S.payments.filter(p => (p.type === "card" || p.type === "wallet") && p.status === "SETTLED" && refundable(p) > 0);
  sel.innerHTML = ok.length ? ok.map(p => `<option value="${p.id}">${p.id} · ${esc(p.party)} · ${money(refundable(p))} left</option>`).join("") : `<option value="">No refundable payments</option>`;
  if (ok.some(p => p.id === cur)) sel.value = cur;
  $("#rf-go").disabled = !can("refund") || !ok.length; lockNote("#rf-lock", "refund");
  $("#submit").disabled = !can("capture"); lockNote("#submit-lock", "capture");
}
function renderReview() {
  const q = queue();
  $("#queue-list").innerHTML = q.length ? q.map((p, i) => { const r = getAdvice(p.id);
    return `<li><span class="id">${p.id}</span> · ${money(p.amount)} · risk ${riskCell(p.risk)}${i === 0 ? " · next" : ""}${r ? ` <span class="badge-ai">AI: ${adviceLabel(p, r)} ${Math.round(r.confidence * 100)}%</span>` : ""}</li>`; }).join("") : `<li class="note">Queue is empty.</li>`;
  $("#decision-list").innerHTML = S.decisions.slice().reverse().slice(0, 40).map(d => {
    const why = reopenCheck(d);
    let action;
    if (d.reopenedAt) action = `<span class="note">Reopened ${esc(d.reopenedAt.slice(11, 16))}${d.reopenedBy ? " by " + esc(d.reopenedBy) : ""}${d.reopenNote ? " · " + esc(d.reopenNote) : ""}</span>`;
    else if (why) action = `<span class="note">Can’t reopen: ${esc(why)}</span>`;
    else if (reopening === d.id) action = `<div class="reopen-form"><input id="reopen-note" placeholder="Why reopen? (optional)" aria-label="Reason for reopening"><button class="btn small" type="button" data-confirm="${d.id}">Reopen</button><button class="btn ghost small" type="button" data-cancel="1">Cancel</button></div>`;
    else action = can("reopen") ? `<button class="btn ghost small" type="button" data-reopen="${d.id}">Reopen</button>` : `<span class="note">Analysts and managers can reopen.</span>`;
    return `<li><span class="id">${d.paymentId}</span> ${d.action.toLowerCase()}${d.aiRecommendation ? ` · AI advised ${d.aiRecommendation}` : ""}<br><span class="note">${d.id} · ${esc(d.time.slice(11, 16))}${d.by ? " · by " + esc(d.by) : ""}${d.reason ? " · " + esc(d.reason) : ""}</span><div style="margin-top:4px">${action}</div></li>`;
  }).join("") || `<li class="note">No decisions yet.</li>`;
  if (reopening && $("#reopen-note")) $("#reopen-note").focus();
  $("#undo").disabled = !S.decisions.some(x => !x.reopenedAt) || !can("reopen");
  $("#triage-go").disabled = !AI || !can("decide") || !q.length;
  const p = q[0];
  if (!p) { $("#next-panel").innerHTML = `<h2>Next in line</h2><p class="empty">Nothing is waiting. Payments with a risk score of 70 or more appear here.</p>`; return; }
  const rec = getAdvice(p.id), isCb = p.type === "chargeback";
  const caseFor = isCb ? S.cases.find(c => c.chargebackId === p.id) : null;
  const block = !can("decide") ? lockText("decide") : (makerCheckerBlock(p, ME.id) ? "You captured this payment, so another analyst must decide it (maker-checker)." : "");
  $("#next-panel").innerHTML = `<h2>Next in line: <span class="id">${p.id}</span></h2>
    <dl class="dl"><dt>Type</dt><dd>${TYPE_NAME[p.type]}</dd><dt>Party</dt><dd>${esc(p.party)}</dd><dt>Amount</dt><dd>${money(p.amount)} (fee ${money(p.fee)})</dd>
    <dt>Details</dt><dd>${esc(describe(p))}</dd><dt>Risk</dt><dd>${riskCell(p.risk)} – ${esc(p.reasons.join("; "))}</dd><dt>Created</dt><dd>${esc(p.createdAt)}</dd></dl>
    <div class="toolbar" style="margin-top:14px">${AI ? `<button class="btn ai" type="button" id="ask">Ask AI copilot</button>` : `<span class="note">${esc(AI_OFF_MSG())} You can still decide from the rules.</span>`}</div>
    <div class="status-line" id="ask-status"></div>
    <div id="rec">${rec ? recHtml(rec, p) : ""}</div>
    <label style="margin-top:12px">${isCb ? "Contest note (evidence sent)" : "Reject reason"}<input id="reject-reason" value="${esc(isCb ? (caseFor && caseFor.draft ? caseFor.draft.slice(0, 140) : "") : (rec && rec.decision === "reject" ? rec.suggestedRejectReason || "" : ""))}" placeholder="${isCb ? "Required to contest" : "Required to reject"}"></label>
    <div class="toolbar" style="margin-top:10px"><button class="btn" type="button" id="approve" ${block ? "disabled" : ""}>${isCb ? "Accept chargeback (refund cardholder)" : "Approve and settle"}</button><button class="btn danger" type="button" id="reject" ${block ? "disabled" : ""}>${isCb ? "Contest" : "Reject"}</button></div>
    ${block ? `<p class="locked">${esc(block)}</p>` : ""}`;
  $("#approve").onclick = () => { if (block) return; decide(p.id, "APPROVED"); renderAll(); };
  $("#reject").onclick = () => { if (block) return; const r = $("#reject-reason").value.trim(); if (!r) { $("#reject-reason").focus(); $("#reject-reason").placeholder = isCb ? "Enter what you sent to contest" : "Enter a reason to reject"; return; } decide(p.id, isCb ? "CONTESTED" : "REJECTED", r); renderAll(); };
  if ($("#ask")) $("#ask").onclick = async () => {
    const b = $("#ask"); b.disabled = true;
    try { const r = await askAI(p.id, $("#ask-status")); $("#ask-status").textContent = ""; renderAll(); }
    catch (e) { $("#ask-status").textContent = aiError(e); b.disabled = false; }
  };
}
function recHtml(r, p) {
  return `<div class="ai-card"><div class="who">AI copilot recommends: ${adviceLabel(p, r)} · confidence ${Math.round(r.confidence * 100)}%${r.time ? ` · ${esc(r.time.slice(11, 16))}` : ""}</div>
    <ul>${r.reasons.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
    ${r.checksUsed && r.checksUsed.length ? `<div class="note" style="margin-top:6px">Checked: ${esc([].concat(r.checksUsed).join(", "))}</div>` : ""}
    <div class="note" style="margin-top:6px">Advice only. Your decision is logged with this recommendation.</div></div>`;
}
function renderDashboard() {
  const t = totals(); const tot = t[t.length - 1];
  $("#kpis").innerHTML = [[money(tot.net), "Net settlement"], [money(tot.fees), "Fees"], [String(tot.held), "Held for review"], [money(tot.refunds), "Refunds"], [String(tot.contested), "Chargebacks contested"], [String(tot.avgRisk), "Average risk score"]]
    .map(([v, l]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join("");
  $("#totals-table").innerHTML = `<thead><tr><th>Type</th><th class="num">Count</th><th class="num">Settled</th><th class="num">Held</th><th class="num">Rejected</th><th class="num">Contested</th><th class="num">Refunds</th><th class="num">Gross settled</th><th class="num">Fees</th><th class="num">Net</th><th class="num">Avg risk</th></tr></thead><tbody>${
    t.map(r => `<tr${r.type === "Total" ? ' style="font-weight:600"' : ""}><td>${r.type}</td><td class="num">${r.count}</td><td class="num">${r.settled}</td><td class="num">${r.held}</td><td class="num">${r.rejected}</td><td class="num">${r.contested}</td><td class="num">${money(r.refunds)}</td><td class="num">${money(r.grossSettled)}</td><td class="num">${money(r.fees)}</td><td class="num">${money(r.net)}</td><td class="num">${r.avgRisk}</td></tr>`).join("")}</tbody>`;
  const bars = t.slice(0, 4), max = Math.max(1, ...bars.map(b => b.grossSettled));
  $("#chart").innerHTML = `<svg viewBox="0 0 460 ${bars.length * 44 + 10}" width="100%" role="img" aria-label="Gross settled by payment type">${bars.map((b, i) => {
    const w = Math.round(b.grossSettled / max * 260), y = i * 44 + 6;
    return `<text x="0" y="${y + 20}" font-size="13" fill="var(--text)">${b.type}</text><rect x="110" y="${y + 6}" width="${Math.max(w, 2)}" height="20" rx="4" fill="${b.type === "Chargeback" ? "var(--ai)" : "var(--ink-2)"}"/><text x="${116 + w}" y="${y + 21}" font-size="12.5" fill="var(--muted)">${money(b.grossSettled)}</text>`;
  }).join("")}</svg>`;
  const hours = {}; S.payments.forEach(p => { const h = Number(p.createdAt.slice(11, 13)); hours[h] = (hours[h] || 0) + 1; });
  const hs = Object.keys(hours).map(Number).sort((a, b) => a - b), hmax = Math.max(1, ...Object.values(hours)), slot = hs.length ? 430 / hs.length : 0;
  $("#trend").innerHTML = hs.length ? `<svg viewBox="0 0 460 165" width="100%" role="img" aria-label="Payments by hour">${hs.map((h, i) => {
    const bw = Math.min(30, slot - 6), x = 15 + i * slot, bh = Math.round(hours[h] / hmax * 105);
    return `<rect x="${x}" y="${128 - bh}" width="${bw}" height="${bh}" rx="3" fill="var(--ink-2)"/><text x="${x + bw / 2}" y="${122 - bh}" font-size="11" text-anchor="middle" fill="var(--muted)">${hours[h]}</text><text x="${x + bw / 2}" y="146" font-size="10.5" text-anchor="middle" fill="var(--text)">${pad2(h)}:00</text>`;
  }).join("")}</svg>` : `<p class="note">No payments yet.</p>`;
  $("#summary").hidden = !AI;
  $("#drive-save").hidden = !MCP;
  if (!AI && !$("#summary-out").textContent) $("#summary-out").innerHTML = `<p class="note">${esc(AI_OFF_MSG())}</p>`;
  else if (AI && $("#summary-out").textContent === AI_OFF_MSG()) $("#summary-out").innerHTML = "";
}
function renderDisputes() {
  const sel = $("#d-payment"), cur = sel.value;
  const cards = S.payments.filter(p => p.type === "card" && p.status === "SETTLED");
  sel.innerHTML = cards.length ? cards.map(p => `<option value="${p.id}">${p.id} · ${esc(p.party)} · ${money(p.amount)}</option>`).join("") : `<option value="">No settled card payments yet</option>`;
  if (cards.some(p => p.id === cur)) sel.value = cur;
  const code = $("#d-code"), cc = code.value;
  code.innerHTML = Object.entries(REASON_CODES).map(([k, v]) => `<option value="${k}">${k} ${esc(v)}</option>`).join("");
  if (cc) code.value = cc;
  $("#d-classify").hidden = $("#d-draft").hidden = !AI;
  $("#d-escalate").disabled = !can("escalate");
  $("#d-drive").hidden = !MCP;
  $("#case-list").innerHTML = S.cases.slice().reverse().map(c => `<li><b>${esc(c.reviewId)}</b><br><span class="id">${c.paymentId}</span> → <span class="id">${c.chargebackId}</span> · ${c.reasonCode}<br><span class="note">${esc(c.outcome)}${c.by ? " · by " + esc(c.by) : ""}${c.evidence && c.evidence.length ? ` · ${c.evidence.length} Google Drive file${c.evidence.length > 1 ? "s" : ""}` : ""}</span></li>`).join("") || `<li class="note">No cases yet.</li>`;
}
function renderAudit() {
  const f = $("#audit-filter").value;
  const xs = auditEntries().filter(a => !f || a.category === f).slice().reverse().slice(0, 300);
  $("#audit-table").innerHTML = xs.length ? `<thead><tr><th>Time</th><th>User</th><th>Category</th><th>Action</th><th>Details</th></tr></thead><tbody>${xs.map(a => `<tr><td>${esc(a.time)}</td><td>${esc(a.actor || "")}</td><td>${esc(a.category)}</td><td>${esc(a.action)}</td><td style="white-space:normal">${esc(a.details)}</td></tr>`).join("")}</tbody>` : `<tbody><tr><td class="empty">Nothing logged yet.</td></tr></tbody>`;
}
function renderCounts() {
  $("#c-ledger").textContent = S.payments.length; $("#c-review").textContent = queue().length; $("#c-disputes").textContent = S.cases.length;
}
function renderAll() { renderWho(); renderLedger(); renderReview(); renderDashboard(); renderDisputes(); renderAudit(); renderCounts(); renderChatAvail(); renderEval(); renderTeam(); }
