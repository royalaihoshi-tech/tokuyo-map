/* Shared facility memo, v1.2.8. Authenticated staff only. No public/local memo copies. */
(()=>{'use strict';
const cfg=window.TOKUYO_FIREBASE_CONFIG;
const sharedLoginEmail=String(window.TOKUYO_SHARED_LOGIN_EMAIL||'').trim();
const ready=!!(cfg&&cfg.apiKey&&cfg.projectId&&cfg.appId&&window.firebase);
let auth=null,db=null,user=null,authorized=false,currentUnsub=null;
let persistenceReady=Promise.resolve();
let entryVerified=false; // Requires Firebase staff approval and an unexpired 24-hour browser grant.
const entryGrantKey='tokuyo_entry_verified_until_v1';
const entryDurationMs=24*60*60*1000;
function grantValid(){
 try{const exp=Number(localStorage.getItem(entryGrantKey));const now=Date.now();return Number.isFinite(exp)&&exp>now&&exp<=now+entryDurationMs}
 catch(e){return false}
}
function saveGrant(){try{localStorage.setItem(entryGrantKey,String(Date.now()+entryDurationMs));return true}catch(e){return false}}
function clearGrant(){try{localStorage.removeItem(entryGrantKey)}catch(e){}}
let authInitialized=false;
let authCheckError='';
if(ready){
 try{
  const app=firebase.apps.length?firebase.app():firebase.initializeApp(cfg);
  auth=app.auth();db=app.firestore();
  // Explicitly request browser-persistent Firebase authentication.
  // This is required in addition to the 24-hour entry grant.
  persistenceReady=auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(e=>{
   console.warn('Firebase persistent login is unavailable',e);
   authCheckError='このブラウザではログイン状態を保存できません。Chromeのサイトデータ設定をご確認ください。';
  });
  auth.onAuthStateChanged(async u=>{
   if(u && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sharedLoginEmail) || u.email?.toLowerCase()!==sharedLoginEmail.toLowerCase())){
    // Existing individual account from previous test: switch to the shared staff account.
    await auth.signOut();return;
   }
   user=u;authorized=false;entryVerified=false;authCheckError='';
   // Do not erase the 24h deadline just because Firebase session restoration failed.
   // Access stays locked unless a valid Firebase session and staff permission return.
   if(u){try{
    const member=await Promise.race([db.collection('staff').doc(u.uid).get(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('STAFF_CHECK_TIMEOUT')),12000))]);
    authorized=member.exists&&member.data().active===true;
    entryVerified=authorized&&grantValid();
    if(!authorized)clearGrant();
   }catch(e){authCheckError=e.message==='STAFF_CHECK_TIMEOUT'?'権限確認がタイムアウトしました。通信状態を確認し、もう一度お試しください。':'権限確認に失敗しました。Firestoreの設定をご確認ください。';console.warn('staff check failed',e)}}
   authInitialized=true;
   document.dispatchEvent(new CustomEvent('tokuyo-auth-changed'));
  });
 }catch(e){console.error('Shared memo setup failed',e)}
}
const escapeText=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
// Visibility preference applies to every facility popup on this browser.
const memoVisibilityKey='tokuyo_shared_memo_collapsed';
let memoCollapsed=false;
try{memoCollapsed=localStorage.getItem(memoVisibilityKey)==='true'}catch(e){}
const memoVisibilityListeners=new Set();
function setMemoCollapsed(value){
 memoCollapsed=!!value;
 try{localStorage.setItem(memoVisibilityKey,String(memoCollapsed))}catch(e){}
 for(const fn of memoVisibilityListeners)fn(memoCollapsed);
}
window.addEventListener('storage',e=>{if(e.key===memoVisibilityKey){memoCollapsed=e.newValue==='true';for(const fn of memoVisibilityListeners)fn(memoCollapsed)}});

const css=document.createElement('style');css.textContent=`
.popup .shared-memo{margin-top:12px;border-top:1px solid #d8e3dc;padding-top:10px;min-width:260px;font:12px/1.55 system-ui,sans-serif;color:#284c3b}
.shared-memo h4{margin:0;font-size:13px}.shared-memo .memo-status{font-size:11px;color:#62796d;margin:5px 0;white-space:pre-wrap}
.shared-memo textarea{display:block;width:100%;box-sizing:border-box;border:1px solid #bad0c3;border-radius:8px;padding:11px;font:13px/1.75 system-ui,sans-serif;background:white;color:#263a30;height:118px;min-height:88px;max-height:42vh;resize:vertical;overflow:auto;white-space:pre-wrap}.shared-memo.is-expanded textarea{height:280px!important;max-height:56vh}.shared-memo .memo-heading{display:flex;align-items:center;justify-content:space-between;gap:8px}.shared-memo .memo-heading-actions{display:flex;align-items:center;gap:6px;flex:0 0 auto}.shared-memo .memo-expand,.shared-memo .memo-visibility{margin:0;padding:2px 7px;font-size:11px;white-space:nowrap}.shared-memo .memo-status:empty{display:none}
.shared-memo.is-collapsed textarea,.shared-memo.is-collapsed .memo-status{display:none}.shared-memo.is-collapsed{padding-bottom:0}
.shared-memo button{border:1px solid #bed0c6;background:#f2f8f5;color:#246348;border-radius:6px;padding:5px 9px;margin:6px 6px 0 0;cursor:pointer;font-size:12px}
.shared-memo button:disabled{opacity:.5;cursor:not-allowed}.shared-memo .memo-actions{display:flex;align-items:center;flex-wrap:wrap}.shared-memo summary{cursor:pointer;margin-top:7px;color:#315b7a}

.toolbar-filters .tokuyo-staff-login-group{flex-shrink:0;white-space:nowrap;margin-left:4px}
.tokuyo-staff-login-group{background:#fff8e4!important;border-color:#e9d8a5!important}
.tokuyo-staff-login-group[hidden],.tokuyo-staff-login-popover[hidden]{display:none!important}
.tokuyo-staff-login-group #tokuyo-staff-login-button{background:#fffdf6;border-color:#deb968;color:#745321}
.tokuyo-staff-login-group #tokuyo-staff-login-button.is-logout{background:#f7faf8;border-color:#cbdcd1;color:#406453}
.tokuyo-staff-login-popover{position:absolute;top:78px;right:12px;margin-top:0;width:min(306px,calc(100vw - 32px));z-index:1200;background:#fff;border:1px solid #d6e3d9;border-radius:12px;box-shadow:0 7px 26px #182a2433;padding:16px;box-sizing:border-box;color:#284c3b;font:13px/1.55 system-ui,sans-serif}
.tokuyo-staff-login-popover h3{margin:0 0 6px;font-size:15px}.tokuyo-staff-login-popover label{display:block;margin:0 0 7px;font-size:12px;font-weight:700}.tokuyo-staff-login-popover input{display:block;width:100%;box-sizing:border-box;padding:10px;border:1px solid #b7ccc0;border-radius:7px;font-size:15px;background:white;color:#263a30}
.tokuyo-staff-login-popover .tokuyo-auth-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px}.tokuyo-staff-login-popover button{padding:8px 13px;font-size:12px}
.tokuyo-staff-login-popover .tokuyo-auth-message{margin:8px 0 0;min-height:16px;font-size:11px;color:#6e716c}
.tokuyo-settings-account{padding:12px 18px;border-top:1px solid #e4eae6;background:#fff}
.tokuyo-settings-logout{width:100%;border:1px solid #d6aaaa;border-radius:8px;background:#fff7f7;color:#a33838;padding:11px 12px;cursor:pointer;font:600 13px system-ui,sans-serif}
.tokuyo-settings-logout:hover{background:#ffebeb}
.tokuyo-settings-logout:disabled{opacity:.5;cursor:wait}
.tokuyo-settings-logout[hidden]{display:none!important}
`;document.head.appendChild(css);
// Entry overlay is a usability gate, not server-side access control.
// Firebase rules continue to protect private shared-memo data.
function setupEntryScreen(){
 const box=document.getElementById('tokuyo-entry-card');
 if(!box)return;
 const input=document.getElementById('tokuyo-entry-pass');
 const submit=document.getElementById('tokuyo-entry-submit');
 const status=document.getElementById('tokuyo-entry-status');
 async function update(){
  if(!authInitialized){status.textContent='ログイン状態を確認中…';return}
  if(entryVerified&&user&&authorized&&grantValid()){document.body.classList.add('tokuyo-unlocked');input.value='';status.textContent='';setTimeout(()=>{try{window.dispatchEvent(new Event('resize'))}catch{}},200)}
  else{
   document.body.classList.remove('tokuyo-unlocked');
   if(entryVerified&&!grantValid()){entryVerified=false;clearGrant();status.textContent='24時間が経過しました。再度ログインしてください。'}
   else if(authInitialized)status.textContent=authCheckError||(!user&&grantValid()?'ブラウザにログイン情報が残っていません。再度ログインしてください。':'');
  }
 }
 document.addEventListener('tokuyo-auth-changed',update);
 box.addEventListener('submit',async ev=>{
  ev.preventDefault();if(!auth||!db){status.textContent='Firebase設定を確認してください';return}
  submit.disabled=true;status.textContent='ログイン中…';
  try{
   await persistenceReady;
   const login=await auth.signInWithEmailAndPassword(sharedLoginEmail,input.value);
   status.textContent='利用権限を確認中…';
   const member=await Promise.race([db.collection('staff').doc(login.user.uid).get(),new Promise((_,reject)=>setTimeout(()=>reject(Error('確認がタイムアウトしました')),12000))]);
   if(!member.exists||member.data().active!==true){status.textContent='このアカウントは許可されていません';return}
   user=login.user;authorized=true;entryVerified=saveGrant();authInitialized=true;authCheckError='';
   if(!entryVerified)status.textContent='ログイン状態をブラウザに保存できませんでした。ブラウザの設定を確認してください。';
   document.dispatchEvent(new CustomEvent('tokuyo-auth-changed'));
  }catch(e){status.textContent='ログインに失敗しました。パスワードをご確認ください。'}
  finally{input.value='';submit.disabled=false}
 });
 if(!ready)status.textContent='Firebase接続設定が必要です';
 // Also close a still-open map after the 24-hour grant has expired.
 setInterval(()=>{if(document.body.classList.contains('tokuyo-unlocked')&&!grantValid())update()},30000);
 window.addEventListener('focus',update);
 window.addEventListener('storage',e=>{if(e.key===entryGrantKey)update()});
 update();
}
setupEntryScreen();
function mountGlobalAuth(toolbar){
 if(!toolbar||toolbar.querySelector('.tokuyo-staff-login-group'))return;
 const group=document.createElement('div');group.className='toolbar-group tokuyo-staff-login-group';group.hidden=true;
 const toggle=document.createElement('button');toggle.id='tokuyo-staff-login-button';toggle.type='button';toggle.textContent='🔒 スタッフログイン';toggle.setAttribute('aria-expanded','false');
 group.append(toggle);toolbar.append(group);
 const popup=document.createElement('div');popup.className='tokuyo-staff-login-popover';popup.hidden=true;
 popup.innerHTML='<h3>スタッフログイン</h3><form class="tokuyo-auth-form"><label for="tokuyo-global-password">共通パスワード</label><input id="tokuyo-global-password" type="password" autocomplete="current-password" required><div class="tokuyo-auth-actions"><button type="button" class="tokuyo-auth-close">閉じる</button><button type="submit" class="tokuyo-auth-submit">ログイン</button></div></form><p class="tokuyo-auth-message" role="status" aria-live="polite"></p>';
 (toolbar.closest('.map-wrap')||document.body).append(popup);
 const form=popup.querySelector('form'),input=popup.querySelector('input'),submit=popup.querySelector('.tokuyo-auth-submit'),message=popup.querySelector('.tokuyo-auth-message');
 function hide(){popup.hidden=true;toggle.setAttribute('aria-expanded','false');input.value='';message.textContent=''}
 function update(){
  if(!authInitialized){group.hidden=true;return}
  // A signed-in but unauthorized account is never treated as unlocked.
  group.hidden=false;
  if(user&&authorized){hide();toggle.textContent='↪ ログアウト';toggle.classList.add('is-logout');toggle.disabled=false;toggle.setAttribute('aria-expanded','false');return}
  toggle.classList.remove('is-logout');
  if(!ready||!auth||!sharedLoginEmail||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sharedLoginEmail)){
   group.hidden=false;toggle.textContent='共有メモ：設定確認';toggle.disabled=true;
  }else{toggle.textContent='🔒 スタッフログイン';toggle.disabled=false}
 }
 toggle.onclick=async()=>{
  if(user&&authorized){
   toggle.disabled=true;
   try{await auth.signOut();clearGrant();entryVerified=false;document.dispatchEvent(new CustomEvent('tokuyo-auth-changed'))}catch(e){console.warn('Staff logout failed',e);toggle.disabled=false;alert('ログアウトに失敗しました。再度お試しください。')}
   return;
  }
  popup.hidden=!popup.hidden;toggle.setAttribute('aria-expanded',String(!popup.hidden));if(!popup.hidden)input.focus();
 };
 popup.querySelector('.tokuyo-auth-close').onclick=hide;
 form.onsubmit=async event=>{
  event.preventDefault();if(!auth||submit.disabled)return;
  submit.disabled=true;message.textContent='ログイン中…';
  const password=input.value;
  try{
   await persistenceReady;
   const signedIn=await auth.signInWithEmailAndPassword(sharedLoginEmail,password);
   // The auth-state callback may have already finished here; never overwrite a success with 'checking'.
   if(!popup.hidden)message.textContent='権限を確認中…';
   const member=await Promise.race([
    db.collection('staff').doc(signedIn.user.uid).get(),
    new Promise((_,reject)=>setTimeout(()=>reject(new Error('STAFF_CHECK_TIMEOUT')),12000))
   ]);
   if(!member.exists||member.data().active!==true){
    message.textContent='このアカウントは共有メモの利用許可がありません。';
   }else{
    user=signedIn.user;authorized=true;authInitialized=true;authCheckError='';
    entryVerified=saveGrant();
    document.dispatchEvent(new CustomEvent('tokuyo-auth-changed'));
    hide();
   }
  }catch(error){
   console.warn('Staff login failed',error);
   message.textContent=error.message==='STAFF_CHECK_TIMEOUT'?'権限確認がタイムアウトしました。通信状態を確認し、再度お試しください。':'ログインまたは権限確認に失敗しました。共通パスワードと通信状態をご確認ください。';
  }finally{submit.disabled=false;input.value=''}
 };
 document.addEventListener('tokuyo-auth-changed',()=>{
  update();if(user&&!authorized&&!popup.hidden){message.textContent=authCheckError||'このアカウントには共有メモの利用権限がありません。'}
 });
 document.addEventListener('pointerdown',event=>{if(!popup.hidden&&!popup.contains(event.target)&&!group.contains(event.target))hide()});
 update();
}
// A dedicated logout action in the bottom of the settings sidebar.
async function logoutFromSettings(button){
 if(!auth)return;
 if(!window.confirm('特養マップからログアウトしますか？\n再度開く際はパスワード入力が必要になります。'))return;
 button.disabled=true;
 try{
  await auth.signOut();
  // Discard the 24-hour access grant only after the Firebase sign-out succeeds.
  clearGrant();entryVerified=false;user=null;authorized=false;authInitialized=true;
  document.body.classList.remove('tokuyo-unlocked');
  document.dispatchEvent(new CustomEvent('tokuyo-auth-changed'));
  const field=document.getElementById('tokuyo-entry-pass');
  if(field)field.focus();
 }catch(err){
  console.warn('Settings logout failed',err);
  alert('ログアウトできませんでした。通信状態を確認して再度お試しください。');
 }finally{button.disabled=false}
}
function mountSettingsLogout(){
 const side=document.querySelector('.side');
 if(!side||side.querySelector('#tokuyo-settings-logout'))return;
 const footer=side.querySelector('.footer');
 const wrap=document.createElement('div');wrap.className='tokuyo-settings-account';
 wrap.innerHTML='<button id="tokuyo-settings-logout" type="button" class="tokuyo-settings-logout" hidden>↪ ログアウト</button>';
 if(footer)footer.before(wrap);else side.append(wrap);
 const button=wrap.querySelector('button');
 button.addEventListener('click',()=>logoutFromSettings(button));
 const refresh=()=>{button.hidden=!(authInitialized&&user&&authorized&&entryVerified&&grantValid())};
 document.addEventListener('tokuyo-auth-changed',refresh);
 window.addEventListener('focus',refresh);
 refresh();
}
function mount(popup,id,serviceCode,name){
 if(currentUnsub){currentUnsub();currentUnsub=null}
 popup.querySelector('.shared-memo')?.remove();
 const facilityKey=`${id}_${serviceCode}`;
 const el=document.createElement('section');el.className='shared-memo';popup.appendChild(el);
 let unsub=null,active=true,timer=null,seq=0,saveBusy=false,dirty=false,conflicted=false;
 let baseline='',revision=0,input=null,hasSnapshot=false,visibilityUpdater=null;
 const ref=db?.collection('facilityMemos').doc(facilityKey);
 function status(msg){const out=el.querySelector('.memo-status');if(out)out.textContent=msg||''}
 function schedule(){clearTimeout(timer);if(!conflicted)timer=setTimeout(save,1100)}
 async function save(){
  clearTimeout(timer);
  if(!active||!input||!hasSnapshot||saveBusy||conflicted||!dirty||!user||!authorized)return;
  const body=input.value,expected=revision,editSeq=seq;
  saveBusy=true;status('保存中…');
  try{
   await db.runTransaction(async tx=>{
    const snap=await tx.get(ref),actual=snap.exists?Number(snap.data().revision||0):0;
    if(actual!==expected)throw Error('CONFLICT');
    const next=actual+1,history=ref.collection('revisions').doc(String(next).padStart(9,'0'));
    const data={body,revision:next,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:user.uid,updatedEmail:user.email||''};
    tx.set(ref,data);tx.set(history,data);
   });
   revision=expected+1;baseline=body;
   dirty=input.value!==body;conflicted=false;status('');
  }catch(e){
   if(e.message==='CONFLICT'){conflicted=true;status('他の端末で更新されました。入力内容をコピーしてから開き直してください。')}
   else status('自動保存に失敗しました。通信状態を確認してください。');
  }finally{
   saveBusy=false;
   if(dirty&&!conflicted&&seq!==editSeq)schedule();
  }
 }
 function cleanup(){
  // Flush pending edits while the closure is still alive. Do not silently discard them.
  if(dirty&&!saveBusy&&!conflicted&&hasSnapshot)void save();
  if(visibilityUpdater)memoVisibilityListeners.delete(visibilityUpdater);
  active=false;clearTimeout(timer);
  if(unsub)unsub();document.removeEventListener('tokuyo-auth-changed',render);
 }
 currentUnsub=cleanup;
 function resizeInput(){
  // Keep the address and basic facility information visible by default.
  // The reader may expand the memo explicitly, or manually resize its textarea.
  if(!input)return;
 }
 function render(){
  if(!active)return;
  if(visibilityUpdater){memoVisibilityListeners.delete(visibilityUpdater);visibilityUpdater=null}
  clearTimeout(timer);if(unsub){unsub();unsub=null}
  if(!db||!auth){el.innerHTML='<h4>共有メモ</h4><p class="memo-status">Firebaseへの接続設定を確認してください。</p>';return}
  if(!user||!authorized||!entryVerified){el.innerHTML='<h4>共有メモ</h4><p class="memo-status">ログイン後に表示します。</p>';return}
  el.innerHTML='<div class="memo-heading"><h4>共有メモ</h4><div class="memo-heading-actions"><button type="button" class="memo-expand" aria-expanded="false">広げる</button><button type="button" class="memo-visibility" aria-expanded="true">－</button></div></div><textarea class="memo-body" maxlength="10000" placeholder="施設の注意点や共有事項を入力" disabled></textarea><p class="memo-status" role="status" aria-live="polite">読み込み中…</p>';
  const popupContent=popup.parentElement;
  const popupWrapper=popup.closest('.leaflet-popup-content-wrapper');
  const applyWidth=wide=>{if(popupContent){popupContent.style.width=wide?'520px':'';popupContent.style.maxWidth=wide?'520px':'';}if(popupWrapper){popupWrapper.style.width=wide?'560px':'';popupWrapper.style.maxWidth=wide?'560px':'';}}
  const expand=el.querySelector('.memo-expand');expand.addEventListener('click',()=>{const next=!el.classList.contains('is-expanded');el.classList.toggle('is-expanded',next);expand.textContent=next?'戻す':'広げる';expand.setAttribute('aria-expanded',String(next));applyWidth(next);setTimeout(()=>{try{window.dispatchEvent(new Event('resize'))}catch{}},60);});
  const hideBtn=el.querySelector('.memo-visibility');
  function applyCollapsed(hidden){
   el.classList.toggle('is-collapsed',hidden);
   hideBtn.textContent=hidden?'＋':'－';
   hideBtn.title=hidden?'共有メモを表示':'共有メモを非表示';
   hideBtn.setAttribute('aria-label',hideBtn.title);
   hideBtn.setAttribute('aria-expanded',String(!hidden));
   if(hidden&&el.classList.contains('is-expanded')){
    el.classList.remove('is-expanded');expand.textContent='広げる';
    expand.setAttribute('aria-expanded','false');applyWidth(false);
   }
   expand.hidden=hidden;
  }
  visibilityUpdater=applyCollapsed;memoVisibilityListeners.add(applyCollapsed);
  applyCollapsed(memoCollapsed);
  hideBtn.addEventListener('click',()=>setMemoCollapsed(!memoCollapsed));
  input=el.querySelector('.memo-body');hasSnapshot=false;dirty=false;conflicted=false;revision=0;baseline='';
  input.addEventListener('input',()=>{
   seq++;dirty=input.value!==baseline;status('');resizeInput();if(dirty&&hasSnapshot)schedule();
  });
  unsub=ref.onSnapshot(snap=>{
   if(!active)return;
   const data=snap.exists?snap.data():{},remoteBody=String(data.body||''),remoteRev=Number(data.revision||0);
   // Firestore snapshots may arrive before the transaction result resolves.
   if(saveBusy)return;
   if(dirty&&remoteRev!==revision&&remoteBody!==baseline){
    conflicted=true;status('他の端末から更新されました。入力内容をコピーして開き直してください。');return;
   }
   revision=remoteRev;baseline=remoteBody;hasSnapshot=true;
   if(!dirty){input.value=remoteBody;input.disabled=false;resizeInput()}
   status('');
  },()=>status('読み込みに失敗しました。通信・権限を確認してください。'));
 }
 document.addEventListener('tokuyo-auth-changed',render);render();
}

window.TokuyoSharedMemos={mount,mountGlobalAuth:()=>{},mountSettingsLogout};
})();
