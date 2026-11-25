/* PAYOPS AI Copilot (IDS 517, Tanjiba Sultana)
   Sign-in, roles, preview as role, maker-checker, shared team database (FR-18, FR-19)
   Owner: Tanjiba Sultana
   Load order: see index.html */
"use strict";

/* =====================================================================
   Shared: sign-in and roles (FR-18) and the team database (FR-19)
   ===================================================================== */
const ROLE_NAME = { ops: "Ops staff", analyst: "Analyst", manager: "Manager", viewer: "Viewer (read only)" };
const PERMS = {
  capture:  { roles: ["ops", "analyst", "manager"], text: "capture payments" },
  dispute:  { roles: ["ops", "analyst", "manager"], text: "log disputes and ask the AI" },
  decide:   { roles: ["analyst", "manager"], text: "approve, reject, accept or contest held payments" },
  reopen:   { roles: ["analyst", "manager"], text: "reopen decisions" },
  refund:   { roles: ["analyst", "manager"], text: "refund payments" },
  escalate: { roles: ["analyst", "manager"], text: "escalate disputes into chargebacks" },
  evaluate: { roles: ["analyst", "manager"], text: "run the AI evaluation" },
  drive_save: { roles: ["analyst", "manager"], text: "save reports to Google Drive" },
  sample:   { roles: ["manager"], text: "load or replace the sample day" },
  reset:    { roles: ["manager"], text: "reset all data" },
  team:     { roles: ["manager"], text: "change team roles" }
};
const allowed = (role, action) => !!(PERMS[action] && PERMS[action].roles.includes(role));
const can = action => allowed(ME.role, action);
function lockText(action) {
  if (!ME.role) return "Sign in first.";
  const PLURAL = { ops: "ops staff", analyst: "analysts", manager: "managers" };
  const rs = PERMS[action].roles.map(r => PLURAL[r]);
  const who = rs.length > 1 ? rs.slice(0, -1).join(", ") + " and " + rs[rs.length - 1] : rs[0];
  return `Only ${who} can ${PERMS[action].text}. You are signed in as ${ME.name || "someone"} (${ROLE_NAME[ME.role]}).`;
}
function lockNote(sel, action) { const el = $(sel); if (el) el.textContent = can(action) ? "" : lockText(action); }
/* Maker-checker: the person who captured a payment cannot approve it. */
function makerCheckerBlock(p, userId) { return !!(p && userId && p.createdBy && p.createdBy !== "system" && p.createdBy === userId); }
const DEMO_USERS = [
  { id: "demo-tanjiba", name: "Tanjiba Sultana", role: "manager", note: "Developer and product owner" },
  { id: "demo-maria", name: "Maria Lopez (demo)", role: "manager", note: "Operations manager" },
  { id: "demo-daniel", name: "Daniel Kim (demo)", role: "analyst", note: "Fraud analyst" },
  { id: "demo-priya", name: "Priya Shah (demo)", role: "analyst", note: "Disputes analyst" },
  { id: "demo-ops", name: "Front-line ops (demo)", role: "ops", note: "Captures payments and logs complaints" }
];
let TEAM = { roles: {}, members: {} };
let USER = null;
let REAL = null;   // the signed-in person, kept while a manager previews another role
/* Managers can preview the app as another role on claude.ai, to test it without other accounts.
   Every preview is logged, and actions carry a "previewing" label so they are never mistaken for a teammate's. */
function setPreview(role, quiet) {
  if (!REAL || REAL.role !== "manager") return;
  if (!role) ME = Object.assign({}, REAL);
  else ME = { id: REAL.id + ":preview-" + role, name: `${REAL.name} (previewing ${ROLE_NAME[role]})`, role, mode: REAL.mode, preview: role, isMgr: false };
  audit("SYSTEM", "PREVIEW_ROLE", role ? `${REAL.name} started previewing the app as ${ROLE_NAME[role]}` : `${REAL.name} stopped previewing`);
  if (!quiet) renderAll();
}
function signInDemo(u, quiet) {
  if (!u) return;
  ME = { id: u.id, name: u.name, role: u.role, mode: "demo" };
  try { localStorage.setItem(KEY + "-user", u.id); } catch (e) {}
  $("#signin").hidden = true;
  if (!quiet) audit("SYSTEM", "SIGN_IN", `${u.name} signed in as ${ROLE_NAME[u.role]} (demo sign-in)`);
  renderAll();
}
function startDemoSignIn() {
  let saved = null; try { saved = localStorage.getItem(KEY + "-user"); } catch (e) {}
  const u = DEMO_USERS.find(x => x.id === saved);
  if (u) return signInDemo(u, true);
  ME = { id: null, name: "", role: null, mode: "demo" };
  showSignIn();
}
function showSignIn() {
  $("#signin-users").innerHTML = DEMO_USERS.map(u => `<button type="button" data-user="${u.id}"><span><b>${esc(u.name)}</b><br><span class="note">${esc(u.note)}</span></span><span class="chip st-SETTLED">${ROLE_NAME[u.role]}</span></button>`).join("");
  $("#signin").hidden = false;
  const first = $("#signin-users button"); if (first) first.focus();
}
function signOut() {
  if (ME.mode !== "demo") return;
  audit("SYSTEM", "SIGN_OUT", `${ME.name} signed out`);
  try { localStorage.removeItem(KEY + "-user"); } catch (e) {}
  ME = { id: null, name: "", role: null, mode: "demo" };
  renderAll(); showSignIn();
}
$("#signin-users").onclick = e => { const b = e.target.closest("[data-user]"); if (b) signInDemo(DEMO_USERS.find(u => u.id === b.dataset.user)); };
/* On claude.ai: sign in with the viewer's Claude account and use the shared team database. */
async function connectTeam() {
  if (!window.claude) return false;
  const [user, db] = await Promise.all([window.claude.use("user"), window.claude.use("db")]);
  if (!user || !db) return false;
  const id = await user.id();
  if (!id) return false;
  USER = user;
  const isMgr = await user.canEdit().catch(() => false);
  const canWrite = await user.can("data.write").catch(() => null);
  let name = "You";
  try { const ps = await user.profiles([id]); name = (ps[id] && ps[id].name) || "You"; } catch (e) {}
  ME = { id, name, role: isMgr ? "manager" : (canWrite === false ? "viewer" : "ops"), mode: "shared", isMgr, canWrite };
  REAL = Object.assign({}, ME);
  SHARED = db;
  S = blank();                       // the team database replaces this browser's copy
  if (canWrite !== false) db.doc("members/" + id).set({ id, lastSeen: Date.now() }).catch(() => {});
  db.doc("payops/team").onSnapshot(snap => {
    TEAM.roles = (snap.exists && snap.data().roles) || {};
    if (!ME.preview && !ME.isMgr && ME.role !== "viewer") { ME.role = TEAM.roles[ME.id] || "ops"; if (REAL) REAL.role = ME.role; }
    renderAll();
  }, () => {});
  db.collection("members").onSnapshot(snap => {
    TEAM.members = {}; snap.docs.forEach(d => { TEAM.members[d.id] = d.data() || {}; });
    renderTeam();
  }, () => {});
  let first = true;
  const slow = setTimeout(() => { if (first) setSync("The shared database is slow to answer; still trying."); }, 10000);
  db.doc("payops/state").onSnapshot(snap => {
    clearTimeout(slow);
    if (snap.metadata && snap.metadata.hasPendingWrites) return;
    const d = snap.exists ? snap.data() : null;
    if (d && d.state && (first || d.updatedBy !== ME.id)) {
      try { S = Object.assign(blank(), JSON.parse(d.state)); S.audit = []; } catch (e) {}
      advice = {};
    }
    first = false; setSync("Shared team data: everyone signed in sees the same ledger."); renderAll();
  }, e => setSync("Shared database unavailable (" + ((e && e.code) || "error") + ")."));
  db.collection("audit").orderBy("at", "desc").limit(300).onSnapshot(snap => {
    REMOTE_AUDIT = snap.docs.map(x => x.data()).reverse(); renderAudit();
  }, () => {});
  audit("SYSTEM", "SIGN_IN", `${name} signed in with a Claude account as ${ROLE_NAME[ME.role]}`);
  return true;
}
function renderWho() {
  const el = $("#whoami"); if (!el) return;
  if (ME.mode === "pending") { el.textContent = "Signing in…"; return; }
  if (!ME.role) { el.innerHTML = `<b>Not signed in</b><button type="button" id="who-in">Sign in</button>`; $("#who-in").onclick = showSignIn; return; }
  const canPreview = ME.mode === "shared" && REAL && REAL.role === "manager";
  el.innerHTML = `<b>${esc(ME.name)}</b><span class="role">${ROLE_NAME[ME.role]}</span><br>${ME.mode === "shared" ? "Claude account · shared team data" : "Demo sign-in · this browser"}${ME.mode === "demo" ? `<br><button type="button" id="who-out">Switch user</button>` : ""}${canPreview ? `<label class="preview">Preview as <select id="who-preview"><option value="">Myself (Manager)</option><option value="ops">Ops staff</option><option value="analyst">Analyst</option></select></label>${ME.preview ? `<span class="preview-on">Preview mode: your actions are logged with this label</span>` : ""}` : ""}`;
  if ($("#who-out")) $("#who-out").onclick = signOut;
  if ($("#who-preview")) { $("#who-preview").value = ME.preview || ""; $("#who-preview").onchange = e => setPreview(e.target.value); }
}
async function renderTeam() {
  const panel = $("#team-panel"); if (!panel) return;
  $("#perm-table").innerHTML = `<thead><tr><th>Action</th><th class="num">Ops staff</th><th class="num">Analyst</th><th class="num">Manager</th></tr></thead><tbody>${
    Object.keys(PERMS).map(a => `<tr><td>${esc(PERMS[a].text.replace(/^./, c => c.toUpperCase()))}</td>${["ops", "analyst", "manager"].map(r => `<td class="num">${allowed(r, a) ? '<span class="ok-mark">✓</span>' : "–"}</td>`).join("")}</tr>`).join("")
  }<tr><td>Approve a payment you captured yourself (maker-checker)</td><td class="num">–</td><td class="num">–</td><td class="num">–</td></tr></tbody>`;
  if (ME.mode === "shared") {
    const ids = Object.keys(TEAM.members);
    let names = {}; try { if (USER && ids.length) names = await USER.profiles(ids); } catch (e) {}
    panel.innerHTML = `<h2>People on this team</h2><p class="note">Everyone who has opened the app with a Claude account. The app’s owner and editors are managers; managers set everyone else’s role.</p>
      <div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Person</th><th>Role</th></tr></thead><tbody>${ids.map(id => {
        const nm = (names[id] && names[id].name) || (id === ME.id ? ME.name : "Someone");
        const role = id === ME.id ? ME.role : (TEAM.roles[id] || "ops");
        const cell = can("team") && id !== ME.id ? `<select data-role-for="${esc(id)}">${["ops", "analyst", "manager"].map(r => `<option value="${r}" ${r === role ? "selected" : ""}>${ROLE_NAME[r]}</option>`).join("")}</select>` : esc(ROLE_NAME[role] || role);
        return `<tr><td>${esc(nm)}${id === ME.id ? " (you)" : ""}</td><td>${cell}</td></tr>`; }).join("") || `<tr><td class="empty">No one yet.</td></tr>`}</tbody></table></div><p class="note" id="team-note"></p>`;
  } else {
    panel.innerHTML = `<h2>Demo users</h2><p class="note">This offline copy uses a demo sign-in to show each role. On claude.ai, people sign in with their Claude accounts and managers assign roles.</p>
      <div class="table-wrap" style="margin-top:10px"><table><thead><tr><th>Person</th><th>Role</th><th></th></tr></thead><tbody>${DEMO_USERS.map(u => `<tr><td>${esc(u.name)}<br><span class="note">${esc(u.note)}</span></td><td>${ROLE_NAME[u.role]}</td><td>${u.id === ME.id ? "Signed in" : `<button class="btn ghost small" type="button" data-switch="${u.id}">Sign in as</button>`}</td></tr>`).join("")}</tbody></table></div>`;
  }
}
$("#team-panel").onchange = async e => {
  const sel = e.target.closest("[data-role-for]"); if (!sel || !can("team") || !SHARED) return;
  const roles = Object.assign({}, TEAM.roles, { [sel.dataset.roleFor]: sel.value });
  try { await SHARED.doc("payops/team").set({ roles }); audit("SYSTEM", "ROLE_CHANGE", `${ME.name} set a team member’s role to ${ROLE_NAME[sel.value]}`); }
  catch (err) { const n = $("#team-note"); if (n) n.textContent = "Only the app’s owner and editors can change roles."; }
};
$("#team-panel").onclick = e => { const b = e.target.closest("[data-switch]"); if (b) signInDemo(DEMO_USERS.find(u => u.id === b.dataset.switch)); };
