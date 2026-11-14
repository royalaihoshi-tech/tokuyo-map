/* Facility official-site URL overrides — v1.2.12 TEST. Staff-only Firestore data. */
(()=>{'use strict';
const cfg=window.TOKUYO_FIREBASE_CONFIG;
const db=(cfg&&window.firebase)?firebase.firestore():null;
const auth=(cfg&&window.firebase)?firebase.auth():null;
let records=new Map(),unsubscribe=null,ready=false,handlers=new Set(),lastError='';
const k=(id,service)=>`${id}_${service||510}`;
const get=(id,service)=>records.get(k(id,service))?.url||null;
function valid(raw){try{const u=new URL(String(raw).trim());return u.protocol==='https:'&&!u.username&&!u.password&&u.hostname.includes('.')&&u.hostname!=='localhost'&&u.href.length<=2000}catch{return false}}
function broadcast(){for(const fn of handlers){try{fn()}catch(err){console.warn(err)}}}
function watch(){if(unsubscribe){unsubscribe();unsubscribe=null}records=new Map();ready=false;lastError='';broadcast();
 if(!db||!auth?.currentUser)return;
 unsubscribe=db.collection('facilityWebsites').onSnapshot(s=>{
  records=new Map(s.docs.map(doc=>[doc.id,doc.data()]));ready=true;lastError='';broadcast();
 },err=>{lastError='公式URLの共有設定が読み込めません。Firestoreのルールを確認してください。';console.warn('facilityWebsites watch',err);broadcast()});
}
if(auth)auth.onAuthStateChanged(watch);
async function set(id,service,newUrl,defaultUrl){
 if(!auth?.currentUser)throw Error('ログインしてください');
 const url=String(newUrl||'').trim();if(!valid(url))throw Error('https:// で始まる正しいURLを入力してください');
 const key=k(id,service),ref=db.collection('facilityWebsites').doc(key),uid=auth.currentUser.uid,email=auth.currentUser.email||'';
 await db.runTransaction(async tx=>{
  const snap=await tx.get(ref),old=snap.exists?snap.data():null,revision=Number(old?.revision||0)+1;
  const previousUrl=String(old?.url||defaultUrl||'');
  const payload={url,previousUrl,revision,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:uid,updatedEmail:email};
  tx.set(ref,payload);
  tx.set(ref.collection('revisions').doc(String(revision).padStart(9,'0')),payload);
 });
 records.set(key,{url});broadcast();return url;
}
window.TokuyoFacilityWebsites={get,set,onChange(fn){handlers.add(fn);return ()=>handlers.delete(fn)},isReady:()=>ready,error:()=>lastError,valid};
})();
