/* PAYOPS AI Copilot (IDS 517, Tanjiba Sultana)
   Built-in self-test: 50 automated checks
   Owner: Tanjiba Sultana
   Load order: see index.html */
"use strict";

/* =====================================================================
   Shared: built-in self-test (the same checks as the HW9 test results)
   ===================================================================== */
let lastTests = null;
function runSelfTests() {
  const keep = JSON.stringify(S), keepAdvice = advice, keepMsg = $("#presult").innerHTML, keepME = ME;
  TESTING = true; ME = { id: "selftest", name: "Self-test", role: "manager", mode: keepME.mode };
  let R;
  try {

 R=[]; const t=(id,area,test,input,expected,fn)=>{ let actual,pass; try{ const o=fn(); actual=o[0]; pass=o[1]; }catch(e){ actual='Error: '+(e.message||e.rule||e); pass=false; } R.push({id,area,test,input,expected,actual:String(actual),result:pass?'Pass':'Fail'}); };
 const rej=(type,f)=>{ try{ buildPayment(type,f); return null; }catch(e){ return e; } };
 const card=(o)=>Object.assign({party:'Test',amount:100,cardNumber:'4111111111111111',expiry:'12/29',cvv:'123'},o);
 const q=a=>TOOLS.quote_payment.execute(a);
 // ---- HW8 test cases on the rules engine ----
 t('R1','Rules','Card over the limit','Card $12,000','Refused: card limit $10,000',()=>{const e=rej('card',card({amount:12000}));return [e?e.rule+': '+e.message:'accepted', !!e&&e.rule==='LIMIT'];});
 t('R2','Rules','Wallet limit','Wallet $2,500 and $2,600','$2,500 accepted; $2,600 refused',()=>{const ok=!rej('wallet',{party:'T',amount:2500,walletId:'a@b.com'}); const e=rej('wallet',{party:'T',amount:2600,walletId:'a@b.com'}); return [(ok?'2,500 accepted':'2,500 refused')+'; '+(e?e.message:'2,600 accepted'), ok&&!!e];});
 t('F1','Fees','Online international card fee','Card $3,000, online, international','$117.30',()=>{const r=q({type:'card',amount:3000,online:true,international:true});return ['$'+r.fee.toFixed(2), r.fee===117.3];});
 t('F2','Fees','In-store card fee','Card $500, in-store','$11.10',()=>{const r=q({type:'card',amount:500});return ['$'+r.fee.toFixed(2), r.fee===11.1];});
 t('F3','Fees','Wallet fee','Wallet $800','$12.00',()=>{const r=q({type:'wallet',amount:800});return ['$'+r.fee.toFixed(2), r.fee===12];});
 t('K1','Risk','Online international card','Card $3,000, online, international','75, held',()=>{const r=q({type:'card',amount:3000,online:true,international:true});return [r.riskScore+', '+r.decision, r.riskScore===75&&r.decision.startsWith('HELD')];});
 t('K2','Risk','Wallet on a new device','Wallet $1,200, new device','70, held (at threshold)',()=>{const r=q({type:'wallet',amount:1200,newDevice:true});return [r.riskScore+', '+r.decision, r.riskScore===70&&r.decision.startsWith('HELD')];});
 t('K3','Risk','ACH to a known beneficiary','ACH $30,000, known beneficiary','25, settled',()=>{const r=q({type:'bank',amount:30000,rail:'ACH'});return [r.riskScore+', '+r.decision, r.riskScore===25&&r.decision==='SETTLED'];});
 t('E3','Disputes','Fraud chargeback on $1,500','Chargeback 10.4, $1,500','Risk 80, held; if settled the business pays $1,515',()=>{S=blank(); const c=submit('card',card({amount:1500})); const cb=submit('chargeback',{party:'Test',amount:1500,originalId:c.p.id,reasonCode:'10.4'}); settle(cb.p); const net=netOf(cb.p); return ['risk '+cb.p.risk+', '+cb.out+'; net if settled '+net, cb.p.risk===80&&cb.out.startsWith('HELD FOR REVIEW')&&net===-1515];});
 // ---- edge cases ----
 t('M1-01','Validation','Exact card limit','Card $10,000.00','Accepted',()=>{const e=rej('card',card({amount:10000}));return [e?e.message:'accepted', !e];});
 t('M1-02','Validation','One cent over the limit','Card $10,000.01','Refused',()=>{const e=rej('card',card({amount:10000.01}));return [e?e.rule:'accepted', !!e&&e.rule==='LIMIT'];});
 t('M1-03','Validation','Mistyped card number','4111 1111 1111 1112','Refused by Luhn check',()=>{const e=rej('card',card({cardNumber:'4111111111111112'}));return [e?e.rule:'accepted', !!e&&e.rule==='LUHN_CHECK'];});
 t('M1-04','Validation','Expired card','Expiry 01/24','Refused',()=>{const e=rej('card',card({expiry:'01/24'}));return [e?e.rule:'accepted', !!e&&e.rule==='EXPIRY'];});
 t('M1-05','Validation','Short CVV','CVV 12','Refused',()=>{const e=rej('card',card({cvv:'12'}));return [e?e.rule:'accepted', !!e&&e.rule==='CVV'];});
 t('M1-06','Validation','Bad routing number','Routing 123456789','Refused by ABA check',()=>{const e=rej('bank',{party:'A',beneficiary:'B',amount:100,rail:'ACH',routing:'123456789',account:'12345678'});return [e?e.rule:'accepted', !!e&&e.rule==='ABA_CHECK'];});
 t('M1-07','Validation','RTP over its limit','RTP $100,000.01','Refused',()=>{const e=rej('bank',{party:'A',beneficiary:'B',amount:100000.01,rail:'RTP',routing:'021000021',account:'12345678'});return [e?e.rule:'accepted', !!e&&e.rule==='LIMIT'];});
 t('M1-08','Validation','Invalid wallet ID','Wallet ID "abc"','Refused',()=>{const e=rej('wallet',{party:'T',amount:10,walletId:'abc'});return [e?e.rule:'accepted', !!e&&e.rule==='WALLET_ID'];});
 t('M1-09','Fees','Wallet minimum fee','Wallet $10','$0.25',()=>{const r=q({type:'wallet',amount:10});return ['$'+r.fee.toFixed(2), r.fee===0.25];});
 t('M1-10','Fees','Bank transfer fees','RTP and ACH','$0.45 and $0.25',()=>{const a=q({type:'bank',amount:500,rail:'RTP'}).fee,b=q({type:'bank',amount:500,rail:'ACH'}).fee;return ['$'+a.toFixed(2)+' and $'+b.toFixed(2), a===0.45&&b===0.25];});
 t('M1-11','Risk','Medium-risk flag','Card $6,200, online','65, settled with medium flag',()=>{const r=q({type:'card',amount:6200,online:true});return [r.riskScore+', '+r.decision, r.riskScore===65&&r.decision.includes('medium')];});
 t('M1-12','Security','Card data kept safe','Submit card 4111 1111 1111 1111, CVV 123','Only masked number stored; no CVV',()=>{S=blank(); const c=submit('card',card({})); const js=JSON.stringify(c.p); return [c.p.details.maskedPan+(js.includes('4111111111111111')?'; full number stored':'')+(js.includes('"cvv"')?'; CVV stored':''), !js.includes('4111111111111111')&&!js.includes('"cvv"')];});
 t('M1-13','Sample day','Repeatable sample business day','Load twice from empty (seed 517)','Same 35 payments and totals both times',()=>{S=blank(); loadSampleDay(); const a=JSON.stringify(totals()); const n1=S.payments.length, h1=queue().length; S=blank(); loadSampleDay(); const b=JSON.stringify(totals()); return [n1+' payments, '+h1+' held; identical totals: '+(a===b), a===b&&n1===35&&h1===4];});
 t('E1','Review','Queue order','Sample day','Oldest held payment first',()=>{S=blank(); loadSampleDay(); const qq=queue(); const ok=qq.every((p,i)=>i===0||qq[i-1].qkey<p.qkey); return [qq.map(p=>p.id).join(', '), ok];});
 // ---- Reopen (decision history) ----
 t('RO-01','Reopen','Reopen an older decision','Approve A, reject B, approve C; reopen B','Only B returns to the front of the queue',()=>{S=blank(); loadSampleDay(); const [a,b,c]=queue(); decide(a.id,'APPROVED'); decide(b.id,'REJECTED','test'); decide(c.id,'APPROVED'); const r=reopen('D0002',''); const q0=queue()[0].id; return [r.msg+' Others: '+a.status+', '+c.status, r.ok&&q0===b.id&&a.status==='SETTLED'&&c.status==='SETTLED'];});
 t('RO-06','Reopen','Every reopen is logged','After RO-01','Audit entry REOPEN naming the original decision',()=>{const a=S.audit.filter(x=>x.action==='REOPEN'); return [a.length?a[a.length-1].details:'no entry', a.length===1&&a[0].details.includes('D0002')];});
 t('RO-02','Reopen','Reopen twice','Reopen D0002 again','Refused: already reopened',()=>{const r=reopen('D0002',''); return [r.msg, !r.ok&&r.msg.includes('already reopened')];});
 t('RO-03','Reopen','Old decision after the payment was decided again','Decide B again (D0004), then reopen D0002; reopen D0004 instead','D0002 refused; D0004 allowed',()=>{const b=queue()[0]; decide(b.id,'APPROVED'); const r1=reopenCheck(S.decisions.find(d=>d.id==='D0002')); const r2=reopenCheck(S.decisions.find(d=>d.id==='D0004')); return ['D0002: '+(r1||'allowed')+'; D0004: '+(r2||'allowed'), !!r1&&!r2];});
 t('RO-04','Reopen','Payment changed after decision (like E2)','Approve a card, then charge it back, then reopen','Refused: payment changed',()=>{S=blank(); const c=submit('card',card({amount:4000,online:true,international:true})); decide(c.p.id,'APPROVED'); const cb=submit('chargeback',{party:'Test',amount:100,originalId:c.p.id,reasonCode:'13.1'}); decide(cb.p.id,'APPROVED'); const r=reopen('D0001',''); return [r.msg, !r.ok];});
 t('RO-05','Reopen','Settled chargeback','Approve a held chargeback, then reopen','Refused: money already returned',()=>{S=blank(); const c=submit('card',card({amount:2000})); const cb=submit('chargeback',{party:'Test',amount:2000,originalId:c.p.id,reasonCode:'10.4'}); decide(cb.p.id,'APPROVED'); const d=S.decisions[S.decisions.length-1]; const r=reopen(d.id,''); return [r.msg, !r.ok&&r.msg.includes('cardholder')];});
 // ---- duplicate guard ----
 t('DG-01','Sample day','Replace keeps the audit log','Load sample day twice, then Replace','35 payments; audit log keeps both loads and the clear',()=>{S=blank(); loadSampleDay(); loadSampleDay(); const before=S.audit.length; doLoadSample(true); const acts=S.audit.map(a=>a.action).filter(a=>a==='LOAD_SAMPLE_DAY'||a==='CLEAR_DATA'); return [S.payments.length+' payments; '+acts.join(' → '), S.payments.length===35&&S.audit.length>before&&acts.join()==='LOAD_SAMPLE_DAY,LOAD_SAMPLE_DAY,CLEAR_DATA,LOAD_SAMPLE_DAY'];});


 // ---- final project: refunds, chargebacks, roles, playbook ----
 t('RF-01','Refunds','Partial refund','Refund $100 of a $500 card payment','$400 left; still settled; net lower by $100',()=>{S=blank(); const c=submit('card',card({amount:500})); refund(c.p.id,100,'test'); return [money(refundable(c.p))+' left; '+c.p.status+'; net '+netOf(c.p), refundable(c.p)===400&&c.p.status==='SETTLED'&&netOf(c.p)===round2(500-c.p.fee-100)];});
 t('RF-02','Refunds','Bank transfer refund','Refund an RTP transfer','Refused: not refundable',()=>{S=blank(); const b=submit('bank',{party:'A',beneficiary:'B',amount:500,rail:'RTP',routing:'021000021',account:'12345678'}); let e=null; try{refund(b.p.id,10,'');}catch(x){e=x;} return [e?e.rule+': '+e.message:'refunded', !!e&&e.rule==='NOT_REFUNDABLE'];});
 t('RF-03','Refunds','Refund more than is left','Refund $600 of a $500 card payment','Refused',()=>{S=blank(); const c=submit('card',card({amount:500})); let e=null; try{refund(c.p.id,600,'');}catch(x){e=x;} return [e?e.rule:'refunded', !!e&&e.rule==='LIMIT'];});
 t('RF-04','Refunds','Full refund','Refund all of a $250 wallet payment','Status REFUNDED; nothing left',()=>{S=blank(); const w=submit('wallet',{party:'T',amount:250,walletId:'a@b.com'}); refund(w.p.id,250,''); return [w.p.status+'; '+money(refundable(w.p))+' left', w.p.status==='REFUNDED'&&refundable(w.p)===0];});
 t('E2','Reopen','Reopen after a refund (HW8 case E2)','Approve a held card, refund part of it, then reopen','Refused: refunded after the decision',()=>{S=blank(); const c=submit('card',card({amount:3000,online:true,international:true})); decide(c.p.id,'APPROVED'); refund(c.p.id,50,''); const r=reopen('D0001',''); return [r.msg, !r.ok&&r.msg.includes('refunded')];});
 t('CB-01','Chargebacks','Every chargeback is reviewed','Chargeback 13.1 on $100 (risk 20)','Held for review even at low risk',()=>{S=blank(); const c=submit('card',card({amount:100})); const cb=submit('chargeback',{party:'Test',amount:100,originalId:c.p.id,reasonCode:'13.1'}); return ['risk '+cb.p.risk+', '+cb.p.status, cb.p.risk===20&&cb.p.status==='PENDING_REVIEW'];});
 t('CB-02','Chargebacks','Contest keeps the money','Contest the chargeback from CB-01','Contested; original stays settled; net 0',()=>{const cb=queue()[0]; decide(cb.id,'CONTESTED','evidence sent'); const o=S.payments.find(p=>p.id===cb.details.originalId); return [cb.status+'; original '+o.status+'; net '+netOf(cb), cb.status==='CONTESTED'&&o.status==='SETTLED'&&netOf(cb)===0];});
 t('CB-03','Chargebacks','Chargeback after a refund','Refund $40 of $100, then dispute $100','Refused; at most $60 can be disputed',()=>{S=blank(); const c=submit('card',card({amount:100})); refund(c.p.id,40,''); let e=null; try{submit('chargeback',{party:'T',amount:100,originalId:c.p.id,reasonCode:'13.1'});}catch(x){e=x;} return [(e?'$100 refused':'$100 accepted')+'; can dispute '+money(refundable(c.p)), !!e&&refundable(c.p)===60];});
 t('RL-01','Roles','Ops staff permissions','Role: Ops staff','Capture yes; decide, refund, reopen no',()=>{const ok=allowed('ops','capture')&&!allowed('ops','decide')&&!allowed('ops','refund')&&!allowed('ops','reopen'); return [ok?'as expected':'wrong permissions', ok];});
 t('RL-02','Roles','Analyst permissions','Role: Analyst','Decide, refund, reopen yes; roles and reset no',()=>{const ok=allowed('analyst','decide')&&allowed('analyst','refund')&&allowed('analyst','reopen')&&!allowed('analyst','team')&&!allowed('analyst','reset'); return [ok?'as expected':'wrong permissions', ok];});
 t('RL-03','Roles','Manager permissions','Role: Manager','Every action allowed',()=>{const ok=Object.keys(PERMS).every(a=>allowed('manager',a)); return [ok?'all allowed':'something missing', ok];});
 t('RL-04','Roles','Maker-checker','Same person captured and tries to approve','Blocked; another person or sample-day payment allowed',()=>{const p={createdBy:'u1'}; const ok=makerCheckerBlock(p,'u1')&&!makerCheckerBlock(p,'u2')&&!makerCheckerBlock({createdBy:'system'},'u1'); return [ok?'as expected':'wrong', ok];});
 t('RL-05','Roles','Decisions record who decided','Approve a held payment as the self-test user','Decision shows the user’s name',()=>{S=blank(); const c=submit('card',card({amount:3000,online:true,international:true})); decide(c.p.id,'APPROVED'); return ['by '+S.decisions[0].by, S.decisions[0].by==='Self-test'];});
 t('PB-01','Playbook','Dispute playbook tool','get_dispute_playbook for 13.1','Evidence includes proof of delivery',()=>{const r=TOOLS.get_dispute_playbook.execute({reasonCode:'13.1'}); return [r.evidence.join('; '), r.evidence.some(x=>/delivery/.test(x))];});
 t('PV-01','Roles','Manager previews another role','Manager previews Analyst, then stops','Analyst role under a separate test identity; back to Manager after',()=>{const kR=REAL,kM=ME; REAL={id:'m1',name:'Mgr',role:'manager',mode:'shared'}; ME=Object.assign({},REAL); setPreview('analyst',true); const a=ME.role+' | new id: '+(ME.id!=='m1')+' | '+ME.name; setPreview('',true); const b=ME.role; REAL=kR; ME=kM; return [a+' → '+b, a==='analyst | new id: true | Mgr (previewing Analyst)'&&b==='manager'];});
 t('PV-02','Roles','Only managers can preview','Analyst tries to preview Ops staff','Nothing changes',()=>{const kR=REAL,kM=ME; REAL={id:'a1',name:'Ana',role:'analyst',mode:'shared'}; ME=Object.assign({},REAL); setPreview('ops',true); const ok=ME.role==='analyst'; REAL=kR; ME=kM; return [ok?'unchanged':'changed', ok];});
 // ---- Google Drive connector (MCP) ----
 t('DR-01','Google Drive','Only payment IDs reach the Drive search','CRD-0001, and an injection attempt',"CRD-0001 kept; anything else dropped",()=>{const a=safeId('CRD-0001'), b=safeId("CRD-0001' or title contains '"), c=safeId('drop'); return ['kept: '+a+' | injection: '+(b||'dropped')+' | other: '+(c||'dropped'), a==='CRD-0001'&&b===''&&c===''];});
 t('DR-02','Google Drive','Only Google Docs or Drive links are shown','docs.google.com, drive.google.com and another site','Google links allowed; other sites not linked',()=>{const ok=safeUrl('https://docs.google.com/document/d/x/edit')&&safeUrl('https://drive.google.com/file/d/x/view')&&!safeUrl('https://evil.example.com/x')&&!safeUrl('javascript:alert(1)'); return [ok?'as expected':'wrong', ok];});
 t('DR-03','Google Drive','Clear message for each connector problem','Not connected; sign-in expired; save timed out','Says how to fix it; warns a save may have happened',()=>{const a=driveError({code:'server_not_connected'},false), b=driveError({code:'needs_reauth'},false), c=driveError({code:'server_unavailable'},true); const ok=/Settings/.test(a)&&/sign in again/.test(b)&&/may or may not/.test(c); return [ok?'messages correct':'wrong', ok];});
    // UI check: the warning before loading the sample day again
    S = blank(); loadSampleDay(); $("#sample").onclick();
    const txt = $("#presult").textContent;
    R.push({ id: "DG-02", area: "Sample day", test: "Warning before loading again", input: "Click Load sample business day with data present",
      expected: "Warning with Replace / Keep choices; no duplicates", actual: txt.slice(0, 110) + "; payments: " + S.payments.length,
      result: txt.includes("already loaded") && S.payments.length === 35 ? "Pass" : "Fail" });
  } finally {
    TESTING = false; ME = keepME; S = JSON.parse(keep); advice = keepAdvice; reopening = null; save();   // put the user's data back
    $("#presult").innerHTML = keepMsg;
  }
  return R;
}
function renderTests(R) {
  const pass = R.filter(r => r.result === "Pass").length;
  $("#tests-kpis").innerHTML = [[R.length, "Checks run"], [pass, "Passed"], [R.length - pass, "Failed"], [nowStr().slice(0, 16), "Run at"]]
    .map(([v, l]) => `<div class="kpi"><div class="v">${esc(v)}</div><div class="l">${l}</div></div>`).join("");
  $("#tests-table").innerHTML = `<thead><tr><th>ID</th><th>Area</th><th>Test and input</th><th>Expected</th><th>Actual result</th><th>Result</th></tr></thead><tbody>${
    R.map(r => `<tr><td class="id">${esc(r.id)}</td><td>${esc(r.area)}</td><td style="white-space:normal;min-width:220px">${esc(r.test)}: ${esc(r.input)}</td><td style="white-space:normal;min-width:160px">${esc(r.expected)}</td><td style="white-space:normal;min-width:200px">${esc(r.actual)}</td><td>${r.result === "Pass" ? '<span class="chip st-SETTLED">Pass</span>' : '<span class="chip st-REJECTED">Fail</span>'}</td></tr>`).join("")}</tbody>`;
}
$("#run-tests").onclick = () => {
  const R = runSelfTests(); lastTests = R; renderTests(R); renderAll();
  $("#export-tests").disabled = false;
  audit("SYSTEM", "SELF_TEST", `${R.filter(r => r.result === "Pass").length} of ${R.length} checks passed`); renderAudit();
};
$("#export-tests").onclick = () => { if (lastTests) exportFile("payops_test_results.csv", csv([["id","area","test","input","expected","actual","result"], ...lastTests.map(r => [r.id, r.area, r.test, r.input, r.expected, r.actual, r.result])]), "#tests-note"); };
