/* PAYOPS AI Copilot (IDS 517, Tanjiba Sultana)
   Shared helpers, saved state and the append-only audit log
   Owner: Tanjiba Sultana
   Load order: see index.html */
"use strict";

/* =====================================================================
   Shared helpers and state
   ===================================================================== */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money = v => (v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const round2 = v => Math.round(v * 100) / 100;
const pad2 = n => String(n).padStart(2, "0");
const nowStr = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
const KEY = "payops-copilot-v1";
let S = load();
S.decisions.forEach((d, i) => { if (!d.id) d.id = "D" + String(i + 1).padStart(4, "0"); }); // older saved data
function blank() { return { seq: {CRD:0, WAL:0, BNK:0, CBK:0}, payments: [], decisions: [], audit: [], cases: [], qseq: 0 }; }
function load() { try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : blank(); } catch (e) { return blank(); } }
/* Who is signed in (FR-18). mode: pending | shared (Claude account) | demo (offline copy) */
let ME = { id: null, name: "", role: null, mode: "pending" };
let TESTING = false;          // self-test runs never write to the shared database
let SYSTEM_ACTOR = false;     // true while the sample day is loading
let SHARED = null;            // shared team database on claude.ai (FR-19), or null = this browser only
let REMOTE_AUDIT = [];        // audit entries read from the shared database
let lastWrite = 0, writeTimer = null;
function setSync(msg) { const el = $("#sync-note"); if (el) el.textContent = msg; }
function save() {
  if (TESTING) return;
  if (SHARED) {               // one ledger for the whole team
    clearTimeout(writeTimer);
    writeTimer = setTimeout(() => {
      lastWrite = Date.now();
      const state = Object.assign({}, S, { audit: [] });
      SHARED.doc("payops/state").set({ state: JSON.stringify(state), updatedAt: lastWrite, updatedBy: ME.id || "" })
        .then(() => setSync("Saved to the shared team database."))
        .catch(e => setSync("Could not save to the shared database (" + ((e && e.code) || "error") + ")."));
    }, 250);
    return;
  }
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
}

/* ---------- Shared: audit log ---------- */
function audit(category, action, details) {
  const e = { time: nowStr(), category, action, details, actor: ME.name || "" };
  if (SHARED && !TESTING) {   // append-only: entries are added, never rewritten
    SHARED.collection("audit").add(Object.assign({ at: Date.now() }, e)).catch(() => {});
    REMOTE_AUDIT.push(e);
    return;
  }
  S.audit.push(e);
  save();
}
const auditEntries = () => (SHARED && !TESTING ? REMOTE_AUDIT : S.audit);
