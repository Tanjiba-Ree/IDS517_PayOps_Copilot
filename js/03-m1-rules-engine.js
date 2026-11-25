/* PAYOPS AI Copilot (IDS 517, Tanjiba Sultana)
   M1 rules engine: validation, fees, risk, refunds, sample day
   Owner: Tanjiba Sultana
   Load order: see index.html */
"use strict";

/* =====================================================================
   M1  Payments ledger and rules engine   (owner: Tanjiba)
   Same rules as the HW7 PayOps Java app.
   ===================================================================== */
const RULES = {
  limits: { card: 10000, wallet: 2500, RTP: 100000, ACH: 250000 },
  thresholds: { held: 70, medium: 40 },
  points: {
    card: "online (card not present) +30; international +25; amount > $2,000 +20; amount > $5,000 +15",
    wallet: "new device +45; amount > $1,000 +25",
    bank: "new beneficiary +40; amount > $25,000 +25; RTP rail +10",
    chargeback: "dispute base +20; fraud reason code 10.x +40; amount > $1,000 +20"
  },
  fees: "card in-store 2.2% + $0.10, online 2.9% + $0.30, +1% international; wallet 1.5% (min $0.25); RTP $0.45; ACH $0.25; chargeback $15 dispute fee",
  refunds: "card and wallet payments can be refunded after settlement; bank transfers cannot (RTP is irrevocable)",
  undo: "a review decision can be reopened only if the payment has not changed since (for example it was refunded or charged back)",
  chargebacks: "every chargeback is reviewed by an analyst, who accepts it (the cardholder is refunded) or contests it with evidence",
  makerChecker: "the person who captured a payment cannot approve it; another analyst must decide"
};
const REASON_CODES = {
  "10.4": "Fraud – card absent environment",
  "13.1": "Merchandise/services not received",
  "13.3": "Not as described or defective",
  "12.6": "Duplicate processing",
  "13.6": "Credit not processed"
};
/* Team playbook per reason code: the AI loads it as a tool before advising (Agent Skill-style, S2-08). */
const PLAYBOOK = {
  "10.4": { evidence: ["AVS and CVV match results", "3-D Secure authentication result", "device and IP address of the order", "the customer's earlier undisputed payments"],
            contestWhen: "the payment was authenticated (3-D Secure) or AVS and CVV matched, and the customer has paid this way before",
            acceptWhen: "there was no authentication and the card details did not match", respond: "within the card network's deadline (about 30 days; check the network rules)" },
  "13.1": { evidence: ["proof of delivery with tracking number", "delivery address matching the billing address", "messages with the customer"],
            contestWhen: "tracking shows delivery to the customer's address", acceptWhen: "there is no proof of delivery", respond: "within the card network's deadline (about 30 days; check the network rules)" },
  "13.3": { evidence: ["product description at the time of sale", "return and quality records", "messages with the customer"],
            contestWhen: "the item matched its description and no return was attempted", acceptWhen: "the item was defective or a return was refused", respond: "within the card network's deadline (about 30 days; check the network rules)" },
  "12.6": { evidence: ["both transaction records", "proof that they are separate purchases"],
            contestWhen: "the two payments are separate purchases", acceptWhen: "the same purchase was processed twice", respond: "within the card network's deadline (about 30 days; check the network rules)" },
  "13.6": { evidence: ["refund policy shown at purchase", "return records", "the refund transaction, if any"],
            contestWhen: "no return was received, or the refund was already issued", acceptWhen: "a credit was promised but not processed", respond: "within the card network's deadline (about 30 days; check the network rules)" }
};
const PREFIX = { card: "CRD", wallet: "WAL", bank: "BNK", chargeback: "CBK" };
const TYPE_NAME = { card: "Card", wallet: "Mobile wallet", bank: "Bank transfer", chargeback: "Chargeback" };

function luhn(d) {
  let sum = 0, dbl = false;
  for (let i = d.length - 1; i >= 0; i--) { let x = +d[i]; if (dbl) { x *= 2; if (x > 9) x -= 9; } sum += x; dbl = !dbl; }
  return sum % 10 === 0;
}
function abaValid(r) {
  if (!/^\d{9}$/.test(r)) return false;
  const d = r.split("").map(Number);
  return (3 * (d[0] + d[3] + d[6]) + 7 * (d[1] + d[4] + d[7]) + (d[2] + d[5] + d[8])) % 10 === 0;
}
function expiryValid(mmyy) {
  const m = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(mmyy || ""); if (!m) return false;
  const mm = +m[1], yy = 2000 + +m[2], now = new Date();
  return yy > now.getFullYear() || (yy === now.getFullYear() && mm >= now.getMonth() + 1);
}
function networkOf(d) {
  if (d.startsWith("4")) return "Visa"; if (/^(5[1-5]|2[2-7])/.test(d)) return "Mastercard";
  if (/^3[47]/.test(d)) return "Amex"; if (d.startsWith("6")) return "Discover"; return "Card";
}
const maskPan = d => d.length < 8 ? "****" : d.slice(0, 4) + " **** **** " + d.slice(-4);

/* Builds a payment from form input; throws {rule, message} on the first failed rule. */
function buildPayment(type, f) {
  const fail = (rule, message) => { throw { rule, message }; };
  const amount = round2(Number(f.amount));
  const party = String(f.party || "").trim();
  if (!party) fail("REQUIRED", type === "bank" ? "Payer name is required." : "Customer name is required.");
  if (!(amount > 0)) fail("AMOUNT", "Amount must be greater than 0.");
  const p = { id: "", type, party, amount, createdAt: f.createdAt || nowStr(), status: "NEW", details: {}, rejectReason: "", chargedBack: 0 };
  if (type === "card") {
    const d = String(f.cardNumber || "").replace(/[\s-]/g, "");
    if (amount > RULES.limits.card) fail("LIMIT", "Card limit is $10,000.00 per transaction.");
    if (!/^\d{13,19}$/.test(d) || !luhn(d)) fail("LUHN_CHECK", "Card number fails the Luhn check digit (typo?).");
    if (!expiryValid(f.expiry)) fail("EXPIRY", "Expiry must be MM/YY and not in the past.");
    if (!/^\d{3,4}$/.test(String(f.cvv || "").trim())) fail("CVV", "CVV must be 3 or 4 digits.");
    p.details = { network: networkOf(d), maskedPan: maskPan(d), online: !!f.online, international: !!f.international, expiry: f.expiry };
    // the full card number and CVV are not kept (PCI DSS)
  } else if (type === "wallet") {
    if (amount > RULES.limits.wallet) fail("LIMIT", "Wallet limit is $2,500.00 per payment.");
    const w = String(f.walletId || "").trim();
    if (!/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(w) && !/^\d{10}$/.test(w.replace(/[\s()-]/g, ""))) fail("WALLET_ID", "Wallet ID must be an email or a 10-digit phone number.");
    p.details = { provider: f.provider || "Apple Pay", walletId: w.includes("@") ? w.replace(/^(.).*(@.*)$/, "$1***$2") : "******" + w.slice(-4), newDevice: !!f.newDevice };
  } else if (type === "bank") {
    const rail = f.rail === "ACH" ? "ACH" : "RTP";
    const ben = String(f.beneficiary || "").trim();
    if (!ben) fail("REQUIRED", "Beneficiary name is required.");
    if (amount > RULES.limits[rail]) fail("LIMIT", `${rail} limit is ${money(RULES.limits[rail])}.`);
    if (!abaValid(String(f.routing || ""))) fail("ABA_CHECK", "Routing number fails the ABA check digit.");
    if (!/^\d{4,17}$/.test(String(f.account || ""))) fail("ACCOUNT", "Account number must be 4 to 17 digits.");
    p.details = { rail, beneficiary: ben, routing: f.routing, account: "****" + String(f.account).slice(-4), newBeneficiary: !!f.newBeneficiary };
  } else if (type === "chargeback") {
    const orig = S.payments.find(x => x.id === f.originalId);
    if (!orig || orig.type !== "card") fail("REFERENCE", "Choose the disputed card payment.");
    if (orig.status !== "SETTLED") fail("REFERENCE", `Only settled card payments can be disputed (${orig.id} is ${orig.status}).`);
    if (amount > refundable(orig) + 0.0001) fail("LIMIT", `Chargeback cannot exceed the remaining ${money(refundable(orig))} of ${orig.id}.`);
    if (!REASON_CODES[f.reasonCode]) fail("REQUIRED", "Reason code is required.");
    p.details = { originalId: orig.id, reasonCode: f.reasonCode, reviewId: f.reviewId || "" };
  }
  return p;
}
function feeOf(p) {
  if (p.type === "card") { let rate = p.details.online ? 0.029 : 0.022; if (p.details.international) rate += 0.01; return round2(p.amount * rate + (p.details.online ? 0.30 : 0.10)); }
  if (p.type === "wallet") return round2(Math.max(0.25, p.amount * 0.015));
  if (p.type === "bank") return p.details.rail === "RTP" ? 0.45 : 0.25;
  return 15;
}
function riskOf(p) {
  let s = 0; const r = []; const add = (n, why) => { s += n; r.push(`${why} (+${n})`); };
  if (p.type === "card") { if (p.details.online) add(30, "card not present"); if (p.details.international) add(25, "international"); if (p.amount > 2000) add(20, "amount > $2,000"); if (p.amount > 5000) add(15, "amount > $5,000"); }
  if (p.type === "wallet") { if (p.details.newDevice) add(45, "new device"); if (p.amount > 1000) add(25, "amount > $1,000"); }
  if (p.type === "bank") { if (p.details.newBeneficiary) add(40, "new beneficiary"); if (p.amount > 25000) add(25, "amount > $25,000"); if (p.details.rail === "RTP") add(10, "irrevocable real-time rail"); }
  if (p.type === "chargeback") { add(20, "dispute base"); if (p.details.reasonCode.startsWith("10.")) add(40, "fraud reason code"); if (p.amount > 1000) add(20, "amount > $1,000"); }
  return { score: Math.min(s, 100), reasons: r.length ? r : ["no risk rules triggered"] };
}
function refundable(p) { return round2(p.amount - (p.chargedBack || 0) - (p.refunded || 0)); }
function netOf(p) {
  if (p.type === "chargeback") return p.status === "SETTLED" ? -round2(p.amount + p.fee) : 0;
  return ["SETTLED", "CHARGED_BACK", "REFUNDED"].includes(p.status) ? round2(p.amount - p.fee - (p.refunded || 0)) : 0;
}
function settle(p) {
  p.status = "SETTLED";
  if (p.type === "chargeback") { const o = S.payments.find(x => x.id === p.details.originalId); if (o) { o.chargedBack = round2((o.chargedBack || 0) + p.amount); o.status = "CHARGED_BACK"; } }
}
/* Refund part or all of a settled card or wallet payment (HW7 rules, S2-02). */
function refund(id, amount, reason) {
  const fail = (rule, message) => { throw { rule, message }; };
  const p = S.payments.find(x => x.id === id);
  if (!p) fail("REFERENCE", "Choose a payment to refund.");
  if (p.type === "bank") fail("NOT_REFUNDABLE", "Bank transfers cannot be refunded (RTP is irrevocable).");
  if (p.type === "chargeback") fail("NOT_REFUNDABLE", "A chargeback cannot be refunded.");
  if (p.status !== "SETTLED") fail("STATUS", `Only settled payments can be refunded (${p.id} is ${p.status.replace("_", " ").toLowerCase()}).`);
  const a = round2(Number(amount));
  if (!(a > 0)) fail("AMOUNT", "Refund amount must be greater than 0.");
  if (a > refundable(p) + 0.0001) fail("LIMIT", `Refund cannot exceed the remaining ${money(refundable(p))}.`);
  p.refunded = round2((p.refunded || 0) + a);
  (p.refunds = p.refunds || []).push({ amount: a, reason: reason || "", time: nowStr(), by: ME.name || "" });
  if (refundable(p) <= 0) p.status = "REFUNDED";
  audit("PAYMENT", "REFUND", `${p.id}: ${money(a)} refunded${reason ? " – " + reason : ""}; ${money(refundable(p))} left`);
  save();
  return p;
}
/* Submit any payment type: validate, score, then settle or hold. Returns a decision text. */
function submit(type, form) {
  const p = buildPayment(type, form);
  p.id = PREFIX[type] + "-" + String(++S.seq[PREFIX[type]]).padStart(4, "0");
  p.fee = feeOf(p);
  p.createdBy = SYSTEM_ACTOR ? "system" : (ME.id || ""); p.createdByName = SYSTEM_ACTOR ? "Sample day" : (ME.name || "");
  const r = riskOf(p); p.risk = r.score; p.reasons = r.reasons;
  S.payments.push(p);
  let out;
  if (p.risk >= RULES.thresholds.held || p.type === "chargeback") {   // every chargeback is reviewed (S2-11)
    p.status = "PENDING_REVIEW"; p.qkey = ++S.qseq; out = p.type === "chargeback" ? "HELD FOR REVIEW (accept or contest)" : "HELD FOR REVIEW";
  }
  else { settle(p); out = p.risk >= RULES.thresholds.medium ? "SETTLED (medium risk, flagged)" : "SETTLED"; }
  audit("PAYMENT", "SUBMIT", `${p.id} ${TYPE_NAME[type]} ${money(p.amount)} risk ${p.risk} → ${out}`);
  return { p, out };
}
/* Fixed seed = the same sample day every time, so tests are repeatable. */
function loadSampleDay(seed = 517) {
  SYSTEM_ACTOR = true;
  try { return loadSampleDayInner(seed); } finally { SYSTEM_ACTOR = false; }
}
function loadSampleDayInner(seed) {
  let t = seed >>> 0;
  const rnd = () => { t += 0x6D2B79F5; let r = Math.imul(t ^ t >>> 15, 1 | t); r ^= r + Math.imul(r ^ r >>> 7, 61 | r); return ((r ^ r >>> 14) >>> 0) / 4294967296; };
  const pick = a => a[Math.floor(rnd() * a.length)];
  const people = ["Ava Thompson","Liam Patel","Sofia Garcia","Noah Kim","Mia Johnson","Ethan Rossi","Zara Ahmed","Lucas Brown","Chloe Nguyen","Omar Haddad","Grace Lee","Daniel Okafor"];
  const firms = ["Lakeview Dental LLC","Northside Builders","Prairie Foods Co.","Loop Tech Supplies","Midway Logistics","Riverwalk Cafe"];
  const cards = ["4111111111111111","5555555555554444","4012888888881881","378282246310005","6011111111111117","5105105105105100"];
  const routings = ["071000013","021000021","011000015","121000248"];
  const base = new Date(); base.setHours(8, 0, 0, 0);
  let n = 0;
  for (let i = 0; i < 30; i++) {
    const at = nowStr(new Date(base.getTime() + i * 17 * 60000));
    const r = rnd();
    try {
      if (r < 0.5) submit("card", { party: pick(people), amount: round2(20 + rnd() * rnd() * 7500), cardNumber: pick(cards), expiry: "12/29", cvv: "123", online: rnd() < 0.55, international: rnd() < 0.3, createdAt: at });
      else if (r < 0.78) submit("wallet", { party: pick(people), amount: round2(10 + rnd() * rnd() * 1900), provider: pick(["Apple Pay","Google Pay","PayPal","Venmo","Samsung Pay"]), walletId: "3125550" + String(100 + i), newDevice: rnd() < 0.3, createdAt: at });
      else submit("bank", { party: pick(firms), beneficiary: pick(firms), amount: round2(500 + rnd() * rnd() * 55000), rail: rnd() < 0.45 ? "RTP" : "ACH", routing: pick(routings), account: String(10000000 + Math.floor(rnd() * 8999999)), newBeneficiary: rnd() < 0.35, createdAt: at });
      n++;
    } catch (e) { /* sample data is valid by construction */ }
  }
  // Scenario payments that match the HW8 test cases, so the queue always has work to review
  const late = i => nowStr(new Date(base.getTime() + (30 + i) * 17 * 60000));
  const scenarios = [
    ["card", { party: "Omar Haddad", amount: 3000, cardNumber: "4012888888881881", expiry: "12/29", cvv: "123", online: true, international: true, createdAt: late(0) }],
    ["wallet", { party: "Zara Ahmed", amount: 1200, provider: "Venmo", walletId: "zara@example.com", newDevice: true, createdAt: late(1) }],
    ["bank", { party: "Midway Logistics", beneficiary: "Northside Builders", amount: 30000, rail: "RTP", routing: "071000013", account: "55501234", newBeneficiary: true, createdAt: late(2) }],
    ["card", { party: "Liam Patel", amount: 6200, cardNumber: "5555555555554444", expiry: "12/29", cvv: "123", online: true, international: false, createdAt: late(3) }],
    ["wallet", { party: "Grace Lee", amount: 800, provider: "Google Pay", walletId: "3125550199", newDevice: true, createdAt: late(4) }]
  ];
  for (const [type, f] of scenarios) { submit(type, f); n++; }
  audit("SYSTEM", "LOAD_SAMPLE_DAY", `seed ${seed}: ${n} payments`);
  return n;
}
