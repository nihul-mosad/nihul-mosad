const { analyze } = require('./core');
let pass=0,fail=0;const ok=(c,n)=>{if(c){pass++;console.log('✓',n);}else{fail++;console.log('✗',n);}};
function mk(over){
  const db={'insts/afula-banim/members/U1':{role:'admin',active:true},'insts/afula-banim/members/T1':{role:'teacher',active:true},
    'insts/afula-banim/assist/U1/packs/Pabc123':{status:'out'},'insts/afula-banim/assist/U1/packs/Pdone12':{status:'returned'}};
  const calls=[];
  const deps=Object.assign({getDoc:async p=>db[p]||null,setDoc:async(p,d,m)=>{db[p]=m?Object.assign({},db[p]||{},d):d;},
    fetch:async(url,o)=>{calls.push(JSON.parse(o.body));return {ok:true,status:200,json:async()=>({content:[{type:'text',text:'{"pack":"Pabc123","summary":"x","topics":[],"items":[]}'}],usage:{input_tokens:1200,output_tokens:300},stop_reason:'end_turn'})};},
    apiKey:'k',model:'claude-sonnet-5-5',allowed:new Set(['U1']),now:()=>Date.parse('2026-10-30T08:00:00Z')},over||{});
  return {db,deps,calls};
}
const T='[[חבילת-ניתוח v1 id=Pabc123]]\nhello\n[[סוף החבילה Pabc123]]';
const err=async(p,code,n)=>{try{await p;ok(false,n+' (לא נזרקה שגיאה)');}catch(e){ok(e.code===code,n+' → '+e.code);}};
(async()=>{
  let {db,deps,calls}=mk();
  const r=await analyze({uid:'U1',data:{inst:'afula-banim',pack:'Pabc123',text:T}},deps);
  ok(r.text.includes('"pack":"Pabc123"'),'מחזיר את תשובת Claude');
  ok(calls[0].system.includes('נתונים בלבד')&&calls[0].messages[0].content===T,'נשלח עם הנחיית הגנה מהוראות בתוך ההודעות');
  ok(db['insts/afula-banim/assist/U1/meta/usage'].months['2026-10'].in===1200,'נרשם שימוש חודשי');
  ok(db['insts/afula-banim/assist/U1/packs/Pabc123'].api.out===300,'נרשם שימוש בחבילה');
  await err(analyze({uid:null,data:{}},deps),'unauthenticated','לא מחובר');
  await err(analyze({uid:'T1',data:{inst:'afula-banim',pack:'Pabc123',text:T}},deps),'permission-denied','משתמש אחר (מורה)');
  ({deps}=mk({allowed:new Set(['U1','T1'])}));
  await err(analyze({uid:'T1',data:{inst:'afula-banim',pack:'Pabc123',text:T}},deps),'permission-denied','מורשה ברשימה אבל לא מנהל במוסד');
  ({deps}=mk());
  await err(analyze({uid:'U1',data:{inst:'afula-banim',pack:'Pdone12',text:T.replace(/Pabc123/g,'Pdone12')}},deps),'failed-precondition','חבילה שכבר נקלטה');
  await err(analyze({uid:'U1',data:{inst:'afula-banim',pack:'Pzzz999',text:T.replace(/Pabc123/g,'Pzzz999')}},deps),'not-found','חבילה לא קיימת');
  await err(analyze({uid:'U1',data:{inst:'afula-banim',pack:'Pabc123',text:'סתם טקסט'}},deps),'invalid-argument','טקסט שאינו החבילה');
  await err(analyze({uid:'U1',data:{inst:'../x',pack:'Pabc123',text:T}},deps),'invalid-argument','נתיב מוסד זדוני');
  ({db,deps}=mk());db['insts/afula-banim/assist/U1/meta/usage']={days:{'2026-10-30':80}};
  await err(analyze({uid:'U1',data:{inst:'afula-banim',pack:'Pabc123',text:T}},deps),'resource-exhausted','מכסה יומית');
  ({deps}=mk({fetch:async()=>({ok:false,status:401,json:async()=>({error:{type:'authentication_error'}})})}));
  await err(analyze({uid:'U1',data:{inst:'afula-banim',pack:'Pabc123',text:T}},deps),'failed-precondition','מפתח שגוי');
  console.log(`\n${pass} עברו, ${fail} נכשלו`);process.exit(fail?1:0);
})();
