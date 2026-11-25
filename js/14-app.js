/* PAYOPS AI Copilot (IDS 517, Tanjiba Sultana)
   Screen routing and start-up (sign-in, AI and Google Drive connections)
   Owner: Tanjiba Sultana
   Load order: see index.html */
"use strict";

/* ---------- Routing between screens ---------- */
const VIEWS = ["ledger", "review", "dashboard", "disputes", "chat", "audit", "tests", "eval", "team"];
function route() {
  const v = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "ledger";
  document.querySelectorAll("section[data-section]").forEach(s => s.hidden = s.dataset.section !== v);
  document.querySelectorAll("nav.side a").forEach(a => { if (a.dataset.view === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
}
window.addEventListener("hashchange", route);
$("#audit-filter").onchange = renderAudit;
renderForm(); route(); renderAll();
/* Sign in: Claude account + shared team database on claude.ai; demo sign-in for the offline copy. */
(async () => {
  let ok = false;
  try { ok = await connectTeam(); } catch (e) { ok = false; }
  if (!ok) startDemoSignIn();
  renderAll();
})();
/* Google Drive connector (MCP): null when this view has no connectors (offline copy) */
(async () => {
  try { MCP = window.claude ? await window.claude.use("mcp") : null; } catch (e) { MCP = null; }
  renderAll();
})();
/* Light up AI features once the claude.ai runtime answers (null = no AI in this view). */
(async () => {
  try {
    AI = window.claude ? await window.claude.use("sample") : null;
    if (AI) { const lim = await AI.limits().catch(() => null); AI_TOOLS = !!(lim && lim.tools); }
  } catch (e) { AI = null; }
  renderAll();
})();
