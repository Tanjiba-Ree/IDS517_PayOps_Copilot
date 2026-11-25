/* PAYOPS AI Copilot (IDS 517, Tanjiba Sultana)
   Google Drive connector (MCP): dispute evidence search and saving the end-of-day report
   Owner: Tanjiba Sultana
   Load order: see index.html */
"use strict";

/* =====================================================================
   Shared: Google Drive connector (MCP): dispute evidence and report saving
   ===================================================================== */
let MCP = null;               // the viewer's claude.ai connectors, or null when this view has none
let driveEvidence = null;     // { paymentId, files } from the last evidence search
const DRIVE = "Google Drive";
const safeId = id => /^[A-Z]{3}-\d{4}$/.test(String(id || "")) ? id : "";            // payment ids only: nothing else reaches the query
const safeUrl = u => /^https:\/\/(docs|drive)\.google\.com\//.test(String(u || ""));  // links shown only for Google Docs or Drive
function driveError(e, write) {
  const c = e && e.code;
  if (c === "server_not_connected") return "Google Drive isn’t connected. Add it in Settings › Connectors, then try again.";
  if (c === "needs_reauth") return "Google Drive needs you to sign in again: Settings › Connectors › Google Drive.";
  if (c === "not_granted" || c === "approval_required") return "This page needs your OK to use Google Drive. Allow it when claude.ai asks, or in the page’s Permissions menu.";
  if (c === "selection_required") return "More than one Google Drive is connected; choose one when claude.ai asks.";
  if (c === "blocked_by_policy") return "Your organization blocks this Google Drive action.";
  if (c === "tool_error") return "Google Drive reported a problem: " + String((e && e.message) || "").slice(0, 160);
  if (write && (c === "server_unavailable" || c === "upstream_error")) return "Google Drive didn’t answer, so the report may or may not have been saved. Check your Drive before trying again.";
  if (c === "server_unavailable" || c === "upstream_error") return "Google Drive didn’t answer. Try again in a moment.";
  return "The Google Drive request failed. Try again.";
}
async function findDriveEvidence(paymentId) {
  const id = safeId(paymentId);
  if (!id || !MCP) return [];
  const r = await MCP.callTool(DRIVE, "search_files", { query: `title contains 'PAYOPS evidence' and title contains '${id}'`, pageSize: 5, snippetVerbosity: "BRIEF" }, { cache: false });
  const files = (r && r.payload && Array.isArray(r.payload.files)) ? r.payload.files : [];
  audit("DRIVE", "SEARCH_EVIDENCE", `${id}: ${files.length} evidence file${files.length === 1 ? "" : "s"} found in Google Drive`);
  return files.slice(0, 5).map(f => ({ title: String(f.title || "Untitled"), url: String(f.viewUrl || ""), snippet: String(f.contentSnippet || "").replace(/^\s*1\.\s*/, "").slice(0, 300), modified: String(f.modifiedTime || "").slice(0, 10) }));
}
async function saveReportToDrive() {
  const title = "PAYOPS end-of-day report " + nowStr().slice(0, 16);
  const r = await MCP.callTool(DRIVE, "create_file", { title, textContent: buildReport(), contentMimeType: "text/plain" }, { cache: false });
  const f = (r && r.payload) || {};
  audit("DRIVE", "SAVE_REPORT", `${title} saved to Google Drive`);
  return { title: String(f.title || title), url: String(f.viewUrl || "") };
}
const driveLink = f => safeUrl(f.url) ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.title)}</a>` : esc(f.title);
$("#d-drive").onclick = async () => {
  const id = $("#d-payment").value, out = $("#d-drive-out");
  if (!MCP) { out.innerHTML = `<p class="note">Google Drive works on the claude.ai link once the Google Drive connector is added.</p>`; return; }
  if (!can("dispute")) { out.innerHTML = `<p class="note">${esc(lockText("dispute"))}</p>`; return; }
  if (!safeId(id)) { out.innerHTML = `<p class="note">Choose the disputed payment first.</p>`; return; }
  const b = $("#d-drive"); b.disabled = true; out.innerHTML = `<p class="status-line">Searching Google Drive for “PAYOPS evidence ${esc(id)}”…</p>`;
  try {
    const files = await findDriveEvidence(id); driveEvidence = { paymentId: id, files };
    out.innerHTML = files.length
      ? `<div class="ai-card" style="border-color:var(--ink-2);background:var(--surface)"><div class="who" style="color:var(--ink-2)">Evidence in Google Drive (${files.length})</div><ul>${files.map(f => `<li>${driveLink(f)}${f.modified ? ` <span class="note">· ${esc(f.modified)}</span>` : ""}${f.snippet ? `<br><span class="note">${esc(f.snippet)}</span>` : ""}</li>`).join("")}</ul><div class="note" style="margin-top:6px">The AI draft uses this evidence, and the links are attached to the case when you escalate.</div></div>`
      : `<p class="note">No files named “PAYOPS evidence ${esc(id)}” in Google Drive. Name evidence files that way so the app can find them.</p>`;
    renderAudit();
  } catch (e) { out.innerHTML = `<p class="note">${esc(driveError(e, false))}</p>`; }
  b.disabled = false;
};
$("#drive-save").onclick = async () => {
  const out = $("#drive-save-out");
  if (!MCP) { out.textContent = "Google Drive works on the claude.ai link once the Google Drive connector is added."; return; }
  if (!can("drive_save")) { out.textContent = lockText("drive_save"); return; }
  const b = $("#drive-save"); b.disabled = true; out.textContent = "Saving the report to Google Drive…";
  try { const f = await saveReportToDrive(); out.innerHTML = `Saved to Google Drive: ${driveLink(f)}`; renderAudit(); }
  catch (e) { out.textContent = driveError(e, true); }
  b.disabled = false;
};
