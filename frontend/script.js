/* ████████████████████████████████████████████████████████████████
   ██                                                            ██
   ██   striveAI v1 — CONFIGURATION — READ THIS FIRST           ██
   ██                                                            ██
   ████████████████████████████████████████████████████████████████

   ┌─────────────────────────────────────────────────────────────┐
   │  STEP 1 ▸ GEMINI API KEY  (powers ALL AI features)          │
   │                                                             │
   │  Get your FREE key at:                                      │
   │  https://aistudio.google.com/app/apikey                     │
   │                                                             │
   │  Then paste it below replacing 'YOUR_GEMINI_API_KEY_HERE'   │
   │                                                             │
   │  ⚠ AI Coach, Roadmap, Tasks, Goals ALL use this key         │
   └─────────────────────────────────────────────────────────────┘ */

let GEMINI_CONFIGURED = false;

/* ┌─────────────────────────────────────────────────────────────┐
   │  STEP 2 ▸ PAYPAL (optional — for paid subscriptions)        │
   │  Get Client ID: https://developer.paypal.com                │
   │  → My Apps & Credentials → Create App → copy Client ID      │
   └─────────────────────────────────────────────────────────────┘ */
let PAYPAL_CLIENT_ID = 'YOUR_PAYPAL_CLIENT_ID_HERE';
let PLAN_PRO = 'YOUR_PAYPAL_PLAN_ID_PRO_HERE';
let PLAN_TEAM = 'YOUR_PAYPAL_PLAN_ID_TEAM_HERE';
let PAYPAL_SDK_URL = 'https://www.paypal.com/sdk/js';
let FIREBASE_CONFIGURED = false;
let FIREBASE_WEB_CONFIG = null;
let FB_APP = null;
let FB_AUTH = null;
let FB_DB = null;
let CURRENT_AUTH_USER = null;
let STORAGE_BRIDGE_INSTALLED = false;
let CLOUD_KV = {};
let CLOUD_WRITE_QUEUE = new Set();
let CLOUD_FLUSH_TIMER = null;
let CLOUD_FLUSH_IN_PROGRESS = false;
const SA_KEY_PREFIX = 'sa_';
// For sandbox testing change above to: 'https://www.sandbox.paypal.com/sdk/js'

async function loadRuntimeConfig(){
  try{
    const res=await fetch('/api/config');
    if(!res.ok) throw new Error(`Config request failed: ${res.status}`);
    const cfg=await res.json();
    GEMINI_CONFIGURED=Boolean(cfg.geminiConfigured);
    PAYPAL_CLIENT_ID=cfg.paypalClientId||PAYPAL_CLIENT_ID;
    PLAN_PRO=cfg.planPro||PLAN_PRO;
    PLAN_TEAM=cfg.planTeam||PLAN_TEAM;
    PAYPAL_SDK_URL=cfg.paypalSdkUrl||PAYPAL_SDK_URL;
    FIREBASE_CONFIGURED=Boolean(cfg.firebaseConfigured);
    FIREBASE_WEB_CONFIG=cfg.firebaseConfig||null;
  }catch(err){
    console.warn('Runtime config failed to load',err);
  }
}

/* ════════════════════════════════════════════════════════════════
   GEMINI API — used for: Roadmap, AI Coach, Task Cleanup,
   Goal Review, Note Processing, Onboarding generation
   Model: gemini-2.5-flash  |  Proxied through backend
   ════════════════════════════════════════════════════════════════ */
async function gemini(prompt, systemCtx='', maxTokens=1000, opts={}) {
  if(!GEMINI_CONFIGURED){
    throw new Error('⚠ Gemini API key not set!\n\nSet GEMINI_API_KEY in server environment variables.\n\nGet a free key at: https://aistudio.google.com/app/apikey');
  }
  const res = await fetch('/api/gemini/generate',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({prompt,systemCtx,maxTokens,opts})
  });
  const data = await res.json().catch(()=>({}));
  if(!res.ok||data.error) throw new Error(data.error||'Gemini API error');
  if(data.finishReason==='MAX_TOKENS') throw new Error('Ответ Gemini обрезался из-за лимита длины.');
  return data.text||'';
}
function stripCodeFences(raw){return String(raw||'').replace(/```json\s*/gi,'').replace(/```\s*/gi,'').trim();}
function extractJsonChunk(raw){
  const text=stripCodeFences(raw);
  const start=[text.indexOf('['),text.indexOf('{')].filter(i=>i>=0).sort((a,b)=>a-b)[0];
  if(start===undefined) return '';
  let depth=0,inString=false,escaped=false;
  for(let i=start;i<text.length;i++){
    const ch=text[i];
    if(inString){
      if(escaped) escaped=false;
      else if(ch==='\\') escaped=true;
      else if(ch==='"') inString=false;
      continue;
    }
    if(ch==='"'){inString=true;continue;}
    if(ch==='['||ch==='{') depth++;
    if(ch===']'||ch==='}') depth--;
    if(depth===0) return text.slice(start,i+1);
  }
  return text.slice(start);
}
function parseJSON(raw){
  const variants=[stripCodeFences(raw),extractJsonChunk(raw)].filter(Boolean);
  let lastErr=null;
  for(const candidate of variants){
    try{return JSON.parse(candidate);}catch(err){lastErr=err;}
  }
  console.warn('Gemini JSON parse failed',raw,lastErr);
  throw new Error('Модель вернула повреждённый JSON. Попробуй ещё раз.');
}
async function geminiJSON(prompt,responseJsonSchema,maxTokens=1000,systemCtx='',opts={}){
  const callOpts={...opts,responseMimeType:'application/json',responseJsonSchema};
  const attemptLimits=[maxTokens,Math.min(8192,Math.max(maxTokens+1600,Math.round(maxTokens*1.9)))];
  let lastErr=null;
  for(const tokenLimit of attemptLimits){
    try{
      const raw=await gemini(prompt,systemCtx,tokenLimit,callOpts);
      return parseJSON(raw);
    }catch(err){
      lastErr=err;
      const msg=String(err?.message||err||'');
      const retryable=msg.includes('повреждённый JSON')||msg.includes('обрезался');
      if(!retryable||tokenLimit===attemptLimits[attemptLimits.length-1]) break;
    }
  }
  throw lastErr||new Error('Не удалось получить валидный JSON от Gemini.');
}

function showApiKeyBanner(){
  if(!GEMINI_CONFIGURED){
    const banner=document.createElement('div');
    banner.id='api-key-banner';
    banner.style.cssText='position:fixed;top:52px;left:0;right:0;z-index:200;background:#F59E0B;color:#000;padding:8px 20px;display:flex;align-items:center;gap:12px;font-family:JetBrains Mono,monospace;font-size:11px;font-weight:700;';
    banner.innerHTML='⚠ GEMINI API KEY NOT SET — AI features will not work. <a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:#000;text-decoration:underline;">Get free key →</a> then set <code style="background:rgba(0,0,0,.15);padding:1px 6px;">GEMINI_API_KEY</code> in server environment variables. <button onclick="this.parentNode.remove()" style="margin-left:auto;background:transparent;border:1px solid #000;padding:2px 8px;cursor:pointer;font-family:inherit;font-size:10px;font-weight:700;">Dismiss</button>';
    document.body.appendChild(banner);
    // Push app body down
    const app=document.getElementById('app');
    if(app) app.style.marginTop='36px';
  }
}

/* ══ STATE ══ */
const S = {
  user:{name:'',project:'',idea:'',goal:'',deadline:'',hours:'',blockers:'',styles:[],win:'',mode:'b2c',role:'user',stage:'',built:'',niche:'',audience:'',resources:'',constraints:''},
  billing:{plan:'free',subscriptionId:null},
  roadmap:null, chatHistory:[], loading:false,
  progress:{sessions:0,streak:0,hours:0,milestones:0,tasksDone:0,activityLog:[],sessionLog:[]},
  tasks:[], goals:[], notes:[],
  activeSession:null, paypalLoaded:false
};
const INITIAL_STATE_SNAPSHOT = JSON.parse(JSON.stringify(S));
const STORAGE_PROTO = Storage.prototype;
const NATIVE_GET_ITEM = STORAGE_PROTO.getItem;
const NATIVE_SET_ITEM = STORAGE_PROTO.setItem;
const NATIVE_REMOVE_ITEM = STORAGE_PROTO.removeItem;
const NATIVE_CLEAR = STORAGE_PROTO.clear;

function isScopedSaKey(key){
  return typeof key==='string'&&key.startsWith(SA_KEY_PREFIX);
}
function nativeStorageGetItem(key){
  return NATIVE_GET_ITEM.call(window.localStorage,key);
}
function nativeStorageSetItem(key,value){
  NATIVE_SET_ITEM.call(window.localStorage,key,value);
}
function readLegacySaDataFromBrowser(){
  const out={};
  for(let i=0;i<window.localStorage.length;i++){
    const key=window.localStorage.key(i);
    if(!isScopedSaKey(key)) continue;
    const value=nativeStorageGetItem(key);
    if(value!==null) out[key]=String(value);
  }
  return out;
}
function installScopedStorageBridge(){
  if(STORAGE_BRIDGE_INSTALLED) return;
  try{
    STORAGE_PROTO.getItem=function(key){
      const skey=String(key);
      if(this===window.localStorage&&CURRENT_AUTH_USER&&isScopedSaKey(skey)){
        return Object.prototype.hasOwnProperty.call(CLOUD_KV,skey)?CLOUD_KV[skey]:null;
      }
      return NATIVE_GET_ITEM.call(this,key);
    };
    STORAGE_PROTO.setItem=function(key,value){
      const skey=String(key);
      if(this===window.localStorage&&CURRENT_AUTH_USER&&isScopedSaKey(skey)){
        CLOUD_KV[skey]=String(value);
        queueCloudWrite(skey);
        return;
      }
      return NATIVE_SET_ITEM.call(this,key,value);
    };
    STORAGE_PROTO.removeItem=function(key){
      const skey=String(key);
      if(this===window.localStorage&&CURRENT_AUTH_USER&&isScopedSaKey(skey)){
        delete CLOUD_KV[skey];
        queueCloudWrite(skey);
        return;
      }
      return NATIVE_REMOVE_ITEM.call(this,key);
    };
    STORAGE_PROTO.clear=function(){
      if(this===window.localStorage&&CURRENT_AUTH_USER){
        Object.keys(CLOUD_KV).filter(isScopedSaKey).forEach((key)=>{
          delete CLOUD_KV[key];
          queueCloudWrite(key);
        });
        return;
      }
      return NATIVE_CLEAR.call(this);
    };
    STORAGE_BRIDGE_INSTALLED=true;
  }catch(err){
    console.warn('Scoped storage bridge is unavailable in this browser',err);
  }
}
async function writeCloudPairs(uid,pairs){
  if(!FB_DB||!uid||!pairs) return;
  const entries=Object.entries(pairs);
  if(!entries.length) return;
  for(let i=0;i<entries.length;i+=400){
    const chunk=entries.slice(i,i+400);
    const batch=FB_DB.batch();
    chunk.forEach(([key,value])=>{
      const ref=FB_DB.collection('users').doc(uid).collection('kv').doc(key);
      if(value===undefined||value===null) batch.delete(ref);
      else batch.set(ref,{
        value:String(value),
        updatedAt:firebase.firestore.FieldValue.serverTimestamp()
      },{merge:true});
    });
    await batch.commit();
  }
}
function queueCloudWrite(key){
  if(!CURRENT_AUTH_USER||!isScopedSaKey(key)) return;
  CLOUD_WRITE_QUEUE.add(key);
  scheduleCloudFlush();
}
function scheduleCloudFlush(){
  if(CLOUD_FLUSH_TIMER) return;
  CLOUD_FLUSH_TIMER=setTimeout(()=>{
    CLOUD_FLUSH_TIMER=null;
    flushCloudWriteQueue();
  },320);
}
async function flushCloudWriteQueue(){
  if(CLOUD_FLUSH_IN_PROGRESS||!CURRENT_AUTH_USER||!CLOUD_WRITE_QUEUE.size) return;
  CLOUD_FLUSH_IN_PROGRESS=true;
  const uid=CURRENT_AUTH_USER.uid;
  const keys=Array.from(CLOUD_WRITE_QUEUE);
  CLOUD_WRITE_QUEUE.clear();
  const payload={};
  keys.forEach((key)=>{
    if(Object.prototype.hasOwnProperty.call(CLOUD_KV,key)) payload[key]=CLOUD_KV[key];
    else payload[key]=null;
  });
  try{
    await writeCloudPairs(uid,payload);
  }catch(err){
    console.warn('Cloud sync failed',err);
    if(CURRENT_AUTH_USER&&CURRENT_AUTH_USER.uid===uid){
      keys.forEach((key)=>CLOUD_WRITE_QUEUE.add(key));
    }
  }finally{
    CLOUD_FLUSH_IN_PROGRESS=false;
    if(CLOUD_WRITE_QUEUE.size) scheduleCloudFlush();
  }
}
async function loadCloudDataForUser(uid){
  if(!FB_DB||!uid) return;
  const snap=await FB_DB.collection('users').doc(uid).collection('kv').get();
  if(snap.empty){
    const legacy=readLegacySaDataFromBrowser();
    if(Object.keys(legacy).length){
      await writeCloudPairs(uid,legacy);
      CLOUD_KV={...legacy};
      await FB_DB.collection('users').doc(uid).set({
        legacyMigratedAt:firebase.firestore.FieldValue.serverTimestamp()
      },{merge:true});
      return;
    }
    CLOUD_KV={};
    return;
  }
  const fromCloud={};
  snap.forEach((docSnap)=>{
    const value=docSnap.data()?.value;
    if(value!==undefined&&value!==null) fromCloud[docSnap.id]=String(value);
  });
  CLOUD_KV=fromCloud;
}
function resetInMemoryState(){
  if(S.activeSession&&S.activeSession.timerInterval){
    clearInterval(S.activeSession.timerInterval);
  }
  const fresh=JSON.parse(JSON.stringify(INITIAL_STATE_SNAPSHOT));
  S.user=fresh.user;
  S.billing=fresh.billing;
  S.roadmap=fresh.roadmap;
  S.chatHistory=fresh.chatHistory;
  S.loading=fresh.loading;
  S.progress=fresh.progress;
  S.tasks=fresh.tasks;
  S.goals=fresh.goals;
  S.notes=fresh.notes;
  S.activeSession=fresh.activeSession;
  S.paypalLoaded=fresh.paypalLoaded;
  try{feedLines=[];}catch(_e){}
}
function authEls(){
  return {
    screen:document.getElementById('auth-screen'),
    email:document.getElementById('auth-email'),
    password:document.getElementById('auth-password'),
    signInBtn:document.getElementById('auth-signin-btn'),
    error:document.getElementById('auth-error'),
    status:document.getElementById('auth-status')
  };
}
function setAuthError(msg=''){
  const {error}=authEls();
  if(error) error.textContent=msg||'';
}
function setAuthStatus(msg=''){
  const {status}=authEls();
  if(status) status.textContent=msg||'';
}
function setAuthBusy(isBusy){
  const {signInBtn}=authEls();
  if(signInBtn) signInBtn.disabled=Boolean(isBusy);
}
function showAuthScreen(){
  const {screen,password}=authEls();
  const app=document.getElementById('app');
  const ob=document.getElementById('ob');
  const banner=document.getElementById('api-key-banner');
  if(banner) banner.remove();
  if(app){
    app.classList.remove('app-on');
    app.style.display='none';
    app.style.marginTop='';
  }
  if(ob) ob.style.display='none';
  if(screen) screen.style.display='flex';
  if(password) password.value='';
}
function hideAuthScreen(){
  const {screen}=authEls();
  if(screen) screen.style.display='none';
}
function authErrorMessage(err){
  const code=String(err?.code||'');
  if(code.includes('invalid-email')) return 'Invalid email format.';
  if(code.includes('user-not-found')) return 'User not found.';
  if(code.includes('wrong-password')) return 'Wrong password.';
  if(code.includes('invalid-credential')) return 'Invalid email or password.';
  if(code.includes('email-already-in-use')) return 'This email is already registered.';
  if(code.includes('weak-password')) return 'Password must be at least 6 characters.';
  if(code.includes('too-many-requests')) return 'Too many attempts. Please try again later.';
  return err?.message||'Authentication failed.';
}
function bindAuthInputHandlers(){
  const {email,password}=authEls();
  if(email) email.addEventListener('keydown',(event)=>{
    if(event.key==='Enter') authSignIn();
  });
  if(password) password.addEventListener('keydown',(event)=>{
    if(event.key==='Enter') authSignIn();
  });
}
function initFirebaseClient(){
  if(!FIREBASE_CONFIGURED||!FIREBASE_WEB_CONFIG) return false;
  if(!window.firebase||!window.firebase.initializeApp) return false;
  FB_APP=(firebase.apps&&firebase.apps.length)?firebase.app():firebase.initializeApp(FIREBASE_WEB_CONFIG);
  FB_AUTH=firebase.auth();
  FB_DB=firebase.firestore();
  return true;
}
async function handleSignedInUser(user){
  CURRENT_AUTH_USER=user;
  setAuthError('');
  setAuthStatus('Loading your workspace...');
  setAuthBusy(true);
  try{
    await FB_DB.collection('users').doc(user.uid).set({
      email:user.email||'',
      lastSeenAt:firebase.firestore.FieldValue.serverTimestamp()
    },{merge:true});
    await loadCloudDataForUser(user.uid);
    resetInMemoryState();
    switchWorkTab('tasks');
    loadAll();
    hideAuthScreen();
    const hasProfile=Boolean(S.user&&S.user.name);
    const app=document.getElementById('app');
    const ob=document.getElementById('ob');
    if(hasProfile){
      if(ob) ob.style.display='none';
      if(app){
        app.style.display='flex';
        app.classList.add('app-on');
      }
      applyUserToUI();
      initHM();
      initHM2();
      if(S.roadmap){updDashboard();renderRM();updRoadmapProgress();}
      gp('dashboard');
      feedLine(`Welcome back, ${S.user.name}.`);
      showApiKeyBanner();
      trackEvent('auto_login');
      const alc=(parseInt(localStorage.getItem('sa_auto_logins')||'0'))+1;
      localStorage.setItem('sa_auto_logins',alc);
    }else{
      if(app){
        app.classList.remove('app-on');
        app.style.display='none';
      }
      if(ob) ob.style.display='flex';
      const nm=document.getElementById('ob-nm');
      if(nm&&!nm.value){
        const fallbackName=(user.email||'').split('@')[0]||'';
        if(fallbackName) nm.value=fallbackName;
      }
      obGo(0);
      showApiKeyBanner();
    }
    trackEvent('page_load');
    const totalLoads=(parseInt(localStorage.getItem('sa_total_loads')||'0'))+1;
    localStorage.setItem('sa_total_loads',totalLoads);
    setAuthStatus('');
  }catch(err){
    console.error('Auth bootstrap failed',err);
    setAuthError('Failed to load user workspace.');
    await FB_AUTH.signOut().catch(()=>{});
  }finally{
    setAuthBusy(false);
  }
}
function handleSignedOutUser(){
  CURRENT_AUTH_USER=null;
  CLOUD_KV={};
  CLOUD_WRITE_QUEUE.clear();
  if(CLOUD_FLUSH_TIMER){
    clearTimeout(CLOUD_FLUSH_TIMER);
    CLOUD_FLUSH_TIMER=null;
  }
  resetInMemoryState();
  showAuthScreen();
  setAuthStatus('');
  setAuthError('');
}
async function authSignIn(){
  if(!FB_AUTH){
    setAuthError('Firebase auth is not initialized.');
    return;
  }
  const {email,password}=authEls();
  const em=(email?.value||'').trim();
  const pw=(password?.value||'').trim();
  if(!em||!pw){
    setAuthError('Enter email and password.');
    return;
  }
  setAuthError('');
  setAuthStatus('Signing in...');
  setAuthBusy(true);
  try{
    await FB_AUTH.signInWithEmailAndPassword(em,pw);
  }catch(err){
    setAuthError(authErrorMessage(err));
  }finally{
    setAuthBusy(false);
    setAuthStatus('');
  }
}
async function authSignUp(){
  setAuthError('Account registration is disabled on this website.');
}
async function authSignOut(){
  if(!FB_AUTH) return;
  setAuthError('');
  setAuthStatus('Signing out...');
  await FB_AUTH.signOut().catch((err)=>{
    setAuthError(authErrorMessage(err));
  });
  setAuthStatus('');
}
function initAuthFlow(){
  installScopedStorageBridge();
  bindAuthInputHandlers();
  if(!initFirebaseClient()){
    showAuthScreen();
    setAuthError('Firebase is not configured. Set FIREBASE_* env values on the server.');
    return;
  }
  FB_AUTH.onAuthStateChanged(async (user)=>{
    if(user) await handleSignedInUser(user);
    else handleSignedOutUser();
  });
}

/* ══ PERSIST ══ */
function saveAll(){try{localStorage.setItem('sa_user',JSON.stringify(S.user));localStorage.setItem('sa_progress',JSON.stringify(S.progress));localStorage.setItem('sa_billing',JSON.stringify(S.billing));if(S.roadmap)localStorage.setItem('sa_roadmap',JSON.stringify(S.roadmap));}catch(e){}}
function loadAll(){try{const u=localStorage.getItem('sa_user');if(u)Object.assign(S.user,JSON.parse(u));const p=localStorage.getItem('sa_progress');if(p)Object.assign(S.progress,JSON.parse(p));const b=localStorage.getItem('sa_billing');if(b)Object.assign(S.billing,JSON.parse(b));const r=localStorage.getItem('sa_roadmap');if(r)S.roadmap=JSON.parse(r);}catch(e){}loadTasks();loadGoals();loadNotes();}

/* ══ HELPERS ══ */
function escHtml(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function toast2(title,body=''){document.getElementById('tt').textContent=title;document.getElementById('tb2').textContent=body;const t=document.getElementById('toast');t.classList.add('on');clearTimeout(t._tm);t._tm=setTimeout(()=>t.classList.remove('on'),3200);}
function togglePill(el){el.classList.toggle('on');}
function getSelectedPills(id){return Array.from(document.querySelectorAll('#'+id+' .pill.on')).map(p=>p.textContent.trim());}
function aiLanguageRules(){return `ВАЖНО:\n- Весь смысловой текст, все формулировки задач, milestones, целей, заметок и советов пиши только на русском языке.\n- Английский допустим только в обязательных ключах JSON, если схема ниже требует английские ключи.\n- Если требуется JSON, верни только чистый JSON без markdown, без комментариев и без пояснений.\n- Значения полей title, objective, task, text, desc и day должны быть на русском языке.`;}
function sysp(){return `Ты — персональный AI-коуч по исполнению и дисциплине внутри StriveAI.\n\nКонтекст пользователя:\n- Имя: ${S.user.name||'не указано'}\n- Проект / компания: ${S.user.project||'не указан'}\n- Идея / продукт: ${S.user.idea||'не указана'}\n- Стадия: ${S.user.stage||'не указана'}\n- Что уже сделано: ${S.user.built||'не указано'}\n- Ниша / направление: ${S.user.niche||'не указаны'}\n- Целевая аудитория: ${S.user.audience||'не указана'}\n- Ресурсы: ${S.user.resources||'не указаны'}\n- Ограничения: ${S.user.constraints||'не указаны'}\n- Главная цель: ${S.user.goal||'не указана'}\n- Дедлайн: ${S.user.deadline||'гибкий'}\n- Доступно времени в день: ${S.user.hours||'не указано'}\n- Блокеры: ${S.user.blockers||'не указаны'}\n- Предпочитаемый стиль работы: ${(S.user.styles||[]).length?(S.user.styles||[]).join(', '):'не указан'}\n- Текущий прогресс: ${S.progress.sessions} сессий, серия ${S.progress.streak} дней, готовность ${totalPct()}%\n\nПравила ответа:\n- Пиши по-русски, ясно, жёстко и без воды.\n- Всегда опирайся на стадию, идею, аудиторию, ресурсы, ограничения, цель, дедлайн и реальный темп пользователя.\n- Делай рекомендации максимально привязанными к контексту проекта, а не универсальными.\n- Предлагай конкретные действия, которые можно выполнить сегодня, на этой неделе или в ближайшем milestone.\n- Если пользователь отстаёт, перестраивай план под реальность, а не под идеальную картинку.\n- Не используй мотивационный мусор и пустые фразы.\n- Если чего-то не хватает, делай аккуратные допущения и не выдумывай лишнего.\n- Когда уместно, структурируй ответ короткими блоками: что важно, что мешает, что делать дальше.\n\n${aiLanguageRules()}`;}
function todayISO(){return new Date().toISOString().slice(0,10);}
function roadmapJsonSchema(){return `[{"week":1,"title":"Короткое название этапа","objective":"Что должно быть достигнуто по итогам этапа","days":[{"day":"Пн","task":"Конкретное действие","duration":"2ч"},{"day":"Вт","task":"Конкретное действие","duration":"2ч"},{"day":"Ср","task":"Конкретное действие","duration":"2ч"},{"day":"Чт","task":"Конкретное действие","duration":"2ч"},{"day":"Пт","task":"Конкретное действие","duration":"2ч"},{"day":"Сб","task":"Облегчённая задача или ревью","duration":"1ч"},{"day":"Вс","task":"Добивка, ревью или отдых по плану","duration":"1ч"}]}]`;}
function taskJsonSchema(){return `[{"text":"Конкретная задача","prio":"high|med|low","deadline":"YYYY-MM-DD или пустая строка"}]`;}
function normalizeTaskPrio(prio){return ['high','med','low'].includes(prio)?prio:'med';}
function taskPrioLabel(prio){return {high:'Высокий',med:'Средний',low:'Низкий'}[normalizeTaskPrio(prio)]||'Средний';}
function roadmapMaxTokens(weeksCount){return Math.min(8192,Math.max(3200,700+(weeksCount*420)));}
function roadmapResponseJsonSchema(){
  return {
    type:'array',
    minItems:1,
    items:{
      type:'object',
      additionalProperties:false,
      required:['week','title','objective','days'],
      properties:{
        week:{type:'integer'},
        title:{type:'string'},
        objective:{type:'string'},
        days:{
          type:'array',
          minItems:7,
          maxItems:7,
          items:{
            type:'object',
            additionalProperties:false,
            required:['day','task','duration'],
            properties:{
              day:{type:'string',enum:['Пн','Вт','Ср','Чт','Пт','Сб','Вс']},
              task:{type:'string'},
              duration:{type:'string'}
            }
          }
        }
      }
    }
  };
}
function milestoneTasksResponseJsonSchema(){
  return {
    type:'array',
    minItems:1,
    items:{
      type:'object',
      additionalProperties:false,
      required:['text','prio','deadline'],
      properties:{
        text:{type:'string'},
        prio:{type:'string',enum:['high','med','low']},
        deadline:{type:'string'}
      }
    }
  };
}
function taskAuditResponseJsonSchema(){
  return {
    type:'array',
    minItems:1,
    items:{
      type:'object',
      additionalProperties:false,
      required:['id','text','prio','done','created'],
      properties:{
        id:{type:'integer'},
        text:{type:'string'},
        prio:{type:'string',enum:['high','med','low']},
        done:{type:'boolean'},
        created:{type:'string'}
      }
    }
  };
}
function buildRoadmapPrompt(weeksCount,strategyDesc=''){
  const styleList=(S.user.styles||[]).length?(S.user.styles||[]).join(', '):'не указан';
  return `Собери персональный roadmap исполнения для пользователя StriveAI на ${weeksCount} недель.

Контекст пользователя:
- Имя: ${S.user.name||'не указано'}
- Проект: ${S.user.project||'не указан'}
- Идея / суть проекта: ${S.user.idea||S.user.project||S.user.goal||'не указана'}
- Стадия: ${S.user.stage||'не указана'}
- Что уже сделано: ${S.user.built||'не указано'}
- Ниша / направление: ${S.user.niche||'не указаны'}
- Целевая аудитория: ${S.user.audience||'не указана'}
- Ресурсы: ${S.user.resources||'не указаны'}
- Ограничения: ${S.user.constraints||'не указаны'}
- Финальная цель: ${S.user.goal||'не указана'}
- Дедлайн: ${S.user.deadline||'гибкий'}
- Доступно времени в день: ${S.user.hours||'не указано'}
- Главные блокеры: ${S.user.blockers||'не указаны'}
- Стиль работы: ${styleList}
- Желаемый быстрый результат / first win: ${S.user.win||'не указан'}
${strategyDesc?`- Выбранный режим темпа: ${strategyDesc}`:''}

Что нужно сделать:
- Разбей путь на ${weeksCount} последовательных недельных milestones.
- Каждый milestone должен логично продвигать пользователя к финальной цели.
- Сделай roadmap привязанным к стадии проекта. Для стадии Idea сначала подтверждай проблему, аудиторию и спрос. Для MVP сначала доводи ядро продукта и проверку использования. Для Launched сначала усиливай удержание, активацию и продажи. Для Scaling сначала устраняй узкие места роста и операционные ограничения.
- Пусть этапы отражают именно идею проекта и его нишу, а не универсальный шаблон.
- Учитывай, что уже сделано: не возвращай пользователя к шагам, которые он уже прошёл.
- Учитывай целевую аудиторию при формулировке исследований, оффера, каналов дистрибуции и проверок гипотез.
- Учитывай ресурсы и ограничения при выборе масштаба задач, скорости и глубины проработки.
- В начале заложи фундамент и критичные зависимости, в середине — основное исполнение, в конце — проверку результата, доработки и финализацию.
- Учитывай реальный лимит времени. План должен быть амбициозным, но выполнимым.
- Если часов мало, делай упор на 1-3 действительно важных шага в день.
- Если срок жёсткий, повышай плотность, но не предлагай невозможный объём.
- Учитывай blockers и предпочитаемый стиль работы пользователя.
- Каждая daily task должна быть конкретным действием, а не абстрактной темой.
- Не повторяй одинаковые задачи без причины.
- Используй выходные разумно: облегчённые задачи, ревью, добивка, восстановление, если это соответствует темпу.

Требования к качеству:
- title: короткое, ясное название этапа на русском.
- objective: 1-2 предложения на русском про ожидаемый результат этапа.
- Делай title коротким, обычно до 5 слов.
- Делай objective ёмким, обычно до 18 слов.
- days: ровно 7 объектов, по одному на каждый день недели.
- day используй только так: "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс".
- task: конкретное действие на русском языке, которое можно реально выполнить.
- Формулировка task должна быть короткой и плотной, обычно до 14 слов.
- duration: реалистичная оценка в формате "45м", "1ч", "2ч", "3ч".
- План должен быть похож на маршрут к результату, а не на мотивационный текст.

Формат ответа:
Верни только JSON-массив без markdown и без пояснений.
Схема:
${roadmapJsonSchema()}

${aiLanguageRules()}`;
}
function buildMilestoneTasksPrompt(ms1,countDesc,intensityDesc=''){
  const styleList=(S.user.styles||[]).length?(S.user.styles||[]).join(', '):'не указан';
  return `Подготовь набор задач на одну неделю для первого milestone roadmap.

Контекст:
- Сегодня: ${todayISO()}
- Проект: ${S.user.project||'не указан'}
- Идея / продукт: ${S.user.idea||S.user.project||S.user.goal||'не указаны'}
- Стадия: ${S.user.stage||'не указана'}
- Что уже сделано: ${S.user.built||'не указано'}
- Ниша: ${S.user.niche||'не указана'}
- Целевая аудитория: ${S.user.audience||'не указана'}
- Ресурсы: ${S.user.resources||'не указаны'}
- Ограничения: ${S.user.constraints||'не указаны'}
- Главная цель: ${S.user.goal||'не указана'}
- Milestone: ${ms1.title||'не указан'}
- Цель milestone: ${ms1.objective||'не указана'}
- Доступно времени в день: ${S.user.hours||'не указано'}
- Блокеры: ${S.user.blockers||'не указаны'}
- Стиль работы: ${styleList}
${intensityDesc?`- Интенсивность: ${intensityDesc}`:''}
- Нужный объём: ${countDesc} задач

Требования:
- Сгенерируй ${countDesc} конкретных задач, которые реально ведут к закрытию milestone.
- Построй список в логике: подготовка -> основное исполнение -> проверка -> фиксация результата.
- Задачи должны опираться на стадию, уже сделанное, аудиторию, ресурсы и ограничения.
- Не предлагай шаги, которые конфликтуют с текущей стадией проекта или требуют несуществующих ресурсов.
- У задач должна быть понятная очередность и практический смысл.
- Не пиши абстракции вроде "поработать над проектом" или "улучшить стратегию" без расшифровки.
- Используй приоритет high только для действительно критичных задач.
- Используй med для основной рабочей массы.
- Используй low для второстепенных, но полезных шагов.
- Если уместно, поставь дедлайны внутри ближайших 7 дней в формате YYYY-MM-DD.
- Не ставь дедлайны в прошлом.
- Не делай все задачи одинаковыми по типу.
- В text пиши готовую к исполнению формулировку на русском.

Формат ответа:
Верни только JSON-массив без markdown и пояснений.
Схема:
${taskJsonSchema()}

${aiLanguageRules()}`;
}
function buildTaskAuditPrompt(tasks){
  return `Перестрой и усили список задач пользователя StriveAI.

Контекст:
- Проект: ${S.user.project||'не указан'}
- Стадия: ${S.user.stage||'не указана'}
- Что уже сделано: ${S.user.built||'не указано'}
- Ниша: ${S.user.niche||'не указана'}
- Целевая аудитория: ${S.user.audience||'не указана'}
- Ресурсы: ${S.user.resources||'не указаны'}
- Ограничения: ${S.user.constraints||'не указаны'}
- Главная цель: ${S.user.goal||'не указана'}
- Дедлайн: ${S.user.deadline||'гибкий'}
- Доступно времени в день: ${S.user.hours||'не указано'}
- Блокеры: ${S.user.blockers||'не указаны'}

Текущий список задач:
${tasks.map((t,i)=>`${i+1}. id=${t.id}; priority=${normalizeTaskPrio(t.prio)}; done=${!!t.done}; created=${t.created||''}; text=${t.text}`).join('\n')}

Что нужно сделать:
- Убери дубли и слабые формулировки.
- Сделай задачи конкретнее и исполнимее.
- Привяжи задачи к реальной стадии, аудитории и ограничениям проекта.
- Сохрани уже выполненные задачи как done=true.
- Сохрани существующие id и created для исходных задач, если задача по сути осталась той же.
- Если без критичной задачи план развалится, добавь её.
- Не раздувай список ради количества.
- Расставь high|med|low адекватно, а не автоматически.
- Все тексты задач напиши на русском.

Формат ответа:
Верни только JSON-массив без markdown и пояснений.
Схема:
[{"id":123,"text":"Конкретная задача","prio":"high|med|low","done":false,"created":"11 Apr"}]

${aiLanguageRules()}`;
}
function normalizeAiTasks(tasks){
  return (Array.isArray(tasks)?tasks:[]).map((t,i)=>({
    id:Number(t.id)||Date.now()+i,
    text:String(t.text||'').trim()||`Задача ${i+1}`,
    prio:normalizeTaskPrio(t.prio),
    done:Boolean(t.done),
    deadline:String(t.deadline||'').trim(),
    created:String(t.created||new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'})).trim()
  }));
}
function buildGoalsReviewPrompt(goals){
  return `Сделай честный и полезный разбор списка целей пользователя.

Контекст:
- Проект: ${S.user.project||'не указан'}
- Стадия: ${S.user.stage||'не указана'}
- Что уже сделано: ${S.user.built||'не указано'}
- Ниша: ${S.user.niche||'не указана'}
- Целевая аудитория: ${S.user.audience||'не указана'}
- Ресурсы: ${S.user.resources||'не указаны'}
- Ограничения: ${S.user.constraints||'не указаны'}
- Главная цель пользователя: ${S.user.goal||'не указана'}
- Дедлайн: ${S.user.deadline||'гибкий'}
- Доступно времени в день: ${S.user.hours||'не указано'}
- Блокеры: ${S.user.blockers||'не указаны'}

Цели:
${goals.map((g,i)=>`${i+1}. "${g.title}" — прогресс ${g.pct}%${g.desc?`; описание: ${g.desc}`:''}`).join('\n')}

Формат ответа:
- Пиши только по-русски.
- Дай структурированный разбор с короткими секциями:
1. Что сформулировано слабо
2. Что реально критично
3. Что убрать или объединить
4. Что делать следующим конкретным шагом
- Без воды, без мотивационных фраз, максимум пользы.`;
}
function buildNoteProcessPrompt(body){
  return `Приведи заметку в рабочий порядок.

Исходная заметка:
---
${body}
---

Что нужно сделать:
- Сохранить исходный смысл.
- Убрать шум, повторы и слабые формулировки.
- Перестроить материал в понятную структуру.
- Если уместно, выделить решения, риски, вопросы и следующие шаги.
- Добавить раздел "## Action Items" с конкретными действиями.
- Писать только по-русски.

Верни только улучшенный текст заметки, без пояснений вне самой заметки.`;
}
function resolveUserRole(){
  return 'user';
}
function isAdmin(){return false;}

/* ══ ONBOARDING ══ */
let obMode='b2c',obVariant='balanced',obTaskVariant='balanced';
function obSelectMode(m){obMode=m;document.getElementById('tab-b2c').classList.toggle('on',m==='b2c');}
function obSelectVariant(v){obVariant=v;['safe','balanced','aggressive'].forEach(x=>{document.getElementById('var-'+x).classList.toggle('on',x===v);document.getElementById('vc-'+x).textContent=x===v?'✓':'';});}
function obSelectTaskVar(v){obTaskVariant=v;['safe','balanced','aggressive'].forEach(x=>{document.getElementById('tvar-'+x).classList.toggle('on',x===v);document.getElementById('tvc-'+x).textContent=x===v?'✓':'';});}
function obGo(step){document.querySelectorAll('.ob-step').forEach(s=>s.classList.remove('on'));document.getElementById('obs-'+step).classList.add('on');for(let i=0;i<=6;i++){const d=document.getElementById('pd'+i);if(d)d.classList.toggle('done',i<=step);}}
function obNext(from){
  if(from===0){
    const n=document.getElementById('ob-nm').value.trim();
    const p=document.getElementById('ob-proj').value.trim();
    if(!n){document.getElementById('ob-nm').style.borderColor='var(--red)';document.getElementById('ob-nm').focus();return;}
    S.user.name=n;S.user.project=p;S.user.mode=obMode;S.user.role=resolveUserRole();
  }
  if(from===1){
    S.user.goal=document.getElementById('ob-goal').value.trim();
    S.user.deadline=document.getElementById('ob-deadline').value;
    S.user.hours=document.getElementById('ob-hrs').value;
    S.user.blockers=document.getElementById('ob-block').value.trim();
    S.user.idea=document.getElementById('ob-idea').value.trim();
    S.user.stage=document.getElementById('ob-stage').value;
    S.user.built=document.getElementById('ob-built').value.trim();
    S.user.niche=document.getElementById('ob-niche').value.trim();
    S.user.audience=document.getElementById('ob-audience').value.trim();
    S.user.resources=document.getElementById('ob-resources').value.trim();
    S.user.styles=getSelectedPills('ob-pills');
    S.user.win=document.getElementById('ob-win').value.trim();
  }
  obGo(from+1);
}
function calcWeeksFromDeadline(deadline){
  if(!deadline) return 8;
  const days=Math.round((new Date(deadline)-new Date())/(1000*60*60*24));
  if(days<=7) return 1;
  if(days<=14) return 2;
  const weeks=Math.min(16,Math.max(2,Math.round(days/7)));
  return weeks;
}
async function obGenerateRoadmap(){
  const btn=document.getElementById('ob-gen-btn'),loading=document.getElementById('ob-gen-loading');
  btn.disabled=true;loading.style.display='';
  try{
    const variantDesc={safe:'Консервативный темп: 2-4 часа в день, упор на устойчивость и низкий риск',balanced:'Сбалансированный темп: 4-6 часов в день, сочетание скорости и качества',aggressive:'Агрессивный темп: 8-10 часов в день, высокий фокус на быстрый результат'}[obVariant];
    const weeksCount=calcWeeksFromDeadline(S.user.deadline);
    S.roadmap=await geminiJSON(buildRoadmapPrompt(weeksCount,variantDesc),roadmapResponseJsonSchema(),roadmapMaxTokens(weeksCount),'',{temperature:0.35});saveAll();obShowGoals();obGo(3);
  }catch(e){toast2('Error',e.message);}
  finally{btn.disabled=false;loading.style.display='none';}
}
function obShowGoals(){
  if(!S.roadmap)return;
  const newGoals=S.roadmap.slice(0,3).map((wk,i)=>({id:Date.now()+i,title:wk.title,deadline:'',desc:wk.objective,pct:0}));
  S.goals=newGoals;saveGoals();
  const el=document.getElementById('ob-goals-preview');
  el.innerHTML=newGoals.map(g=>`<div style="background:var(--surface);border:1px solid var(--border2);padding:10px;margin-bottom:8px;"><div style="font-family:var(--head);font-size:13px;font-weight:900;color:var(--ink);text-transform:uppercase;">${escHtml(g.title)}</div><div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:3px;">${escHtml(g.desc)}</div></div>`).join('');
}
function renderOnboardingTaskPreview(){
  const el=document.getElementById('ob-tasks-preview');
  const milestone=S.roadmap?.[0];
  if(!el||!milestone)return;
  const count=(S.tasks||[]).length;
  el.innerHTML=`<div class="ob-task-preview-meta"><strong>${escHtml(milestone.title||'Этап 1')}</strong><span>Загружено задач: ${count}</span></div><div class="ob-task-preview-list">`+
    (S.tasks||[]).map((task,i)=>`<div class="ob-task-item"><div class="ob-task-index">${i+1}</div><div class="ob-task-body"><div class="ob-task-text">${escHtml(task.text)}</div><div class="ob-task-deadline">${task.deadline?`Дедлайн: ${escHtml(task.deadline)}`:'Дедлайн не назначен'}</div></div><div class="ob-task-prio ${escHtml(task.prio||'med')}">${escHtml(taskPrioLabel(task.prio||'med'))}</div></div>`).join('')+`</div>`;
}
function obPrepLaunch(){
  const nameEl=document.getElementById('ob-name-final');
  const missionEl=document.getElementById('ob-mission-final');
  const deadlineEl=document.getElementById('ob-deadline-final');
  if(nameEl)nameEl.textContent=S.user.name||'builder';
  if(missionEl)missionEl.textContent=S.user.goal||'Ship it.';
  if(deadlineEl)deadlineEl.textContent=S.user.deadline?`Deadline: ${S.user.deadline}`:'Deadline: flexible';
  const ms=document.getElementById('ob-ready-milestones');
  const tk=document.getElementById('ob-ready-tasks');
  if(ms)ms.textContent=String((S.roadmap||[]).length);
  if(tk)tk.textContent=String((S.tasks||[]).length);
}
function obContinueToLaunch(){obPrepLaunch();obGo(6);}
async function obGenerateTasks(){
  if(!S.roadmap)return;
  const btn=document.getElementById('ob-tasks-btn'),loading=document.getElementById('ob-tasks-loading');
  btn.disabled=true;loading.style.display='';
  try{
    const ms1=S.roadmap[0];
    const countDesc={safe:'3-5',balanced:'7-10',aggressive:'12-15'}[obTaskVariant];
    const intensityDesc={safe:'бережный, устойчивый темп',balanced:'рабочий сбалансированный темп',aggressive:'максимально плотный темп'}[obTaskVariant];
    const tasks=await geminiJSON(buildMilestoneTasksPrompt(ms1,countDesc,intensityDesc),milestoneTasksResponseJsonSchema(),1200,'',{temperature:0.3});
    S.tasks=tasks.map((t,i)=>({id:Date.now()+i,text:t.text,prio:t.prio||'med',done:false,deadline:t.deadline||'',created:new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'})}));
    saveTasks();renderOnboardingTaskPreview();obPrepLaunch();toast2('Задачи сгенерированы',`Подготовлено ${S.tasks.length} задач для первого этапа`);obGo(5);
  }catch(e){toast2('Error',e.message);}
  finally{btn.disabled=false;loading.style.display='none';}
}
function obFinish(){
  const btn=document.getElementById('ob-launch-btn');
  if(btn){btn.disabled=true;btn.textContent='Launching…';}
  obLaunch({startTour:true});
}
function markUserRegistered(){
  localStorage.setItem('sa_last_name', S.user.name);
  localStorage.setItem('sa_tour_seen','1');
  const regList=JSON.parse(localStorage.getItem('sa_registrations')||'[]');
  regList.push({name:S.user.name,project:S.user.project,plan:S.billing.plan,ts:Date.now(),date:new Date().toDateString()});
  localStorage.setItem('sa_registrations',JSON.stringify(regList));
  const rc=(parseInt(localStorage.getItem('sa_reg_count')||'0'))+1;
  localStorage.setItem('sa_reg_count',rc);
}
function obLaunch(opts={}){
  const obScreen=document.getElementById('ob');
  const appScreen=document.getElementById('app');
  if(obScreen)obScreen.style.display='none';
  if(appScreen){appScreen.style.display='flex';appScreen.classList.add('app-on');}
  S.user.role=resolveUserRole();
  try{applyUserToUI();}catch(e){}
  try{initHM();}catch(e){}
  try{if(S.roadmap){updDashboard();renderRM();updRoadmapProgress();}}catch(e){}
  try{saveAll();}catch(e){}
  markUserRegistered();
  gp('dashboard');
  feedLine(`System initialized for ${S.user.name}.`);
  trackEvent('app_start');
  trackEvent('registration');
  showApiKeyBanner();
  if(opts.startTour)startGuidedTour();
}

/* ══ PAGE NAV ══ */
function gp(id){
  if(id==='chat'){toast2('Removed','AI Coach tab has been removed from the MVP');id='dashboard';}
  if(id==='analytics'&&!isAdmin()){toast2('Restricted','Analytics is available only to admins');id='dashboard';}
  document.querySelectorAll('.pg').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('.htab').forEach(b=>b.classList.remove('on'));
  const pg=document.getElementById('pg-'+id);if(pg)pg.classList.add('on');
  document.querySelectorAll('.htab').forEach(b=>{if(b.getAttribute('onclick')&&b.getAttribute('onclick').includes("'"+id+"'"))b.classList.add('on');});
  if(id==='work'){renderTasks();renderGoals();updTaskBadge();}
  if(id==='notes'){renderNoteList();if(!activeNoteId&&(S.notes||[]).length)openNote(S.notes[0].id);}
  if(id==='settings'){populateSettings();}
  if(id==='analytics'){renderAnalytics();}
  if(id==='roadmap'){updRoadmapProgress();if(S.roadmap)renderRM();}
  if(id==='billing'){renderBillingBtns();}
  trackEvent('page_'+id);
}

/* ══ GUIDED TOUR ══ */
let guidedTourIndex=0;
function getGuidedTourSteps(){
  const steps=[
    {page:'dashboard',target:'tab-dashboard',title:'Dashboard',body:'This is your operating surface. Daily focus, session state, streak, and execution signal live here.'},
    {page:'work',target:'tab-work',title:'Tasks & Goals',body:'Your daily tasks and milestone goals stay in one place. This is where the plan turns into concrete work.'},
    {page:'notes',target:'tab-notes',title:'Notes',body:'Capture blockers, decisions, and raw thinking here. Keep the execution context close to the plan.'},
    {page:'roadmap',target:'tab-roadmap',title:'Roadmap',body:'This view now shows the actual roadmap: milestones, sequencing, and the active execution window instead of an activity graph.'},
    {page:'settings',target:'tab-settings',title:'Settings',body:'Deadlines, working hours, blockers, and integrations live here. Change them and the roadmap can be rebuilt around reality.'}
  ];
  if(isAdmin()&&document.getElementById('tab-analytics')?.style.display!=='none'){
    steps.push({page:'analytics',target:'tab-analytics',title:'Analytics',body:'Analytics stays admin-only. Regular users do not see this tab or page.'});
  }
  return steps;
}
function positionGuidedTourCard(rect){
  const card=document.getElementById('tour-card');
  if(!card)return;
  const vw=window.innerWidth,vh=window.innerHeight;
  const cardW=Math.min(320,vw-32);
  const preferRight=rect.right+cardW+28<vw;
  const left=preferRight?Math.min(vw-cardW-16,rect.right+20):Math.max(16,rect.left-cardW-20);
  const top=Math.min(vh-card.offsetHeight-16,Math.max(16,rect.top));
  card.style.left=`${left}px`;
  card.style.top=`${top}px`;
}
function renderGuidedTour(){
  const steps=getGuidedTourSteps();
  const step=steps[guidedTourIndex];
  if(!step){showGuidedTourFinish();return;}
  gp(step.page);
  const overlay=document.getElementById('tour-overlay');
  const highlight=document.getElementById('tour-highlight');
  const card=document.getElementById('tour-card');
  const finalCard=document.getElementById('tour-final-card');
  const target=document.getElementById(step.target);
  if(!overlay||!highlight||!card||!target){guidedTourIndex++;renderGuidedTour();return;}
  finalCard.classList.remove('on');
  card.style.display='block';
  highlight.style.display='block';
  const rect=target.getBoundingClientRect();
  highlight.style.left=`${Math.max(8,rect.left-8)}px`;
  highlight.style.top=`${Math.max(8,rect.top-8)}px`;
  highlight.style.width=`${Math.min(window.innerWidth-16,rect.width+16)}px`;
  highlight.style.height=`${Math.min(window.innerHeight-16,rect.height+16)}px`;
  document.getElementById('tour-step-label').textContent=`Step ${guidedTourIndex+1}`;
  document.getElementById('tour-title').textContent=step.title;
  document.getElementById('tour-copy').textContent=step.body;
  document.getElementById('tour-foot').textContent=`${guidedTourIndex+1} / ${steps.length}`;
  document.getElementById('tour-next-btn').textContent=guidedTourIndex===steps.length-1?'Finish →':'Next →';
  setTimeout(()=>positionGuidedTourCard(rect),0);
}
function startGuidedTour(){
  guidedTourIndex=0;
  const overlay=document.getElementById('tour-overlay');
  if(!overlay)return;
  overlay.classList.add('on');
  document.getElementById('tour-card').style.display='block';
  document.getElementById('tour-final-card').classList.remove('on');
  renderGuidedTour();
}
function nextGuidedTourStep(){guidedTourIndex++;renderGuidedTour();}
function showGuidedTourFinish(){
  const overlay=document.getElementById('tour-overlay');
  const highlight=document.getElementById('tour-highlight');
  const card=document.getElementById('tour-card');
  const finalCard=document.getElementById('tour-final-card');
  if(!overlay||!highlight||!card||!finalCard)return;
  highlight.style.display='none';
  card.style.display='none';
  document.getElementById('tour-final-name').textContent=S.user.name||'builder';
  document.getElementById('tour-final-mission').textContent=S.user.goal||'Ship it.';
  document.getElementById('tour-final-deadline').textContent=S.user.deadline?`Deadline: ${S.user.deadline}`:'Deadline: flexible';
  finalCard.classList.add('on');
}
function skipGuidedTour(){showGuidedTourFinish();}
function closeGuidedTour(){
  const overlay=document.getElementById('tour-overlay');
  if(overlay)overlay.classList.remove('on');
  document.getElementById('tour-card').style.display='block';
  document.getElementById('tour-final-card').classList.remove('on');
  gp('dashboard');
}
window.addEventListener('resize',()=>{if(document.getElementById('tour-overlay')?.classList.contains('on')&&!document.getElementById('tour-final-card')?.classList.contains('on'))renderGuidedTour();});

/* ══ TASKS+GOALS SUB-TABS ══ */
function switchWorkTab(tab){
  document.getElementById('st-tasks').classList.toggle('on',tab==='tasks');
  document.getElementById('st-goals').classList.toggle('on',tab==='goals');
  document.getElementById('wp-tasks').classList.toggle('on',tab==='tasks');
  document.getElementById('wp-goals').classList.toggle('on',tab==='goals');
  // Swap action buttons
  const actions=document.getElementById('work-actions');
  if(tab==='tasks'){
    actions.innerHTML=`<button class="btn btn-ghost btn-sm" onclick="aiEditTasks()">⚡ AI Cleanup</button><button class="btn btn-primary btn-sm" onclick="focusTaskInput()">+ Add Task</button>`;
  } else {
    actions.innerHTML=`<button class="btn btn-ghost btn-sm" onclick="aiReviewGoals()">⚡ AI Review</button><button class="btn btn-primary btn-sm" onclick="addGoal()">+ Add Goal</button>`;
  }
}

/* ══ USER UI ══ */
function applyUserToUI(){
  S.user.role=resolveUserRole();
  const n=S.user.name,plan=S.billing.plan;
  document.getElementById('user-av').textContent=n.charAt(0).toUpperCase();
  document.getElementById('user-name-lbl').textContent=n;
  document.getElementById('set-name').textContent=n;
  document.getElementById('set-proj').textContent=S.user.project||'—';
  document.getElementById('set-plan').textContent=plan.charAt(0).toUpperCase()+plan.slice(1);
  const chip=document.getElementById('plan-chip');chip.textContent=plan.toUpperCase();chip.className='plan-chip '+plan;
  if(S.user.goal)document.getElementById('dash-goal-line').textContent='🎯 '+S.user.goal;
  document.getElementById('dstat-sess').textContent=S.progress.sessions;
  document.getElementById('dstat-streak').textContent=S.progress.streak+'🔥';
  document.getElementById('dstat-pct').textContent=totalPct()+'%';
  updMilestoneBar();
  const analyticsTab=document.getElementById('tab-analytics');
  if(analyticsTab)analyticsTab.style.display=isAdmin()?'flex':'none';
}

/* ══ SESSION (start/done) ══ */
function startSession(){
  const focus=document.getElementById('focus-input').value.trim();
  if(!focus){document.getElementById('focus-input').style.borderColor='var(--red)';document.getElementById('focus-input').focus();return;}
  document.getElementById('focus-input').style.borderColor='';
  document.getElementById('focus-input-row').style.display='none';
  document.getElementById('default-actions').style.display='none';
  document.getElementById('session-active-row').style.display='block';
  document.getElementById('focus-display-text').textContent='🎯 Focus: '+focus;
  const startTime=Date.now();
  S.activeSession={startTime,focus,timerInterval:null};
  S.activeSession.timerInterval=setInterval(()=>{
    const elapsed=Date.now()-startTime;
    const m=Math.floor(elapsed/60000),s=Math.floor((elapsed%60000)/1000);
    document.getElementById('session-timer-display').textContent=String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
  },1000);
  feedLine(`Session started: "${focus}"`);
  toast2('Session started!',focus);
}
function markDone(){
  if(!S.activeSession){toast2('Start a session first','Set focus and click Start Session');return;}
  clearInterval(S.activeSession.timerInterval);
  const duration=(Date.now()-S.activeSession.startTime)/60000;
  const focus=S.activeSession.focus;
  const prevDone=S.progress.tasksDone;
  const newDone=(S.tasks||[]).filter(t=>t.done).length;
  const hasTask=newDone>prevDone;
  S.progress.sessions++;S.progress.hours+=duration/60;S.progress.tasksDone=newDone;S.progress.milestones=Math.floor(S.progress.sessions/7);
  if(hasTask){logActivityInternal(focus,Math.round(duration));feedLine(`Session done: ${Math.round(duration)}m · "${focus}" · streak +1`);toast2('Session complete! 🚀','Streak updated');}
  else{feedLine(`Session done: ${Math.round(duration)}m · no tasks — streak NOT counted`);toast2('Session saved','Complete a task to count streak');}
  if(!S.progress.sessionLog)S.progress.sessionLog=[];
  const today=new Date().toDateString();
  const log=S.progress.sessionLog.find(e=>e.date===today);
  if(log){log.sessions++;log.tasks=Math.max(0,newDone-prevDone);log.focus=focus;log.duration=Math.round(duration);}
  else S.progress.sessionLog.push({date:today,sessions:1,tasks:Math.max(0,newDone-prevDone),focus,duration:Math.round(duration)});
  S.activeSession=null;
  document.getElementById('focus-input-row').style.display='flex';
  document.getElementById('default-actions').style.display='flex';
  document.getElementById('session-active-row').style.display='none';
  document.getElementById('focus-input').value='';
  document.getElementById('session-timer-display').textContent='00:00';
  updProgress();updDashboard();if(S.roadmap)renderRM();saveAll();
  document.getElementById('dstat-sess').textContent=S.progress.sessions;
  document.getElementById('dstat-streak').textContent=S.progress.streak+'🔥';
  document.getElementById('dstat-pct').textContent=totalPct()+'%';
  updMilestoneBar();updRoadmapProgress();
  trackEvent('session_done');initHM();initHM2();
}
function logActivityInternal(focus,durationMin){const today=new Date().toDateString();if(!S.progress.activityLog.includes(today)){S.progress.activityLog.push(today);S.lastActivity=Date.now();updStreak();}}
function updStreak(){let s=0;const today=new Date();for(let i=0;i<60;i++){const d=new Date(today);d.setDate(d.getDate()-i);if(S.progress.activityLog.includes(d.toDateString()))s++;else break;}S.progress.streak=s;}

/* ══ MILESTONE BAR ══ */
function updMilestoneBar(){
  const total=(S.tasks||[]).length;const done=(S.tasks||[]).filter(t=>t.done).length;
  const pct=total>0?Math.round((done/total)*100):0;
  const ms=S.progress.milestones+1;
  const msEl=document.getElementById('ms-num');if(msEl)msEl.textContent=ms;
  const pctEl=document.getElementById('ms-pct');if(pctEl)pctEl.textContent=pct+'%';
  const barEl=document.getElementById('ms-bar');if(barEl)barEl.style.width=pct+'%';
}

/* ══ ROADMAP PROGRESS PANEL ══ */
function updRoadmapProgress(){
  const pct=totalPct();
  const el=id=>document.getElementById(id);
  const set=(id,v)=>{const e=el(id);if(e)e.textContent=v;};
  set('rm-pct',pct+'%');
  set('rm-sess',S.progress.sessions);
  set('rm-streak',S.progress.streak+'🔥');
  set('rm-hrs',Math.round(S.progress.hours)+'h invested');
  const currentMilestone=S.roadmap&&S.roadmap.length?Math.min(S.progress.milestones+1,S.roadmap.length):0;
  set('rm-ms',currentMilestone);
  set('rm-tasks',(S.tasks||[]).filter(t=>t.done).length);
  set('rm-prog-label',pct===0?'Start your first session':pct<50?'Building momentum':'On track!');
  const totalWks = S.roadmap ? S.roadmap.length : '?';
  set('rm-total-weeks','of '+totalWks+' weeks');
}

/* ══ HEATMAP with tooltip showing duration ══ */
function buildHM(id){
  const el=document.getElementById(id);if(!el)return;
  let html='';
  for(let i=27;i>=0;i--){
    const d=new Date();d.setDate(d.getDate()-i);
    const dateStr=d.toDateString();
    const active=S.progress.activityLog.includes(dateStr);
    const log=(S.progress.sessionLog||[]).find(e=>e.date===dateStr);
    const label=d.toLocaleDateString('en-GB',{day:'numeric',month:'short'});
    // tooltip shows work time
    let tooltip;
    if(log) tooltip=`${label} · ${log.duration||0}min worked · ${log.sessions} session(s) · ${log.tasks||0} task(s)`;
    else if(active) tooltip=`${label} · Active`;
    else tooltip=`${label} · No activity`;
    html+=`<div class="hcell ${active?'dn':''}" title="${escHtml(tooltip)}"><div class="hcell-tooltip">${escHtml(tooltip)}</div></div>`;
  }
  el.innerHTML=html;
}
function initHM(){buildHM('hg');}
function initHM2(){buildHM('hg2');}

/* ══ PROGRESS ══ */
function totalPct(){const tot=S.roadmap?S.roadmap.length*7:56;return Math.min(100,Math.round((S.progress.sessions/tot)*100));}
function updProgress(){
  const pct=totalPct();
  const s=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  s('pr-pct',pct+'%');s('pr-sess',S.progress.sessions);s('pr-streak',S.progress.streak);
  s('pr-hrs',Math.round(S.progress.hours)+'h');s('pr-ms',S.progress.milestones);
  s('pr-label',pct===0?'Start your first session':pct<50?'Building momentum':'On track!');
  s('pr-analysis',S.progress.sessions===0?'No data yet.\nComplete your first session.':`${pct}% complete · ${S.progress.streak} day streak\n${S.progress.sessions} sessions logged`);
  updDashboard();
}
function updDashboard(){
  const s=S.progress.sessions,t=S.progress.tasksDone;
  const spd=(s/Math.max(1,S.progress.activityLog.length));
  const s2=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  s2('m-speed',spd.toFixed(1));const msb=document.getElementById('m-speed-bar');if(msb)msb.style.width=Math.min(100,spd*10)+'%';
  s2('m-tasks',t);const mtb=document.getElementById('m-tasks-bar');if(mtb)mtb.style.width=Math.min(100,t*5)+'%';
  const eff=s>0?Math.min(100,Math.round((t/Math.max(1,s))*100)):0;
  s2('m-eff',eff);const meb=document.getElementById('m-eff-bar');if(meb)meb.style.width=eff+'%';
  s2('dstat-sess',s);s2('dstat-streak',S.progress.streak+'🔥');s2('dstat-pct',totalPct()+'%');
  if(S.roadmap){const wk=S.roadmap[Math.min(S.progress.milestones,S.roadmap.length-1)];const day=wk&&wk.days?wk.days[S.progress.sessions%7]||wk.days[0]:null;if(day){s2('mc-title',day.task||wk.title||'');s2('mc-detail',wk.objective||'');s2('mc-tag1','Week '+wk.week);s2('mc-tag2','Est: '+day.duration);}}
  updMilestoneBar();
}

/* ══ FEED ══ */
let feedLines=[];
function feedLine(txt){feedLines.unshift(txt);if(feedLines.length>6)feedLines=feedLines.slice(0,6);const el=document.getElementById('lf');if(el)el.innerHTML=feedLines.map(l=>`<div class="feed-line">${escHtml(l)}</div>`).join('');}

/* ══ ROADMAP ══ */
let openRoadmapMilestoneIndex=null, openRoadmapTimelineKey='';

function getRoadmapActiveIndex(){
  return S.roadmap&&S.roadmap.length?Math.min(S.progress.milestones,S.roadmap.length-1):0;
}
function getRoadmapDayProgress(){
  const sessions=Math.max(0,S.progress.sessions||0);
  return Math.min(6,sessions%7);
}
function getRoadmapStageStatus(index){
  const activeIndex=getRoadmapActiveIndex();
  if(index<activeIndex) return 'done';
  if(index===activeIndex) return 'active';
  return 'pending';
}
function getRoadmapStagePct(index){
  const status=getRoadmapStageStatus(index);
  if(status==='done') return 100;
  if(status==='pending') return 0;
  const tasks=S.tasks||[];
  if(tasks.length){
    return Math.round((tasks.filter(t=>t.done).length/tasks.length)*100);
  }
  return Math.round(((getRoadmapDayProgress()+1)/7)*100);
}
function getRoadmapTargetDate(index,total){
  const start=new Date();
  start.setHours(0,0,0,0);
  let target=new Date(start);
  const deadline=S.user.deadline?new Date(S.user.deadline):null;
  if(deadline&&!Number.isNaN(deadline.getTime())&&deadline>start){
    const diff=deadline.getTime()-start.getTime();
    target=new Date(start.getTime()+(diff*((index+1)/Math.max(1,total))));
  }else{
    target.setDate(start.getDate()+((index+1)*7));
  }
  return target.toLocaleDateString('en-GB',{day:'numeric',month:'short'});
}
function getRoadmapRelatedTasks(index){
  if(index===getRoadmapActiveIndex()&&(S.tasks||[]).length){
    return (S.tasks||[]).map(t=>({
      title:t.text,
      meta:`${taskPrioLabel(t.prio)}${t.deadline?` · ${t.deadline}`:''}${t.done?' · DONE':''}`
    }));
  }
  const wk=S.roadmap?.[index];
  return (wk?.days||[]).map((d,dayIndex)=>({
    title:d.task||`Шаг ${dayIndex+1}`,
    meta:`${d.day||`Day ${dayIndex+1}`} · ${d.duration||'без оценки'}`
  }));
}
function focusRoadmapStage(index){
  openRoadmapMilestoneIndex=index;
  renderRM();
  const target=document.getElementById(`rm-stage-${index}`);
  if(target) target.scrollIntoView({behavior:'smooth',block:'start'});
}
function toggleRoadmapMilestone(index){
  openRoadmapMilestoneIndex=openRoadmapMilestoneIndex===index?null:index;
  renderRM();
}
function toggleRoadmapTimelineItem(index,dayIndex){
  const key=`${index}-${dayIndex}`;
  openRoadmapTimelineKey=openRoadmapTimelineKey===key?'':key;
  renderRM();
}
function buildRoadmapDetailPanel(index){
  if(index===null||index===undefined||!S.roadmap||!S.roadmap[index]) return '';
  const wk=S.roadmap[index];
  const pct=getRoadmapStagePct(index);
  const related=getRoadmapRelatedTasks(index).slice(0,6);
  const activeDay=getRoadmapDayProgress();
  const checklist=(wk.days||[]).slice(0,4).map((day,dayIndex)=>{
    let status='pending';
    if(index<getRoadmapActiveIndex()) status='done';
    else if(index===getRoadmapActiveIndex()){
      if(dayIndex<activeDay) status='done';
      else if(dayIndex===activeDay) status='active';
    }
    return `<div class="rm-check-item ${status}"><div class="rm-check-icon">${status==='done'?'✓':status==='active'?'●':'·'}</div><div class="rm-check-copy"><strong>${escHtml(day.task||'Шаг этапа')}</strong><span>${escHtml(day.day||'DAY')} · ${escHtml(day.duration||'без оценки')}</span></div></div>`;
  }).join('');
  return `<div class="rm-detail-head">
    <div>
      <div class="rm-detail-kicker">Milestone Detail</div>
      <div class="rm-detail-title">${escHtml(wk.title||`Этап ${index+1}`)}</div>
      <div class="rm-detail-copy">${escHtml(wk.objective||'')}</div>
    </div>
    <button class="btn btn-ghost btn-sm" onclick="toggleRoadmapMilestone(${index})">Close</button>
  </div>
  <div class="rm-detail-grid">
    <div class="rm-detail-stat"><strong>${pct}%</strong><span>Progress</span></div>
    <div class="rm-detail-stat"><strong>${escHtml(getRoadmapTargetDate(index,S.roadmap.length))}</strong><span>Target date</span></div>
    <div class="rm-detail-stat"><strong>${(wk.days||[]).length}</strong><span>Requirements</span></div>
  </div>
  <div class="rm-detail-list">
    <div>
      <div class="rm-list-title">Success Criteria</div>
      <div class="rm-checklist">${checklist}</div>
    </div>
    <div>
      <div class="rm-list-title">Related Tasks</div>
      <div class="rm-related-list">${related.map(item=>`<div class="rm-related-item"><div class="rm-check-icon">→</div><div class="rm-related-copy"><strong>${escHtml(item.title)}</strong><span>${escHtml(item.meta)}</span></div></div>`).join('')}</div>
    </div>
  </div>`;
}

async function genVariants(){
  if(!S.user.goal){toast2('Set goal first','Settings → Primary Goal');return;}
  const rb=document.getElementById('rb');
  rb.innerHTML='<div class="rm-loading"><div style="width:18px;height:18px;border:2px solid var(--border2);border-top-color:var(--blue);border-radius:50%;animation:spin .7s linear infinite;margin:0 auto 10px;"></div><div style="font-family:var(--mono);font-size:11px;color:var(--muted);text-align:center;text-transform:uppercase">Генерирую roadmap через Gemini… обычно 1-2 минуты.</div></div>';
  try{
    const weeksCount=calcWeeksFromDeadline(S.user.deadline);
    S.roadmap=await geminiJSON(buildRoadmapPrompt(weeksCount),roadmapResponseJsonSchema(),roadmapMaxTokens(weeksCount),'',{temperature:0.35});saveAll();renderRM();updRoadmapProgress();
    toast2('Roadmap готов',`Построен план на ${weeksCount} нед.`);
  }catch(e){rb.innerHTML=`<div style="padding:30px;font-family:var(--mono);color:var(--red);font-size:12px">⚠ ${escHtml(e.message)}</div>`;}
}
function renderRM(){
  if(!S.roadmap||!S.roadmap.length)return;
  const rb=document.getElementById('rb');
  const strip=document.getElementById('rm-milestone-strip');
  const detail=document.getElementById('rm-detail-panel');
  const activeIndex=getRoadmapActiveIndex();
  const activeMilestone=S.roadmap[activeIndex];
  const activeDay=getRoadmapDayProgress();
  const activePct=getRoadmapStagePct(activeIndex);
  const activeDoneCount=(activeMilestone?.days||[]).filter((_,idx)=>idx<activeDay).length;
  if(strip){
    strip.innerHTML=S.roadmap.map((wk,i)=>{
      const status=getRoadmapStageStatus(i);
      const subtitle=(wk.objective||'').split('. ')[0]||wk.objective||'';
      return `<button class="rm-milestone-card ${status} ${openRoadmapMilestoneIndex===i?'selected':''}" onclick="focusRoadmapStage(${i})">
        <div class="rm-milestone-top">
          <div class="rm-milestone-node"></div>
          <div class="rm-milestone-meta">
            <span class="rm-milestone-date">${escHtml(getRoadmapTargetDate(i,S.roadmap.length))}</span>
            <span class="rm-milestone-tag">${status==='done'?'Done':status==='active'?'Active':'Upcoming'}</span>
          </div>
        </div>
        <div class="rm-milestone-label">Stage ${wk.week||i+1}</div>
        <div class="rm-milestone-title">${escHtml(wk.title||`Этап ${i+1}`)}</div>
        <div class="rm-milestone-copy">${escHtml(subtitle)}</div>
        <div class="rm-milestone-state">${status==='done'?'Completed checkpoint':status==='active'?'Current direction':'Future checkpoint'}</div>
      </button>`;
    }).join('');
  }
  if(detail){
    if(openRoadmapMilestoneIndex===null) detail.style.display='none';
    else{
      detail.style.display='';
      detail.innerHTML=buildRoadmapDetailPanel(openRoadmapMilestoneIndex);
    }
  }
  let html=`<div class="rm-overview">
    <div class="rm-overview-head">
      <div>
        <div class="rm-overview-kicker">Roadmap Progression</div>
        <div class="page-title">Full Path</div>
      </div>
      <div class="rm-overview-copy">Click any stage to focus it and open milestone detail.</div>
    </div>
  </div>
  <div class="rm-focus">
    <div class="rm-focus-head">
      <div>
        <div class="rm-focus-kicker">Current Stage Focus</div>
        <div class="rm-focus-title">${escHtml(activeMilestone.title||'Current stage')}</div>
        <div class="rm-focus-copy">${escHtml(activeMilestone.objective||'')}</div>
      </div>
      <div class="rm-focus-progress">
        <strong>${activePct}%</strong>
        <span>${activeDoneCount}/${(activeMilestone.days||[]).length} criteria closed</span>
        <div class="rm-focus-track"><div class="rm-focus-fill" style="width:${activePct}%"></div></div>
      </div>
    </div>
    <div class="rm-focus-grid">
      <div class="rm-focus-box">
        <div class="rm-list-title">Success Criteria</div>
        <div class="rm-focus-list">
          ${(activeMilestone.days||[]).slice(0,5).map((day,idx)=>{
            const status=idx<activeDay?'done':idx===activeDay?'active':'pending';
            return `<div class="rm-focus-item ${status}">
              <div class="rm-focus-item-mark">${status==='done'?'✓':status==='active'?'●':'·'}</div>
              <div><strong>${escHtml(day.task||'Planned step')}</strong><span>${escHtml(day.day||'DAY')} · ${escHtml(day.duration||'без оценки')}</span></div>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="rm-focus-box">
        <div class="rm-list-title">Stage Signals</div>
        <div class="rm-focus-list">
          <div class="rm-focus-item active"><div class="rm-focus-item-mark">●</div><div><strong>${escHtml(getRoadmapTargetDate(activeIndex,S.roadmap.length))}</strong><span>Target checkpoint date</span></div></div>
          <div class="rm-focus-item"><div class="rm-focus-item-mark">·</div><div><strong>${(S.tasks||[]).filter(t=>!t.done).length}</strong><span>Open execution tasks in workspace</span></div></div>
          <div class="rm-focus-item"><div class="rm-focus-item-mark">·</div><div><strong>${S.progress.sessions}</strong><span>Sessions invested into roadmap</span></div></div>
        </div>
      </div>
    </div>
  </div>
  <div class="rm-timeline">
    <div class="rm-timeline-head">
      <div>
        <div class="rm-overview-kicker">Execution Timeline</div>
        <div class="page-title">Timeline</div>
      </div>
      <div class="rm-timeline-copy">Each node is a real roadmap step. Click a node to inspect what it means and how it connects to tasks.</div>
    </div>`;
  S.roadmap.forEach((wk,i)=>{
    const status=getRoadmapStageStatus(i);
    const stagePct=getRoadmapStagePct(i);
    html+=`<section class="rm-stage-section ${status==='active'?'highlight':''}" id="rm-stage-${i}">
      <div class="rm-stage-head">
        <div>
          <div class="rm-stage-title">${escHtml(wk.title||`Этап ${i+1}`)}</div>
          <div class="rm-stage-sub">${escHtml(wk.objective||'')}</div>
          <div class="rm-stage-meta">
            <span class="rm-stage-chip">${status==='done'?'Done':status==='active'?'Active':'Upcoming'}</span>
            <span class="rm-stage-chip">${escHtml(getRoadmapTargetDate(i,S.roadmap.length))}</span>
            <span class="rm-stage-chip">${stagePct}% complete</span>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="toggleRoadmapMilestone(${i})">Milestone Detail</button>
      </div>
      <div class="rm-stage-timeline">`;
    (wk.days||[]).forEach((day,dayIndex)=>{
      let itemStatus='pending';
      if(i<activeIndex) itemStatus='done';
      else if(i===activeIndex){
        if(dayIndex<activeDay) itemStatus='done';
        else if(dayIndex===activeDay) itemStatus='active';
      }
      const key=`${i}-${dayIndex}`;
      const isOpen=openRoadmapTimelineKey===key;
      const related=(i===activeIndex&&(S.tasks||[]).length?(S.tasks||[]).slice(0,3).map(t=>t.text):(wk.days||[]).filter((_,idx)=>idx!==dayIndex).slice(0,2).map(x=>x.task)).filter(Boolean);
      html+=`<div class="rm-time-item ${itemStatus}">
        <button class="rm-time-btn" onclick="toggleRoadmapTimelineItem(${i},${dayIndex})">
          <div class="rm-time-top">
            <div class="rm-time-label">${escHtml(day.day||`Day ${dayIndex+1}`)}</div>
            <div class="rm-time-main">
              <strong>${escHtml(day.task||'Planned step')}</strong>
              <span>${itemStatus==='done'?'Completed step':itemStatus==='active'?'Current execution point':'Upcoming step'}</span>
            </div>
            <div class="rm-time-duration">${escHtml(day.duration||'')}</div>
          </div>
        </button>
        ${isOpen?`<div class="rm-time-detail"><p>${escHtml(wk.objective||'')}</p>${related.length?`<div class="rm-inline-related">${related.map(txt=>`<span class="rm-inline-chip">${escHtml(txt)}</span>`).join('')}</div>`:''}</div>`:''}
      </div>`;
    });
    html+=`</div></section>`;
  });
  html+=`</div>`;
  rb.innerHTML=html;
  document.getElementById('rm-span').textContent=`План на ${S.roadmap.length} этапов · Активен этап ${Math.min(S.progress.milestones+1,S.roadmap.length)}`;
}

/* ══ AI CHAT — paywall for free users ══ */
function renderChatPage(){
  const wrap=document.getElementById('chat-inner');
  const plan=S.billing.plan;
  // Paywall for free users
  if(plan==='free'){
    wrap.innerHTML=`<div class="paywall-overlay">
      <div class="paywall-icon">✦</div>
      <div class="paywall-title">AI Coach</div>
      <div class="paywall-desc">Get unlimited access to your personal AI execution coach. Ask for tactical advice, roadmap reviews, and strategic guidance — powered by Gemini.</div>
      <div class="paywall-features">
        <div class="paywall-feat">Unlimited AI chat sessions</div>
        <div class="paywall-feat">Tactical roadmap advice</div>
        <div class="paywall-feat">AI task cleanup &amp; review</div>
        <div class="paywall-feat">Goal analysis &amp; feedback</div>
        <div class="paywall-feat">Blocker breakthrough prompts</div>
        <div class="paywall-feat">Weekly performance review</div>
      </div>
      <div class="paywall-plans">
        <div class="paywall-plan featured">
          <div class="paywall-plan-price">$19</div>
          <div class="paywall-plan-name">Pro / month</div>
          <button class="paywall-plan-btn" onclick="gp('billing')">Upgrade to Pro →</button>
        </div>
        <div class="paywall-plan">
          <div class="paywall-plan-price">$49</div>
          <div class="paywall-plan-name">Team / month</div>
          <button class="paywall-plan-btn" onclick="gp('billing')" style="background:transparent;color:var(--ink);border-color:var(--ink);">Upgrade to Team →</button>
        </div>
      </div>
    </div>`;
    return;
  }
  // Paid users get full chat
  wrap.innerHTML=`<div class="chat-msgs" id="chat-msgs"></div>
    <div class="chat-starters" id="chat-starters"></div>
    <div class="chat-input-row">
      <textarea id="chat-in" placeholder="Спроси AI-коуча о плане, приоритетах или следующем шаге…" rows="2" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendChat();}"></textarea>
      <button class="chat-send-btn" onclick="sendChat()">Отправить →</button>
    </div>`;
  renderChatMsgs();buildStarters();
}
function renderChatMsgs(){const el=document.getElementById('chat-msgs');if(!el)return;if(!S.chatHistory.length){el.innerHTML=`<div class="chat-msg ai"><div class="msg-av ai">S</div><div class="msg-bubble">Привет, ${escHtml(S.user.name)}. Я твой AI-коуч по исполнению. Могу помочь с приоритетами, roadmap, разбивкой задач и разбором затыков. С чего начнём?</div></div>`;return;}el.innerHTML=S.chatHistory.map(m=>`<div class="chat-msg ${m.role}"><div class="msg-av ${m.role}">${m.role==='ai'?'S':S.user.name.charAt(0).toUpperCase()}</div><div class="msg-bubble">${escHtml(m.content)}</div></div>`).join('');el.scrollTop=el.scrollHeight;}
function buildStarters(){const el=document.getElementById('chat-starters');if(!el)return;const starters=['На чём мне сфокусироваться сегодня?','Разбери мой текущий прогресс','Разложи мою цель на этапы','Что у меня следующий milestone?','Я застрял, помоги выбрать следующий шаг'];el.innerHTML=starters.map(s=>`<button class="starter-chip" onclick="sendChatMsg(${JSON.stringify(s)})">${s}</button>`).join('');}
async function sendChat(){const el=document.getElementById('chat-in');if(!el)return;const msg=el.value.trim();if(!msg)return;el.value='';sendChatMsg(msg);}
async function sendChatMsg(msg){
  S.chatHistory.push({role:'user',content:msg});renderChatMsgs();
  const el=document.getElementById('chat-msgs');
  if(el)el.innerHTML+=`<div class="chat-msg ai"><div class="msg-av ai">S</div><div class="msg-bubble"><span class="spin-sm"></span></div></div>`;
  try{
    const history=S.chatHistory.map(m=>`${m.role==='user'?'Пользователь':'Ассистент'}: ${m.content}`).join('\n\n');
    const reply=await gemini(history,sysp(),600);
    S.chatHistory.push({role:'ai',content:reply});renderChatMsgs();saveAll();
  }catch(e){S.chatHistory.push({role:'ai',content:'⚠ Ошибка: '+e.message});renderChatMsgs();}
}

/* ══ TASKS ══ */
let taskFilter='all',aiTasksDraft=null;
function focusTaskInput(){document.getElementById('task-input').focus();}
function addTask(){
  const txt=document.getElementById('task-input').value.trim();if(!txt)return;
  const prio=document.getElementById('task-prio').value;
  S.tasks=S.tasks||[];S.tasks.unshift({id:Date.now(),text:txt,prio,done:false,created:new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'})});
  document.getElementById('task-input').value='';
  saveTasks();renderTasks();updTaskBadge();updMilestoneBar();
  document.getElementById('m-tasks').textContent=S.progress.tasksDone;
  trackEvent('add_task');
}
function renderTasks(){
  const el=document.getElementById('task-list');if(!el)return;
  let f=S.tasks||[];
  if(taskFilter==='active')f=f.filter(t=>!t.done);
  else if(taskFilter==='done')f=f.filter(t=>t.done);
  else if(taskFilter==='high')f=f.filter(t=>t.prio==='high'&&!t.done);
  const cnt=(S.tasks||[]).filter(t=>!t.done).length;
  const sub=document.getElementById('task-count-sub');if(sub)sub.textContent=cnt>0?`(${cnt} active)`:'';
  if(!f.length){el.innerHTML='<div class="task-empty"><span class="task-empty-icon">☑</span>Задач здесь пока нет</div>';return;}
  el.innerHTML=f.map(t=>`<div class="task-item ${t.done?'done-item':''}">
    <div class="task-cb ${t.done?'checked':''}" onclick="toggleTask(${t.id})"></div>
    <div class="task-body">
      <div class="task-text" contenteditable="true" onblur="editTaskText(${t.id},this.textContent)">${escHtml(t.text)}</div>
      <div class="task-meta">
        <span class="task-prio ${t.prio}">${{high:'🔴 Высокий',med:'🟡 Средний',low:'🟢 Низкий'}[t.prio]||taskPrioLabel(t.prio)}</span>
        <span class="task-date">${t.created||''}</span>
        ${t.deadline?`<span class="task-date">📅 ${t.deadline}</span>`:''}
      </div>
    </div>
    <button class="task-del" onclick="deleteTask(${t.id})">✕</button>
  </div>`).join('');
}
function toggleTask(id){const t=(S.tasks||[]).find(t=>t.id===id);if(t){t.done=!t.done;if(t.done)S.progress.tasksDone++;else if(S.progress.tasksDone>0)S.progress.tasksDone--;saveTasks();renderTasks();updTaskBadge();saveAll();document.getElementById('m-tasks').textContent=S.progress.tasksDone;const mb=document.getElementById('m-tasks-bar');if(mb)mb.style.width=Math.min(100,S.progress.tasksDone*5)+'%';updMilestoneBar();}}
function editTaskText(id,txt){const t=(S.tasks||[]).find(t=>t.id===id);if(t&&txt.trim()){t.text=txt.trim();saveTasks();}}
function deleteTask(id){S.tasks=(S.tasks||[]).filter(t=>t.id!==id);saveTasks();renderTasks();updTaskBadge();updMilestoneBar();}
function filterTasks(f,btn){taskFilter=f;document.querySelectorAll('.ftab').forEach(b=>b.classList.remove('on'));btn.classList.add('on');renderTasks();}
function updTaskBadge(){const c=(S.tasks||[]).filter(t=>!t.done).length;const b=document.getElementById('task-badge');if(b){b.textContent=c;b.style.display=c>0?'':'none';}}
function saveTasks(){try{localStorage.setItem('sa_tasks',JSON.stringify(S.tasks||[]));}catch(e){}}
function loadTasks(){try{S.tasks=JSON.parse(localStorage.getItem('sa_tasks')||'[]');}catch(e){S.tasks=[];}}
async function aiEditTasks(){const tasks=S.tasks||[];if(!tasks.length){toast2('Нет задач','Сначала добавь задачи');return;}const bar=document.getElementById('tasks-ai-bar'),txt=document.getElementById('tasks-ai-txt');bar.style.display='';txt.innerHTML='<span class="spin-sm"></span> Анализирую задачи через Gemini…';document.querySelectorAll('button').forEach(b=>b.disabled=true);try{aiTasksDraft=normalizeAiTasks(await geminiJSON(buildTaskAuditPrompt(tasks),taskAuditResponseJsonSchema(),1000,sysp(),{temperature:0.25}));txt.textContent='Список задач перестроен. Нажми Apply, чтобы заменить текущую версию.';}catch(e){txt.textContent='⚠ Ошибка: '+e.message;}document.querySelectorAll('button').forEach(b=>b.disabled=false);}
function applyAiTasks(){if(!aiTasksDraft)return;S.tasks=normalizeAiTasks(aiTasksDraft);saveTasks();renderTasks();updTaskBadge();document.getElementById('tasks-ai-bar').style.display='none';aiTasksDraft=null;toast2('Задачи обновлены','');}

/* ══ GOALS ══ */
function addGoal(){document.getElementById('goal-form').style.display='flex';}
function saveGoal(){const t=document.getElementById('goal-title-input').value.trim();if(!t)return;const g={id:Date.now(),title:t,deadline:document.getElementById('goal-deadline-input').value,desc:document.getElementById('goal-desc-input').value.trim(),pct:0};S.goals=S.goals||[];S.goals.unshift(g);document.getElementById('goal-title-input').value='';document.getElementById('goal-desc-input').value='';document.getElementById('goal-form').style.display='none';saveGoals();renderGoals();toast2('Цель добавлена','');}
function renderGoals(){const el=document.getElementById('goal-list');if(!el)return;if(!(S.goals||[]).length){el.innerHTML='<div class="task-empty"><span class="task-empty-icon">◎</span>Целей пока нет</div>';return;}el.innerHTML=(S.goals||[]).map(g=>`<div class="goal-card"><div class="goal-card-progress"><div class="goal-card-fill" style="width:${g.pct||0}%"></div></div><div class="goal-card-body"><div class="goal-card-title" contenteditable="true" onblur="editGoalField(${g.id},'title',this.textContent)">${escHtml(g.title)}</div><div class="goal-card-desc" contenteditable="true" onblur="editGoalField(${g.id},'desc',this.textContent)">${escHtml(g.desc||'Добавь описание…')}</div><div class="goal-card-meta">${g.deadline?`<span class="goal-tag-item">📅 ${g.deadline}</span>`:''}<span class="goal-tag-item">Готово: ${g.pct||0}%</span></div></div><div class="goal-card-footer"><input class="goal-pct-in" type="number" min="0" max="100" value="${g.pct||0}" onchange="updateGoalPct(${g.id},this.value)"/> % <span style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-left:4px">прогресс</span><button class="btn btn-danger btn-sm" onclick="deleteGoal(${g.id})" style="margin-left:auto">Удалить</button></div></div>`).join('');}
function editGoalField(id,f,val){const g=(S.goals||[]).find(g=>g.id===id);if(g&&val.trim()&&val.trim()!=='Добавь описание…'){g[f]=val.trim();saveGoals();}}
function updateGoalPct(id,val){const g=(S.goals||[]).find(g=>g.id===id);if(g){g.pct=Math.min(100,Math.max(0,parseInt(val)||0));saveGoals();renderGoals();}}
function deleteGoal(id){if(!confirm('Delete?'))return;S.goals=(S.goals||[]).filter(g=>g.id!==id);saveGoals();renderGoals();}
function saveGoals(){try{localStorage.setItem('sa_goals',JSON.stringify(S.goals||[]));}catch(e){}}
function loadGoals(){try{S.goals=JSON.parse(localStorage.getItem('sa_goals')||'[]');}catch(e){S.goals=[];}}
async function aiReviewGoals(){const goals=S.goals||[];if(!goals.length){toast2('Нет целей','Сначала добавь цели');return;}const bar=document.getElementById('goals-ai-bar'),txt=document.getElementById('goals-ai-txt');bar.style.display='';txt.innerHTML='<span class="spin-sm"></span> Разбираю цели через Gemini…';try{const reply=await gemini(buildGoalsReviewPrompt(goals),sysp(),700);txt.textContent=reply;}catch(e){txt.textContent='⚠ '+e.message;}}

/* ══ NOTES ══ */
let activeNoteId=null,aiNoteDraft=null,autoSaveTimer=null;
function addNote(){const n={id:Date.now(),title:'Untitled Note',body:'',updated:new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'})};S.notes=S.notes||[];S.notes.unshift(n);saveNotes();renderNoteList();openNote(n.id);}
function openNote(id){activeNoteId=id;const n=(S.notes||[]).find(n=>n.id===id);if(!n)return;document.getElementById('note-title').value=n.title;document.getElementById('note-body').value=n.body;renderNoteList();}
function autoSaveNote(){clearTimeout(autoSaveTimer);autoSaveTimer=setTimeout(()=>saveCurrentNote(true),800);}
function saveCurrentNote(silent=false){if(!activeNoteId)return;const n=(S.notes||[]).find(n=>n.id===activeNoteId);if(n){n.title=document.getElementById('note-title').value.trim()||'Untitled';n.body=document.getElementById('note-body').value;n.updated=new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'});saveNotes();renderNoteList();if(!silent)toast2('Note saved','');}}
function deleteCurrentNote(){if(!activeNoteId||!confirm('Delete?'))return;S.notes=(S.notes||[]).filter(n=>n.id!==activeNoteId);activeNoteId=null;document.getElementById('note-title').value='';document.getElementById('note-body').value='';saveNotes();renderNoteList();}
function renderNoteList(){const el=document.getElementById('note-list');if(!el)return;const n=S.notes||[];if(!n.length){el.innerHTML='<div style="padding:14px;font-family:var(--mono);font-size:11px;color:var(--muted);text-align:center">No notes yet</div>';return;}el.innerHTML=n.map(x=>`<div class="note-item ${x.id===activeNoteId?'active':''}" onclick="openNote(${x.id})"><div class="note-item-title">${escHtml(x.title)}</div><div class="note-item-preview">${escHtml((x.body||'').substring(0,60))}</div><div class="note-item-date">${x.updated||''}</div></div>`).join('');}
function saveNotes(){try{localStorage.setItem('sa_notes',JSON.stringify(S.notes||[]));}catch(e){}}
function loadNotes(){try{S.notes=JSON.parse(localStorage.getItem('sa_notes')||'[]');}catch(e){S.notes=[];}}
async function aiProcessNote(){const body=document.getElementById('note-body').value.trim();if(!body){toast2('Пустая заметка','');return;}const bar=document.getElementById('notes-ai-bar'),txt=document.getElementById('notes-ai-txt');bar.style.display='';txt.innerHTML='<span class="spin-sm"></span> Привожу заметку в порядок…';try{const reply=await gemini(buildNoteProcessPrompt(body),sysp(),900);aiNoteDraft=reply;txt.textContent='Готово. Нажми Apply, чтобы заменить текущую заметку.';}catch(e){txt.textContent='⚠ '+e.message;}}
function applyAiNote(){if(!aiNoteDraft)return;document.getElementById('note-body').value=aiNoteDraft;saveCurrentNote();document.getElementById('notes-ai-bar').style.display='none';aiNoteDraft=null;toast2('Note updated','');}

/* ══ SETTINGS ══ */
function saveProfile(){S.user.goal=document.getElementById('set-goal-input').value.trim();S.user.deadline=document.getElementById('set-deadline-input').value;S.user.hours=document.getElementById('set-hrs-input').value;S.user.blockers=document.getElementById('set-block-input').value.trim();S.user.styles=getSelectedPills('style-pills');S.user.win=document.getElementById('set-win-input').value.trim();saveAll();applyUserToUI();const st=document.getElementById('set-profile-status');st.style.display='';clearTimeout(st._t);st._t=setTimeout(()=>st.style.display='none',2500);toast2('Profile saved','');}
function populateSettings(){document.getElementById('set-goal-input').value=S.user.goal||'';document.getElementById('set-deadline-input').value=S.user.deadline||'';document.getElementById('set-hrs-input').value=S.user.hours||'';document.getElementById('set-block-input').value=S.user.blockers||'';document.getElementById('set-win-input').value=S.user.win||'';document.querySelectorAll('#style-pills .pill').forEach(p=>{p.classList.toggle('on',(S.user.styles||[]).includes(p.textContent.trim()));});}

/* ══ BILLING ══ */
function renderBillingBtns(){const plan=S.billing.plan;const freeBtn=document.getElementById('free-btn');if(freeBtn)freeBtn.textContent=plan==='free'?'✓ Current Plan':'Downgrade';}
function initPayPal(planKey,containerId){if(PAYPAL_CLIENT_ID==='YOUR_PAYPAL_CLIENT_ID_HERE'){toast2('PayPal not configured','See billing section setup guide');return;}if(S.paypalLoaded){_renderPayPalBtn(planKey,containerId);return;}const script=document.createElement('script');script.src=`${PAYPAL_SDK_URL}?client-id=${PAYPAL_CLIENT_ID}&vault=true&intent=subscription`;script.onload=()=>{S.paypalLoaded=true;_renderPayPalBtn(planKey,containerId);};document.head.appendChild(script);}
function _renderPayPalBtn(planKey,containerId){const planId=planKey==='pro'?PLAN_PRO:PLAN_TEAM;const el=document.getElementById(containerId);if(!el)return;el.innerHTML='<div id="pp-inner-'+containerId+'"></div>';try{paypal.Buttons({style:{shape:'rect',color:'blue',layout:'vertical',label:'subscribe'},createSubscription:(data,actions)=>actions.subscription.create({'plan_id':planId}),onApprove:(data)=>{S.billing.plan=planKey;S.billing.subscriptionId=data.subscriptionID;saveAll();applyUserToUI();renderBillingBtns();toast2('Upgraded! 🎉','');}}).render('#pp-inner-'+containerId);}catch(e){el.innerHTML='<div style="font-family:var(--mono);font-size:11px;color:var(--red);padding:8px">PayPal error: '+escHtml(String(e))+'</div>';}}

/* ══ ANALYTICS ══ */
let analyticsRangeDays=30;
function trackEvent(name){try{const events=JSON.parse(localStorage.getItem('sa_events')||'[]');events.push({event:name,ts:Date.now(),date:new Date().toDateString(),hour:new Date().getHours()});if(events.length>3000)events.splice(0,events.length-3000);localStorage.setItem('sa_events',JSON.stringify(events));const visits=JSON.parse(localStorage.getItem('sa_analytics_visits')||'{}');const day=new Date().toDateString();visits[day]=(visits[day]||0)+1;localStorage.setItem('sa_analytics_visits',JSON.stringify(visits));}catch(e){}}
function analyticsRange(days,btn){analyticsRangeDays=days;document.querySelectorAll('#pg-analytics .btn-ghost.btn-sm').forEach(b=>{b.style.borderColor='';b.style.color='';});if(btn){btn.style.borderColor='var(--blue)';btn.style.color='var(--blue-l)';}renderAnalytics();}
function renderAnalytics(){
  const visits=JSON.parse(localStorage.getItem('sa_analytics_visits')||'{}');
  const events=JSON.parse(localStorage.getItem('sa_events')||'[]');
  const now=new Date();const labels=[],visitArr=[],sessArr=[];
  for(let i=analyticsRangeDays-1;i>=0;i--){const d=new Date(now);d.setDate(d.getDate()-i);const key=d.toDateString();labels.push(d.toLocaleDateString('en-GB',{day:'numeric',month:'short'}));visitArr.push(visits[key]||0);sessArr.push(events.filter(e=>e.date===key&&e.event==='session_done').length);}
  const totalVisits=visitArr.reduce((a,b)=>a+b,0);const activeDays=visitArr.filter(v=>v>0).length;
  const spd=S.progress.sessions>0?(S.progress.sessions/analyticsRangeDays).toFixed(1):0;
  const avgSession=S.progress.sessions>0?Math.round(S.progress.hours*60/S.progress.sessions)+'m':'—';
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  set('a-visits',totalVisits);set('a-visits-d','total page loads');
  set('a-users',activeDays);set('a-users-d','days with activity');
  set('a-spd',spd);set('a-spd-d','sessions/day avg');
  set('a-dur',avgSession);set('a-dur-d','avg per session');
  set('live-count','1');
  const lu=document.getElementById('live-updated');if(lu)lu.textContent='Updated: '+new Date().toLocaleTimeString();
  const featureCounts={};events.forEach(e=>{featureCounts[e.event]=(featureCounts[e.event]||0)+1;});
  const hourly=new Array(24).fill(0);events.forEach(e=>hourly[e.hour]=(hourly[e.hour]||0)+1);
  drawLineChart('chart-visits',labels,visitArr,'Visits','#0052FF');
  drawLineChart('chart-users',labels,sessArr,'Sessions','#10B981');
  drawDurationChart('chart-duration',labels);
  drawFeatureChart('chart-features',featureCounts);
  drawHourlyChart('chart-hourly',hourly);
  renderAnalyticsEvents(events);
}
function renderAnalyticsEvents(events){const el=document.getElementById('analytics-events');if(!el)return;const recent=events.slice(-20).reverse();if(!recent.length){el.innerHTML='<div style="font-family:var(--mono);font-size:11px;color:var(--muted);padding:8px">No events yet</div>';return;}el.innerHTML=recent.map(e=>{const t=new Date(e.ts);return`<div style="display:grid;grid-template-columns:70px 1fr 100px;align-items:center;gap:10px;padding:5px 0;border-bottom:1px solid var(--border2);font-family:var(--mono);font-size:11px"><span style="color:var(--muted)">${t.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span><span style="color:var(--ink)">${escHtml(e.event)}</span><span style="color:var(--dim);text-align:right">${e.date}</span></div>`;}).join('');}

function drawLineChart(id,labels,data,label,color){const canvas=document.getElementById(id);if(!canvas)return;const ctx=canvas.getContext('2d');const W=canvas.parentElement.clientWidth||400,H=180;canvas.width=W*devicePixelRatio;canvas.height=H*devicePixelRatio;canvas.style.width=W+'px';canvas.style.height=H+'px';ctx.scale(devicePixelRatio,devicePixelRatio);const pad={t:10,r:10,b:28,l:32};const cw=W-pad.l-pad.r,ch=H-pad.t-pad.b;const max=Math.max(...data,1);ctx.fillStyle='#1F1F1F';ctx.fillRect(0,0,W,H);ctx.strokeStyle='#2A2A2A';ctx.lineWidth=1;for(let i=0;i<=4;i++){const y=pad.t+(ch/4)*i;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(pad.l+cw,y);ctx.stroke();}ctx.fillStyle='#8D90A2';ctx.font='9px JetBrains Mono,monospace';ctx.textAlign='right';for(let i=0;i<=4;i++){const y=pad.t+(ch/4)*i;ctx.fillText(Math.round(max-(max/4)*i),pad.l-3,y+4);}const step=Math.ceil(labels.length/8);ctx.textAlign='center';labels.forEach((l,i)=>{if(i%step===0||i===labels.length-1){ctx.fillText(l,pad.l+(i/(labels.length-1||1))*cw,H-6);}});if(!data.some(v=>v>0)){ctx.fillStyle='#8D90A2';ctx.textAlign='center';ctx.font='11px JetBrains Mono';ctx.fillText('No data yet — use the app first',W/2,H/2);return;}const grad=ctx.createLinearGradient(0,pad.t,0,pad.t+ch);grad.addColorStop(0,color+'33');grad.addColorStop(1,color+'05');ctx.fillStyle=grad;ctx.beginPath();data.forEach((v,i)=>{const x=pad.l+(i/(data.length-1||1))*cw;const y=pad.t+(1-v/max)*ch;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});ctx.lineTo(pad.l+cw,pad.t+ch);ctx.lineTo(pad.l,pad.t+ch);ctx.closePath();ctx.fill();ctx.strokeStyle=color;ctx.lineWidth=2;ctx.lineJoin='round';ctx.beginPath();data.forEach((v,i)=>{const x=pad.l+(i/(data.length-1||1))*cw;const y=pad.t+(1-v/max)*ch;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);});ctx.stroke();}
function drawDurationChart(id,labels){const canvas=document.getElementById(id);if(!canvas)return;const ctx=canvas.getContext('2d');const W=canvas.parentElement.clientWidth||300,H=160;canvas.width=W*devicePixelRatio;canvas.height=H*devicePixelRatio;canvas.style.width=W+'px';canvas.style.height=H+'px';ctx.scale(devicePixelRatio,devicePixelRatio);ctx.fillStyle='#1F1F1F';ctx.fillRect(0,0,W,H);const sessionLog=S.progress.sessionLog||[];const now=new Date();const n=Math.min(labels.length,14);const data=Array.from({length:n},(_,i)=>{const d=new Date(now);d.setDate(d.getDate()-(n-1-i));const log=sessionLog.find(e=>e.date===d.toDateString());return log?log.duration:0;});const pad={t:8,r:8,b:24,l:28};const cw=W-pad.l-pad.r,ch=H-pad.t-pad.b;const max=Math.max(...data,1);const bw=cw/n-2;data.forEach((v,i)=>{const x=pad.l+(cw/n)*i+1;const bh=(v/max)*ch;const y=pad.t+ch-bh;ctx.fillStyle='rgba(0,82,255,0.5)';ctx.fillRect(x,y,bw,bh);ctx.fillStyle='#0052FF';ctx.fillRect(x,y,bw,2);});ctx.fillStyle='#8D90A2';ctx.font='9px JetBrains Mono,monospace';ctx.textAlign='center';ctx.fillText('Avg: '+(S.progress.sessions>0?Math.round(S.progress.hours*60/S.progress.sessions):0)+'m',W/2,H-6);if(!data.some(v=>v>0)){ctx.fillStyle='#8D90A2';ctx.textAlign='center';ctx.font='11px JetBrains Mono';ctx.fillText('No sessions yet',W/2,H/2);}}
function drawFeatureChart(id,counts){const canvas=document.getElementById(id);if(!canvas)return;const ctx=canvas.getContext('2d');const W=canvas.parentElement.clientWidth||300,H=160;canvas.width=W*devicePixelRatio;canvas.height=H*devicePixelRatio;canvas.style.width=W+'px';canvas.style.height=H+'px';ctx.scale(devicePixelRatio,devicePixelRatio);ctx.fillStyle='#1F1F1F';ctx.fillRect(0,0,W,H);const labels=['dashboard','work','notes','roadmap','settings','analytics'];const colors=['#0052FF','#10B981','#F59E0B','#B7C4FF','#6EE7B7','#8B5CF6'];const data=labels.map(l=>counts['page_'+l]||0);const max=Math.max(...data,1);const pad={t:6,r:52,b:6,l:6};const cw=W-pad.l-pad.r,ch=H-pad.t-pad.b;const bh=(ch/labels.length)-3;labels.forEach((l,i)=>{const v=data[i];const bw=(v/max)*cw;const y=pad.t+(ch/labels.length)*i;ctx.fillStyle=colors[i]+'33';ctx.fillRect(pad.l,y,cw,bh);ctx.fillStyle=colors[i];ctx.fillRect(pad.l,y,bw,bh);ctx.fillStyle='#E2E2E2';ctx.font='9px JetBrains Mono,monospace';ctx.textAlign='left';ctx.fillText(l.toUpperCase(),pad.l+cw+4,y+bh-1);ctx.textAlign='right';ctx.fillStyle=colors[i];ctx.fillText(v,pad.l+cw-3,y+bh-1);});}
function drawHourlyChart(id,hourly){const canvas=document.getElementById(id);if(!canvas)return;const ctx=canvas.getContext('2d');const W=canvas.parentElement.clientWidth||300,H=160;canvas.width=W*devicePixelRatio;canvas.height=H*devicePixelRatio;canvas.style.width=W+'px';canvas.style.height=H+'px';ctx.scale(devicePixelRatio,devicePixelRatio);ctx.fillStyle='#1F1F1F';ctx.fillRect(0,0,W,H);const pad={t:8,r:8,b:24,l:8};const cw=W-pad.l-pad.r,ch=H-pad.t-pad.b;const max=Math.max(...hourly,1);const bw=cw/24-1;hourly.forEach((v,i)=>{const x=pad.l+(cw/24)*i;const bh=(v/max)*ch;const isWork=i>=9&&i<=18;ctx.fillStyle=isWork?'rgba(0,82,255,0.7)':'rgba(0,82,255,0.25)';ctx.fillRect(x,pad.t+ch-bh,bw,bh);});ctx.fillStyle='#8D90A2';ctx.font='9px JetBrains Mono,monospace';ctx.textAlign='center';[0,6,12,18,23].forEach(h=>{ctx.fillText(h+'h',pad.l+(cw/24)*h+bw/2,H-6);});}

/* ══ QUICK LOGIN ══ */
function quickLogin(){
  authSignIn();
}

/* ══ INIT ══ */
document.addEventListener('DOMContentLoaded',async ()=>{
  await loadRuntimeConfig();
  switchWorkTab('tasks');
  initAuthFlow();
});

/* ══ DRAGGABLE + RESIZABLE WORK PANEL ══ */
(function(){
  const panel = document.getElementById('work-panel');
  const zone  = document.getElementById('work-zone');
  const handle= document.getElementById('drag-handle');
  const resR  = document.getElementById('resize-handle');
  const resL  = document.getElementById('resize-handle-l');
  if(!panel||!zone||!handle) return;

  let dragging=false, resizing=false, resizeSide='r';
  let startX=0, startY=0, startLeft=0, startTop=0, startW=0;
  // Panel starts centered (no offset)
  let panelLeft = null, panelTop = 0;

  function applyPos(){
    if(panelLeft===null){
      panel.style.position='relative';
      panel.style.left='';panel.style.top='';
      panel.style.transform='';
      zone.style.justifyContent='center';
      zone.style.alignItems='flex-start';
    } else {
      panel.style.position='absolute';
      panel.style.left=panelLeft+'px';
      panel.style.top=panelTop+'px';
      zone.style.justifyContent='flex-start';
      zone.style.alignItems='flex-start';
    }
  }

  // DRAG
  handle.addEventListener('mousedown',e=>{
    if(e.button!==0) return;
    // If panel not yet freed, calculate absolute position from current center
    if(panelLeft===null){
      const r=panel.getBoundingClientRect();
      panelLeft=r.left;
      panelTop=r.top-zone.getBoundingClientRect().top;
      applyPos();
    }
    dragging=true;
    startX=e.clientX; startY=e.clientY;
    startLeft=panelLeft; startTop=panelTop;
    panel.classList.add('dragging');
    document.body.style.userSelect='none';
    e.preventDefault();
  });

  // RESIZE RIGHT
  resR.addEventListener('mousedown',e=>{
    if(e.button!==0) return;
    resizing=true; resizeSide='r';
    startX=e.clientX; startW=panel.offsetWidth;
    panel.classList.add('dragging');
    document.body.style.userSelect='none';
    e.preventDefault();
  });

  // RESIZE LEFT
  resL.addEventListener('mousedown',e=>{
    if(e.button!==0) return;
    resizing=true; resizeSide='l';
    startX=e.clientX; startW=panel.offsetWidth;
    if(panelLeft===null){
      const r=panel.getBoundingClientRect();
      panelLeft=r.left;
      panelTop=r.top-zone.getBoundingClientRect().top;
      applyPos();
    }
    startLeft=panelLeft;
    panel.classList.add('dragging');
    document.body.style.userSelect='none';
    e.preventDefault();
  });

  document.addEventListener('mousemove',e=>{
    if(dragging){
      const dx=e.clientX-startX;
      const dy=e.clientY-startY;
      panelLeft=Math.max(0, Math.min(window.innerWidth-200, startLeft+dx));
      panelTop=Math.max(0, Math.min(window.innerHeight-80, startTop+dy));
      applyPos();
    }
    if(resizing){
      const dx=e.clientX-startX;
      if(resizeSide==='r'){
        const newW=Math.max(320, Math.min(window.innerWidth-40, startW+dx));
        panel.style.width=newW+'px';
      } else {
        const newW=Math.max(320, Math.min(window.innerWidth-40, startW-dx));
        const newL=startLeft+(startW-newW);
        panel.style.width=newW+'px';
        panelLeft=newL;
        applyPos();
      }
    }
  });

  document.addEventListener('mouseup',()=>{
    dragging=false; resizing=false;
    panel.classList.remove('dragging');
    document.body.style.userSelect='';
  });

  // Touch support for drag
  handle.addEventListener('touchstart',e=>{
    const t=e.touches[0];
    if(panelLeft===null){
      const r=panel.getBoundingClientRect();
      panelLeft=r.left;
      panelTop=r.top-zone.getBoundingClientRect().top;
      applyPos();
    }
    dragging=true;
    startX=t.clientX; startY=t.clientY;
    startLeft=panelLeft; startTop=panelTop;
    e.preventDefault();
  },{passive:false});

  document.addEventListener('touchmove',e=>{
    if(!dragging) return;
    const t=e.touches[0];
    const dx=t.clientX-startX, dy=t.clientY-startY;
    panelLeft=Math.max(0,Math.min(window.innerWidth-200,startLeft+dx));
    panelTop=Math.max(0,Math.min(window.innerHeight-80,startTop+dy));
    applyPos();
    e.preventDefault();
  },{passive:false});

  document.addEventListener('touchend',()=>{dragging=false;});
})();
