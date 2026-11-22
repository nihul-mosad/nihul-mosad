// בדיקות לשעון הנוכחות בשרת: node functions/clock.test.js
const { clock, MAX_FAILS, MAX_NET_FAILS } = require('./clock');
let pass=0,fail=0;const ok=(c,n)=>{if(c){pass++;console.log('✓',n);}else{fail++;console.log('✗',n);}};
const B='insts/afula-banim/';
function mk(t0){
  const db={'insts/afula-banim':{name:'ת"ת',clockOn:true},'insts/off':{name:'x'},
    [B+'clockcodes/1234']:{sid:'S1',name:'משה כהן',active:true},[B+'clockcodes/5555']:{sid:'S2',name:'יוסף לוי',active:false}};
  const colls={};let seq=0,clockMs=t0||Date.parse('2026-11-23T05:50:00Z');
  const deps={getDoc:async p=>db[p]?JSON.parse(JSON.stringify(db[p])):null,setDoc:async(p,d,m)=>{db[p]=m?Object.assign({},db[p]||{},d):d;},
    addDoc:async(c,d)=>{const id='D'+(++seq);(colls[c]=colls[c]||[]).push(Object.assign({id},d));return id;},
    query:async(c,f)=>(colls[c]||[]).filter(x=>f.every(([k,v])=>x[k]===v)),
    hash:s=>require('crypto').createHash('sha256').update(s).digest('hex'),now:()=>clockMs};
  return {db,colls,deps,tick:ms=>{clockMs+=ms;}};
}
const call=(deps,data,ip)=>clock({data:Object.assign({inst:'afula-banim',dev:'dev1'},data),ip:ip||'1.1.1.1'},deps);
const err=async(p,code,n,re)=>{try{await p;ok(false,n+' (לא נזרקה שגיאה)');}catch(e){ok(e.code===code&&(!re||re.test(e.message)),n+' → '+e.code+' '+e.message);}};
(async()=>{
  let {db,colls,deps,tick}=mk();
  let r=await call(deps,{code:'1234',action:'who'});
  ok(r.name==='משה כהן'&&r.today.length===0&&!r.inside,'זיהוי לפי קוד מחזיר רק שם והחתמות של היום');
  ok(JSON.stringify(r).indexOf('S1')<0,'מזהה העובד הפנימי לא נשלח לדפדפן');
  r=await call(deps,{code:'1234',action:'in'});
  ok(r.done==='in'&&r.hm==='07:50'&&r.inside,'כניסה נרשמת בשעון ישראל (07:50)');
  ok(colls[B+'punch'].length===1&&colls[B+'punch'][0].day==='2026-11-23'&&colls[B+'punch'][0].sid==='S1','ההחתמה נשמרה עם יום ועובד');
  tick(60000);r=await call(deps,{code:'1234',action:'in'});
  ok(r.dup&&colls[B+'punch'].length===1,'לחיצה כפולה בתוך 3 דקות לא נרשמת פעמיים');
  tick(10*60000);r=await call(deps,{code:'1234',action:'in'});
  ok(r.confirm&&/07:50/.test(r.confirm)&&colls[B+'punch'].length===1,'כניסה שנייה דורשת אישור');
  r=await call(deps,{code:'1234',action:'in',force:true});
  ok(r.done==='in'&&colls[B+'punch'].length===2,'עם אישור — נרשמת');
  tick(6*3600000);r=await call(deps,{code:'1234',action:'out'});
  ok(r.done==='out'&&!r.inside&&r.today.length===3,'יציאה נרשמת ומעדכנת מצב');
  ({db,colls,deps,tick}=mk());
  r=await call(deps,{code:'1234',action:'out'});
  ok(r.confirm&&/לא רשומה לך כניסה/.test(r.confirm)&&!colls[B+'punch'],'יציאה בלי כניסה דורשת אישור');
  // היעדרות
  r=await call(deps,{code:'1234',action:'abs',from:'2026-11-24',to:'2026-11-25',reason:'מחלה'});
  ok(r.done==='abs'&&colls[B+'absreq'][0].status==='pending'&&colls[B+'absreq'][0].reason==='מחלה','היעדרות נשמרת כממתינה לאישור');
  await err(call(deps,{code:'1234',action:'abs',from:'2026-11-25',to:'2026-11-24',reason:'מחלה'}),'invalid-argument','תאריכים הפוכים נדחים');
  await err(call(deps,{code:'1234',action:'abs',from:'2026-11-24',reason:'טיול'}),'invalid-argument','סיבה שלא ברשימה נדחית');
  await err(call(deps,{code:'1234',action:'abs',from:'2026-11-24',reason:'אחר'}),'invalid-argument','"אחר" בלי הסבר נדחה');
  // שגיאות ונעילה
  await err(call(deps,{code:'5555',action:'in'}),'permission-denied','קוד של עובד לא פעיל נדחה');
  await err(call(deps,{code:'12a4',action:'in'}),'invalid-argument','קוד שאינו 4 ספרות נדחה');
  await err(call(deps,{code:'1234',action:'in',inst:'off'}),'failed-precondition','מוסד שלא הפעיל שעון נוכחות נחסם');
  await err(call(deps,{code:'1234',action:'in',inst:'nope'}),'not-found','מוסד לא קיים');
  ({db,colls,deps,tick}=mk());
  for(let i=1;i<MAX_FAILS;i++)await err(call(deps,{code:'9999',action:'who'},'2.2.2.2'),'permission-denied','קוד שגוי '+i,/נשארו/);
  await err(call(deps,{code:'9999',action:'who'},'2.2.2.2'),'permission-denied','קוד שגוי אחרון נועל',/ננעלה/);
  await err(call(deps,{code:'1234',action:'who'},'2.2.2.2'),'resource-exhausted','גם קוד נכון חסום בזמן הנעילה');
  r=await call(deps,{code:'1234',action:'who'},'3.3.3.3');
  ok(r.ok,'מכשיר אחר לא נפגע מהנעילה');
  tick(16*60000);r=await call(deps,{code:'1234',action:'who'},'2.2.2.2');
  ok(r.ok,'אחרי 15 דקות הנעילה משתחררת');
  ({db,colls,deps,tick}=mk());
  for(let i=0;i<MAX_NET_FAILS;i++){try{await clock({data:{inst:'afula-banim',code:'9999',action:'who',dev:'X'+i},ip:'4.4.4.4'},deps);}catch(e){}}
  await err(clock({data:{inst:'afula-banim',code:'1234',action:'who',dev:'NEW'},ip:'4.4.4.4'},deps),'resource-exhausted','החלפת מכשיר לא עוקפת את הנעילה לפי רשת');
  console.log('\n'+pass+' עברו, '+fail+' נכשלו');process.exit(fail?1:0);
})();
