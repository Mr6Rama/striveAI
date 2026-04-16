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
let AUTH_STATE_RESOLVED = false;
let STORAGE_BRIDGE_INSTALLED = false;
let CLOUD_KV = {};
let CLOUD_WRITE_QUEUE = new Set();
let CLOUD_FLUSH_TIMER = null;
let CLOUD_FLUSH_IN_PROGRESS = false;
const SA_KEY_PREFIX = 'sa_';
const SA_REBUILD_COUNT_KEY = 'sa_rebuild_count';
const SA_EXECUTION_KEY = 'sa_execution';
const ROADMAP_REBUILD_LIMIT = 2;
const BETA_MAX_DEADLINE_MONTHS = 1;
const BETA_ALLOWED_ROADMAP_VARIANT = 'balanced';
const BETA_ALLOWED_TASK_VARIANT = 'safe';
const EXECUTION_SCHEMA_VERSION = 1;
const SA_USER_DATA_KEYS = Object.freeze([
  'sa_context_summary',
  'sa_user',
  'sa_progress',
  'sa_billing',
  'sa_roadmap',
  SA_EXECUTION_KEY,
  'sa_tasks',
  'sa_goals',
  'sa_notes',
  'sa_events',
  'sa_analytics_visits',
  SA_REBUILD_COUNT_KEY,
  'sa_last_name',
  'sa_tour_seen',
  'sa_registrations',
  'sa_reg_count',
  'sa_auto_logins',
  'sa_total_loads'
]);
// For sandbox testing change above to: 'https://www.sandbox.paypal.com/sdk/js'

const LOG_LEVEL_PRIORITY = Object.freeze({debug:10,info:20,warn:30,error:40});
function getDefaultFrontendLogLevel(){
  const host=String(window.location?.hostname||'').toLowerCase();
  const isDev=host==='localhost'||host==='127.0.0.1'||host.endsWith('.local');
  return isDev?'debug':'info';
}
function resolveFrontendLogLevel(){
  try{
    const stored=String(window.localStorage.getItem('sa_log_level')||'').toLowerCase();
    if(LOG_LEVEL_PRIORITY[stored]) return stored;
  }catch(_e){}
  return getDefaultFrontendLogLevel();
}
const FRONTEND_LOG_LEVEL = resolveFrontendLogLevel();
function ensureSessionId(){
  const key='sa_session_id';
  try{
    const existing=String(window.sessionStorage.getItem(key)||'').trim();
    if(existing) return existing;
    const id=createClientRequestId('sess');
    window.sessionStorage.setItem(key,id);
    return id;
  }catch(_e){
    return createClientRequestId('sess');
  }
}
const FRONTEND_SESSION_ID = ensureSessionId();
function shouldLogFrontend(level){
  const incoming=LOG_LEVEL_PRIORITY[level]||LOG_LEVEL_PRIORITY.info;
  return incoming>=LOG_LEVEL_PRIORITY[FRONTEND_LOG_LEVEL];
}
function normalizeClientError(error,fallback='unexpected_exception'){
  const code=String(error?.code||'').toLowerCase();
  let category=fallback;
  if(code.includes('provider_unavailable')||code.includes('upstream_unavailable')||code.includes('unavailable')) category='provider_unavailable';
  else if(code.includes('timeout')) category='timeout';
  else if(code.includes('truncated')) category='truncated_response';
  else if(code.includes('parse')) category='parse_failure';
  else if(code.includes('json')) category='invalid_json';
  else if(code.includes('auth')) category='unauthorized';
  else if(code.includes('duplicate')) category='duplicate_request_blocked';
  else if(code.includes('validation')) category='validation_error';
  return {
    category,
    code:String(error?.code||''),
    message:String(error?.message||'Unknown error'),
    stack:typeof error?.stack==='string'?error.stack:'',
  };
}
function toLogPayload(level,payload){
  const base={
    timestamp:new Date().toISOString(),
    level,
    sessionId:FRONTEND_SESSION_ID,
    userId:CURRENT_AUTH_USER?.uid||'',
    route:window.location?.pathname||'/',
  };
  const out={...base,...payload};
  Object.keys(out).forEach((key)=>{if(out[key]===undefined) delete out[key];});
  return out;
}
function frontendLog(level,payload){
  if(!shouldLogFrontend(level)) return;
  const record=toLogPayload(level,payload||{});
  const area=record.area||'frontend';
  const action=record.action||'event';
  const requestId=record.requestId||record.clientRequestId||'-';
  const prefix=`[${area}] ${action} requestId=${requestId}`;
  if(level==='error'){console.error(prefix,record);return;}
  if(level==='warn'){console.warn(prefix,record);return;}
  if(level==='debug'){console.debug(prefix,record);return;}
  console.info(prefix,record);
}
function logDebug(payload){frontendLog('debug',payload);}
function logInfo(payload){frontendLog('info',payload);}
function logWarn(payload){frontendLog('warn',payload);}
function logError(payload){frontendLog('error',payload);}
async function withTiming(meta,fn){
  const startedAt=Date.now();
  logDebug({...meta,action:`${meta.action||'operation'}_started`});
  try{
    const result=await fn();
    logInfo({...meta,action:`${meta.action||'operation'}_succeeded`,durationMs:Date.now()-startedAt,status:'ok'});
    return result;
  }catch(error){
    const normalized=normalizeClientError(error);
    logError({
      ...meta,
      action:`${meta.action||'operation'}_failed`,
      durationMs:Date.now()-startedAt,
      status:'failed',
      errorCategory:normalized.category,
      errorCode:normalized.code,
      errorMessage:normalized.message
    });
    throw error;
  }
}
function createRequestTrace(fields={}){
  const trace={
    requestId:fields.requestId||createClientRequestId('trace'),
    clientRequestId:fields.clientRequestId||'',
    sessionId:FRONTEND_SESSION_ID,
    userId:fields.userId||CURRENT_AUTH_USER?.uid||'',
    route:window.location?.pathname||'/',
  };
  Object.keys(trace).forEach((key)=>{if(!trace[key]) delete trace[key];});
  return trace;
}

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
function simplifyPromptForFallback(prompt=''){
  return String(prompt||'').replace(/\s+/g,' ').trim().slice(0,1500);
}
function createGeminiError(message,code='GEMINI_ERROR',status=0){
  const error=new Error(message||'Gemini API error');
  error.code=String(code||'GEMINI_ERROR');
  error.status=Number(status)||0;
  return error;
}
function createClientRequestId(prefix='req'){
  try{
    if(window.crypto?.randomUUID){
      return `${prefix}-${window.crypto.randomUUID()}`;
    }
  }catch(_e){}
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
}
let activeRoadmapPipelineId=null;
let activeRoadmapAbortController=null;
function isRoadmapPipelineActive(pipelineId){
  return Boolean(pipelineId)&&pipelineId===activeRoadmapPipelineId;
}
function isAbortError(error){
  return Boolean(
    error?.name==='AbortError'
    || String(error?.code||'').toLowerCase()==='aborted'
  );
}
function startRoadmapPipelineSession(){
  if(activeRoadmapAbortController){
    try{activeRoadmapAbortController.abort();}catch(_e){}
  }
  const pipelineId=createClientRequestId('roadmap-pipeline');
  const controller=typeof AbortController!=='undefined'?new AbortController():null;
  activeRoadmapPipelineId=pipelineId;
  activeRoadmapAbortController=controller;
  return {pipelineId,signal:controller?.signal};
}
function mapGeminiErrorMessage(error,action='chat'){
  const code=String(error?.code||'').toLowerCase();
  if(code==='upstream_unavailable'||code==='provider_unavailable'){
    if(action==='roadmap') return 'Roadmap generation is temporarily unavailable. Please try again in a moment.';
    return 'AI provider is temporarily unavailable. Please try again in a moment.';
  }
  if(code==='timeout') return 'The request timed out. Please try again.';
  if(code==='response_truncated'||code==='truncated_response') return action==='roadmap'
    ? 'Roadmap response was too large and got truncated. Please retry.'
    : 'The AI response was incomplete. Please retry.';
  if(code==='parse_fail'||code==='invalid_response') return 'AI response format was invalid. Please retry.';
  if(code==='bad_request') return 'Invalid AI request. Please refresh and try again.';
  if(code==='duplicate_request_blocked') return 'Roadmap generation is already running. Please wait a moment.';
  return String(error?.message||'AI request failed. Please try again.');
}
async function geminiRequest(prompt, systemCtx='', maxTokens=1000, opts={}, action='chat') {
  if(!GEMINI_CONFIGURED){
    throw createGeminiError('⚠ Gemini API key not set!\n\nSet GEMINI_API_KEY in server environment variables.\n\nGet a free key at: https://aistudio.google.com/app/apikey','CONFIG',503);
  }
  const requestOpts=opts&&typeof opts==='object'?{...opts}:{};
  const signal=requestOpts?.signal;
  if(requestOpts&&Object.prototype.hasOwnProperty.call(requestOpts,'signal')) delete requestOpts.signal;
  const res = await fetch('/api/gemini/generate',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action,prompt,systemCtx,maxTokens,opts:requestOpts}),
    signal
  });
  const data = await res.json().catch(()=>({}));
  if(!res.ok||data.error){
    const message=String(data.error||'Gemini API error');
    const code=String(data.code||'GEMINI_ERROR');
    const error=createGeminiError(message,code,res.status);
    error.requestId=String(data.requestId||'');
    throw error;
  }
  if(typeof data.text!=='string'){
    throw createGeminiError('AI response body is invalid.','INVALID_MODEL_RESPONSE',502);
  }
  return {
    text:data.text||'',
    finishReason:String(data.finishReason||''),
    requestId:String(data.requestId||'')
  };
}
async function gemini(prompt, systemCtx='', maxTokens=1000, opts={}, action='chat') {
  const response=await geminiRequest(prompt,systemCtx,maxTokens,opts,action);
  return response.text||'';
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
function repairTruncatedJsonCandidate(raw){
  let text=String(raw||'').trim();
  if(!text) return '';
  let inString=false,escaped=false;
  const stack=[];
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(inString){
      if(escaped) escaped=false;
      else if(ch==='\\') escaped=true;
      else if(ch==='"') inString=false;
      continue;
    }
    if(ch==='"'){inString=true;continue;}
    if(ch==='{'||ch==='['){stack.push(ch);continue;}
    if(ch==='}'||ch===']'){
      const top=stack[stack.length-1];
      if((ch==='}'&&top==='{')||(ch===']'&&top==='[')) stack.pop();
    }
  }
  if(inString) text+='\"';
  while(stack.length){
    const open=stack.pop();
    text+=open==='{'?'}':']';
  }
  text=text.replace(/,\s*([}\]])/g,'$1');
  return text;
}
function parseJSON(raw,opts={}){
  const allowPartial=Boolean(opts.allowPartial);
  const variants=[stripCodeFences(raw),extractJsonChunk(raw)].filter(Boolean);
  if(allowPartial){
    const repaired=variants.map(v=>repairTruncatedJsonCandidate(v)).filter(Boolean);
    variants.push(...repaired);
  }
  let lastErr=null;
  for(const candidate of variants){
    try{return JSON.parse(candidate);}catch(err){lastErr=err;}
  }
  console.warn('Gemini JSON parse failed',raw,lastErr);
  throw new Error('Модель вернула повреждённый JSON. Попробуй ещё раз.');
}
function parseStages(text){
  return String(text||'')
    .split('\n')
    .map(line=>line.trim())
    .filter(line=>/^\d+\./.test(line))
    .map(line=>line.replace(/^\d+\.\s*/,''))
    .filter(Boolean)
    .slice(0,3);
}
const ROADMAP_MIN_STAGES=2;
const ROADMAP_MAX_STAGES=4;
const ROADMAP_DEFAULT_MAX_TOKENS = 2000;
const TASKS_DEFAULT_MAX_TOKENS = 1000;
const ROADMAP_SKELETON_MAX_TOKENS = 1600;
const ACTIVE_STAGE_ENRICH_MAX_TOKENS = 180;
const MVP_STAGE_DETAILS_DEFAULTS=Object.freeze({
  whyThisStageMatters:'This stage moves the project toward the current goal.',
  completionCriteria:[
    'All stage tasks are completed',
    'There is a visible milestone outcome'
  ],
  executionFocus:'Focus only on actions that advance this milestone.'
});
function buildFallbackStageTitle(index,goal=''){
  const safeGoal=clipText(goal,48);
  if(safeGoal){
    const prefixes=['Foundation for','Execution for','Scale for','Optimization for'];
    const prefix=prefixes[index]||`Stage ${index+1} for`;
    return clipText(`${prefix} ${safeGoal}`,80);
  }
  return `Stage ${index+1}`;
}
function summarizeRoadmapStagesForLog(stages=[]){
  return (Array.isArray(stages)?stages:[]).map((stage,index)=>({
    stageIndex:index,
    title:clipText(stage?.title||'',80),
    objective:clipText(stage?.objective||'',140),
    outcome:clipText(stage?.outcome||extractOutcomeFromObjective(stage?.objective||''),120),
    reasoning:clipText(stage?.reasoning||'',160),
    status:String(stage?.status||'')
  }));
}
function applyMvpStageDetailsDefaults(stage){
  if(!stage||typeof stage!=='object') return stage;
  const why=clipText(stage.whyThisStageMatters||stage.reasoning||'',220);
  const criteria=normalizeCompletionCriteria(stage.completionCriteria||stage.completion_criteria||[],stage.objective||'');
  const focus=clipText(stage.executionFocus||stage.execution_focus||'',160);
  stage.whyThisStageMatters=why||MVP_STAGE_DETAILS_DEFAULTS.whyThisStageMatters;
  stage.reasoning=clipText(stage.reasoning||stage.whyThisStageMatters||'',220)||MVP_STAGE_DETAILS_DEFAULTS.whyThisStageMatters;
  stage.completionCriteria=criteria.length
    ? criteria.slice(0,4)
    : [...MVP_STAGE_DETAILS_DEFAULTS.completionCriteria];
  stage.executionFocus=focus||MVP_STAGE_DETAILS_DEFAULTS.executionFocus;
  return stage;
}
function logRoadmapPipelineEvent(action,meta={}){
  const stages=getExecutionStages();
  const fallbackStageCount=Array.isArray(S.roadmap)?S.roadmap.length:0;
  const activeIndex=Number.isFinite(Number(meta.activeStageIndex))
    ? Number(meta.activeStageIndex)
    : (stages.length?getExecutionActiveStageIndex():0);
  const activeStage=Number.isFinite(activeIndex)&&stages.length?getExecutionStage(activeIndex):null;
  const payload={
    area:'frontend',
    module:'frontend/script.js',
    function:'roadmap_pipeline',
    action,
    requestId:String(meta.requestId||''),
    stageCount:Number.isFinite(Number(meta.stageCount))?Number(meta.stageCount):(stages.length||fallbackStageCount),
    activeStageId:String(meta.activeStageId||activeStage?.id||''),
    activeStageIndex:Number.isFinite(Number(activeIndex))?Number(activeIndex):0,
    promptChars:Number.isFinite(Number(meta.promptChars))?Number(meta.promptChars):0,
    requestedMaxTokens:Number.isFinite(Number(meta.requestedMaxTokens))?Number(meta.requestedMaxTokens):0,
    finishReason:String(meta.finishReason||''),
    contextFields:Array.isArray(meta.contextFields)?meta.contextFields:undefined,
    taskCount:Number.isFinite(Number(meta.taskCount))?Number(meta.taskCount):undefined,
    errorMessage:meta.errorMessage?String(meta.errorMessage):undefined
  };
  const warnActions=new Set([
    'roadmap_skeleton_parse_failed',
    'active_stage_enrichment_failed'
  ]);
  if(warnActions.has(action)) logWarn(payload);
  else logInfo(payload);
}
function parseObjectiveOutcome(rawObjective='',rawOutcome=''){
  const objectiveText=String(rawObjective||'').replace(/\s+/g,' ').trim();
  const outcomeText=String(rawOutcome||'').replace(/\s+/g,' ').trim();
  let objective='';
  let outcome='';
  const combined=[objectiveText,outcomeText].filter(Boolean).join(' | ');
  const normalizedCombined=combined
    .replace(/objective:\s*objective:/gi,'objective:')
    .replace(/outcome:\s*outcome:/gi,'outcome:')
    .trim();
  const objectiveMatch=normalizedCombined.match(/objective:\s*([^|]+?)(?=\s*\|\s*outcome:|$)/i);
  const outcomeMatch=normalizedCombined.match(/outcome:\s*([^|]+?)(?=\s*\|\s*objective:|$)/i);
  if(objectiveMatch&&objectiveMatch[1]) objective=clipText(objectiveMatch[1],180);
  if(outcomeMatch&&outcomeMatch[1]) outcome=clipText(outcomeMatch[1],140);
  if(!objective){
    const splitOnOutcome=normalizedCombined.split(/\|\s*outcome:/i)[0];
    objective=clipText(splitOnOutcome.replace(/^objective:/i,''),180);
  }
  if(!outcome){
    const splitOnObjective=normalizedCombined.split(/\|\s*objective:/i);
    const tail=splitOnObjective.length>1?splitOnObjective[splitOnObjective.length-1]:'';
    outcome=clipText(tail.replace(/^outcome:/i,''),140);
  }
  if(!objective) objective='достичь ключевого результата этапа';
  if(!outcome) outcome=clipText(outcomeText||extractOutcomeFromObjective(objective),140);
  return {objective,outcome};
}
function dedupeTextSegments(value,max=180){
  const raw=String(value||'').replace(/\s+/g,' ').trim();
  if(!raw) return '';
  const parts=raw
    .split('|')
    .map((part)=>part.replace(/^(objective|outcome)\s*:/i,'').trim())
    .filter(Boolean);
  const unique=[];
  parts.forEach((part)=>{
    const normalized=part.toLowerCase();
    if(!unique.some((candidate)=>candidate.toLowerCase()===normalized)) unique.push(part);
  });
  const joined=unique.length?unique.join(' | '):raw;
  return clipText(joined,max);
}
function splitUniqueSegments(value,maxLen=120){
  const cleaned=String(value||'')
    .replace(/\s+/g,' ')
    .replace(/\s*\|\s*/g,'|')
    .trim();
  if(!cleaned) return [];
  const parts=cleaned
    .split('|')
    .map((part)=>part.replace(/^(objective|outcome)\s*:/i,'').trim())
    .filter(Boolean);
  const unique=[];
  parts.forEach((part)=>{
    const normalized=part.toLowerCase();
    if(!unique.some((item)=>item.toLowerCase()===normalized)){
      unique.push(clipText(part,maxLen));
    }
  });
  return unique;
}
function normalizeStageForEnrichment(stageLike={},fallbackIndex=0){
  const rawTitle=clipText(stageLike?.title||`Stage ${fallbackIndex+1}`,80)||`Stage ${fallbackIndex+1}`;
  const objectiveSource=dedupeTextSegments(stageLike?.objective||'',220);
  const outcomeSource=dedupeTextSegments(stageLike?.outcome||'',180);
  const objectiveSegments=splitUniqueSegments(objectiveSource,160);
  const outcomeSegments=splitUniqueSegments(outcomeSource,140);

  // Prefer a single crisp objective segment; avoid carrying concatenated objective|outcome blobs.
  let objective=clipText(objectiveSegments[0]||'',180);
  if(!objective){
    const parsed=parseObjectiveOutcome(objectiveSource,outcomeSource);
    objective=clipText(parsed.objective||'',180);
  }
  objective=objective.replace(/\|\s*.*$/,'').replace(/^objective\s*:/i,'').trim();

  // Outcome: first outcome segment different from objective, else fallback to secondary objective segment.
  let outcome='';
  for(const segment of outcomeSegments){
    if(segment.toLowerCase()!==objective.toLowerCase()){
      outcome=segment;
      break;
    }
  }
  if(!outcome&&objectiveSegments.length>1){
    outcome=objectiveSegments.find((segment)=>segment.toLowerCase()!==objective.toLowerCase())||'';
  }
  if(!outcome){
    const parsed=parseObjectiveOutcome(objectiveSource,outcomeSource);
    outcome=clipText(parsed.outcome||'',140);
  }
  if(outcome&&/[|]/.test(outcome)){
    outcome=splitUniqueSegments(outcome,140)[0]||outcome;
  }
  if(!outcome) outcome=clipText(extractOutcomeFromObjective(objective),140);
  if(!objective) objective='достичь измеримого прогресса по текущему этапу';
  if(outcome.toLowerCase()===objective.toLowerCase()){
    outcome=clipText(extractOutcomeFromObjective(objective),140);
  }
  outcome=outcome.replace(/\|\s*.*$/,'').replace(/^outcome\s*:/i,'').trim();
  return {
    title:clipText(rawTitle,80),
    objective:clipText(objective,180),
    outcome:clipText(outcome,140)
  };
}
function sanitizeStageForEnrichment(stageLike={},fallbackIndex=0){
  return normalizeStageForEnrichment(stageLike,fallbackIndex);
}
function fallbackEnrichmentPayload(){
  return {
    why_this_stage_matters:'Этот этап нужен, чтобы создать измеримый прогресс по текущей цели и подтвердить реальный спрос.',
    completion_criteria:[
      'Все ключевые задачи этапа завершены',
      'Есть измеримый результат по milestone'
    ],
    execution_focus:'Сконцентрироваться только на действиях, которые двигают текущий этап.'
  };
}
function normalizeEnrichmentPayload(raw={},fallback={}){
  const base={...fallbackEnrichmentPayload(),...(fallback||{})};
  const why=clipText(raw?.why_this_stage_matters||raw?.whyThisStageMatters||base.why_this_stage_matters,220);
  const criteria=normalizeCompletionCriteria(raw?.completion_criteria||raw?.completionCriteria||base.completion_criteria,why);
  const focus=clipText(raw?.execution_focus||raw?.executionFocus||base.execution_focus,160);
  return {
    why_this_stage_matters:why||base.why_this_stage_matters,
    completion_criteria:criteria.length?criteria:base.completion_criteria,
    execution_focus:focus||base.execution_focus
  };
}
function tryExtractJsonStringField(raw,key,maxLen=220){
  const text=String(raw||'');
  if(!text) return '';
  const strict=new RegExp(`"${key}"\\s*:\\s*"([\\s\\S]*?)"(?=\\s*,\\s*"|\\s*\\}|$)`,'i');
  const loose=new RegExp(`"${key}"\\s*:\\s*"([\\s\\S]{1,500})`,'i');
  const strictMatch=text.match(strict);
  const looseMatch=text.match(loose);
  const candidate=(strictMatch&&strictMatch[1])||(looseMatch&&looseMatch[1])||'';
  if(!candidate) return '';
  const cleaned=candidate
    .replace(/\\n/g,' ')
    .replace(/\\"/g,'"')
    .replace(/"\s*,?\s*$/,'')
    .replace(/}\s*$/,'')
    .replace(/\s+/g,' ')
    .trim();
  return clipText(cleaned,maxLen);
}
function tryExtractJsonArrayField(raw,key,maxItems=4,maxLen=100){
  const text=String(raw||'');
  if(!text) return [];
  const match=text.match(new RegExp(`"${key}"\\s*:\\s*\\[([\\s\\S]*?)\\]`,'i'));
  if(!match||!match[1]) return [];
  const chunk=match[1];
  const items=[];
  const regex=/"([^"\\]*(?:\\.[^"\\]*)*)"/g;
  let current;
  while((current=regex.exec(chunk))!==null){
    const value=clipText(String(current[1]||'').replace(/\\n/g,' ').replace(/\\"/g,'"').trim(),maxLen);
    if(value) items.push(value);
    if(items.length>=maxItems) break;
  }
  return items;
}
function salvageEnrichmentFromRaw(raw){
  const why=tryExtractJsonStringField(raw,'why_this_stage_matters',220);
  const focus=tryExtractJsonStringField(raw,'execution_focus',160);
  const criteria=tryExtractJsonArrayField(raw,'completion_criteria',4,100);
  const hasAny=Boolean(why||focus||criteria.length);
  if(!hasAny) return null;
  return {
    why_this_stage_matters:why,
    completion_criteria:criteria,
    execution_focus:focus
  };
}
function hasEnrichmentSignal(payload){
  if(!payload||typeof payload!=='object'||Array.isArray(payload)) return false;
  const why=clipText(payload?.why_this_stage_matters||payload?.whyThisStageMatters||'',220);
  const focus=clipText(payload?.execution_focus||payload?.executionFocus||'',160);
  const criteria=normalizeCompletionCriteria(payload?.completion_criteria||payload?.completionCriteria||[],why);
  return Boolean(why||focus||criteria.length);
}
function normalizeEnrichmentResponsePayload(response){
  let parsed=null;
  let salvaged=null;
  try{
    parsed=parseJSON(response.text,{allowPartial:response.finishReason==='MAX_TOKENS'});
  }catch(_parseError){
    salvaged=salvageEnrichmentFromRaw(response.text);
  }
  if(!salvaged&&response.finishReason==='MAX_TOKENS'){
    salvaged=salvageEnrichmentFromRaw(response.text);
  }
  const parsedObject=(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))?parsed:{};
  const salvagedObject=(salvaged&&typeof salvaged==='object'&&!Array.isArray(salvaged))?salvaged:{};
  const mergedPayload={...parsedObject,...salvagedObject};
  const signalPresent=hasEnrichmentSignal(mergedPayload);
  return {
    normalized:normalizeEnrichmentPayload(signalPresent?mergedPayload:{},fallbackEnrichmentPayload()),
    usedFallback:!signalPresent||response.finishReason==='MAX_TOKENS',
    usedSalvage:hasEnrichmentSignal(salvagedObject),
    fallbackReason:response.finishReason==='MAX_TOKENS'?'finish_reason_max_tokens':'fallback_payload_used'
  };
}
function logEnrichmentFallbackContinuation(meta){
  logRoadmapPipelineEvent('active_stage_enrichment_fallback_used',{
    requestId:meta.requestId||'',
    stageCount:getExecutionStages().length,
    activeStageId:meta.activeStageId||'',
    activeStageIndex:meta.activeStageIndex,
    promptChars:meta.promptChars||0,
    requestedMaxTokens:meta.requestedMaxTokens||0,
    finishReason:meta.finishReason||'',
    errorMessage:meta.errorMessage||undefined
  });
  logRoadmapPipelineEvent('active_stage_enrichment_failed_but_pipeline_continues',{
    requestId:meta.requestId||'',
    stageCount:getExecutionStages().length,
    activeStageId:meta.activeStageId||'',
    activeStageIndex:meta.activeStageIndex,
    promptChars:meta.promptChars||0,
    requestedMaxTokens:meta.requestedMaxTokens||0,
    finishReason:meta.finishReason||'',
    errorMessage:meta.errorMessage||undefined
  });
}
function formatObjectiveOutcome(objective='',outcome=''){
  return `objective: ${clipText(objective,180)} | outcome: ${clipText(outcome,140)}`;
}
function splitObjectiveOutcomeText(value=''){
  const parsed=parseObjectiveOutcome(String(value||''),'');
  return parsed;
}
function getStageObjectiveText(stageLike){
  const direct=clipText(stageLike?.objective||'',180);
  if(direct&&!/objective:|outcome:/i.test(direct)) return direct;
  const parsed=splitObjectiveOutcomeText(stageLike?.objective||'');
  return clipText(parsed.objective||direct,180);
}
function getStageOutcomeText(stageLike){
  const direct=clipText(stageLike?.outcome||'',140);
  if(direct) return direct;
  const parsed=splitObjectiveOutcomeText(stageLike?.objective||'');
  return clipText(parsed.outcome||'',140);
}
function getStageReasoningText(stageLike){
  return clipText(stageLike?.whyThisStageMatters||stageLike?.reasoning||stageLike?.why||'',220);
}
function getRoadmapWindowDays(deadline){
  if(!deadline) return 10;
  const end=new Date(deadline);
  const now=new Date();
  now.setHours(0,0,0,0);
  end.setHours(0,0,0,0);
  const raw=Math.ceil((end.getTime()-now.getTime())/(1000*60*60*24));
  if(!Number.isFinite(raw)) return 10;
  return Math.max(7,Math.min(14,raw));
}
function phaseDayLabels(totalDays,count){
  const labels=[];
  const safeCount=Math.max(1,count);
  for(let i=0;i<safeCount;i++){
    const idx=safeCount===1?1:1+Math.round(((totalDays-1)*i)/(safeCount-1));
    labels.push(`D${idx}`);
  }
  return labels;
}
function isWeakExecutionTask(task){
  const text=String(task||'').trim().toLowerCase();
  if(!text||text.length<18) return true;
  const weakChunks=['сформулировать','определить','проанализировать','изучить','подготовить стратегию','подумать','улучшить'];
  if(weakChunks.some(chunk=>text.includes(chunk))&&!/\d/.test(text)) return true;
  const actionChunks=['запустить','собрать','провести','выпустить','получить','сделать','включить','проверить','продать','опубликовать'];
  const hasAction=actionChunks.some(chunk=>text.includes(chunk));
  const hasOutcome=/\d/.test(text)||text.includes('плат')||text.includes('регистрац')||text.includes('интервью')||text.includes('пользоват');
  return !(hasAction&&hasOutcome);
}
function extractTaskTexts(phase){
  const out=[];
  if(Array.isArray(phase?.days)){
    phase.days.forEach((entry)=>{
      if(typeof entry==='string') out.push(entry);
      else if(entry&&typeof entry==='object') out.push(String(entry.task||entry.text||''));
    });
  }
  if(Array.isArray(phase?.tasks)){
    phase.tasks.forEach((entry)=>{
      if(typeof entry==='string') out.push(entry);
      else if(entry&&typeof entry==='object') out.push(String(entry.task||entry.text||''));
    });
  }
  return out.map((item)=>clipText(item,80)).filter(Boolean);
}
function tasksToDays(tasks,totalDays,duration='2-3ч'){
  const labels=phaseDayLabels(totalDays,tasks.length);
  return tasks.map((task,idx)=>({
    day:labels[idx]||`D${idx+1}`,
    task:clipText(task,80),
    duration
  }));
}
function fallbackRoadmapForMvp(){
  const project=clipText((S?.user?.project||S?.user?.idea||''),70)||'проект';
  const goal=clipText((S?.user?.goal||''),70)||'ключевой цели';
  const horizon=getRoadmapWindowDays(S?.user?.deadline);
  const activeTasks=[
    `запустить лендинг ${project} и собрать 20 регистраций`,
    'провести 5 интервью и зафиксировать 3 ключевые боли',
    'выпустить рабочую версию и закрыть 10 критичных сценариев',
    'получить 1 платящего пользователя или LOI'
  ];
  return [
    {
      week:1,
      title:buildFallbackStageTitle(0,goal),
      objective:goal,
      outcome:`MVP + 20 лидов за ${horizon} дней`,
      reasoning:'Создаёт стартовую базу исполнения: проверка спроса и первый измеримый сигнал.',
      days:tasksToDays(activeTasks,horizon,'2-4ч')
    },
    {
      week:2,
      title:buildFallbackStageTitle(1,goal),
      objective:'запуск беты',
      outcome:'15 ответов фидбэка и 3 улучшения',
      reasoning:'Переводит гипотезы из планирования в реальные пользовательские реакции.',
      days:[{day:'W2',task:'открыть бета-доступ и собрать 15 ответов от пользователей',duration:'focus'}]
    },
    {
      week:3,
      title:buildFallbackStageTitle(2,goal),
      objective:'масштабировать приток',
      outcome:'5 платящих пользователей',
      reasoning:'Показывает, что продукт можно конвертировать в устойчивый денежный сигнал.',
      days:[{day:'W3',task:'включить 1 канал привлечения и довести до 5 оплат',duration:'focus'}]
    }
  ];
}
function normalizeBetaRoadmap(raw){
  const source=Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.stages)
      ? raw.stages
      : Array.isArray(raw?.phases)
        ? raw.phases
        : (raw&&typeof raw==='object'?[raw]:[]);
  const base=fallbackRoadmapForMvp();
  const activeWindow=getRoadmapWindowDays(S?.user?.deadline);
  const phaseFallbackTasks=base[0].days.map((d)=>d.task);
  const targetCount=Math.max(
    ROADMAP_MIN_STAGES,
    Math.min(ROADMAP_MAX_STAGES,source.length||base.length)
  );
  const fallbackFlags=[];
  const normalized=Array.from({length:targetCount},(_,index)=>{
    const candidate=source[index]||{};
    const rawTitle=clipText(candidate?.title||'',80);
    const fallbackBase=base[index]||base[base.length-1]||{};
    const title=rawTitle||clipText(fallbackBase?.title||buildFallbackStageTitle(index,S?.user?.goal||''),80)||`Stage ${index+1}`;
    const objectiveRaw=clipText(candidate?.objective||'',180);
    const outcomeRaw=clipText(candidate?.outcome||'',140);
    const reasoningRaw=clipText(candidate?.reasoning||'',220);
    const parsedObjective=parseObjectiveOutcome(objectiveRaw||fallbackBase.objective||'',outcomeRaw||fallbackBase.outcome||'');
    const objective=clipText(parsedObjective.objective||'достичь измеримого прогресса этапа',180);
    const outcome=clipText(parsedObjective.outcome||extractOutcomeFromObjective(objective),140);
    const reasoning=reasoningRaw||clipText(fallbackBase?.reasoning||`Этот этап нужен, чтобы подготовить входные условия для следующего шага после "${title}".`,220);
    const criteriaFromResponse=(Array.isArray(candidate?.completion_criteria)?candidate.completion_criteria:[])
      .map((item)=>clipText(item,80))
      .filter(Boolean);
    const extracted=extractTaskTexts(candidate);
    const usedFallbackTitle=!rawTitle;
    const usedFallbackObjective=!objectiveRaw;
    fallbackFlags.push({index,usedFallbackTitle,usedFallbackObjective});
    if(index===0){
      let strong=[...criteriaFromResponse,...extracted].filter((task)=>!isWeakExecutionTask(task)).slice(0,4);
      if(strong.length<3){
        phaseFallbackTasks.forEach((task)=>{
          if(strong.length<4&&!strong.includes(task)) strong.push(task);
        });
      }
      strong=strong.slice(0,4);
      const completionCriteria=strong.slice(0,4);
      return {
        week:index+1,
        title,
        objective,
        outcome,
        reasoning,
        completion_criteria:completionCriteria,
        target_date:toIsoDateOnly(candidate?.target_date||''),
        days:tasksToDays(completionCriteria,activeWindow,'2-4ч')
      };
    }
    const firstHighLevel=clipText(criteriaFromResponse[0]||extracted[0]||'',80);
    const fallbackTask=fallbackBase.days?.[0]?.task||'выполнить ключевой шаг фазы';
    const task=(!firstHighLevel||isWeakExecutionTask(firstHighLevel))?fallbackTask:firstHighLevel;
    return {
      week:index+1,
      title,
      objective,
      outcome,
      reasoning,
      completion_criteria:[clipText(task,90)],
      target_date:toIsoDateOnly(candidate?.target_date||''),
      days:[{
        day:`W${index+1}`,
        task:clipText(task,80),
        duration:'focus'
      }]
    };
  });
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'normalizeBetaRoadmap',
    action:'roadmap_normalized',
    sourceStageCount:source.length,
    fallbackUsage:fallbackFlags,
    stages:summarizeRoadmapStagesForLog(normalized)
  });
  return normalized;
}
function normalizeTaskPriority(value){
  const raw=String(value||'').trim().toLowerCase();
  if(raw==='high'||raw==='med'||raw==='low') return raw;
  if(raw==='medium') return 'med';
  return 'med';
}
function normalizeTaskDeadlineValue(value){
  const raw=String(value||'').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw)?raw:'';
}
function getTaskTitle(task){
  return clipText(task?.title||task?.text||'Задача',80)||'Задача';
}
function getTaskSupportLine(task){
  return clipText(task?.deliverable||task?.description||task?.doneDefinition||task?.whyItMatters||'',140);
}
function isWeakFounderTaskTitle(title){
  const text=String(title||'').trim().toLowerCase();
  if(!text||text.length<20) return true;
  const weak=['сформулировать цель','собрать ядро задачи','снять фидбек','уточнить стратегию','подумать','проанализировать','изучить'];
  if(weak.some((item)=>text.includes(item))) return true;
  const action=['запустить','провести','созвониться','выпустить','собрать','получить','проверить','подключить','опубликовать'];
  const hasAction=action.some((item)=>text.includes(item));
  const hasOutcome=/\d/.test(text)||text.includes('плат')||text.includes('регистрац')||text.includes('интервью')||text.includes('демо')||text.includes('ответ');
  return !(hasAction&&hasOutcome);
}
function spreadTaskDeadlines(deadline,count){
  const total=Math.max(1,count||1);
  const now=new Date();
  now.setHours(0,0,0,0);
  const windowDays=getRoadmapWindowDays(deadline);
  const end=new Date(now.getTime()+windowDays*24*60*60*1000);
  const hardDeadline=deadline?new Date(`${deadline}T00:00:00`):null;
  const targetEnd=hardDeadline&&Number.isFinite(hardDeadline.getTime())&&hardDeadline>now&&hardDeadline<end?hardDeadline:end;
  const diffDays=Math.max(1,Math.round((targetEnd.getTime()-now.getTime())/(24*60*60*1000)));
  const out=[];
  for(let i=0;i<total;i++){
    const offset=Math.max(1,Math.round(((i+1)*diffDays)/total));
    const date=new Date(now.getTime()+offset*24*60*60*1000);
    out.push(toDateInputValue(date));
  }
  return out;
}
function fallbackFounderTaskBlueprints({goal='',stageObjective='',deadline='',stageLabel='Stage 1'}={}){
  const safeGoal=clipText(goal,80)||'запуск продукта';
  const safeObjective=clipText(stageObjective,120)||'проверить спрос и запустить MVP';
  const dates=spreadTaskDeadlines(deadline,5);
  return [
    {
      title:'Созвониться с 5 ICP-пользователями и подтвердить ключевую боль',
      description:`Провести 5 интервью с ICP и проверить, насколько ${safeObjective} решает боль.`,
      whyItMatters:'Без подтверждённой боли рост будет случайным и дорогим.',
      deliverable:'5 интервью, заметки и таблица повторяющихся паттернов.',
      doneDefinition:'Есть 5 интервью и 3 повторяющиеся боли с цитатами.',
      priority:'high',
      deadline:dates[0]||'',
      linkedStage:1,
      stageObjective:safeObjective
    },
    {
      title:'Запустить лендинг с CTA и собрать 20 регистраций',
      description:`Собрать лендинг под "${safeGoal}" с понятным оффером и формой регистрации.`,
      whyItMatters:'Проверяет реальный интерес до масштабной разработки.',
      deliverable:'Лендинг в проде и минимум 20 целевых регистраций.',
      doneDefinition:'Лендинг опубликован, в аналитике минимум 20 регистраций.',
      priority:'high',
      deadline:dates[1]||'',
      linkedStage:1,
      stageObjective:safeObjective
    },
    {
      title:'Выпустить clickable demo ключевого сценария',
      description:`Собрать кликабельный демо-поток для фазы "${stageLabel}" и показать его 5 людям.`,
      whyItMatters:'Демо ускоряет обратную связь и снижает риск неверной реализации.',
      deliverable:'Clickable demo + список блокеров от пользователей.',
      doneDefinition:'5 просмотров демо и список замечаний с приоритетами.',
      priority:'med',
      deadline:dates[2]||'',
      linkedStage:1,
      stageObjective:safeObjective
    },
    {
      title:'Провести 10 ответов на форму и выделить 3 главных паттерна',
      description:'Собрать ответы через форму/чат, выделить ключевые возражения и триггеры покупки.',
      whyItMatters:'Уточняет positioning и снижает шум в следующих итерациях.',
      deliverable:'10 ответов + summary с 3 ключевыми паттернами.',
      doneDefinition:'Подготовлен отчёт с 3 паттернами и следующими действиями.',
      priority:'med',
      deadline:dates[3]||'',
      linkedStage:1,
      stageObjective:safeObjective
    },
    {
      title:'Закрыть 1 платящего пользователя или LOI',
      description:'Довести один квалифицированный лид до оплаты или подписанного LOI.',
      whyItMatters:'Показывает монетизацию и валидирует ценность продукта.',
      deliverable:'Оплата или подписанный LOI с подтверждённым use-case.',
      doneDefinition:'Есть подтверждённая оплата или LOI от целевого клиента.',
      priority:'high',
      deadline:dates[4]||'',
      linkedStage:1,
      stageObjective:safeObjective
    }
  ];
}
function normalizeFounderTask(raw,options={}){
  const stageObjective=clipText(options.stageObjective||raw?.stageObjective||'',150);
  const stageIndex=Number.isFinite(Number(raw?.linked_stage??raw?.linkedStage))?Number(raw?.linked_stage??raw?.linkedStage):Number(options.stageIndex||0);
  const stageLabel=clipText(options.stageTitle||'',40)||'Stage 1';
  const title=getTaskTitle(raw);
  const normalized={
    id:Number(raw?.id)||0,
    title,
    text:title,
    description:clipText(raw?.description||raw?.desc||'',220),
    whyItMatters:clipText(raw?.why_it_matters||raw?.whyItMatters||'',200),
    deliverable:clipText(raw?.deliverable||'',200),
    doneDefinition:clipText(raw?.done_definition||raw?.doneDefinition||'',200),
    prio:normalizeTaskPriority(raw?.priority??raw?.prio),
    deadline:normalizeTaskDeadlineValue(raw?.deadline),
    linkedStage:Math.max(1,Math.min(ROADMAP_MAX_STAGES,stageIndex+1)),
    stageObjective:stageObjective||clipText(raw?.objective||'',150),
    done:Boolean(raw?.done),
    created:String(raw?.created||new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'})).trim()
  };
  if(!normalized.description){
    normalized.description=`Выполнить задачу "${normalized.title}" в рамках текущего этапа ${stageLabel}.`;
  }
  if(!normalized.whyItMatters){
    normalized.whyItMatters='Двигает продукт к проверяемому результату в текущем спринте.';
  }
  if(!normalized.deliverable){
    normalized.deliverable='Подтверждаемый артефакт: ссылка, список выводов или метрика.';
  }
  if(!normalized.doneDefinition){
    normalized.doneDefinition='Есть конкретный результат и короткая фиксация выводов.';
  }
  return normalized;
}
function normalizeFounderTasks(raw,options={}){
  const source=Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.tasks)
      ? raw.tasks
      : [];
  const stageObjective=clipText(options.stageObjective||'',150);
  const stageTitle=clipText(options.stageTitle||'',40)||'Stage 1';
  const fallback=fallbackFounderTaskBlueprints({
    goal:S?.user?.goal||'',
    stageObjective,
    deadline:options.deadline||S?.user?.deadline||'',
    stageLabel:stageTitle
  });
  const seen=new Set();
  const out=[];
  source.forEach((item)=>{
    if(out.length>=5) return;
    const normalized=normalizeFounderTask(item,{...options,stageObjective,stageTitle});
    const key=normalized.title.toLowerCase();
    if(seen.has(key)) return;
    const qualityOk=!isWeakFounderTaskTitle(normalized.title)&&normalized.deliverable.length>=20;
    const finalTask=qualityOk?normalized:normalizeFounderTask(fallback[out.length%fallback.length],{...options,stageObjective,stageTitle});
    seen.add(finalTask.title.toLowerCase());
    out.push(finalTask);
  });
  let fallbackIndex=0;
  while(out.length<3){
    const candidate=normalizeFounderTask(fallback[fallbackIndex%fallback.length],{...options,stageObjective,stageTitle});
    fallbackIndex+=1;
    const key=candidate.title.toLowerCase();
    if(seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  return out.slice(0,5);
}
function fallbackTasksForMvp(options={}){
  return normalizeFounderTasks([],options);
}
function normalizeBetaTasks(raw,options={}){
  return normalizeFounderTasks(raw,options);
}
function normalizeTaskCollection(raw,options={}){
  const source=Array.isArray(raw)?raw:[];
  const normalizedStageIndex=Number.isFinite(Number(options.stageIndex))
    ? Math.max(0,Math.min(ROADMAP_MAX_STAGES-1,Number(options.stageIndex)))
    : 0;
  const baseId=Date.now();
  const usedIds=new Set();
  return source.map((item,index)=>{
    const rawId=Number(item?.id);
    let id=Number.isFinite(rawId)&&rawId>0?rawId:(baseId+index);
    while(usedIds.has(id)) id+=1;
    usedIds.add(id);
    const rawLinkedStage=Number(item?.linkedStage??item?.linked_stage);
    const stageIndex=Number.isFinite(rawLinkedStage)
      ? Math.max(0,Math.min(ROADMAP_MAX_STAGES-1,rawLinkedStage-1))
      : normalizedStageIndex;
    const normalized=normalizeFounderTask(
      {
        ...item,
        id,
        done:Boolean(item?.done)
      },
      {
        ...options,
        stageIndex
      }
    );
    const created=String(
      item?.created||
      normalized.created||
      new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'})
    ).trim();
    return {
      ...normalized,
      id,
      text:getTaskTitle(normalized),
      done:Boolean(item?.done),
      created,
      linkedStage:Math.max(1,Math.min(ROADMAP_MAX_STAGES,Number(normalized.linkedStage)||stageIndex+1))
    };
  });
}
let executionTaskSeq=Date.now();
let stageAdvanceInFlight=false;
const stageTaskGenerationInFlight=new Map();
function nextExecutionTaskId(){
  executionTaskSeq+=1;
  return executionTaskSeq;
}
function nowIso(){
  return new Date().toISOString();
}
function toIsoDateOnly(value){
  if(!value) return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return String(value);
  const date=new Date(value);
  if(Number.isNaN(date.getTime())) return '';
  return toDateInputValue(date);
}
function extractOutcomeFromObjective(objective=''){
  const text=String(objective||'').trim();
  const parts=text.split('|').map((part)=>part.trim());
  const outcomePart=parts.find((part)=>part.toLowerCase().startsWith('outcome:'));
  if(outcomePart) return clipText(outcomePart.replace(/outcome:/i,''),140);
  return clipText(text,140);
}
function normalizeCompletionCriteria(rawDays,objective=''){
  const base=(Array.isArray(rawDays)?rawDays:[])
    .map((entry)=>clipText(entry?.task||entry?.text||entry||'',90))
    .filter(Boolean);
  if(base.length) return base.slice(0,4);
  const fallback=clipText(objective,90)||'Выполнить ключевой outcome этапа.';
  return [fallback];
}
function resolvePhaseCompletionCriteria(phase){
  const direct=(Array.isArray(phase?.completion_criteria)?phase.completion_criteria:[])
    .map((entry)=>clipText(entry,90))
    .filter(Boolean);
  if(direct.length) return direct.slice(0,4);
  return normalizeCompletionCriteria(phase?.days||[],phase?.objective||'');
}
function normalizeExecutionTask(task,stage){
  const safe=normalizeFounderTask(task,{
    stageIndex:Math.max(0,(stage?.index||1)-1),
    stageTitle:stage?.title||'Stage 1',
    stageObjective:stage?.objective||'',
    deadline:S.user.deadline||''
  });
  const isDone=Boolean(task?.done)||String(task?.status||'')==='done';
  const status=isDone?'done':String(task?.status||'active');
  return {
    id:Number(task?.id)||nextExecutionTaskId(),
    roadmapId:String(task?.roadmapId||S.execution?.id||''),
    linkedStageId:String(task?.linkedStageId||stage?.id||''),
    linkedStageIndex:Number.isFinite(Number(task?.linkedStageIndex))?Number(task.linkedStageIndex):Math.max(0,(stage?.index||1)-1),
    title:getTaskTitle(safe),
    text:getTaskTitle(safe),
    description:clipText(task?.description||safe.description||'',220),
    whyItMatters:clipText(task?.whyItMatters||task?.why_it_matters||safe.whyItMatters||'',200),
    why_it_matters:clipText(task?.whyItMatters||task?.why_it_matters||safe.whyItMatters||'',200),
    deliverable:clipText(task?.deliverable||safe.deliverable||'',200),
    doneDefinition:clipText(task?.doneDefinition||task?.done_definition||safe.doneDefinition||'',200),
    done_definition:clipText(task?.doneDefinition||task?.done_definition||safe.doneDefinition||'',200),
    priority:normalizeTaskPriority(task?.priority??task?.prio??safe.prio),
    prio:normalizeTaskPriority(task?.priority??task?.prio??safe.prio),
    deadline:normalizeTaskDeadlineValue(task?.deadline||safe.deadline||''),
    status:status==='archived'?'archived':(status==='done'?'done':'active'),
    done:isDone,
    createdAt:String(task?.createdAt||nowIso()),
    completedAt:isDone?String(task?.completedAt||nowIso()):'',
    created:String(task?.created||new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'})).trim(),
    stageTitle:stage?.title||'',
    stageObjective:stage?.objective||'',
    linked_stage:Math.max(1,(Number(task?.linkedStageIndex)||Math.max(0,(stage?.index||1)-1))+1)
  };
}
function isExecutionStateObject(value){
  return Boolean(
    value&&
    typeof value==='object'&&
    Array.isArray(value.stages)&&
    value.stages.length>0&&
    value.tasksById&&
    typeof value.tasksById==='object'
  );
}
function createExecutionRoadmapFromPhases(phases){
  const list=Array.isArray(phases)?phases:[];
  const createdAt=nowIso();
  const roadmapId=createClientRequestId('roadmapdoc');
  const total=Math.max(1,list.length);
  const baseDate=new Date();
  baseDate.setHours(0,0,0,0);
  const deadline=S.user.deadline?new Date(`${S.user.deadline}T00:00:00`):null;
  const hasDeadline=Boolean(deadline)&&!Number.isNaN(deadline.getTime())&&deadline>baseDate;
  const stages=list.map((phase,index)=>{
    const stageId=createClientRequestId(`stage${index+1}`);
    const parsed=splitObjectiveOutcomeText(phase?.objective||'');
    const objectiveClean=clipText(parsed.objective||phase?.objective||'',180)||`этап ${index+1}: измеримый прогресс`;
    const outcomeClean=clipText(phase?.outcome||parsed.outcome||extractOutcomeFromObjective(objectiveClean),140);
    const reasoningClean=clipText(phase?.whyThisStageMatters||phase?.reasoning||'',220);
    const aiTargetDate=toIsoDateOnly(phase?.target_date||'');
    const targetDate=aiTargetDate||(
      hasDeadline
      ? toDateInputValue(new Date(baseDate.getTime()+(((deadline.getTime()-baseDate.getTime())*(index+1))/total)))
      : toDateInputValue(new Date(baseDate.getTime()+((index+1)*7*24*60*60*1000)))
    );
    return {
      id:stageId,
      index:index+1,
      title:clipText(phase?.title||buildFallbackStageTitle(index,S?.user?.goal||''),80),
      objective:objectiveClean,
      outcome:outcomeClean,
      whyThisStageMatters:reasoningClean,
      reasoning:reasoningClean,
      startDate:index===0?toDateInputValue(baseDate):'',
      targetDate,
      status:index===0?'active':'locked',
      completionCriteria:Array.isArray(phase?.completion_criteria)
        ? phase.completion_criteria.map((item)=>clipText(item,90)).filter(Boolean).slice(0,4)
        : resolvePhaseCompletionCriteria(phase),
      executionFocus:clipText(phase?.executionFocus||phase?.execution_focus||'',160),
      tasksGenerated:false,
      tasksGeneratedAt:'',
      detailsGenerated:false,
      detailsGeneratedAt:'',
      progress:0,
      taskIds:[]
    };
  });
  return {
    schemaVersion:EXECUTION_SCHEMA_VERSION,
    id:roadmapId,
    createdAt,
    updatedAt:createdAt,
    currentStageIndex:0,
    status:'active',
    stages,
    tasksById:{},
    tasksStatus:'not_generated',
    tasksByStage:{},
    taskGenerationByStage:{},
    taskGenerationErrorsByStage:{}
  };
}
function resolveStageTaskStatus(stageIndex){
  const stage=getExecutionStage(stageIndex);
  if(!stage) return 'not_generated';
  const stageId=String(stage.id||'');
  const mapped=String(S.execution?.taskGenerationByStage?.[stageId]||'').trim();
  if(mapped==='loading'||mapped==='ready'||mapped==='error'||mapped==='not_generated') return mapped;
  const hasTasks=getTasksForStage(stageIndex,{includeArchived:false}).length>0;
  if(hasTasks&&stage.tasksGenerated) return 'ready';
  return 'not_generated';
}
function setStageTaskStatus(stageIndex,status,errorMessage=''){
  const stage=getExecutionStage(stageIndex);
  if(!stage||!isExecutionStateObject(S.execution)) return;
  const stageId=String(stage.id||'');
  if(!S.execution.taskGenerationByStage||typeof S.execution.taskGenerationByStage!=='object') S.execution.taskGenerationByStage={};
  if(!S.execution.taskGenerationErrorsByStage||typeof S.execution.taskGenerationErrorsByStage!=='object') S.execution.taskGenerationErrorsByStage={};
  if(!S.execution.tasksByStage||typeof S.execution.tasksByStage!=='object') S.execution.tasksByStage={};
  const safeStatus=(status==='loading'||status==='ready'||status==='error')?status:'not_generated';
  S.execution.taskGenerationByStage[stageId]=safeStatus;
  S.execution.tasksStatus=safeStatus;
  if(safeStatus==='ready'){
    const taskIds=Array.isArray(stage.taskIds)?[...stage.taskIds]:[];
    S.execution.tasksByStage[stageId]=taskIds;
    delete S.execution.taskGenerationErrorsByStage[stageId];
  }else if(safeStatus==='error'){
    S.execution.taskGenerationErrorsByStage[stageId]=String(errorMessage||'task_generation_failed');
  }else{
    delete S.execution.taskGenerationErrorsByStage[stageId];
    S.execution.tasksByStage[stageId]=Array.isArray(stage.taskIds)?[...stage.taskIds]:[];
  }
  S.execution.updatedAt=nowIso();
}
function getExecutionStages(){
  return Array.isArray(S.execution?.stages)?S.execution.stages:[];
}
function getExecutionStage(stageIndex){
  const stages=getExecutionStages();
  if(!stages.length) return null;
  const idx=Math.max(0,Math.min(stages.length-1,Number(stageIndex)||0));
  return stages[idx]||null;
}
function getExecutionActiveStageIndex(){
  const stages=getExecutionStages();
  if(!stages.length) return S.roadmap&&S.roadmap.length?Math.min(S.progress.milestones,S.roadmap.length-1):0;
  const stored=Number(S.execution?.currentStageIndex);
  if(Number.isFinite(stored)&&stored>=0&&stored<stages.length) return stored;
  const activeIdx=stages.findIndex((stage)=>stage.status==='active');
  if(activeIdx>=0) return activeIdx;
  const firstLocked=stages.findIndex((stage)=>stage.status!=='completed');
  if(firstLocked>=0) return firstLocked;
  return stages.length-1;
}
function getExecutionTaskById(id){
  const key=String(id);
  if(S.execution?.tasksById&&Object.prototype.hasOwnProperty.call(S.execution.tasksById,key)){
    return S.execution.tasksById[key];
  }
  return null;
}
function getAllExecutionTasks(){
  if(!S.execution?.tasksById||typeof S.execution.tasksById!=='object') return [];
  return Object.values(S.execution.tasksById);
}
function resolveUniqueExecutionTaskId(preferredId){
  let id=Number(preferredId)||nextExecutionTaskId();
  while(getExecutionTaskById(id)){
    id=nextExecutionTaskId();
  }
  return id;
}
function detachTaskFromOtherStages(taskId,currentStageIndex){
  const id=Number(taskId);
  getExecutionStages().forEach((stage,idx)=>{
    if(idx===currentStageIndex||!Array.isArray(stage.taskIds)) return;
    stage.taskIds=stage.taskIds.filter((existingId)=>Number(existingId)!==id);
  });
}
function logStageTaskSnapshot(action,stageIndex,extra={}){
  const stage=getExecutionStage(stageIndex);
  const stageTasks=stage?getTasksForStage(stageIndex,{includeArchived:false}):[];
  logDebug({
    area:'frontend',
    module:'frontend/script.js',
    function:'execution',
    action,
    stageId:stage?.id||'',
    stageIndex,
    stageStatus:stage?.status||'',
    taskCount:stageTasks.length,
    tasksByIdCount:getAllExecutionTasks().length,
    ...extra
  });
}
function logExecutionFlowEvent(action,stageIndex,extra={}){
  const stages=getExecutionStages();
  const safeStageIndex=Number.isFinite(Number(stageIndex))
    ? Math.max(0,Math.min(Math.max(0,stages.length-1),Number(stageIndex)))
    : getExecutionActiveStageIndex();
  const stage=getExecutionStage(safeStageIndex);
  const stageTasks=stage?getTasksForStage(safeStageIndex,{includeArchived:false}):[];
  const payload={
    area:'frontend',
    module:'frontend/script.js',
    function:'execution_flow',
    action,
    stageCount:stages.length,
    activeStageId:stage?.id||'',
    taskCount:stageTasks.length,
    ...extra
  };
  if(action==='stage_tasks_missing'||action==='recovery_attempt') logWarn(payload);
  else if(action==='fallback_used') logWarn(payload);
  else logInfo(payload);
}
function getTasksForStage(stageIndex,opts={}){
  const stage=getExecutionStage(stageIndex);
  if(!stage) return [];
  const includeArchived=Boolean(opts.includeArchived);
  const out=(Array.isArray(stage.taskIds)?stage.taskIds:[])
    .map((id)=>getExecutionTaskById(id))
    .filter(Boolean)
    .filter((task)=>includeArchived||task.status!=='archived')
    .map((task)=>({
      ...task,
      prio:normalizeTaskPriority(task.prio||task.priority),
      priority:normalizeTaskPriority(task.prio||task.priority),
      done:Boolean(task.done)||task.status==='done',
      linkedStage:(Number(task.linkedStageIndex)||0)+1,
      text:getTaskTitle(task)
    }));
  return out;
}
function areStageTasksCompleted(stageIndex){
  const tasks=getTasksForStage(stageIndex,{includeArchived:false});
  if(!tasks.length) return false;
  return tasks.every((task)=>task.status==='done'||task.done);
}
function refreshExecutionProgress(){
  const stages=getExecutionStages();
  if(!stages.length){
    S.progress.tasksDone=(S.tasks||[]).filter((task)=>task.done).length;
    return;
  }
  stages.forEach((stage,idx)=>{
    const tasks=getTasksForStage(idx,{includeArchived:false});
    if(stage.status==='completed') stage.progress=100;
    else if(!tasks.length) stage.progress=0;
    else stage.progress=Math.round((tasks.filter((task)=>task.status==='done'||task.done).length/tasks.length)*100);
  });
  const completedStages=stages.filter((stage)=>stage.status==='completed').length;
  const allTasks=getAllExecutionTasks().filter((task)=>task.status!=='archived');
  const doneTasks=allTasks.filter((task)=>task.status==='done'||task.done).length;
  S.progress.milestones=completedStages;
  S.progress.tasksDone=doneTasks;
}
function syncActiveTasksFromExecution(){
  const stages=getExecutionStages();
  if(!stages.length) return;
  const activeIndex=getExecutionActiveStageIndex();
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'syncActiveTasksFromExecution',
    action:'tasks_sync_started',
    activeStageIndex:activeIndex,
    stageCount:stages.length
  });
  S.execution.currentStageIndex=activeIndex;
  const activeTasks=getTasksForStage(activeIndex,{includeArchived:false});
  S.tasks=activeTasks.map((task)=>({
    ...task,
    prio:normalizeTaskPriority(task.prio||task.priority),
    priority:normalizeTaskPriority(task.prio||task.priority),
    done:Boolean(task.done)||task.status==='done',
    text:getTaskTitle(task),
    linkedStage:Math.max(1,(Number(task.linkedStageIndex)||0)+1)
  }));
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'syncActiveTasksFromExecution',
    action:'tasks_sync_completed',
    activeStageIndex:activeIndex,
    taskCount:S.tasks.length
  });
}
function normalizeExecutionStatuses(){
  const stages=getExecutionStages();
  if(!stages.length) return;
  let activeIndex=0;
  for(let i=0;i<stages.length;i+=1){
    if(areStageTasksCompleted(i)){
      stages[i].status='completed';
      activeIndex=i+1;
    }else{
      break;
    }
  }
  if(activeIndex>=stages.length){
    S.execution.status='completed';
    S.execution.currentStageIndex=stages.length-1;
    stages.forEach((stage)=>{stage.status='completed';stage.progress=100;});
    return;
  }
  S.execution.status='active';
  S.execution.currentStageIndex=Math.max(0,Math.min(stages.length-1,activeIndex));
  stages.forEach((stage,idx)=>{
    if(idx<activeIndex) stage.status='completed';
    else if(idx===activeIndex) stage.status='active';
    else stage.status='locked';
  });
}
function initializeExecutionFromRoadmap(options={}){
  if(!Array.isArray(S.roadmap)||!S.roadmap.length){
    S.execution=null;
    return false;
  }
  S.execution=createExecutionRoadmapFromPhases(S.roadmap);
  S.execution.currentStageIndex=0;
  S.execution.status='active';
  S.execution.stages.forEach((stage,idx)=>{
    stage.status=idx===0?'active':'locked';
    stage.progress=0;
    stage.taskIds=[];
    stage.tasksGenerated=false;
    stage.tasksGeneratedAt='';
    stage.detailsGenerated=false;
    stage.detailsGeneratedAt='';
    stage.whyThisStageMatters=clipText(stage.whyThisStageMatters||stage.reasoning||'',220);
    stage.executionFocus=clipText(stage.executionFocus||'',160);
    stage.completionCriteria=Array.isArray(stage.completionCriteria)?stage.completionCriteria:[];
    applyMvpStageDetailsDefaults(stage);
    setStageTaskStatus(idx,'not_generated');
  });
  if(options.resetVisibleTasks!==false) S.tasks=[];
  refreshExecutionProgress();
  syncActiveTasksFromExecution();
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'initializeExecutionFromRoadmap',
    action:'execution_initialized',
    stageCount:S.execution.stages.length,
    stages:summarizeRoadmapStagesForLog(S.execution.stages)
  });
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'initializeExecutionFromRoadmap',
    action:'roadmap_initialized',
    stageCount:S.execution.stages.length
  });
  logStageTaskSnapshot('active_stage_set',0);
  return true;
}
function migrateLegacyTasksIntoExecution(legacyTasks){
  const stages=getExecutionStages();
  if(!stages.length||!Array.isArray(legacyTasks)||!legacyTasks.length) return false;
  let changed=false;
  legacyTasks.forEach((rawTask,index)=>{
    const hasExplicitStageLink=Boolean(rawTask?.linkedStageId)||Number.isFinite(Number(rawTask?.linkedStageIndex));
    const linkedStage=hasExplicitStageLink
      ? Math.max(0,Math.min(stages.length-1,(Number(rawTask?.linkedStageIndex)||0)))
      : 0;
    const stage=stages[linkedStage];
    if(!stage) return;
    const normalized=normalizeExecutionTask({
      ...rawTask,
      id:resolveUniqueExecutionTaskId(Number(rawTask?.id)||nextExecutionTaskId()+index),
      status:Boolean(rawTask?.done)?'done':'active',
      done:Boolean(rawTask?.done),
      linkedStageIndex:linkedStage,
      linkedStageId:stage.id,
      roadmapId:S.execution.id
    },stage);
    const key=String(normalized.id);
    S.execution.tasksById[key]=normalized;
    detachTaskFromOtherStages(normalized.id,linkedStage);
    if(!stage.taskIds.includes(normalized.id)) stage.taskIds.push(normalized.id);
    stage.tasksGenerated=true;
    stage.tasksGeneratedAt=stage.tasksGeneratedAt||nowIso();
    changed=true;
  });
  return changed;
}
function ensureExecutionState(options={}){
  if(!Array.isArray(S.roadmap)||!S.roadmap.length){
    S.execution=null;
    return false;
  }
  let changed=false;
  if(!isExecutionStateObject(S.execution)){
    initializeExecutionFromRoadmap();
    changed=true;
  }
  if(!S.execution.tasksById||typeof S.execution.tasksById!=='object'){
    S.execution.tasksById={};
    changed=true;
  }
  if(!S.execution.tasksByStage||typeof S.execution.tasksByStage!=='object'){
    S.execution.tasksByStage={};
    changed=true;
  }
  if(!S.execution.taskGenerationByStage||typeof S.execution.taskGenerationByStage!=='object'){
    S.execution.taskGenerationByStage={};
    changed=true;
  }
  if(!S.execution.taskGenerationErrorsByStage||typeof S.execution.taskGenerationErrorsByStage!=='object'){
    S.execution.taskGenerationErrorsByStage={};
    changed=true;
  }
  if(!String(S.execution.tasksStatus||'')){
    S.execution.tasksStatus='not_generated';
    changed=true;
  }
  const stages=getExecutionStages();
  const globalTaskRefs=new Set();
  stages.forEach((stage,idx)=>{
    if(!stage.id){
      stage.id=createClientRequestId(`stage${idx+1}`);
      changed=true;
    }
    if(!Array.isArray(stage.taskIds)){
      stage.taskIds=[];
      changed=true;
    }
    stage.index=Number(stage.index)||1;
    {
      const rawStatus=String(stage.status||'locked');
      stage.status=rawStatus==='completed'||rawStatus==='active'||rawStatus==='locked'?rawStatus:'locked';
    }
    stage.tasksGenerated=Boolean(stage.tasksGenerated);
    stage.detailsGenerated=Boolean(stage.detailsGenerated);
    stage.detailsGeneratedAt=String(stage.detailsGeneratedAt||'');
    stage.progress=Number(stage.progress)||0;
    stage.whyThisStageMatters=clipText(stage.whyThisStageMatters||stage.reasoning||'',220);
    stage.reasoning=clipText(stage.reasoning||stage.whyThisStageMatters||'',220);
    stage.completionCriteria=normalizeCompletionCriteria(stage.completionCriteria||stage.completion_criteria||[],stage.objective||'');
    stage.executionFocus=clipText(stage.executionFocus||stage.execution_focus||'',160);
    applyMvpStageDetailsDefaults(stage);
    stage.taskIds=stage.taskIds.filter((id)=>{
      const key=String(id);
      const task=S.execution.tasksById[key];
      if(!task) return false;
      if(globalTaskRefs.has(key)){
        changed=true;
        return false;
      }
      globalTaskRefs.add(key);
      task.linkedStageId=stage.id;
      task.linkedStageIndex=stage.index-1;
      task.roadmapId=S.execution.id;
      return true;
    });
    const taskCount=getTasksForStage(idx,{includeArchived:false}).length;
    if(taskCount>0&&stage.tasksGenerated){
      S.execution.taskGenerationByStage[stage.id]='ready';
      S.execution.tasksByStage[stage.id]=Array.isArray(stage.taskIds)?[...stage.taskIds]:[];
    }else if(!S.execution.taskGenerationByStage[stage.id]){
      S.execution.taskGenerationByStage[stage.id]='not_generated';
      S.execution.tasksByStage[stage.id]=Array.isArray(stage.taskIds)?[...stage.taskIds]:[];
    }
  });
  const hasStoredTasks=Object.keys(S.execution.tasksById).length>0;
  const canMigrateLegacy=Array.isArray(S.tasks)&&S.tasks.length>0;
  if((!hasStoredTasks&&canMigrateLegacy)||options.mergeLegacyTasks){
    if(migrateLegacyTasksIntoExecution(S.tasks)) changed=true;
  }
  normalizeExecutionStatuses();
  refreshExecutionProgress();
  syncActiveTasksFromExecution();
  return changed;
}
function hasExecutionStateReady(){
  return isExecutionStateObject(S.execution)&&getExecutionStages().length>0;
}
function setStageTasks(stageIndex,tasks,opts={}){ 
  const stage=getExecutionStage(stageIndex);
  if(!stage||!Array.isArray(tasks)) return [];
  const replace=opts.replace!==false;
  const oldIds=Array.isArray(stage.taskIds)?[...stage.taskIds]:[];
  if(replace){
    oldIds.forEach((id)=>{
      const existing=getExecutionTaskById(id);
      if(existing) existing.status='archived';
    });
    stage.taskIds=[];
  }
  const persisted=tasks.map((task)=>{
    const normalized=normalizeExecutionTask({
      ...task,
      linkedStageId:stage.id,
      linkedStageIndex:stageIndex,
      roadmapId:S.execution?.id||''
    },stage);
    const id=resolveUniqueExecutionTaskId(Number(normalized.id)||nextExecutionTaskId());
    normalized.id=id;
    normalized.linkedStageId=stage.id;
    normalized.linkedStageIndex=stageIndex;
    normalized.roadmapId=S.execution?.id||'';
    normalized.status=normalized.done?'done':'active';
    const key=String(id);
    S.execution.tasksById[key]=normalized;
    detachTaskFromOtherStages(id,stageIndex);
    if(!stage.taskIds.includes(id)) stage.taskIds.push(id);
    return normalized;
  });
  stage.tasksGenerated=true;
  stage.tasksGeneratedAt=nowIso();
  stage.progress=0;
  S.execution.updatedAt=nowIso();
  normalizeExecutionStatuses();
  refreshExecutionProgress();
  syncActiveTasksFromExecution();
  logStageTaskSnapshot('stage_tasks_saved',stageIndex,{savedTaskCount:persisted.length});
  return persisted;
}
async function generateTasksForStage(stageIndex,options={}){
  ensureExecutionState();
  if(!hasExecutionStateReady()){
    logRoadmapPipelineEvent('active_stage_task_generation_skipped_execution_uninitialized',{
      stageCount:getExecutionStages().length,
      activeStageId:'',
      activeStageIndex:stageIndex
    });
    logWarn({
      area:'frontend',
      module:'frontend/script.js',
      function:'generateTasksForStage',
      action:'generate_stage_tasks_skipped_execution_uninitialized',
      stageIndex
    });
    return [];
  }
  const stage=getExecutionStage(stageIndex);
  if(!stage){
    logRoadmapPipelineEvent('active_stage_task_generation_skipped_no_stage',{
      stageCount:getExecutionStages().length,
      activeStageId:'',
      activeStageIndex:stageIndex
    });
    logWarn({
      area:'frontend',
      module:'frontend/script.js',
      function:'generateTasksForStage',
      action:'generate_stage_tasks_skipped_no_active_stage',
      stageIndex
    });
    return [];
  }
  if(!stage.id){
    logRoadmapPipelineEvent('active_stage_task_generation_skipped_missing_stage_id',{
      stageCount:getExecutionStages().length,
      activeStageId:'',
      activeStageIndex:stageIndex
    });
    logWarn({
      area:'frontend',
      module:'frontend/script.js',
      function:'generateTasksForStage',
      action:'generate_stage_tasks_skipped_missing_stage_id',
      stageIndex
    });
    return [];
  }
  if(stageTaskGenerationInFlight.has(stageIndex)){
    logDebug({
      area:'frontend',
      module:'frontend/script.js',
      function:'generateTasksForStage',
      action:'generate_stage_tasks_join_inflight',
      stageIndex
    });
    return stageTaskGenerationInFlight.get(stageIndex);
  }
  const existing=getTasksForStage(stageIndex,{includeArchived:false});
  if(existing.length&&stage.tasksGenerated&&!options.force){
    logRoadmapPipelineEvent('active_stage_task_generation_skipped_already_generated',{
      stageCount:getExecutionStages().length,
      activeStageId:stage.id,
      activeStageIndex:stageIndex,
      taskCount:existing.length
    });
    logInfo({
      area:'frontend',
      module:'frontend/script.js',
      function:'generateTasksForStage',
      action:'generate_stage_tasks_skipped_already_generated',
      stageIndex,
      taskCount:existing.length
    });
    if(getExecutionActiveStageIndex()===stageIndex) syncActiveTasksFromExecution();
    return existing;
  }
  logStageTaskSnapshot('generate_stage_tasks_called',stageIndex,{
    force:Boolean(options.force),
    reason:String(options.reason||'unspecified')
  });
  logExecutionFlowEvent('generate_tasks_called',stageIndex,{
    force:Boolean(options.force),
    reason:String(options.reason||'unspecified')
  });
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'generateTasksForStage',
    action:'tasks_generation_started',
    stageIndex,
    force:Boolean(options.force),
    reason:String(options.reason||'unspecified')
  });
  const taskPromise=(async ()=>{
    const phase=S.roadmap?.[stageIndex]||{};
    const normalizedStage=normalizeStageForEnrichment({
      title:stage?.title||phase?.title||`Stage ${stageIndex+1}`,
      objective:stage?.objective||phase?.objective||'',
      outcome:stage?.outcome||phase?.outcome||''
    },stageIndex);
    const intensityDesc='рабочий сбалансированный темп';
    const clientRequestId=createClientRequestId(`tasks-s${stageIndex+1}`);
    const contextMapping=roadmapContextPresence(buildRoadmapOnboardingContext());
    const tasksPrompt=buildMilestoneTasksPrompt(normalizedStage,'3-5',intensityDesc,{
      stageIndex,
      context:buildRoadmapOnboardingContext()
    });
    logRoadmapPipelineEvent('active_stage_task_generation_started',{
      requestId:clientRequestId,
      stageCount:getExecutionStages().length,
      activeStageId:stage.id,
      activeStageIndex:stageIndex,
      promptChars:tasksPrompt.length,
      requestedMaxTokens:TASKS_DEFAULT_MAX_TOKENS
    });
    try{
      const generatedResult=await geminiJSON(
        tasksPrompt,
        milestoneTasksResponseJsonSchema(),
        TASKS_DEFAULT_MAX_TOKENS,
        '',
        {
          temperature:0.2,
          clientRequestId,
          stageObjective:normalizedStage.objective||stage.objective||'',
          stageTitle:normalizedStage.title||stage.title||`Stage ${stageIndex+1}`,
          stageIndex,
          deadline:S.user.deadline||'',
          returnMeta:true,
          contextFields:contextMapping.present,
          missingContextFields:contextMapping.missing
        },
        'tasks'
      );
      const generated=generatedResult?.data||[];
      const normalized=normalizeFounderTasks(generated,{
        stageObjective:phase?.objective||stage.objective||'',
        stageTitle:phase?.title||stage.title||`Stage ${stageIndex+1}`,
        stageIndex,
        deadline:S.user.deadline||''
      }).slice(0,5);
      const persisted=setStageTasks(stageIndex,normalized,{replace:true});
      setStageTaskStatus(stageIndex,'ready');
      logRoadmapPipelineEvent('stage_task_generation_succeeded',{
        requestId:generatedResult?.meta?.requestId||clientRequestId,
        stageCount:getExecutionStages().length,
        activeStageId:stage.id,
        activeStageIndex:stageIndex,
        taskCount:persisted.length
      });
      logStageTaskSnapshot('stage_tasks_generated',stageIndex,{generatedCount:normalized.length});
      logExecutionFlowEvent('tasks_generated_count',stageIndex,{generatedCount:persisted.length,fallback:false});
      logExecutionFlowEvent('tasks_saved',stageIndex,{savedCount:persisted.length});
      logInfo({
        area:'frontend',
        module:'frontend/script.js',
        function:'generateTasksForStage',
        action:'tasks_generated_count',
        stageIndex,
        generatedCount:persisted.length,
        fallback:false
      });
      logRoadmapPipelineEvent('active_stage_tasks_generated',{
        requestId:generatedResult?.meta?.requestId||clientRequestId,
        stageCount:getExecutionStages().length,
        activeStageId:stage.id,
        activeStageIndex:stageIndex,
        promptChars:generatedResult?.meta?.promptChars||tasksPrompt.length,
        requestedMaxTokens:TASKS_DEFAULT_MAX_TOKENS,
        finishReason:generatedResult?.meta?.finishReason||'',
        taskCount:persisted.length
      });
      logRoadmapPipelineEvent('active_stage_tasks_saved',{
        requestId:generatedResult?.meta?.requestId||clientRequestId,
        stageCount:getExecutionStages().length,
        activeStageId:stage.id,
        activeStageIndex:stageIndex,
        promptChars:generatedResult?.meta?.promptChars||tasksPrompt.length,
        requestedMaxTokens:TASKS_DEFAULT_MAX_TOKENS,
        finishReason:generatedResult?.meta?.finishReason||'',
        taskCount:persisted.length
      });
      saveTasks();
      saveAll();
      return persisted;
    }catch(error){
      const errorMessage=String(error?.message||'');
      logInfo({
        area:'frontend',
        module:'frontend/script.js',
        function:'generateTasksForStage',
        action:'tasks_generation_failed',
        stageIndex,
        errorMessage
      });
      const fallback=normalizeFounderTasks([],{
        stageObjective:phase?.objective||stage.objective||'',
        stageTitle:phase?.title||stage.title||`Stage ${stageIndex+1}`,
        stageIndex,
        deadline:S.user.deadline||''
      }).slice(0,5);
      const persisted=setStageTasks(stageIndex,fallback,{replace:true});
      setStageTaskStatus(stageIndex,persisted.length?'ready':'error',errorMessage);
      logStageTaskSnapshot('stage_tasks_generated',stageIndex,{generatedCount:persisted.length,fallback:true,errorMessage});
      logExecutionFlowEvent('fallback_used',stageIndex,{reason:'tasks_generation_failed',errorMessage});
      logExecutionFlowEvent('tasks_generated_count',stageIndex,{generatedCount:persisted.length,fallback:true});
      logInfo({
        area:'frontend',
        module:'frontend/script.js',
        function:'generateTasksForStage',
        action:'tasks_generated_count',
        stageIndex,
        generatedCount:persisted.length,
        fallback:true
      });
      logRoadmapPipelineEvent('tasks_generation_failed',{
        requestId:clientRequestId,
        stageCount:getExecutionStages().length,
        activeStageId:stage.id,
        activeStageIndex:stageIndex,
        promptChars:tasksPrompt.length,
        requestedMaxTokens:TASKS_DEFAULT_MAX_TOKENS,
        finishReason:'',
        taskCount:persisted.length,
        errorMessage
      });
      logRoadmapPipelineEvent('stage_task_generation_failed_nonfatal',{
        requestId:clientRequestId,
        stageCount:getExecutionStages().length,
        activeStageId:stage.id,
        activeStageIndex:stageIndex,
        promptChars:tasksPrompt.length,
        requestedMaxTokens:TASKS_DEFAULT_MAX_TOKENS,
        finishReason:'',
        taskCount:persisted.length,
        errorMessage:'fallback_tasks_applied'
      });
      saveTasks();
      saveAll();
      if(options.silentFallback!==true){
        toast2('Task generation fallback','Applied fallback tasks for this stage.');
      }
      return persisted;
    }finally{
      stageTaskGenerationInFlight.delete(stageIndex);
    }
  })();
  stageTaskGenerationInFlight.set(stageIndex,taskPromise);
  return taskPromise;
}
async function initializeTasksForActiveStage(options={}){
  ensureExecutionState();
  if(!hasExecutionStateReady()){
    logInfo({
      area:'frontend',
      module:'frontend/script.js',
      function:'initializeTasksForActiveStage',
      action:'stage_task_generation_deferred_execution_uninitialized'
    });
    return [];
  }
  const activeIndex=getExecutionActiveStageIndex();
  const activeStage=getExecutionStage(activeIndex);
  if(!activeStage) return [];
  const existing=getTasksForStage(activeIndex,{includeArchived:false});
  if(existing.length&&activeStage.tasksGenerated&&!options.force){
    setStageTaskStatus(activeIndex,'ready');
    return existing;
  }
  if(resolveStageTaskStatus(activeIndex)==='loading') return existing;
  setStageTaskStatus(activeIndex,'loading');
  logRoadmapPipelineEvent('stage_task_generation_started',{
    stageCount:getExecutionStages().length,
    activeStageId:activeStage.id||'',
    activeStageIndex:activeIndex
  });
  renderTasks();
  const generated=await generateTasksForStage(activeIndex,{
    force:Boolean(options.force),
    silentFallback:options.silentFallback!==false,
    reason:String(options.reason||'lazy_active_stage')
  });
  const taskCount=Array.isArray(generated)?generated.length:0;
  if(taskCount>0){
    setStageTaskStatus(activeIndex,'ready');
    logRoadmapPipelineEvent('stage_task_generation_succeeded',{
      stageCount:getExecutionStages().length,
      activeStageId:activeStage.id||'',
      activeStageIndex:activeIndex,
      taskCount
    });
  }else{
    setStageTaskStatus(activeIndex,'error','no_tasks_generated');
    logRoadmapPipelineEvent('stage_task_generation_failed_nonfatal',{
      stageCount:getExecutionStages().length,
      activeStageId:activeStage.id||'',
      activeStageIndex:activeIndex,
      errorMessage:String(S.execution?.taskGenerationErrorsByStage?.[activeStage.id]||'no_tasks_generated')
    });
  }
  saveTasks();
  saveAll();
  renderTasks();
  return generated;
}
async function ensureActiveStageTasks(options={}){
  ensureExecutionState();
  if(!hasExecutionStateReady()){
    logWarn({
      area:'frontend',
      module:'frontend/script.js',
      function:'ensureActiveStageTasks',
      action:'generate_stage_tasks_skipped_execution_uninitialized'
    });
    return [];
  }
  const activeIndex=getExecutionActiveStageIndex();
  const activeStage=getExecutionStage(activeIndex);
  if(!activeStage){
    logWarn({
      area:'frontend',
      module:'frontend/script.js',
      function:'ensureActiveStageTasks',
      action:'generate_stage_tasks_skipped_no_active_stage'
    });
    return [];
  }
  logStageTaskSnapshot('active_stage_resolved',activeIndex,{reason:String(options.reason||'unspecified')});
  const generated=await generateTasksForStage(activeIndex,options);
  const activeTasks=getTasksForStage(activeIndex,{includeArchived:false});
  if(!activeTasks.length){
    logExecutionFlowEvent('stage_tasks_missing',activeIndex,{reason:String(options.reason||'')});
    logExecutionFlowEvent('recovery_attempt',activeIndex,{reason:String(options.reason||'')});
    const recovered=await generateTasksForStage(activeIndex,{...options,force:true,reason:'recovery_after_empty_stage'});
    const recoveredCount=Array.isArray(recovered)?recovered.length:0;
    logInfo({
      area:'frontend',
      module:'frontend/script.js',
      function:'ensureActiveStageTasks',
      action:recoveredCount?'stage_tasks_recovery_succeeded':'stage_tasks_recovery_failed',
      stageIndex:activeIndex,
      taskCount:recoveredCount
    });
  }
  return generated;
}
function applyActiveStageEnrichment(stageIndex,enrichment,opts={}){
  const stage=getExecutionStage(stageIndex);
  if(!stage) return false;
  const why=clipText(enrichment?.why_this_stage_matters||enrichment?.whyThisStageMatters||stage.whyThisStageMatters||stage.reasoning||'',220);
  const criteria=normalizeCompletionCriteria(enrichment?.completion_criteria||stage.completionCriteria||[],stage.objective||'');
  const focus=clipText(enrichment?.execution_focus||enrichment?.executionFocus||stage.executionFocus||'',160);
  stage.whyThisStageMatters=why;
  stage.reasoning=why;
  stage.completionCriteria=criteria;
  stage.executionFocus=focus;
  stage.detailsGenerated=!opts.fromFallback;
  stage.detailsGeneratedAt=nowIso();
  if(Array.isArray(S.roadmap)&&S.roadmap[stageIndex]){
    const wk=S.roadmap[stageIndex];
    wk.reasoning=why;
    wk.completion_criteria=criteria;
    wk.days=criteria.map((item,idx)=>({day:`C${idx+1}`,task:clipText(item,90),duration:'criteria'}));
  }
  return true;
}
async function enrichActiveStage(stageIndex,options={}){
  const stage=getExecutionStage(stageIndex);
  if(!stage){
    logRoadmapPipelineEvent('active_stage_enrichment_skipped_no_stage',{
      stageCount:getExecutionStages().length,
      activeStageId:'',
      activeStageIndex:stageIndex
    });
    return null;
  }
  if(stage.detailsGenerated&&!options.force){
    logRoadmapPipelineEvent('active_stage_enrichment_skipped_already_generated',{
      stageCount:getExecutionStages().length,
      activeStageId:stage.id,
      activeStageIndex:stageIndex
    });
    return {
    why_this_stage_matters:stage.whyThisStageMatters||stage.reasoning||'',
    completion_criteria:Array.isArray(stage.completionCriteria)?stage.completionCriteria:[],
    execution_focus:stage.executionFocus||''
    };
  }
  const context=options.context||buildRoadmapOnboardingContext();
  const contextMapping=roadmapContextPresence(context);
  logRoadmapPipelineEvent('active_stage_before_sanitize',{
    stageCount:getExecutionStages().length,
    activeStageId:stage.id,
    activeStageIndex:stageIndex
  });
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'enrichActiveStage',
    action:'active_stage_before_sanitize',
    title:clipText(stage?.title||'',80),
    objective:clipText(stage?.objective||'',180),
    outcome:clipText(stage?.outcome||'',140)
  });
  const cleanedStage=sanitizeStageForEnrichment(stage,stageIndex);
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'enrichActiveStage',
    action:'active_stage_after_sanitize',
    title:cleanedStage.title,
    objective:cleanedStage.objective,
    outcome:cleanedStage.outcome
  });
  logRoadmapPipelineEvent('active_stage_after_sanitize',{
    stageCount:getExecutionStages().length,
    activeStageId:stage.id,
    activeStageIndex:stageIndex
  });
  const prompt=buildActiveStageEnrichmentPrompt(cleanedStage,{context});
  const requestedMaxTokens=ACTIVE_STAGE_ENRICH_MAX_TOKENS;
  const clientRequestId=createClientRequestId(`stage-enrich-${stageIndex+1}`);
  logRoadmapPipelineEvent('active_stage_enrichment_started',{
    requestId:clientRequestId,
    stageCount:getExecutionStages().length,
    activeStageId:stage.id,
    activeStageIndex:stageIndex,
    promptChars:prompt.length,
    requestedMaxTokens
  });
  let responseMeta={
    requestId:clientRequestId,
    finishReason:'',
    promptChars:prompt.length
  };
  try{
    const response=await geminiRequest(
      prompt,
      '',
      requestedMaxTokens,
      {
        temperature:0.2,
        responseMimeType:'application/json',
        clientRequestId,
        contextFields:contextMapping.present,
        missingContextFields:contextMapping.missing
      },
      'chat'
    );
    responseMeta={
      requestId:response.requestId||clientRequestId,
      finishReason:response.finishReason||'',
      promptChars:prompt.length
    };
    const parsedPayload=normalizeEnrichmentResponsePayload(response);
    const normalized=parsedPayload.normalized;
    const usedFallback=parsedPayload.usedFallback;
    const usedSalvage=parsedPayload.usedSalvage;
    applyActiveStageEnrichment(stageIndex,normalized,{fromFallback:usedFallback});
    if(usedFallback){
      logEnrichmentFallbackContinuation({
        requestId:responseMeta.requestId,
        activeStageId:stage.id,
        activeStageIndex:stageIndex,
        promptChars:responseMeta.promptChars,
        requestedMaxTokens,
        finishReason:responseMeta.finishReason,
        errorMessage:parsedPayload.fallbackReason
      });
      logRoadmapPipelineEvent('active_stage_enriched',{
        requestId:responseMeta.requestId,
        stageCount:getExecutionStages().length,
        activeStageId:stage.id,
        activeStageIndex:stageIndex,
        promptChars:responseMeta.promptChars,
        requestedMaxTokens,
        finishReason:responseMeta.finishReason,
        errorMessage:'fallback_applied'
      });
    }else if(usedSalvage){
      logEnrichmentFallbackContinuation({
        requestId:responseMeta.requestId,
        activeStageId:stage.id,
        activeStageIndex:stageIndex,
        promptChars:responseMeta.promptChars,
        requestedMaxTokens,
        finishReason:responseMeta.finishReason,
        errorMessage:'partial_enrichment_salvaged'
      });
      logRoadmapPipelineEvent('active_stage_enriched',{
        requestId:responseMeta.requestId,
        stageCount:getExecutionStages().length,
        activeStageId:stage.id,
        activeStageIndex:stageIndex,
        promptChars:responseMeta.promptChars,
        requestedMaxTokens,
        finishReason:responseMeta.finishReason
      });
    }else{
      logRoadmapPipelineEvent('active_stage_enriched',{
        requestId:responseMeta.requestId,
        stageCount:getExecutionStages().length,
        activeStageId:stage.id,
        activeStageIndex:stageIndex,
        promptChars:responseMeta.promptChars,
        requestedMaxTokens,
        finishReason:responseMeta.finishReason
      });
    }
    return normalized;
  }catch(error){
    const fallback=normalizeEnrichmentPayload({},fallbackEnrichmentPayload());
    applyActiveStageEnrichment(stageIndex,fallback,{fromFallback:true});
    logRoadmapPipelineEvent('active_stage_enrichment_failed',{
      requestId:responseMeta.requestId||clientRequestId,
      stageCount:getExecutionStages().length,
      activeStageId:stage.id,
      activeStageIndex:stageIndex,
      promptChars:responseMeta.promptChars||prompt.length,
      requestedMaxTokens,
      finishReason:responseMeta.finishReason||'',
      errorMessage:String(error?.message||'')
    });
    logEnrichmentFallbackContinuation({
      requestId:responseMeta.requestId||clientRequestId,
      activeStageId:stage.id,
      activeStageIndex:stageIndex,
      promptChars:responseMeta.promptChars||prompt.length,
      requestedMaxTokens,
      finishReason:responseMeta.finishReason||'',
      errorMessage:String(error?.message||'')
    });
    logRoadmapPipelineEvent('active_stage_enriched',{
      requestId:responseMeta.requestId||clientRequestId,
      stageCount:getExecutionStages().length,
      activeStageId:stage.id,
      activeStageIndex:stageIndex,
      promptChars:responseMeta.promptChars||prompt.length,
      requestedMaxTokens,
      finishReason:responseMeta.finishReason||'',
      errorMessage:'fallback_applied'
    });
    return fallback;
  }
}
async function enrichActiveStageBestEffort(stageIndex,options={}){
  try{
    return await enrichActiveStage(stageIndex,options);
  }catch(error){
    const stage=getExecutionStage(stageIndex);
    const fallback=normalizeEnrichmentPayload({},fallbackEnrichmentPayload());
    if(stage){
      applyActiveStageEnrichment(stageIndex,fallback,{fromFallback:true});
    }
    logRoadmapPipelineEvent('active_stage_enrichment_fallback_used',{
      stageCount:getExecutionStages().length,
      activeStageId:stage?.id||'',
      activeStageIndex:stageIndex,
      requestedMaxTokens:ACTIVE_STAGE_ENRICH_MAX_TOKENS,
      errorMessage:String(error?.message||'best_effort_wrapper')
    });
    logRoadmapPipelineEvent('active_stage_enrichment_failed_but_pipeline_continues',{
      stageCount:getExecutionStages().length,
      activeStageId:stage?.id||'',
      activeStageIndex:stageIndex,
      requestedMaxTokens:ACTIVE_STAGE_ENRICH_MAX_TOKENS,
      errorMessage:String(error?.message||'best_effort_wrapper')
    });
    logRoadmapPipelineEvent('active_stage_enriched',{
      stageCount:getExecutionStages().length,
      activeStageId:stage?.id||'',
      activeStageIndex:stageIndex,
      requestedMaxTokens:ACTIVE_STAGE_ENRICH_MAX_TOKENS,
      errorMessage:'fallback_applied'
    });
    return fallback;
  }
}
function prepareRoadmapSkeletonRequest(options={}){
  const context=options.context||buildRoadmapOnboardingContext();
  const contextMapping=options.contextMapping||roadmapContextPresence(context);
  const weeksCount=Math.max(1,Number(options.weeksCount)||2);
  const strategyDesc=String(options.strategyDesc||'').trim();
  const prompt=buildRoadmapSkeletonPrompt({weeksCount,strategyDesc,context});
  return {
    context,
    contextMapping,
    weeksCount,
    strategyDesc,
    prompt,
    requestedMaxTokens:ROADMAP_SKELETON_MAX_TOKENS,
    clientRequestId:createClientRequestId('roadmap-skeleton')
  };
}
async function generateStageTasksAfterRoadmap(activeIndex,activeStage,reason){
  const stages=getExecutionStages();
  setStageTaskStatus(activeIndex,'not_generated');
  logRoadmapPipelineEvent('post_roadmap_task_generation_deferred',{
    stageCount:stages.length,
    activeStageId:activeStage?.id||'',
    activeStageIndex:activeIndex,
    errorMessage:String(reason||'')
  });
  return {generated:[],taskCount:0};
}
async function generateRoadmapSkeleton(options={}){
  const prepared=prepareRoadmapSkeletonRequest(options);
  const {
    context,
    contextMapping,
    prompt,
    requestedMaxTokens,
    clientRequestId
  }=prepared;
  const pipelineId=String(options.pipelineId||'');
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'generateRoadmapSkeleton',
    action:'roadmap_context_metadata_built',
    contextFields:contextMapping.present,
    missingContextFields:contextMapping.missing,
    contextKeys:Object.keys(context||{})
  });
  logRoadmapPipelineEvent('roadmap_skeleton_generation_started',{
    requestId:clientRequestId,
    stageCount:0,
    activeStageId:'',
    activeStageIndex:0,
    promptChars:prompt.length,
    requestedMaxTokens,
    contextFields:contextMapping.present
  });
  try{
    const result=await geminiJSON(
      prompt,
      null,
      requestedMaxTokens,
      '',
      {
        temperature:0.2,
        clientRequestId,
        roadmapMode:'skeleton',
        returnMeta:true,
        signal:options.signal,
        contextFields:contextMapping.present,
        missingContextFields:contextMapping.missing
      },
      'roadmap'
    );
    if(pipelineId&&!isRoadmapPipelineActive(pipelineId)) return [];
    const skeleton=normalizeRoadmapSkeleton(result?.data||[]);
    logRoadmapPipelineEvent('roadmap_skeleton_generated',{
      requestId:result?.meta?.requestId||clientRequestId,
      stageCount:skeleton.length,
      activeStageId:'',
      activeStageIndex:0,
      promptChars:result?.meta?.promptChars||prompt.length,
      requestedMaxTokens,
      finishReason:result?.meta?.finishReason||'',
      contextFields:contextMapping.present
    });
    return skeleton;
  }catch(error){
    if(isAbortError(error)||(pipelineId&&!isRoadmapPipelineActive(pipelineId))) throw error;
    logRoadmapPipelineEvent('roadmap_skeleton_parse_failed',{
      requestId:clientRequestId,
      stageCount:0,
      activeStageId:'',
      activeStageIndex:0,
      promptChars:prompt.length,
      requestedMaxTokens,
      errorMessage:String(error?.message||'')
    });
    throw error;
  }
}
async function bootstrapExecutionAfterRoadmap(reason='roadmap_created'){
  ensureExecutionState({mergeLegacyTasks:false});
  if(!hasExecutionStateReady()){
    throw new Error('Execution state was not initialized from roadmap');
  }
  const stages=getExecutionStages();
  if(!stages.length) throw new Error('Roadmap has no stages');
  S.execution.currentStageIndex=0;
  const firstStage=stages[0];
  if(firstStage&&!firstStage.id){
    firstStage.id=createClientRequestId('stage1');
  }
  if(firstStage) firstStage.status='active';
  stages.forEach((stage,idx)=>{
    if(idx>0&&stage.status!=='completed') stage.status='locked';
  });
  normalizeExecutionStatuses();
  refreshExecutionProgress();
  let activeIndex=getExecutionActiveStageIndex();
  let activeStage=getExecutionStage(activeIndex);
  if(!activeStage||!activeStage.id){
    S.execution.currentStageIndex=0;
    activeIndex=0;
    activeStage=getExecutionStage(0);
    if(activeStage&&!activeStage.id){
      activeStage.id=createClientRequestId('stage1-recovered');
    }
  }
  if(!activeStage||!activeStage.id){
    throw new Error('Active stage resolution failed after skeleton initialization');
  }
  logExecutionFlowEvent('roadmap_generated',activeIndex,{reason});
  logExecutionFlowEvent('roadmap_normalized',activeIndex,{reason});
  logExecutionFlowEvent('active_stage_set',activeIndex,{stageId:activeStage?.id||''});
  logRoadmapPipelineEvent('active_stage_set',{
    stageCount:stages.length,
    activeStageId:activeStage?.id||'',
    activeStageIndex:activeIndex
  });
  logRoadmapPipelineEvent('active_stage_enrichment_skipped_mvp_mode',{
    stageCount:stages.length,
    activeStageId:activeStage?.id||'',
    activeStageIndex:activeIndex
  });
  setStageTaskStatus(activeIndex,'not_generated');
  logRoadmapPipelineEvent('tasks_generation_deferred',{
    stageCount:stages.length,
    activeStageId:activeStage?.id||'',
    activeStageIndex:activeIndex,
    errorMessage:String(reason||'bootstrap')
  });
  saveAll();
  return [];
}
async function runRoadmapPipeline(options={}){
  const pipelineId=String(options.pipelineId||'');
  const signal=options.signal;
  const weeksCount=Math.max(1,Number(options.weeksCount)||2);
  const strategyDesc=String(options.strategyDesc||'').trim();
  const reason=String(options.reason||'roadmap_pipeline');
  const context=options.context||buildRoadmapOnboardingContext();
  const contextMapping=roadmapContextPresence(context);
  const result={
    degraded:false,
    degradedStage:'',
    errorMessage:''
  };
  logRoadmapPipelineEvent('roadmap_pipeline_started',{
    requestId:createClientRequestId('roadmap-pipeline'),
    stageCount:0,
    activeStageId:'',
    activeStageIndex:0,
    contextFields:contextMapping.present
  });
  const nextRoadmap=await generateRoadmapSkeleton({
    weeksCount,
    strategyDesc,
    context,
    contextMapping,
    pipelineId,
    signal
  });
  if(pipelineId&&!isRoadmapPipelineActive(pipelineId)) return null;
  S.roadmap=nextRoadmap;
  let initialized=false;
  try{
    initialized=initializeExecutionFromRoadmap({resetVisibleTasks:true});
  }catch(error){
    result.degraded=true;
    result.degradedStage='execution_init';
    result.errorMessage=String(error?.message||'');
    S.execution=null;
    logRoadmapPipelineEvent('roadmap_execution_init_failed',{
      stageCount:Array.isArray(S.roadmap)?S.roadmap.length:0,
      activeStageId:'',
      activeStageIndex:0,
      errorMessage:result.errorMessage,
      contextFields:contextMapping.present
    });
    logRoadmapPipelineEvent('roadmap_pipeline_degraded_fallback_applied',{
      stageCount:Array.isArray(S.roadmap)?S.roadmap.length:0,
      activeStageId:'',
      activeStageIndex:0,
      errorMessage:'execution_init_failed_using_skeleton_only',
      contextFields:contextMapping.present
    });
    return result;
  }
  if(pipelineId&&!isRoadmapPipelineActive(pipelineId)) return null;
  logRoadmapPipelineEvent('execution_state_initialized',{
    roadmapId:S.execution?.id||'',
    stageCount:getExecutionStages().length,
    activeStageId:getExecutionStage(0)?.id||'',
    activeStageIndex:0,
    contextFields:contextMapping.present
  });
  if(!initialized){
    result.degraded=true;
    result.degradedStage='execution_init';
    result.errorMessage='Execution state initialization failed';
    S.execution=null;
    logRoadmapPipelineEvent('roadmap_execution_init_failed',{
      stageCount:Array.isArray(S.roadmap)?S.roadmap.length:0,
      activeStageId:'',
      activeStageIndex:0,
      errorMessage:result.errorMessage,
      contextFields:contextMapping.present
    });
    logRoadmapPipelineEvent('roadmap_pipeline_degraded_fallback_applied',{
      stageCount:Array.isArray(S.roadmap)?S.roadmap.length:0,
      activeStageId:'',
      activeStageIndex:0,
      errorMessage:'execution_init_returned_false_using_skeleton_only',
      contextFields:contextMapping.present
    });
    return result;
  }
  const activeStageIndex=getExecutionActiveStageIndex();
  const activeStage=getExecutionStage(activeStageIndex);
  if(pipelineId&&!isRoadmapPipelineActive(pipelineId)) return null;
  logRoadmapPipelineEvent('active_stage_resolved',{
    roadmapId:S.execution?.id||'',
    stageCount:getExecutionStages().length,
    activeStageId:activeStage?.id||'',
    activeStageIndex,
    contextFields:contextMapping.present
  });
  try{
    await bootstrapExecutionAfterRoadmap(reason);
  }catch(error){
    if(pipelineId&&!isRoadmapPipelineActive(pipelineId)) return null;
    result.degraded=true;
    result.degradedStage='post_generation';
    result.errorMessage=String(error?.message||'');
    logRoadmapPipelineEvent('roadmap_pipeline_failed_post_generation',{
      roadmapId:S.execution?.id||'',
      stageCount:getExecutionStages().length||(Array.isArray(S.roadmap)?S.roadmap.length:0),
      activeStageId:getExecutionStage(getExecutionActiveStageIndex())?.id||'',
      activeStageIndex:getExecutionActiveStageIndex(),
      errorMessage:result.errorMessage,
      contextFields:contextMapping.present
    });
    logRoadmapPipelineEvent('roadmap_pipeline_degraded_fallback_applied',{
      roadmapId:S.execution?.id||'',
      stageCount:getExecutionStages().length||(Array.isArray(S.roadmap)?S.roadmap.length:0),
      activeStageId:getExecutionStage(getExecutionActiveStageIndex())?.id||'',
      activeStageIndex:getExecutionActiveStageIndex(),
      errorMessage:'post_generation_failed_roadmap_kept_in_memory',
      contextFields:contextMapping.present
    });
  }
  if(pipelineId&&!isRoadmapPipelineActive(pipelineId)) return null;
  logRoadmapPipelineEvent('roadmap_pipeline_completed',{
    roadmapId:S.execution?.id||'',
    stageCount:getExecutionStages().length,
    activeStageId:getExecutionStage(getExecutionActiveStageIndex())?.id||'',
    activeStageIndex:getExecutionActiveStageIndex(),
    taskCount:getTasksForStage(getExecutionActiveStageIndex(),{includeArchived:false}).length,
    degraded:result.degraded,
    degradedStage:result.degradedStage,
    contextFields:contextMapping.present
  });
  return result;
}
async function advanceRoadmapStage(options={}){
  if(stageAdvanceInFlight) return false;
  ensureExecutionState();
  if(!hasExecutionStateReady()) return false;
  const stages=getExecutionStages();
  if(!stages.length) return false;
  const currentIndex=getExecutionActiveStageIndex();
  const currentStage=stages[currentIndex];
  if(!currentStage) return false;
  if(!options.force&&!areStageTasksCompleted(currentIndex)) return false;
  stageAdvanceInFlight=true;
  try{
    currentStage.status='completed';
    currentStage.progress=100;
    const nextIndex=currentIndex+1;
    if(nextIndex>=stages.length){
      S.execution.currentStageIndex=stages.length-1;
      S.execution.status='completed';
      stages.forEach((stage)=>{stage.status='completed';stage.progress=100;});
      S.execution.updatedAt=nowIso();
      refreshExecutionProgress();
      syncActiveTasksFromExecution();
      saveTasks();
      saveAll();
      toast2('Roadmap completed','All milestones are completed.');
      return true;
    }
    stages.forEach((stage,idx)=>{
      if(idx<nextIndex) stage.status='completed';
      else if(idx===nextIndex) stage.status='active';
      else stage.status='locked';
    });
    S.execution.currentStageIndex=nextIndex;
    S.execution.status='active';
    S.execution.updatedAt=nowIso();
    logRoadmapPipelineEvent('active_stage_enrichment_skipped_mvp_mode',{
      stageCount:getExecutionStages().length,
      activeStageId:stages[nextIndex]?.id||'',
      activeStageIndex:nextIndex
    });
    refreshExecutionProgress();
    syncActiveTasksFromExecution();
    saveTasks();
    saveAll();
    const nextStage=stages[nextIndex];
    toast2('Milestone completed',`Next milestone unlocked: ${nextStage?.title||`Stage ${nextIndex+1}`}`);
    await generateTasksForStage(nextIndex,{force:false,silentFallback:false});
    return true;
  }finally{
    stageAdvanceInFlight=false;
  }
}
async function maybeAutoAdvanceRoadmapStage(){
  if(stageAdvanceInFlight) return false;
  ensureExecutionState();
  if(!hasExecutionStateReady()) return false;
  const activeIndex=getExecutionActiveStageIndex();
  if(activeIndex<0) return false;
  if(!areStageTasksCompleted(activeIndex)) return false;
  return advanceRoadmapStage({force:false,reason:'all_stage_tasks_done'});
}
async function geminiJSON(prompt,_responseJsonSchema,maxTokens=1000,systemCtx='',opts={},action='chat'){
  const callOpts={
    ...opts
  };
  if(action!=='roadmap'){
    callOpts.responseMimeType='application/json';
    callOpts.responseJsonSchema=_responseJsonSchema&&typeof _responseJsonSchema==='object'
      ? _responseJsonSchema
      : undefined;
  }
  const response=await geminiRequest(prompt,systemCtx,maxTokens,callOpts,action);
  const meta={
    requestId:response.requestId||'',
    finishReason:response.finishReason||'',
    promptChars:String(prompt||'').length,
    requestedMaxTokens:Number(maxTokens)||0
  };
  const taskNormalizationContext={
    stageObjective:clipText(opts?.stageObjective||'',150),
    stageTitle:clipText(opts?.stageTitle||'',40),
    stageIndex:Number.isFinite(Number(opts?.stageIndex))?Number(opts.stageIndex):0,
    deadline:opts?.deadline||S?.user?.deadline||''
  };
  try{
    if(action==='roadmap'){
      logInfo({
        area:'frontend',
        module:'frontend/script.js',
        function:'geminiJSON',
        action:'roadmap_raw_received',
        requestId:response.requestId||'',
        finishReason:response.finishReason||'',
        rawPreview:clipText(response.text||'',200)
      });
      const parsedStages=parseStages(response.text);
      logExecutionFlowEvent('roadmap_parsed',0,{
        requestId:response.requestId||'',
        stages:summarizeRoadmapStagesForLog(parsedStages.map((title,index)=>({
          title,
          objective:'',
          outcome:'',
          status:index===0?'active':''
        })))
      });
      const normalized=normalizeRoadmapSkeleton(parsedStages);
      logExecutionFlowEvent('roadmap_normalized',0,{
        requestId:response.requestId||'',
        stages:summarizeRoadmapStagesForLog(normalized)
      });
      if(opts?.returnMeta) return {data:normalized,meta};
      return normalized;
    }
    const parsed=parseJSON(response.text,{allowPartial:response.finishReason==='MAX_TOKENS'});
    if(action==='tasks'){
      const normalizedTasks=normalizeBetaTasks(parsed,taskNormalizationContext);
      if(opts?.returnMeta) return {data:normalizedTasks,meta};
      return normalizedTasks;
    }
    if(opts?.returnMeta) return {data:parsed,meta};
    return parsed;
  }catch(parseErr){
    if(action==='roadmap'){
      logWarn({area:'frontend',module:'frontend/script.js',function:'geminiJSON',action:'roadmap_partial_fallback',errorMessage:String(parseErr?.message||''),finishReason:response.finishReason||'',requestId:response.requestId||''});
      const fallback=fallbackRoadmapForMvp();
      logExecutionFlowEvent('fallback_used',0,{requestId:response.requestId||'',stages:summarizeRoadmapStagesForLog(fallback)});
      if(opts?.returnMeta) return {data:fallback,meta};
      return fallback;
    }
    if(action==='tasks'){
      logWarn({area:'frontend',module:'frontend/script.js',function:'geminiJSON',action:'tasks_partial_fallback',errorMessage:String(parseErr?.message||''),finishReason:response.finishReason||'',requestId:response.requestId||''});
      const fallbackTasks=fallbackTasksForMvp(taskNormalizationContext);
      if(opts?.returnMeta) return {data:fallbackTasks,meta};
      return fallbackTasks;
    }
    throw parseErr;
  }
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
  contextSummary:'',
  roadmap:null, chatHistory:[], loading:false,
  execution:null,
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
function nativeStorageRemoveItem(key){
  NATIVE_REMOVE_ITEM.call(window.localStorage,key);
}
function canPersistUserData(){
  return Boolean(AUTH_STATE_RESOLVED&&CURRENT_AUTH_USER&&CURRENT_AUTH_USER.uid);
}
function clearLegacySaDataFromBrowser(){
  const keys=[];
  for(let i=0;i<window.localStorage.length;i++){
    const key=window.localStorage.key(i);
    if(!isScopedSaKey(key)) continue;
    keys.push(key);
  }
  keys.forEach((key)=>nativeStorageRemoveItem(key));
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
  S.contextSummary=fresh.contextSummary;
  S.roadmap=fresh.roadmap;
  S.execution=fresh.execution;
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
function clearCurrentUserDataStorage(){
  if(!canPersistUserData()) return;
  const keys=new Set([
    ...SA_USER_DATA_KEYS,
    ...Object.keys(CLOUD_KV).filter(isScopedSaKey)
  ]);
  keys.forEach((key)=>{
    try{window.localStorage.removeItem(key);}catch(_e){}
  });
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
  const previousUid=CURRENT_AUTH_USER?.uid||'';
  if(previousUid&&previousUid!==user.uid){
    CLOUD_WRITE_QUEUE.clear();
    CLOUD_KV={};
    if(CLOUD_FLUSH_TIMER){
      clearTimeout(CLOUD_FLUSH_TIMER);
      CLOUD_FLUSH_TIMER=null;
    }
  }
  resetInMemoryState();
  showAuthScreen();
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
    loadRoadmapRebuildCount();
    const betaNormalized=enforceBetaOnboardingState();
    if(betaNormalized) saveAll();
    const deadlineInput=document.getElementById('ob-deadline');
    if(deadlineInput) deadlineInput.value=S.user.deadline||'';
    setObDeadlineError('');
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
      updateRoadmapRebuildUi();
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
  roadmapRebuildCount=0;
  CLOUD_KV={};
  CLOUD_WRITE_QUEUE.clear();
  if(CLOUD_FLUSH_TIMER){
    clearTimeout(CLOUD_FLUSH_TIMER);
    CLOUD_FLUSH_TIMER=null;
  }
  clearLegacySaDataFromBrowser();
  resetInMemoryState();
  updateRoadmapRebuildUi();
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
    AUTH_STATE_RESOLVED=true;
    if(user) await handleSignedInUser(user);
    else handleSignedOutUser();
  });
}

/* ══ PERSIST ══ */
function clipText(value,max=160){return String(value||'').replace(/\s+/g,' ').trim().slice(0,max);}
function buildRoadmapOnboardingContext(){
  return {
    project_name:clipText(S.user.project,90),
    startup_idea:clipText(S.user.idea,220),
    primary_goal:clipText(S.user.goal,140),
    current_stage:clipText(S.user.stage,50),
    built_status:clipText(S.user.built,180),
    niche:clipText(S.user.niche,90),
    target_audience:clipText(S.user.audience,120),
    resources:clipText(S.user.resources,180),
    blocker:clipText(S.user.blockers,120),
    daily_hours:clipText(S.user.hours,40),
    deadline:clipText(S.user.deadline,30)
  };
}
function roadmapContextPresence(context){
  const required=[
    'project_name',
    'startup_idea',
    'primary_goal',
    'current_stage',
    'built_status',
    'niche',
    'target_audience',
    'resources',
    'blocker',
    'daily_hours',
    'deadline'
  ];
  const present=required.filter((key)=>Boolean(context?.[key]));
  const missing=required.filter((key)=>!context?.[key]);
  return {present,missing};
}
function buildContextSummaryFromState(){
  const ctx=buildRoadmapOnboardingContext();
  const projectValue=ctx.project_name||ctx.startup_idea||'MVP стартап';
  const goalValue=ctx.primary_goal||'запуск продукта';
  const stageValue=ctx.current_stage||'ранняя стадия';
  const topTasks=(S.tasks||[]).filter(t=>!t.done).slice(0,3).map((t)=>clipText(getTaskTitle(t),60)).join('; ');
  const topGoals=(S.goals||[]).slice(0,2).map(g=>clipText(g.title,60)).join('; ');
  const topBlockers=ctx.blocker||'нет явных';
  return [
    `Проект: ${projectValue}`,
    ctx.startup_idea?`Идея: ${ctx.startup_idea}`:'Идея: не указана',
    `Цель: ${goalValue}`,
    `Стадия: ${stageValue}`,
    ctx.built_status?`Уже сделано: ${ctx.built_status}`:'Уже сделано: не указано',
    ctx.niche?`Ниша: ${ctx.niche}`:'Ниша: не указана',
    ctx.target_audience?`Аудитория: ${ctx.target_audience}`:'Аудитория: не указана',
    ctx.resources?`Ресурсы: ${ctx.resources}`:'Ресурсы: не указаны',
    `Дедлайн: ${ctx.deadline||'гибкий'}`,
    `Часы/день: ${ctx.daily_hours||'1-2'}`,
    `Блокеры: ${topBlockers}`,
    `Прогресс: ${S.progress.sessions} сессий, streak ${S.progress.streak}`,
    topTasks?`Активные задачи: ${topTasks}`:'Активные задачи: нет',
    topGoals?`Ключевые цели: ${topGoals}`:'Ключевые цели: нет'
  ].join('\n');
}
function refreshContextSummary(){
  S.contextSummary=buildContextSummaryFromState();
  return S.contextSummary;
}
function getContextSummary(){
  if(S.contextSummary&&S.contextSummary.trim()) return S.contextSummary;
  if(canPersistUserData()){
    try{
      const saved=localStorage.getItem('sa_context_summary');
      if(saved){S.contextSummary=String(saved);return S.contextSummary;}
    }catch(_e){}
  }
  return refreshContextSummary();
}
function saveAll(){
  if(!canPersistUserData()) return;
  try{
    const summary=refreshContextSummary();
    localStorage.setItem('sa_context_summary',summary);
    localStorage.setItem('sa_user',JSON.stringify(S.user));
    localStorage.setItem('sa_progress',JSON.stringify(S.progress));
    localStorage.setItem('sa_billing',JSON.stringify(S.billing));
    if(S.roadmap)localStorage.setItem('sa_roadmap',JSON.stringify(S.roadmap));
    if(S.execution)localStorage.setItem(SA_EXECUTION_KEY,JSON.stringify(S.execution));
    else localStorage.removeItem(SA_EXECUTION_KEY);
  }catch(e){}
}
function loadAll(){
  if(!canPersistUserData()){
    refreshContextSummary();
    return;
  }
  try{
    const summary=localStorage.getItem('sa_context_summary');
    if(summary)S.contextSummary=String(summary);
    const u=localStorage.getItem('sa_user');if(u)Object.assign(S.user,JSON.parse(u));
    const p=localStorage.getItem('sa_progress');if(p)Object.assign(S.progress,JSON.parse(p));
    const b=localStorage.getItem('sa_billing');if(b)Object.assign(S.billing,JSON.parse(b));
    const r=localStorage.getItem('sa_roadmap');if(r)S.roadmap=JSON.parse(r);
    const ex=localStorage.getItem(SA_EXECUTION_KEY);if(ex)S.execution=JSON.parse(ex);
  }catch(e){}
  loadTasks();loadGoals();loadNotes();
  const executionChanged=ensureExecutionState();
  if(executionChanged) saveAll();
  if(S.roadmap&&getExecutionStages().length){
    logRoadmapPipelineEvent('post_roadmap_task_generation_deferred',{
      roadmapId:S.execution?.id||'',
      stageCount:getExecutionStages().length,
      activeStageId:getExecutionStage(getExecutionActiveStageIndex())?.id||'',
      activeStageIndex:getExecutionActiveStageIndex()
    });
  }
  if(!S.contextSummary)refreshContextSummary();
}

/* ══ HELPERS ══ */
function escHtml(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function toast2(title,body=''){document.getElementById('tt').textContent=title;document.getElementById('tb2').textContent=body;const t=document.getElementById('toast');t.classList.add('on');clearTimeout(t._tm);t._tm=setTimeout(()=>t.classList.remove('on'),3200);}
function togglePill(el){el.classList.toggle('on');}
function getSelectedPills(id){return Array.from(document.querySelectorAll('#'+id+' .pill.on')).map(p=>p.textContent.trim());}
function aiLanguageRules(){return `ВАЖНО:\n- Весь смысловой текст, все формулировки задач, milestones, целей, заметок и советов пиши только на русском языке.\n- Английский допустим только в обязательных ключах JSON, если схема ниже требует английские ключи.\n- Если требуется JSON, верни только чистый JSON без markdown, без комментариев и без пояснений.\n- Значения полей title, objective, task, text, desc и day должны быть на русском языке.`;}
function sysp(){
  const summary=getContextSummary();
  return `Ты — AI-коуч StriveAI. Работаешь кратко, по-русски, без воды.\n\nКонтекст (сводка):\n${summary}\n\nПравила:\n- Не выдумывай данные, если их нет.\n- Давай только практические и проверяемые шаги.\n- Учитывай дедлайн, ограничения и текущий темп.\n- Если формат JSON обязателен, верни только JSON.\n\n${aiLanguageRules()}`;
}
function todayISO(){return new Date().toISOString().slice(0,10);}
function roadmapJsonSchema(){return `[{"week":1,"title":"Короткое название этапа","objective":"Что должно быть достигнуто по итогам этапа","days":[{"day":"Пн","task":"Конкретное действие","duration":"2ч"},{"day":"Вт","task":"Конкретное действие","duration":"2ч"},{"day":"Ср","task":"Конкретное действие","duration":"2ч"},{"day":"Чт","task":"Конкретное действие","duration":"2ч"},{"day":"Пт","task":"Конкретное действие","duration":"2ч"},{"day":"Сб","task":"Облегчённая задача или ревью","duration":"1ч"},{"day":"Вс","task":"Добивка, ревью или отдых по плану","duration":"1ч"}]}]`;}
function taskJsonSchema(){return `[{"text":"Конкретная задача","prio":"high|med|low","deadline":"YYYY-MM-DD или пустая строка"}]`;}
function normalizeTaskPrio(prio){return ['high','med','low'].includes(prio)?prio:'med';}
function taskPrioLabel(prio){return {high:'Высокий',med:'Средний',low:'Низкий'}[normalizeTaskPrio(prio)]||'Средний';}
function normalizeRoadmapVariant(v){
  const safe=String(v||'').trim().toLowerCase();
  return ['safe','balanced','aggressive'].includes(safe)?safe:'balanced';
}
function roadmapMaxTokens(weeksCount,variant='balanced'){
  const _safeVariant=normalizeRoadmapVariant(variant);
  const _weeks=Number(weeksCount)||2;
  return ROADMAP_DEFAULT_MAX_TOKENS;
}
function roadmapResponseJsonSchema(){
  return {
    type:'object',
    additionalProperties:false,
    required:['stages'],
    properties:{
      stages:{
        type:'array',
        minItems:ROADMAP_MIN_STAGES,
        maxItems:ROADMAP_MAX_STAGES,
        items:{
          type:'object',
          additionalProperties:false,
          required:['title','objective','outcome','reasoning','completion_criteria','target_date'],
          properties:{
            title:{type:'string',maxLength:64},
            objective:{type:'string',maxLength:180},
            outcome:{type:'string',maxLength:140},
            reasoning:{type:'string',maxLength:220},
            completion_criteria:{
              type:'array',
              minItems:1,
              maxItems:4,
              items:{type:'string',maxLength:90}
            },
            target_date:{type:'string',maxLength:20}
          }
        }
      }
    }
  };
}
function roadmapSkeletonResponseJsonSchema(){
  return {
    type:'object',
    additionalProperties:false,
    required:['stages'],
    properties:{
      stages:{
        type:'array',
        minItems:ROADMAP_MIN_STAGES,
        maxItems:ROADMAP_MAX_STAGES,
        items:{
          type:'object',
          additionalProperties:false,
          required:['title','objective','outcome','target_date'],
          properties:{
            title:{type:'string',maxLength:64},
            objective:{type:'string',maxLength:160},
            outcome:{type:'string',maxLength:140},
            target_date:{type:'string',maxLength:20}
          }
        }
      }
    }
  };
}
function activeStageEnrichmentResponseJsonSchema(){
  return {
    type:'object',
    additionalProperties:false,
    required:['why_this_stage_matters','completion_criteria','execution_focus'],
    properties:{
      why_this_stage_matters:{type:'string',maxLength:220},
      completion_criteria:{
        type:'array',
        minItems:1,
        maxItems:4,
        items:{type:'string',maxLength:100}
      },
      execution_focus:{type:'string',maxLength:160}
    }
  };
}
function getRoadmapPromptWindowDays(deadline){
  return getRoadmapWindowDays(deadline);
}
function milestoneTasksResponseJsonSchema(){
  return {
    type:'array',
    minItems:3,
    maxItems:5,
    items:{
      type:'object',
      additionalProperties:false,
      required:['title','description','why_it_matters','deliverable','done_definition','priority','deadline'],
      properties:{
        title:{type:'string',maxLength:80},
        description:{type:'string',maxLength:220},
        why_it_matters:{type:'string',maxLength:200},
        deliverable:{type:'string',maxLength:200},
        done_definition:{type:'string',maxLength:200},
        priority:{type:'string',enum:['high','med','low']},
        deadline:{type:'string'},
        linked_stage:{type:'integer'}
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
  const ctx=buildRoadmapOnboardingContext();
  const summary=clipText(getContextSummary(),320);
  const deadline=ctx.deadline||'';
  const windowDays=getRoadmapPromptWindowDays(deadline);
  const horizonLabel=deadline?`Дедлайн: ${deadline}`:'Дедлайн: в пределах 14 дней';
  const mapping=roadmapContextPresence(ctx);
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'buildRoadmapPrompt',
    action:'roadmap_context_built',
    presentFields:mapping.present,
    missingFields:mapping.missing
  });
  if(mapping.missing.length){
    logWarn({
      area:'frontend',
      module:'frontend/script.js',
      function:'buildRoadmapPrompt',
      action:'roadmap_context_missing_fields',
      missingFields:mapping.missing
    });
  }
  return `Собери milestone roadmap на ${weeksCount} недель.

FOUNDERS CONTEXT:
- Project name: ${ctx.project_name||'не указано'}
- Startup idea: ${ctx.startup_idea||'не указано'}
- Primary goal: ${ctx.primary_goal||'не указано'}
- Current stage: ${ctx.current_stage||'не указано'}
- Built status: ${ctx.built_status||'не указано'}
- Niche: ${ctx.niche||'не указано'}
- Target audience: ${ctx.target_audience||'не указано'}
- Resources available: ${ctx.resources||'не указано'}
- Biggest blocker: ${ctx.blocker||'нет явных'}
- Daily hours: ${ctx.daily_hours||'не указано'}
- ${horizonLabel}
- Active horizon: ${windowDays} дней
${strategyDesc?`- Pace mode: ${strategyDesc}`:''}

Краткая сводка:
${summary}

Требования:
- Верни JSON-объект вида { "stages": [...] }.
- AI сам выбирает 2-4 milestones, названия и структуру по контексту пользователя.
- Каждый milestone содержит: title, objective, outcome, reasoning, completion_criteria, target_date.
- Это структура milestones, а не полный список задач.

Формат:
- title: короткое название фазы (2-5 слов), отражающее контекст пользователя
- objective: конкретная цель этапа (без префикса "objective:")
- outcome: измеримый результат этапа (без префикса "outcome:")
- reasoning: почему этап критичен сейчас и к чему он ведёт дальше
- completion_criteria: 1-3 коротких критерия завершения
- target_date: YYYY-MM-DD или ""

Правила:
- Не дублируй одинаковые названия milestones
- Без детального task dump
- Компактно, стратегично, без воды
- Без объяснений
- Только JSON`;
}
function buildRoadmapSkeletonPrompt(context={}){
  const weeksCount=Math.max(1,Number(context.weeksCount)||2);
  const strategyDesc=String(context.strategyDesc||'').trim();
  const ctx=context.context||buildRoadmapOnboardingContext();
  const summary=clipText(getContextSummary(),280);
  const deadline=ctx.deadline||S.user.deadline||'';
  const windowDays=getRoadmapPromptWindowDays(deadline);
  const horizonLabel=deadline?`Дедлайн: ${deadline}`:'Дедлайн: в пределах 14 дней';
  return `Собери roadmap skeleton на ${weeksCount} недель.

Контекст основателя:
- Project: ${ctx.project_name||'не указано'}
- Idea: ${ctx.startup_idea||'не указано'}
- Goal: ${ctx.primary_goal||'не указано'}
- Stage: ${ctx.current_stage||'не указано'}
- Built: ${ctx.built_status||'не указано'}
- Niche: ${ctx.niche||'не указано'}
- Audience: ${ctx.target_audience||'не указано'}
- Resources: ${ctx.resources||'не указано'}
- Blocker: ${ctx.blocker||'нет явных'}
- Daily hours: ${ctx.daily_hours||'не указано'}
- ${horizonLabel}
- Active horizon: ${windowDays} дней
${strategyDesc?`- Pace: ${strategyDesc}`:''}

Краткая сводка:
${summary}

Верни только список стадий:
1. Stage name
2. Stage name
3. Stage name

Правила:
- максимум 3 стадии
- каждая строка начинается с '1.', '2.', '3.'
- без описаний
- без лишнего текста`;
}
function buildActiveStageEnrichmentPrompt(stage,context={}){
  const ctx=context.context||buildRoadmapOnboardingContext();
  const normalized=normalizeStageForEnrichment(stage,0);
  const title=normalized.title;
  const objective=normalized.objective;
  const outcome=normalized.outcome;
  return `Верни JSON для активного milestone.
Milestone:
- title: ${title}
- objective: ${objective}
- outcome: ${outcome}

Founder constraints:
- goal: ${ctx.primary_goal||'не указано'}
- blocker: ${ctx.blocker||'нет явных'}
- daily_hours: ${ctx.daily_hours||'не указано'}

Schema:
{"why_this_stage_matters":"","completion_criteria":["",""],"execution_focus":""}

Rules:
- why_this_stage_matters: <=16 слов
- completion_criteria: ровно 2 коротких пункта
- execution_focus: <=10 слов
- только JSON, без markdown и комментариев`;
}
function normalizeRoadmapSkeleton(raw){
  const source=Array.isArray(raw?.stages)
    ? raw.stages
    : (Array.isArray(raw)?raw:[]);
  const fallback=fallbackRoadmapForMvp();
  const count=Math.max(ROADMAP_MIN_STAGES,Math.min(ROADMAP_MAX_STAGES,source.length||fallback.length));
  return Array.from({length:count},(_,index)=>{
    const candidate=source[index]||{};
    const fallbackStage=fallback[index]||fallback[fallback.length-1]||{};
    const candidateTitle=typeof candidate==='string'
      ? candidate
      : candidate?.title;
    const normalized=normalizeStageForEnrichment({
      title:candidateTitle||fallbackStage?.title||buildFallbackStageTitle(index,S?.user?.goal||''),
      objective:candidate?.objective||fallbackStage?.objective||'',
      outcome:candidate?.outcome||fallbackStage?.outcome||''
    },index);
    return {
      week:index+1,
      title:normalized.title,
      objective:normalized.objective,
      outcome:normalized.outcome,
      target_date:toIsoDateOnly(candidate?.target_date||fallbackStage?.target_date||''),
      completion_criteria:[],
      reasoning:'',
      days:[]
    };
  });
}
function buildMilestoneTasksPrompt(ms1,_countDesc,intensityDesc='',options={}){
  const stage=normalizeStageForEnrichment(ms1||{},Number(options.stageIndex)||0);
  const stageTitle=clipText(stage.title||'Stage 1',60)||'Stage 1';
  const stageObjective=clipText(stage.objective||'',170)||'проверить спрос и довести MVP до первых пользователей';
  const stageOutcome=clipText(stage.outcome||'',130)||'измеримый результат текущего этапа';
  const context=options.context||buildRoadmapOnboardingContext();
  const goal=clipText(context.primary_goal||S.user.goal||'',140)||'запуск продукта';
  const deadline=context.deadline||S.user.deadline||'не задан';
  const blockers=clipText(context.blocker||S.user.blockers||'',120)||'нет явных';
  const founderContext=clipText([
    context.project_name||'',
    context.startup_idea||'',
    context.current_stage||'',
    context.target_audience||'',
    context.niche||'',
    context.resources||''
  ].filter(Boolean).join(' · '),260)||'MVP стартап · ранняя стадия';
  return `Сгенерируй founder-grade execution tasks для активной фазы "${stageTitle}".

Контекст:
Цель: ${goal}
Objective фазы: ${stageObjective}
Outcome фазы: ${stageOutcome}
Контекст фаундера: ${founderContext}
Дедлайн: ${deadline}
Блокеры: ${blockers}
Темп: ${intensityDesc||'сбалансированный'}
Сегодня: ${todayISO()}

Требования:
- Верни 3-5 задач
- Только JSON массив

Формат каждого объекта:
- title: конкретное действие + измеримый результат (до 80 символов)
- description: что сделать пошагово (1-2 коротких предложения)
- why_it_matters: почему это критично сейчас для фазы
- deliverable: какой артефакт/результат должен появиться
- done_definition: как понять, что задача завершена
- priority: high | med | low
- deadline: YYYY-MM-DD или ""
- linked_stage: номер активной фазы (1..4)

Правила:
- Без объяснений
- Без вложенности
- Без абстракций и generic формулировок
- Запрещены формулировки типа "сформулировать цель", "снять фидбек"
- Каждая задача должна двигать продукт к реальному output (пользователи, лиды, demo, выручка)

${aiLanguageRules()}`;
}
function sampleTasksForAudit(tasks,maxActive=16,maxDone=8){
  const all=Array.isArray(tasks)?tasks:[];
  const active=all.filter(t=>!t.done).slice(0,maxActive);
  const done=all.filter(t=>t.done).slice(0,maxDone);
  return {sample:[...active,...done],total:all.length};
}
function buildTaskAuditPrompt(sampledTasks,totalCount){
  const summary=getContextSummary();
  return `Перестрой и усили задачи пользователя.

Контекст (сводка):
${summary}

Анализируй только выборку: ${sampledTasks.length} из ${totalCount} задач.
Задачи в выборке:
${sampledTasks.map((t,i)=>`${i+1}. id=${t.id}; prio=${normalizeTaskPrio(t.prio)}; done=${!!t.done}; created=${t.created||''}; title=${clipText(getTaskTitle(t),120)}; detail=${clipText(getTaskSupportLine(t),120)}`).join('\n')}

Что сделать:
- Убери слабые и дублирующиеся формулировки.
- Сохрани id/created для переформулированных задач.
- done=true не сбрасывай для уже завершённых.
- Допусти добавление новых критичных задач только при необходимости.

Формат ответа:
Верни только JSON-массив без markdown и пояснений.

${aiLanguageRules()}`;
}
function normalizeAiTasks(tasks,options={}){
  const existingById=options.existingById instanceof Map?options.existingById:new Map();
  const baseId=Date.now();
  return (Array.isArray(tasks)?tasks:[]).map((t,i)=>{
    const rawId=Number(t?.id);
    const fallbackId=baseId+i;
    const existing=existingById.get(rawId)||{};
    const safeId=Number.isFinite(rawId)&&rawId>0?rawId:(Number(existing?.id)||fallbackId);
    const merged={
      ...existing,
      ...t,
      id:safeId,
      title:t?.title||t?.text||existing?.title||existing?.text||`Задача ${i+1}`,
      priority:t?.priority||t?.prio||existing?.prio||existing?.priority||'med',
      done:t?.done??existing?.done,
      created:t?.created||existing?.created
    };
    const stageIdxRaw=Number(merged?.linkedStage??merged?.linked_stage);
    const stageIndex=Number.isFinite(stageIdxRaw)?Math.max(0,Math.min(ROADMAP_MAX_STAGES-1,stageIdxRaw-1)):0;
    const normalized=normalizeFounderTask(merged,{
      stageIndex,
      stageTitle:options.stageTitle||'Stage 1',
      stageObjective:options.stageObjective||existing?.stageObjective||'',
      deadline:options.deadline||S.user.deadline||''
    });
    return {
      ...normalized,
      id:safeId,
      text:getTaskTitle(normalized),
      done:Boolean(merged.done),
      created:String(merged.created||normalized.created||new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'})).trim(),
      linkedStage:Math.max(1,Math.min(ROADMAP_MAX_STAGES,Number(normalized.linkedStage)||1))
    };
  });
}
function buildGoalsReviewPrompt(goals){
  const summary=getContextSummary();
  return `Сделай честный и полезный разбор списка целей пользователя.

Контекст (сводка):
${summary}

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
  const summary=getContextSummary();
  return `Приведи заметку в рабочий порядок.

Контекст (сводка):
${summary}

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
let obMode='b2c',obVariant=BETA_ALLOWED_ROADMAP_VARIANT,obTaskVariant=BETA_ALLOWED_TASK_VARIANT;
let roadmapRequestInFlight=false;
let taskRequestInFlight=false;
let roadmapRebuildCount=0;
let roadmapRebuildClickInFlight=false;
function obSelectMode(m){obMode=m;document.getElementById('tab-b2c').classList.toggle('on',m==='b2c');}
function loadRoadmapRebuildCount(){
  if(!canPersistUserData()){
    roadmapRebuildCount=0;
    return;
  }
  try{
    const raw=Number.parseInt(localStorage.getItem(SA_REBUILD_COUNT_KEY)||'0',10);
    roadmapRebuildCount=Number.isFinite(raw)&&raw>0?raw:0;
  }catch(_e){
    roadmapRebuildCount=0;
  }
}
function saveRoadmapRebuildCount(){
  if(!canPersistUserData()) return;
  try{
    localStorage.setItem(SA_REBUILD_COUNT_KEY,String(Math.max(0,roadmapRebuildCount)));
  }catch(_e){}
}
function isRoadmapRebuildLimitReached(){
  return roadmapRebuildCount>=ROADMAP_REBUILD_LIMIT;
}
function updateRoadmapRebuildUi(){
  const btn=document.getElementById('rm-rebuild-btn');
  const msg=document.getElementById('rm-rebuild-limit');
  const reached=isRoadmapRebuildLimitReached();
  if(btn){
    btn.disabled=roadmapRequestInFlight||reached;
    btn.title=reached?`Rebuild limit reached (${ROADMAP_REBUILD_LIMIT}/${ROADMAP_REBUILD_LIMIT})`:'';
  }
  if(msg){
    msg.style.display=reached?'':'none';
    msg.textContent=`Rebuild limit reached (${ROADMAP_REBUILD_LIMIT}/${ROADMAP_REBUILD_LIMIT})`;
  }
}
async function onRebuildPlanClick(){
  if(roadmapRequestInFlight||roadmapRebuildClickInFlight) return;
  if(isRoadmapRebuildLimitReached()){
    updateRoadmapRebuildUi();
    toast2('Rebuild limit reached',`${ROADMAP_REBUILD_LIMIT}/${ROADMAP_REBUILD_LIMIT} rebuilds used.`);
    return;
  }
  roadmapRebuildClickInFlight=true;
  try{
    roadmapRebuildCount+=1;
    saveRoadmapRebuildCount();
    updateRoadmapRebuildUi();
    await genVariants();
  }finally{
    roadmapRebuildClickInFlight=false;
    updateRoadmapRebuildUi();
  }
}
function setRoadmapButtonsBusy(isBusy){
  const busy=Boolean(isBusy);
  const selectors=[
    '#ob-gen-btn',
    '#rm-generate-btn'
  ];
  selectors.forEach((selector)=>{
    document.querySelectorAll(selector).forEach((btn)=>{
      btn.disabled=busy;
    });
  });
  updateRoadmapRebuildUi();
}
function toDateInputValue(date){
  const year=date.getFullYear();
  const month=String(date.getMonth()+1).padStart(2,'0');
  const day=String(date.getDate()).padStart(2,'0');
  return `${year}-${month}-${day}`;
}
function addMonths(date,months){
  const copy=new Date(date.getTime());
  copy.setMonth(copy.getMonth()+months);
  return copy;
}
function getBetaDeadlineRange(now=new Date()){
  const minDate=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  const maxDate=addMonths(minDate,BETA_MAX_DEADLINE_MONTHS);
  return {min:toDateInputValue(minDate),max:toDateInputValue(maxDate)};
}
function setObDeadlineError(message=''){
  const el=document.getElementById('ob-deadline-error');
  if(el) el.textContent=message||'';
}
function validateBetaDeadline(raw){
  const value=String(raw||'').trim();
  const range=getBetaDeadlineRange();
  if(!value) return {ok:false,error:'Select a deadline within the beta 1-month range.'};
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) return {ok:false,error:'Enter a valid date in the allowed beta range.'};
  if(value<range.min||value>range.max){
    return {ok:false,error:`Deadline must be between ${range.min} and ${range.max} during beta.`};
  }
  return {ok:true,value};
}
function enforceBetaDeadlineOnState(){
  const previous=String(S.user.deadline||'');
  const check=validateBetaDeadline(S.user.deadline);
  if(!check.ok){
    S.user.deadline='';
    return previous!=='';
  }
  if(check.value!==previous){
    S.user.deadline=check.value;
    return true;
  }
  return false;
}
function initBetaDeadlineInput(){
  const input=document.getElementById('ob-deadline');
  if(!input) return;
  const range=getBetaDeadlineRange();
  input.min=range.min;
  input.max=range.max;
  input.addEventListener('input',()=>{
    const check=validateBetaDeadline(input.value);
    setObDeadlineError(check.ok?'':check.error);
  });
  input.addEventListener('change',()=>{
    const check=validateBetaDeadline(input.value);
    if(check.ok){
      input.value=check.value;
      setObDeadlineError('');
      return;
    }
    input.value='';
    setObDeadlineError(check.error);
  });
}
function syncRoadmapVariantUI(){
  ['safe','balanced','aggressive'].forEach((x)=>{
    const card=document.getElementById('var-'+x);
    const check=document.getElementById('vc-'+x);
    if(card) card.classList.toggle('on',x===obVariant);
    if(check) check.textContent=x===obVariant?'✓':'';
  });
}
function syncTaskVariantUI(){
  ['safe','balanced','aggressive'].forEach((x)=>{
    const card=document.getElementById('tvar-'+x);
    const check=document.getElementById('tvc-'+x);
    if(card) card.classList.toggle('on',x===obTaskVariant);
    if(check) check.textContent=x===obTaskVariant?'✓':'';
  });
}
function enforceBetaOnboardingModes(){
  obVariant=BETA_ALLOWED_ROADMAP_VARIANT;
  obTaskVariant=BETA_ALLOWED_TASK_VARIANT;
  syncRoadmapVariantUI();
  syncTaskVariantUI();
}
function enforceBetaOnboardingState(){
  const prevRoadmap=obVariant;
  const prevTask=obTaskVariant;
  enforceBetaOnboardingModes();
  const deadlineChanged=enforceBetaDeadlineOnState();
  return deadlineChanged||prevRoadmap!==obVariant||prevTask!==obTaskVariant;
}
function obSelectVariant(v){
  if(v!==BETA_ALLOWED_ROADMAP_VARIANT) return;
  obVariant=BETA_ALLOWED_ROADMAP_VARIANT;
  syncRoadmapVariantUI();
}
function obSelectTaskVar(v){
  if(v!==BETA_ALLOWED_TASK_VARIANT) return;
  obTaskVariant=BETA_ALLOWED_TASK_VARIANT;
  syncTaskVariantUI();
}
function obGo(step){document.querySelectorAll('.ob-step').forEach(s=>s.classList.remove('on'));document.getElementById('obs-'+step).classList.add('on');for(let i=0;i<=6;i++){const d=document.getElementById('pd'+i);if(d)d.classList.toggle('done',i<=step);}}
function obNext(from){
  if(from===0){
    const n=document.getElementById('ob-nm').value.trim();
    const p=document.getElementById('ob-proj').value.trim();
    if(!n){document.getElementById('ob-nm').style.borderColor='var(--red)';document.getElementById('ob-nm').focus();return;}
    S.user.name=n;S.user.project=p;S.user.mode=obMode;S.user.role=resolveUserRole();
  }
  if(from===1){
    const deadlineInput=document.getElementById('ob-deadline');
    const deadlineCheck=validateBetaDeadline(deadlineInput?.value||'');
    if(!deadlineCheck.ok){
      setObDeadlineError(deadlineCheck.error);
      if(deadlineInput) deadlineInput.focus();
      return;
    }
    setObDeadlineError('');
    S.user.goal=document.getElementById('ob-goal').value.trim();
    S.user.deadline=deadlineCheck.value;
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
    const ctx=buildRoadmapOnboardingContext();
    const mapping=roadmapContextPresence(ctx);
    logInfo({
      area:'frontend',
      module:'frontend/script.js',
      function:'obNext',
      action:'onboarding_context_collected',
      presentFields:mapping.present,
      missingFields:mapping.missing
    });
  }
  obGo(from+1);
}
function calcWeeksFromDeadline(deadline){
  if(!deadline) return 4;
  const days=Math.round((new Date(deadline)-new Date())/(1000*60*60*24));
  if(days<=7) return 1;
  if(days<=14) return 2;
  const weeks=Math.min(4,Math.max(2,Math.round(days/7)));
  return weeks;
}
async function obGenerateRoadmap(){
  const btn=document.getElementById('ob-gen-btn'),loading=document.getElementById('ob-gen-loading');
  const {pipelineId,signal}=startRoadmapPipelineSession();
  roadmapRequestInFlight=true;
  setRoadmapButtonsBusy(true);
  if(btn) btn.disabled=true;
  if(loading) loading.style.display='';
  try{
    let pipelineCompleted=false;
    const deadlineCheck=validateBetaDeadline(S.user.deadline);
    if(!deadlineCheck.ok) throw new Error(deadlineCheck.error);
    S.user.deadline=deadlineCheck.value;
    const deadlineInput=document.getElementById('ob-deadline');
    if(deadlineInput) deadlineInput.value=deadlineCheck.value;
    setObDeadlineError('');
    const roadmapVariant=BETA_ALLOWED_ROADMAP_VARIANT;
    obVariant=roadmapVariant;
    syncRoadmapVariantUI();
    const variantDesc={safe:'Консервативный темп: 2-4 часа в день, упор на устойчивость и низкий риск',balanced:'Сбалансированный темп: 4-6 часов в день, сочетание скорости и качества',aggressive:'Агрессивный темп: 8-10 часов в день, высокий фокус на быстрый результат'}[roadmapVariant];
    const weeksCount=calcWeeksFromDeadline(S.user.deadline);
    const roadmapCtx=buildRoadmapOnboardingContext();
    const pipelineResult=await runRoadmapPipeline({
      weeksCount,
      strategyDesc:variantDesc,
      context:roadmapCtx,
      reason:'post_roadmap_onboarding',
      pipelineId,
      signal
    });
    if(!isRoadmapPipelineActive(pipelineId)) return;
    pipelineCompleted=true;

    if(pipelineCompleted){
      try{
        saveAll();
        logInfo({
          area:'frontend',
          module:'frontend/script.js',
          function:'obGenerateRoadmap',
          action:'execution_persisted',
          activeStageIndex:getExecutionActiveStageIndex(),
          stages:summarizeRoadmapStagesForLog(getExecutionStages()),
          degraded:Boolean(pipelineResult?.degraded),
          degradedStage:String(pipelineResult?.degradedStage||'')
        });
        if(pipelineResult?.degraded){
          logRoadmapPipelineEvent('roadmap_pipeline_rendered_degraded',{
            roadmapId:S.execution?.id||'',
            stageCount:getExecutionStages().length||(Array.isArray(S.roadmap)?S.roadmap.length:0),
            activeStageId:getExecutionStage(getExecutionActiveStageIndex())?.id||'',
            activeStageIndex:getExecutionActiveStageIndex(),
            errorMessage:String(pipelineResult?.errorMessage||''),
            degradedStage:String(pipelineResult?.degradedStage||'')
          });
        }
        obShowGoals();
        obGo(3);
        if(pipelineResult?.degraded){
          toast2('Roadmap готов','Roadmap показан в degraded mode.');
        }
      }catch(postError){
        logWarn({
          area:'frontend',
          module:'frontend/script.js',
          function:'obGenerateRoadmap',
          action:'onboarding_post_roadmap_nonfatal',
          errorMessage:String(postError?.message||'')
        });
        try{obGo(3);}catch(_e){}
      }
    }
  }catch(e){
    if(isAbortError(e)||!isRoadmapPipelineActive(pipelineId)) return;
    const hasSkeleton=Array.isArray(S.roadmap)&&S.roadmap.length>0;
    logRoadmapPipelineEvent(hasSkeleton?'roadmap_pipeline_failed_post_generation':'roadmap_pipeline_failed_onboarding_collect_or_skeleton',{
      roadmapId:S.execution?.id||'',
      stageCount:getExecutionStages().length||(Array.isArray(S.roadmap)?S.roadmap.length:0),
      activeStageId:getExecutionStage(getExecutionActiveStageIndex())?.id||'',
      activeStageIndex:getExecutionActiveStageIndex(),
      errorMessage:String(e?.message||'')
    });
    if(hasSkeleton){
      logRoadmapPipelineEvent('roadmap_pipeline_degraded_fallback_applied',{
        roadmapId:S.execution?.id||'',
        stageCount:getExecutionStages().length||(Array.isArray(S.roadmap)?S.roadmap.length:0),
        activeStageId:getExecutionStage(getExecutionActiveStageIndex())?.id||'',
        activeStageIndex:getExecutionActiveStageIndex(),
        errorMessage:'post_generation_exception_ui_kept_using_existing_skeleton'
      });
      try{
        if(!getExecutionStages().length) initializeExecutionFromRoadmap({resetVisibleTasks:true});
        saveAll();
        obShowGoals();
        obGo(3);
      }catch(_degradedError){}
      toast2('Roadmap готов','Roadmap показан в degraded mode.');
      return;
    }
    toast2('Roadmap generation failed',mapGeminiErrorMessage(e,'roadmap'));
  }finally{
    if(!isRoadmapPipelineActive(pipelineId)) return;
    activeRoadmapPipelineId=null;
    activeRoadmapAbortController=null;
    roadmapRequestInFlight=false;
    setRoadmapButtonsBusy(false);
    if(btn) btn.disabled=false;
    if(loading) loading.style.display='none';
  }
}
function obShowGoals(){
  if(!S.roadmap)return;
  ensureExecutionState();
  const stageSource=getExecutionStages().length
    ? getExecutionStages().map((stage,index)=>({
      title:stage.title||S.roadmap?.[index]?.title||`Stage ${index+1}`,
      objective:getStageObjectiveText(stage)||getStageObjectiveText(S.roadmap?.[index]||{})||'',
      reasoning:getStageReasoningText(stage)||getStageReasoningText(S.roadmap?.[index]||{})||''
    }))
    : (S.roadmap||[]);
  const newGoals=stageSource.slice(0,3).map((wk,i)=>({id:Date.now()+i,title:wk.title,deadline:'',desc:[wk.objective,wk.reasoning?`Why this stage matters: ${wk.reasoning}`:''].filter(Boolean).join(' · '),pct:0}));
  S.goals=newGoals;saveGoals();
  const el=document.getElementById('ob-goals-preview');
  el.innerHTML=newGoals.map(g=>`<div style="background:var(--surface);border:1px solid var(--border2);padding:10px;margin-bottom:8px;"><div style="font-family:var(--head);font-size:13px;font-weight:900;color:var(--ink);text-transform:uppercase;">${escHtml(g.title)}</div><div style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-top:3px;">${escHtml(g.desc)}</div></div>`).join('');
}
function renderOnboardingTaskPreview(){
  const el=document.getElementById('ob-tasks-preview');
  const activeIndex=getExecutionActiveStageIndex();
  const milestoneStage=getExecutionStage(activeIndex);
  const milestone=milestoneStage||S.roadmap?.[activeIndex]||S.roadmap?.[0];
  if(!el||!milestone)return;
  syncActiveTasksFromExecution();
  const activeTasks=getActiveStageTasks();
  const count=activeTasks.length;
  const stageObjective=getStageObjectiveText(milestone);
  const stageOutcome=getStageOutcomeText(milestone);
  const stageReasoning=getStageReasoningText(milestone);
  el.innerHTML=`<div class="ob-task-preview-meta"><strong>${escHtml(milestone.title||`Этап ${activeIndex+1}`)}</strong><span>Загружено задач: ${count}</span></div>`+
    `${stageObjective?`<div class="ob-task-preview-meta"><strong>Objective:</strong><span>${escHtml(stageObjective)}</span></div>`:''}`+
    `${stageOutcome?`<div class="ob-task-preview-meta"><strong>Outcome:</strong><span>${escHtml(stageOutcome)}</span></div>`:''}`+
    `${stageReasoning?`<div class="ob-task-preview-meta"><strong>Why this stage matters:</strong><span>${escHtml(stageReasoning)}</span></div>`:''}`+
    `<div class="ob-task-preview-list">`+
    activeTasks.map((task,i)=>`<div class="ob-task-item"><div class="ob-task-index">${i+1}</div><div class="ob-task-body"><div class="ob-task-text">${escHtml(getTaskTitle(task))}</div><div class="ob-task-deadline">${task.deadline?`Дедлайн: ${escHtml(task.deadline)}`:'Дедлайн не назначен'}</div></div><div class="ob-task-prio ${escHtml(task.prio||'med')}">${escHtml(taskPrioLabel(task.prio||'med'))}</div></div>`).join('')+`</div>`;
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'renderOnboardingTaskPreview',
    action:'onboarding_preview_rendered',
    activeStageIndex:activeIndex,
    taskCount:count,
    title:clipText(milestone.title||'',80),
    objective:clipText(stageObjective,140),
    outcome:clipText(stageOutcome,120)
  });
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
  if(ms)ms.textContent=String((getExecutionStages().length||S.roadmap?.length||0));
  if(tk)tk.textContent=String((getActiveStageTasks().length||0));
}
function obContinueToLaunch(){obPrepLaunch();obGo(6);}
async function handleGenerateTasksClick(){
  if(!S.roadmap||taskRequestInFlight)return;
  const btn=document.getElementById('ob-tasks-btn'),loading=document.getElementById('ob-tasks-loading');
  taskRequestInFlight=true;
  if(btn) btn.disabled=true;
  if(loading) loading.style.display='';
  try{
    obTaskVariant=BETA_ALLOWED_TASK_VARIANT;
    syncTaskVariantUI();
    logRoadmapPipelineEvent('execution_recovery_started',{
      roadmapId:S.execution?.id||'',
      stageCount:Array.isArray(S.roadmap)?S.roadmap.length:0,
      activeStageId:getExecutionStage(getExecutionActiveStageIndex())?.id||'',
      activeStageIndex:getExecutionActiveStageIndex()
    });
    const hasExecutionObject=isExecutionStateObject(S.execution);
    const hasExecutionStages=getExecutionStages().length>0;
    const hasActiveStage=Boolean(getExecutionStage(getExecutionActiveStageIndex()));
    if(!Array.isArray(S.roadmap)||!S.roadmap.length){
      throw new Error('Roadmap is missing, cannot recover execution state');
    }
    if(!hasExecutionObject||!hasExecutionStages||!hasActiveStage){
      const initialized=initializeExecutionFromRoadmap({resetVisibleTasks:true});
      if(!initialized){
        throw new Error('Execution recovery failed from roadmap');
      }
    }else{
      ensureExecutionState({mergeLegacyTasks:false});
    }
    if(!isExecutionStateObject(S.execution)||!getExecutionStages().length){
      throw new Error('Execution state is still unavailable after recovery');
    }
    const recoveredActiveStageIndex=getExecutionActiveStageIndex();
    const recoveredActiveStage=getExecutionStage(recoveredActiveStageIndex);
    if(!recoveredActiveStage){
      throw new Error('Active stage recovery failed');
    }
    logRoadmapPipelineEvent('active_stage_recovered',{
      roadmapId:S.execution?.id||'',
      stageCount:getExecutionStages().length,
      activeStageId:recoveredActiveStage?.id||'',
      activeStageIndex:recoveredActiveStageIndex
    });
    logRoadmapPipelineEvent('execution_recovery_completed',{
      roadmapId:S.execution?.id||'',
      stageCount:getExecutionStages().length,
      activeStageId:recoveredActiveStage?.id||'',
      activeStageIndex:recoveredActiveStageIndex
    });
    const activeStageIndex=recoveredActiveStageIndex;
    const activeStage=recoveredActiveStage;
    logRoadmapPipelineEvent('tasks_generation_manual_started',{
      roadmapId:S.execution?.id||'',
      stageCount:getExecutionStages().length,
      activeStageId:activeStage?.id||'',
      activeStageIndex
    });
    const tasks=await initializeTasksForActiveStage({force:true,silentFallback:false,reason:'manual_click'});
    if(!getActiveStageTasks().length){
      logRoadmapPipelineEvent('tasks_generation_failed',{
        roadmapId:S.execution?.id||'',
        stageCount:getExecutionStages().length,
        activeStageId:getExecutionStage(getExecutionActiveStageIndex())?.id||'',
        activeStageIndex:getExecutionActiveStageIndex(),
        errorMessage:'tasks_missing_after_manual_generation'
      });
      throw new Error('Active stage tasks are still missing');
    }
    syncActiveTasksFromExecution();
    saveAll();
    logRoadmapPipelineEvent('tasks_generation_manual_completed',{
      roadmapId:S.execution?.id||'',
      stageCount:getExecutionStages().length,
      activeStageId:getExecutionStage(getExecutionActiveStageIndex())?.id||'',
      activeStageIndex:getExecutionActiveStageIndex(),
      taskCount:Array.isArray(tasks)?tasks.length:S.tasks.length
    });
    renderOnboardingTaskPreview();obPrepLaunch();toast2('Задачи сгенерированы',`Подготовлено ${S.tasks.length} задач для первого этапа`);obGo(5);
  }catch(e){
    logRoadmapPipelineEvent('execution_recovery_failed',{
      roadmapId:S.execution?.id||'',
      stageCount:Array.isArray(S.roadmap)?S.roadmap.length:0,
      activeStageId:getExecutionStage(getExecutionActiveStageIndex())?.id||'',
      activeStageIndex:getExecutionActiveStageIndex(),
      errorMessage:String(e?.message||'')
    });
    logRoadmapPipelineEvent('tasks_generation_failed',{
      roadmapId:S.execution?.id||'',
      stageCount:getExecutionStages().length,
      activeStageId:getExecutionStage(getExecutionActiveStageIndex())?.id||'',
      activeStageIndex:getExecutionActiveStageIndex(),
      errorMessage:String(e?.message||'')
    });
    toast2('Task generation failed',mapGeminiErrorMessage(e,'tasks'));
  }finally{
    taskRequestInFlight=false;
    if(btn) btn.disabled=false;
    if(loading) loading.style.display='none';
  }
}
async function obGenerateTasks(){
  return handleGenerateTasksClick();
}
function obFinish(){
  const btn=document.getElementById('ob-launch-btn');
  if(btn){btn.disabled=true;btn.textContent='Launching…';}
  obLaunch({startTour:true});
}
function markUserRegistered(){
  if(!canPersistUserData()) return;
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
  closeTaskDetail(true);
  document.querySelectorAll('.pg').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('.htab').forEach(b=>b.classList.remove('on'));
  const pg=document.getElementById('pg-'+id);if(pg)pg.classList.add('on');
  document.querySelectorAll('.htab').forEach(b=>{if(b.getAttribute('onclick')&&b.getAttribute('onclick').includes("'"+id+"'"))b.classList.add('on');});
  if(id==='work'){
    renderTasks();
    renderGoals();
    updTaskBadge();
  }
  if(id==='notes'){renderNoteList();if(!activeNoteId&&(S.notes||[]).length)openNote(S.notes[0].id);}
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
    {page:'settings',target:'tab-settings',title:'Settings',body:'This area now focuses on account, plan, and system actions for the MVP.'}
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
  if(tab!=='tasks') closeTaskDetail(true);
  if(tab==='tasks'){
    renderTasks();
  }
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
  updateRoadmapRebuildUi();
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
  const newDone=(S.tasks||[]).filter(t=>t.done||t.status==='done').length;
  const hasTask=newDone>prevDone;
  S.progress.sessions++;
  S.progress.hours+=duration/60;
  refreshExecutionProgress();
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
  refreshExecutionProgress();
  const pct=totalPct();
  const el=id=>document.getElementById(id);
  const set=(id,v)=>{const e=el(id);if(e)e.textContent=v;};
  set('rm-pct',pct+'%');
  set('rm-sess',S.progress.sessions);
  set('rm-streak',S.progress.streak+'🔥');
  set('rm-hrs',Math.round(S.progress.hours)+'h invested');
  const currentMilestone=S.roadmap&&S.roadmap.length?Math.min(getRoadmapActiveIndex()+1,S.roadmap.length):0;
  set('rm-ms',currentMilestone);
  set('rm-tasks',S.progress.tasksDone||0);
  set('rm-prog-label',pct===0?'Start your first milestone':pct<50?'Building milestone momentum':'On track!');
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
function totalPct(){
  const stages=getExecutionStages();
  if(stages.length){
    const completed=stages.filter((stage)=>stage.status==='completed').length;
    const activeIndex=getExecutionActiveStageIndex();
    const activePct=activeIndex>=0&&stages[activeIndex]?Number(stages[activeIndex].progress||0):0;
    const combined=((completed+(activePct/100))/Math.max(1,stages.length))*100;
    return Math.max(0,Math.min(100,Math.round(combined)));
  }
  const tot=S.roadmap
    ? Math.max(1,S.roadmap.reduce((sum,phase)=>sum+Math.max(1,(phase?.days||[]).length),0))
    : 56;
  return Math.min(100,Math.round((S.progress.sessions/tot)*100));
}
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
  refreshExecutionProgress();
  const s=S.progress.sessions,t=S.progress.tasksDone;
  const spd=(s/Math.max(1,S.progress.activityLog.length));
  const s2=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  s2('m-speed',spd.toFixed(1));const msb=document.getElementById('m-speed-bar');if(msb)msb.style.width=Math.min(100,spd*10)+'%';
  s2('m-tasks',t);const mtb=document.getElementById('m-tasks-bar');if(mtb)mtb.style.width=Math.min(100,t*5)+'%';
  const eff=s>0?Math.min(100,Math.round((t/Math.max(1,s))*100)):0;
  s2('m-eff',eff);const meb=document.getElementById('m-eff-bar');if(meb)meb.style.width=eff+'%';
  s2('dstat-sess',s);s2('dstat-streak',S.progress.streak+'🔥');s2('dstat-pct',totalPct()+'%');
  if(S.roadmap){
    const wk=S.roadmap[Math.min(getRoadmapActiveIndex(),S.roadmap.length-1)];
    const phaseDays=wk&&Array.isArray(wk.days)&&wk.days.length?wk.days:[];
    const dayIndex=phaseDays.length?S.progress.sessions%phaseDays.length:0;
    const day=phaseDays.length?phaseDays[dayIndex]||phaseDays[0]:null;
    if(day){s2('mc-title',day.task||wk.title||'');s2('mc-detail',wk.objective||'');s2('mc-tag1','Week '+wk.week);s2('mc-tag2','Est: '+day.duration);}
  }
  updMilestoneBar();
}

/* ══ FEED ══ */
let feedLines=[];
function feedLine(txt){feedLines.unshift(txt);if(feedLines.length>6)feedLines=feedLines.slice(0,6);const el=document.getElementById('lf');if(el)el.innerHTML=feedLines.map(l=>`<div class="feed-line">${escHtml(l)}</div>`).join('');}

/* ══ ROADMAP ══ */
let focusedRoadmapStageIndex=null, openRoadmapMilestoneIndex=null, openRoadmapTimelineKey='';

function getRoadmapActiveIndex(){
  if(getExecutionStages().length) return getExecutionActiveStageIndex();
  return S.roadmap&&S.roadmap.length?Math.min(S.progress.milestones,S.roadmap.length-1):0;
}
function getRoadmapDayProgress(){
  const sessions=Math.max(0,S.progress.sessions||0);
  const activePhase=S.roadmap?.[getRoadmapActiveIndex()];
  const phaseSize=Math.max(1,Math.min(7,Array.isArray(activePhase?.days)&&activePhase.days.length?activePhase.days.length:7));
  return Math.min(phaseSize-1,sessions%phaseSize);
}
function getRoadmapStageStatus(index){
  const executionStage=getExecutionStage(index);
  if(executionStage){
    if(executionStage.status==='completed') return 'done';
    if(executionStage.status==='active') return 'active';
    return 'pending';
  }
  const activeIndex=getRoadmapActiveIndex();
  if(index<activeIndex) return 'done';
  if(index===activeIndex) return 'active';
  return 'pending';
}
function getRoadmapStagePct(index){
  const executionStage=getExecutionStage(index);
  if(executionStage){
    return Math.max(0,Math.min(100,Number(executionStage.progress)||0));
  }
  const status=getRoadmapStageStatus(index);
  if(status==='done') return 100;
  if(status==='pending') return 0;
  const tasks=S.tasks||[];
  if(tasks.length){
    return Math.round((tasks.filter(t=>t.done).length/tasks.length)*100);
  }
  const phase=S.roadmap?.[index];
  const phaseSize=Math.max(1,Array.isArray(phase?.days)&&phase.days.length?phase.days.length:7);
  return Math.round(((Math.min(phaseSize-1,getRoadmapDayProgress())+1)/phaseSize)*100);
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
  const stage=getExecutionStage(index);
  const stageStatus=stage?.status||'locked';
  if(stageStatus==='locked'){
    logDebug({
      area:'frontend',
      module:'frontend/script.js',
      function:'getRoadmapRelatedTasks',
      action:'render_locked_stage',
      stageId:stage?.id||'',
      stageIndex:index
    });
    return [{
      title:'Stage locked',
      meta:'Complete the current milestone to unlock this stage'
    }];
  }
  const stageTasks=getTasksForStage(index,{includeArchived:false});
  const linked=(stageTasks||[]).filter((task)=>Number(task?.linkedStage||task?.linkedStageIndex+1||1)===index+1);
  if(linked.length){
    logDebug({
      area:'frontend',
      module:'frontend/script.js',
      function:'getRoadmapRelatedTasks',
      action:'render_stage_tasks',
      stageId:stage?.id||'',
      stageIndex:index,
      taskCount:linked.length
    });
    return linked.map((task)=>({
      taskId:task.id,
      title:getTaskTitle(task),
      meta:`${taskPrioLabel(task.prio)}${task.deadline?` · ${task.deadline}`:''}${task.done?' · DONE':''}${getTaskSupportLine(task)?` · ${clipText(getTaskSupportLine(task),70)}`:''}`
    }));
  }
  if(stageStatus==='completed'){
    return [{
      title:'Milestone completed',
      meta:'All tasks in this stage are completed'
    }];
  }
  return [{
    title:'No tasks yet',
    meta:'Tasks will appear when this milestone becomes active'
  }];
}
function focusRoadmapStage(index){
  focusedRoadmapStageIndex=index;
  renderRM();
  const target=document.getElementById('rm-focus-panel');
  if(target) target.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function toggleRoadmapMilestone(index){
  focusedRoadmapStageIndex=index;
  openRoadmapMilestoneIndex=openRoadmapMilestoneIndex===index?null:index;
  renderRM();
}
function toggleRoadmapTimelineItem(index,dayIndex){
  const key=`${index}-${dayIndex}`;
  openRoadmapTimelineKey=openRoadmapTimelineKey===key?'':key;
  renderRM();
}
function getRoadmapStageCriteria(index){
  const stage=getExecutionStage(index);
  if(stage&&Array.isArray(stage.completionCriteria)&&stage.completionCriteria.length){
    return stage.completionCriteria.map((item,idx)=>({
      day:`C${idx+1}`,
      task:clipText(item,90),
      duration:'criteria'
    }));
  }
  const wk=S.roadmap?.[index];
  return Array.isArray(wk?.days)?wk.days:[];
}
function buildRoadmapDetailPanel(index){
  if(index===null||index===undefined||!S.roadmap||!S.roadmap[index]) return '';
  const wk=S.roadmap[index];
  const stage=getExecutionStage(index);
  const stageTitle=stage?.title||wk.title||`Этап ${index+1}`;
  const stageObjective=getStageObjectiveText(stage||wk)||'';
  const stageOutcome=getStageOutcomeText(stage||wk)||'';
  const stageReasoning=getStageReasoningText(stage||wk)||'';
  const pct=getRoadmapStagePct(index);
  const related=getRoadmapRelatedTasks(index).slice(0,6);
  const stageCriteria=getRoadmapStageCriteria(index);
  const criteriaCount=Math.max(1,stageCriteria.length);
  const criteriaDone=Math.round((pct/100)*criteriaCount);
  const checklist=stageCriteria.slice(0,4).map((day,dayIndex)=>{
    let status='pending';
    if(getRoadmapStageStatus(index)==='done') status='done';
    else if(getRoadmapStageStatus(index)==='active'){
      if(dayIndex<criteriaDone) status='done';
      else if(dayIndex===criteriaDone) status='active';
    }
    return `<div class="rm-check-item ${status}"><div class="rm-check-icon">${status==='done'?'✓':status==='active'?'●':'·'}</div><div class="rm-check-copy"><strong>${escHtml(day.task||'Шаг этапа')}</strong><span>${escHtml(day.day||'DAY')} · ${escHtml(day.duration||'без оценки')}</span></div></div>`;
  }).join('');
  return `<div class="rm-detail-head">
    <div>
      <div class="rm-detail-kicker">Milestone Detail</div>
      <div class="rm-detail-title">${escHtml(stageTitle)}</div>
      <div class="rm-detail-copy">${escHtml(stageObjective)}${stageOutcome?` · Outcome: ${escHtml(stageOutcome)}`:''}</div>
      ${stageReasoning?`<div class="rm-detail-copy"><strong>Why this stage matters:</strong> ${escHtml(stageReasoning)}</div>`:''}
    </div>
    <button class="btn btn-ghost btn-sm" onclick="toggleRoadmapMilestone(${index})">Close</button>
  </div>
  <div class="rm-detail-grid">
    <div class="rm-detail-stat"><strong>${pct}%</strong><span>Progress</span></div>
    <div class="rm-detail-stat"><strong>${escHtml(getRoadmapTargetDate(index,S.roadmap.length))}</strong><span>Target date</span></div>
    <div class="rm-detail-stat"><strong>${stageCriteria.length}</strong><span>Requirements</span></div>
  </div>
  <div class="rm-detail-list">
    <div>
      <div class="rm-list-title">Success Criteria</div>
      <div class="rm-checklist">${checklist}</div>
    </div>
    <div>
      <div class="rm-list-title">Related Tasks</div>
      <div class="rm-related-list">${related.map(item=>`<div class="rm-related-item ${item.taskId?'clickable':''}" ${item.taskId?`onclick="openTaskDetail(${item.taskId})"`:''}><div class="rm-check-icon">→</div><div class="rm-related-copy"><strong>${escHtml(item.title)}</strong><span>${escHtml(item.meta)}</span></div></div>`).join('')}</div>
    </div>
  </div>`;
}

async function genVariants(){
  if(!S.user.goal){toast2('Set goal first','Complete onboarding goal first.');return;}
  const deadlineCheck=validateBetaDeadline(S.user.deadline);
  if(!deadlineCheck.ok){toast2('Invalid deadline',deadlineCheck.error);return;}
  const {pipelineId,signal}=startRoadmapPipelineSession();
  S.user.deadline=deadlineCheck.value;
  obVariant=BETA_ALLOWED_ROADMAP_VARIANT;
  syncRoadmapVariantUI();
  const rb=document.getElementById('rb');
  const previousRoadmap=S.roadmap?JSON.parse(JSON.stringify(S.roadmap)):null;
  const previousExecution=S.execution?JSON.parse(JSON.stringify(S.execution)):null;
  roadmapRequestInFlight=true;
  setRoadmapButtonsBusy(true);
  rb.innerHTML='<div class="rm-loading"><div style="width:18px;height:18px;border:2px solid var(--border2);border-top-color:var(--blue);border-radius:50%;animation:spin .7s linear infinite;margin:0 auto 10px;"></div><div style="font-family:var(--mono);font-size:11px;color:var(--muted);text-align:center;text-transform:uppercase">Генерирую roadmap через Gemini… обычно 1-2 минуты.</div></div>';
  try{
    const weeksCount=calcWeeksFromDeadline(S.user.deadline);
    const roadmapVariant=BETA_ALLOWED_ROADMAP_VARIANT;
    const variantDesc={safe:'Консервативный темп: 2-4 часа в день, упор на устойчивость и низкий риск',balanced:'Сбалансированный темп: 4-6 часов в день, сочетание скорости и качества',aggressive:'Агрессивный темп: 8-10 часов в день, высокий фокус на быстрый результат'}[roadmapVariant];
    const roadmapCtx=buildRoadmapOnboardingContext();
    const pipelineResult=await runRoadmapPipeline({
      weeksCount,
      strategyDesc:variantDesc,
      context:roadmapCtx,
      reason:'post_roadmap_rebuild',
      pipelineId,
      signal
    });
    if(!isRoadmapPipelineActive(pipelineId)) return;
    saveAll();
    logInfo({
      area:'frontend',
      module:'frontend/script.js',
      function:'genVariants',
      action:'execution_persisted',
      activeStageIndex:getExecutionActiveStageIndex(),
      stages:summarizeRoadmapStagesForLog(getExecutionStages()),
      degraded:Boolean(pipelineResult?.degraded),
      degradedStage:String(pipelineResult?.degradedStage||'')
    });
    renderRM();
    updRoadmapProgress();
    if(pipelineResult?.degraded){
      logRoadmapPipelineEvent('roadmap_pipeline_rendered_degraded',{
        roadmapId:S.execution?.id||'',
        stageCount:getExecutionStages().length||(Array.isArray(S.roadmap)?S.roadmap.length:0),
        activeStageId:getExecutionStage(getExecutionActiveStageIndex())?.id||'',
        activeStageIndex:getExecutionActiveStageIndex(),
        errorMessage:String(pipelineResult?.errorMessage||''),
        degradedStage:String(pipelineResult?.degradedStage||'')
      });
      toast2('Roadmap готов','Roadmap показан в degraded mode.');
    }else{
      toast2('Roadmap готов',`Построен план на ${weeksCount} нед.`);
    }
  }catch(e){
    if(isAbortError(e)||!isRoadmapPipelineActive(pipelineId)) return;
    const hasSkeleton=Array.isArray(S.roadmap)&&S.roadmap.length>0;
    logRoadmapPipelineEvent(hasSkeleton?'roadmap_pipeline_failed_post_generation':'roadmap_pipeline_failed_rebuild',{
      roadmapId:S.execution?.id||'',
      stageCount:getExecutionStages().length||(Array.isArray(S.roadmap)?S.roadmap.length:0),
      activeStageId:getExecutionStage(getExecutionActiveStageIndex())?.id||'',
      activeStageIndex:getExecutionActiveStageIndex(),
      errorMessage:String(e?.message||'')
    });
    if(hasSkeleton){
      logRoadmapPipelineEvent('roadmap_pipeline_degraded_fallback_applied',{
        roadmapId:S.execution?.id||'',
        stageCount:getExecutionStages().length||(Array.isArray(S.roadmap)?S.roadmap.length:0),
        activeStageId:getExecutionStage(getExecutionActiveStageIndex())?.id||'',
        activeStageIndex:getExecutionActiveStageIndex(),
        errorMessage:'rebuild_post_generation_exception_ui_kept_using_existing_skeleton'
      });
      try{
        if(!getExecutionStages().length) initializeExecutionFromRoadmap({resetVisibleTasks:true});
        saveAll();
        renderRM();
        updRoadmapProgress();
      }catch(_degradedError){}
      toast2('Roadmap готов','Roadmap показан в degraded mode.');
      return;
    }
    if(previousRoadmap){
      S.roadmap=previousRoadmap;
      S.execution=previousExecution;
      ensureExecutionState();
      renderRM();
      updRoadmapProgress();
    }else{
      rb.innerHTML='<div style="padding:30px;font-family:var(--mono);color:var(--red);font-size:12px">⚠ Roadmap generation failed. Please retry.</div>';
    }
    toast2('Roadmap generation failed',mapGeminiErrorMessage(e,'roadmap'));
  }finally{
    if(!isRoadmapPipelineActive(pipelineId)) return;
    activeRoadmapPipelineId=null;
    activeRoadmapAbortController=null;
    roadmapRequestInFlight=false;
    setRoadmapButtonsBusy(false);
  }
}
function renderRM(){
  if(!S.roadmap||!S.roadmap.length)return;
  ensureExecutionState();
  const rb=document.getElementById('rb');
  const strip=document.getElementById('rm-milestone-strip');
  const detail=document.getElementById('rm-detail-panel');
  const activeIndex=getRoadmapActiveIndex();
  const lastIndex=S.roadmap.length-1;
  if(focusedRoadmapStageIndex===null||focusedRoadmapStageIndex===undefined) focusedRoadmapStageIndex=activeIndex;
  focusedRoadmapStageIndex=Math.max(0,Math.min(lastIndex,focusedRoadmapStageIndex));
  if(openRoadmapMilestoneIndex!==null&&openRoadmapMilestoneIndex!==undefined){
    openRoadmapMilestoneIndex=Math.max(0,Math.min(lastIndex,openRoadmapMilestoneIndex));
  }
  const focusedMilestone=S.roadmap[focusedRoadmapStageIndex]||{};
  const focusedStage=getExecutionStage(focusedRoadmapStageIndex);
  const focusedPct=getRoadmapStagePct(focusedRoadmapStageIndex);
  const focusedStatus=getRoadmapStageStatus(focusedRoadmapStageIndex);
  const focusTasks=getTasksForStage(focusedRoadmapStageIndex,{includeArchived:false});
  const focusDoneCount=focusTasks.filter((task)=>task.status==='done'||task.done).length;
  const focusTotal=(focusedMilestone?.days||[]).length;
  const stageRelatedTasks=getRoadmapRelatedTasks(activeIndex).slice(0,8);
  const completedStages=getExecutionStages().length
    ? getExecutionStages().filter((stage)=>stage.status==='completed').length
    : Math.min(activeIndex,S.roadmap.length);
  const timelineProgress=totalPct();
  const focusStatusLabel=focusedStatus==='done'?'Completed':focusedStatus==='active'?'Active':'Upcoming';
  const focusTitle=(focusedStage?.title||focusedMilestone.title||`Stage ${focusedRoadmapStageIndex+1}`);
  const focusObjective=getStageObjectiveText(focusedStage||focusedMilestone)||'Execution objective not specified yet.';
  const focusOutcome=getStageOutcomeText(focusedStage||focusedMilestone);
  const focusReasoning=getStageReasoningText(focusedStage||focusedMilestone);
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'renderRM',
    action:'roadmap_render_payload',
    activeStageIndex:activeIndex,
    stageCount:S.roadmap.length,
    stages:summarizeRoadmapStagesForLog(getExecutionStages().length?getExecutionStages():S.roadmap)
  });
  const timelineMeta=`${S.roadmap.length} stages · ${completedStages} completed · Active stage ${activeIndex+1}`;
  if(strip){
    strip.innerHTML=`<div class="rm-timeline-track">
      <div class="rm-timeline-track-fill" style="width:${timelineProgress}%"></div>
    </div>
    <div class="rm-node-row">
      ${S.roadmap.map((wk,i)=>{
      const status=getRoadmapStageStatus(i);
      const isSelected=focusedRoadmapStageIndex===i;
      const timelineStage=getExecutionStage(i);
      return `<button class="rm-timeline-node ${status} ${isSelected?'selected':''}" onclick="focusRoadmapStage(${i})" aria-label="Focus stage ${i+1}">
        <span class="rm-node-dot">${status==='done'?'✓':''}</span>
        <span class="rm-node-label">STAGE ${wk.week||i+1}</span>
        <span class="rm-node-title">${escHtml(timelineStage?.title||wk.title||`Stage ${i+1}`)}</span>
      </button>`;
    }).join('')}
    </div>`;
  }
  if(detail){
    if(openRoadmapMilestoneIndex===null) detail.style.display='none';
    else{
      detail.style.display='';
      detail.innerHTML=buildRoadmapDetailPanel(openRoadmapMilestoneIndex);
    }
  }
  let html=`<div class="rm-stage-focus" id="rm-focus-panel">
    <div class="rm-focus-left">
      <div class="rm-focus-kicker">${focusedStatus==='active'?'FOCUSING PHASE':'STAGE OVERVIEW'}</div>
      <h2 class="rm-focus-title">${escHtml(focusTitle)}</h2>
      <p class="rm-focus-copy">${escHtml(focusObjective)}${focusOutcome?` · Outcome: ${escHtml(focusOutcome)}`:''}</p>
      ${focusReasoning?`<p class="rm-focus-copy"><strong>Why this stage matters:</strong> ${escHtml(focusReasoning)}</p>`:''}
      <div class="rm-focus-actions">
        <button class="btn btn-ghost btn-sm" onclick="toggleRoadmapMilestone(${focusedRoadmapStageIndex})">${openRoadmapMilestoneIndex===focusedRoadmapStageIndex?'Hide Milestone Detail':'Open Milestone Detail'}</button>
        ${focusedRoadmapStageIndex===activeIndex?'<button class="btn btn-primary btn-sm" onclick="openExecutionTasks()">Open Execution Tasks →</button>':''}
      </div>
    </div>
    <div class="rm-focus-right">
      <div class="rm-focus-progress-head">
        <div>
          <div class="rm-focus-metric-label">Completion</div>
          <div class="rm-focus-progress-value">${focusedPct}%</div>
        </div>
        <div class="rm-focus-meta">
          <span>${focusTasks.length?`${focusDoneCount}/${focusTasks.length} tasks`:`${focusDoneCount}/${focusTotal||0} criteria`}</span>
          <span>${escHtml(getRoadmapTargetDate(focusedRoadmapStageIndex,S.roadmap.length))}</span>
          <span>${focusStatusLabel}</span>
        </div>
      </div>
      <div class="rm-focus-track"><div class="rm-focus-fill" style="width:${focusedPct}%"></div></div>
      <div class="rm-stage-task-list">
        ${stageRelatedTasks.length?stageRelatedTasks.map((item,idx)=>`<div class="rm-stage-task ${idx===0?'primary':''} ${item.taskId?'clickable':''}" ${item.taskId?`onclick="openTaskDetail(${item.taskId})"`:''}>
          <div class="rm-stage-task-title">${escHtml(item.title)}</div>
          <div class="rm-stage-task-meta">${escHtml(item.meta)}${item.taskId?' · open details':''}</div>
        </div>`).join(''):'<div class="rm-stage-task"><div class="rm-stage-task-title">No linked tasks yet</div><div class="rm-stage-task-meta">This stage has no mapped criteria.</div></div>'}
      </div>
    </div>
  </div>
  ${S.roadmap.map((_,i)=>`<div id="rm-stage-${i}" class="rm-stage-anchor" aria-hidden="true"></div>`).join('')}
  <div class="rm-bottom-strip">
    <div class="rm-bottom-label">SYSTEM STATUS</div>
    <div class="rm-bottom-meta">${escHtml(timelineMeta)}</div>
    <div class="rm-bottom-meta">${S.progress.sessions} sessions · ${S.progress.tasksDone||0} tasks shipped</div>
    <div class="rm-bottom-meta">TARGET ${escHtml(getRoadmapTargetDate(activeIndex,S.roadmap.length)).toUpperCase()}</div>
  </div>`;
  rb.innerHTML=html;
  document.getElementById('rm-span').textContent=`Plan for ${S.roadmap.length} stages · Active stage ${Math.min(activeIndex+1,S.roadmap.length)}`;
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
    const recentHistory=S.chatHistory.slice(-12).map(m=>`${m.role==='user'?'Пользователь':'Ассистент'}: ${clipText(m.content,300)}`);
    const history=recentHistory.join('\n\n');
    const reply=await gemini(history,sysp(),700,{},'chat');
    S.chatHistory.push({role:'ai',content:reply});renderChatMsgs();saveAll();
  }catch(e){S.chatHistory.push({role:'ai',content:'⚠ Ошибка: '+e.message});renderChatMsgs();}
}

/* ══ TASKS ══ */
let taskFilter='all',aiTasksDraft=null,activeTaskDetailId=null,taskDetailEscBound=false;
function getTaskById(id){
  const canonical=getExecutionTaskById(id);
  if(canonical){
    return {
      ...canonical,
      done:Boolean(canonical.done)||canonical.status==='done',
      linkedStage:Math.max(1,(Number(canonical.linkedStageIndex)||0)+1),
      text:getTaskTitle(canonical)
    };
  }
  return (S.tasks||[]).find(t=>Number(t.id)===Number(id));
}
function getActiveStageTasks(){
  ensureExecutionState();
  if(!hasExecutionStateReady()) return [];
  return getTasksForStage(getExecutionActiveStageIndex(),{includeArchived:false});
}
function getTasksForStageById(stageId){
  ensureExecutionState();
  if(!hasExecutionStateReady()) return [];
  const stages=getExecutionStages();
  const idx=stages.findIndex((stage)=>String(stage.id)===String(stageId));
  if(idx<0) return [];
  return getTasksForStage(idx,{includeArchived:false});
}
function stageStatusLabel(status){
  if(status==='completed') return 'Completed';
  if(status==='active') return 'Active';
  return 'Locked';
}
function renderActiveMilestoneHeader(){
  const titleEl=document.getElementById('task-stage-title');
  const metaEl=document.getElementById('task-stage-meta');
  if(!titleEl||!metaEl) return;
  ensureExecutionState();
  if(!hasExecutionStateReady()){
    titleEl.textContent='No active milestone';
    metaEl.textContent='Generate a roadmap to start milestone execution.';
    return;
  }
  const activeIndex=getExecutionActiveStageIndex();
  const stage=getExecutionStage(activeIndex);
  if(!stage){
    titleEl.textContent='No active milestone';
    metaEl.textContent='Generate a roadmap to start milestone execution.';
    return;
  }
  const stageTasks=getTasksForStage(activeIndex,{includeArchived:false});
  const doneCount=stageTasks.filter((task)=>task.status==='done'||task.done).length;
  const totalCount=stageTasks.length;
  const objectiveText=getStageObjectiveText(stage);
  const outcomeText=getStageOutcomeText(stage);
  titleEl.textContent=`Active milestone: ${stage.title||`Stage ${activeIndex+1}`}`;
  metaEl.textContent=`${stageStatusLabel(stage.status)} · ${doneCount}/${totalCount} tasks done · ${clipText(objectiveText||outcomeText||'',120)||'Objective pending'}`;
}
function focusTaskInput(){document.getElementById('task-input').focus();}
function ensureTaskDetailBindings(){
  if(taskDetailEscBound) return;
  window.addEventListener('keydown',(event)=>{
    if(event.key==='Escape') closeTaskDetail(true);
  });
  taskDetailEscBound=true;
}
function openTaskDetail(id){
  ensureTaskDetailBindings();
  const task=getTaskById(id);
  if(!task){toast2('Task not found','Reload tasks and try again.');return;}
  activeTaskDetailId=task.id;
  renderTaskDetail();
}
function closeTaskDetail(silent=false){
  activeTaskDetailId=null;
  const overlay=document.getElementById('task-detail-overlay');
  if(overlay) overlay.classList.remove('on');
  document.body.classList.remove('task-detail-open');
  if(!silent){
    const content=document.getElementById('task-detail-content');
    if(content) content.innerHTML='';
  }
}
function onTaskDetailOverlayClick(event){
  if(event.target&&event.target.id==='task-detail-overlay') closeTaskDetail();
}
function renderTaskDetail(){
  const overlay=document.getElementById('task-detail-overlay');
  const content=document.getElementById('task-detail-content');
  if(!overlay||!content) return;
  const task=getTaskById(activeTaskDetailId);
  if(!task){closeTaskDetail(true);return;}
  const stageIndex=Math.max(0,Number(task.linkedStageIndex??(Number(task.linkedStage)||1)-1)||0);
  const stage=getExecutionStage(stageIndex);
  const stageLabel=`Stage ${stageIndex+1}`;
  const stageTitle=escHtml(stage?.title||task.stageTitle||'Milestone');
  const statusLabel=task.done?'Done':'Active';
  const deadlineLabel=task.deadline?escHtml(task.deadline):'Not set';
  const description=escHtml(task.description||'Открой задачу и зафиксируй план выполнения.');
  const whyItMatters=escHtml(task.whyItMatters||'Связь с текущей фазой должна быть явно подтверждена.');
  const deliverable=escHtml(task.deliverable||'Конкретный артефакт или измеримый результат.');
  const doneDefinition=escHtml(task.doneDefinition||'Есть проверяемый результат, который можно показать команде.');
  const stageObjective=escHtml(clipText(stage?.objective||task.stageObjective||'',180)||'Objective не указан.');
  content.innerHTML=`<div class="task-detail-headline">
      <div>
        <div class="task-detail-kicker">Execution Task</div>
        <div class="task-detail-title" id="task-detail-title">${escHtml(getTaskTitle(task))}</div>
      </div>
      <button class="task-detail-close" onclick="closeTaskDetail()" aria-label="Close task detail">✕</button>
    </div>
    <div class="task-detail-meta">
      <span class="task-detail-chip">${statusLabel}</span>
      <span class="task-detail-chip prio-${normalizeTaskPrio(task.prio)}">${escHtml(taskPrioLabel(task.prio))}</span>
      <span class="task-detail-chip">${deadlineLabel}</span>
      <span class="task-detail-chip">${escHtml(stageLabel)}</span>
      <span class="task-detail-chip">${stageTitle}</span>
    </div>
    <div class="task-detail-section">
      <div class="task-detail-label">Description</div>
      <p>${description}</p>
    </div>
    <div class="task-detail-section">
      <div class="task-detail-label">Why This Matters</div>
      <p>${whyItMatters}</p>
    </div>
    <div class="task-detail-section">
      <div class="task-detail-label">Expected Deliverable</div>
      <p>${deliverable}</p>
    </div>
    <div class="task-detail-section">
      <div class="task-detail-label">Done Definition</div>
      <p>${doneDefinition}</p>
    </div>
    <div class="task-detail-section">
      <div class="task-detail-label">Linked Stage Objective</div>
      <p>${stageObjective}</p>
    </div>`;
  overlay.classList.add('on');
  document.body.classList.add('task-detail-open');
}
function addTask(){
  ensureExecutionState();
  if(!hasExecutionStateReady()){
    toast2('Roadmap required','Generate roadmap before adding milestone tasks.');
    return;
  }
  const taskInput=document.getElementById('task-input');
  const title=taskInput?.value.trim();
  if(!title) return;
  const prio=normalizeTaskPrio(document.getElementById('task-prio')?.value||'med');
  const stageIndex=getExecutionActiveStageIndex();
  const stage=getExecutionStage(stageIndex)||S.roadmap?.[stageIndex]||S.roadmap?.[0]||{};
  const created=new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'});
  const normalized=normalizeTaskCollection([{
    id:Date.now(),
    title,
    priority:prio,
    description:`Выполнить задачу "${title}" и зафиксировать результат для текущей фазы.`,
    why_it_matters:'Поддерживает темп выполнения roadmap и снижает риск отклонения от objective.',
    deliverable:'Проверяемый артефакт или измеримый output.',
    done_definition:'Есть конкретный результат и короткая фиксация в системе.',
    deadline:'',
    linked_stage:stageIndex+1,
    stageObjective:stage?.objective||'',
    done:false,
    created
  }],{
    stageIndex,
    stageTitle:stage?.title||'Stage 1',
    stageObjective:stage?.objective||'',
    deadline:S.user.deadline||''
  })[0];
  const persisted=normalizeExecutionTask({
    ...normalized,
    linkedStageId:stage.id,
    linkedStageIndex:stageIndex,
    roadmapId:S.execution?.id||''
  },stage);
  persisted.id=Number(persisted.id)||nextExecutionTaskId();
  const key=String(persisted.id);
  if(S.execution.tasksById[key]){
    persisted.id=nextExecutionTaskId();
  }
  S.execution.tasksById[String(persisted.id)]=persisted;
  detachTaskFromOtherStages(persisted.id,stageIndex);
  if(!Array.isArray(stage.taskIds)) stage.taskIds=[];
  stage.taskIds=[persisted.id,...stage.taskIds.filter((id)=>Number(id)!==Number(persisted.id))];
  stage.tasksGenerated=true;
  stage.tasksGeneratedAt=stage.tasksGeneratedAt||nowIso();
  S.execution.updatedAt=nowIso();
  refreshExecutionProgress();
  syncActiveTasksFromExecution();
  if(taskInput) taskInput.value='';
  saveTasks();
  saveAll();
  renderTasks();
  updTaskBadge();
  updMilestoneBar();
  updRoadmapProgress();
  const metricTasks=document.getElementById('m-tasks');
  if(metricTasks) metricTasks.textContent=S.progress.tasksDone;
  trackEvent('add_task');
}
function renderTasks(){
  ensureTaskDetailBindings();
  ensureExecutionState();
  syncActiveTasksFromExecution();
  renderActiveMilestoneHeader();
  const el=document.getElementById('task-list');if(!el)return;
  let f=S.tasks||[];
  if(taskFilter==='active')f=f.filter(t=>!t.done);
  else if(taskFilter==='done')f=f.filter(t=>t.done);
  else if(taskFilter==='high')f=f.filter(t=>normalizeTaskPrio(t.prio)==='high'&&!t.done);
  const cnt=getActiveStageTasks().filter((task)=>!task.done&&task.status!=='done').length;
  const sub=document.getElementById('task-count-sub');if(sub)sub.textContent=cnt>0?`(${cnt} active)`:'';
  if(!f.length){
    const activeIndex=getExecutionActiveStageIndex();
    const status=resolveStageTaskStatus(activeIndex);
    if(status==='loading'){
      el.innerHTML='<div class="task-empty"><span class="task-empty-icon">⏳</span>Генерируем задачи для активного этапа…</div>';
      return;
    }
    if(status==='error'){
      el.innerHTML='<div class="task-empty"><span class="task-empty-icon">⚠</span>Не удалось сгенерировать задачи. <button class="btn btn-ghost btn-sm" onclick="retryActiveStageTaskGeneration()">Повторить</button></div>';
      return;
    }
    el.innerHTML='<div class="task-empty"><span class="task-empty-icon">☑</span>Задач здесь пока нет</div>';
    return;
  }
  el.innerHTML=f.map(t=>{
    const prio=normalizeTaskPrio(t.prio);
    const support=clipText(getTaskSupportLine(t)||'Открой задачу, чтобы увидеть полный execution-brief.',120);
    const stageLabel=`Stage ${Math.max(1,(Number(t.linkedStageIndex)||0)+1)}`;
    const status=t.done?'DONE':'ACTIVE';
    return `<div class="task-item ${t.done?'done-item':''}" onclick="openTaskDetail(${t.id})">
      <button class="task-cb ${t.done?'checked':''}" onclick="event.stopPropagation();toggleTask(${t.id})" aria-label="${t.done?'Mark as active':'Mark as done'}"></button>
      <div class="task-body">
        <div class="task-head-row">
          <div class="task-text">${escHtml(getTaskTitle(t))}</div>
          <span class="task-prio ${prio}">${escHtml(taskPrioLabel(prio))}</span>
        </div>
        <div class="task-support">${escHtml(support)}</div>
        <div class="task-meta">
          <span class="task-date">${t.deadline?`📅 ${escHtml(t.deadline)}`:'📅 No deadline'}</span>
          <span class="task-date">${escHtml(stageLabel)}</span>
          <span class="task-date">${status}</span>
        </div>
      </div>
      <button class="task-del" onclick="event.stopPropagation();deleteTask(${t.id})" aria-label="Delete task">✕</button>
    </div>`;
  }).join('');
}
async function toggleTask(id){
  ensureExecutionState();
  if(!hasExecutionStateReady()) return;
  const t=getTaskById(id);
  if(!t) return;
  const canonical=getExecutionTaskById(t.id);
  if(!canonical) return;
  const currentlyDone=Boolean(canonical.done)||canonical.status==='done';
  canonical.done=!currentlyDone;
  canonical.status=canonical.done?'done':'active';
  canonical.completedAt=canonical.done?nowIso():'';
  S.execution.updatedAt=nowIso();
  refreshExecutionProgress();
  syncActiveTasksFromExecution();
  saveTasks();
  saveAll();
  renderTasks();
  updTaskBadge();
  const metricTasks=document.getElementById('m-tasks');
  if(metricTasks) metricTasks.textContent=S.progress.tasksDone;
  const mb=document.getElementById('m-tasks-bar');
  if(mb)mb.style.width=Math.min(100,S.progress.tasksDone*5)+'%';
  updMilestoneBar();
  updRoadmapProgress();
  if(S.roadmap) renderRM();
  await maybeAutoAdvanceRoadmapStage();
  syncActiveTasksFromExecution();
  renderTasks();
  if(S.roadmap) renderRM();
  if(activeTaskDetailId===Number(id)) renderTaskDetail();
}
function deleteTask(id){
  ensureExecutionState();
  if(!hasExecutionStateReady()) return;
  const task=getTaskById(id);
  if(!task) return;
  const stageIndex=Math.max(0,Number(task.linkedStageIndex)||0);
  const stage=getExecutionStage(stageIndex);
  const canonical=getExecutionTaskById(task.id);
  if(canonical){
    canonical.status='archived';
    canonical.done=false;
    canonical.completedAt='';
  }
  if(stage&&Array.isArray(stage.taskIds)){
    stage.taskIds=stage.taskIds.filter((taskId)=>Number(taskId)!==Number(task.id));
  }
  S.execution.updatedAt=nowIso();
  refreshExecutionProgress();
  syncActiveTasksFromExecution();
  if(activeTaskDetailId===Number(id)) closeTaskDetail();
  saveTasks();
  saveAll();
  renderTasks();
  updTaskBadge();
  updMilestoneBar();
  updRoadmapProgress();
  if(S.roadmap) renderRM();
}
function filterTasks(f,btn){taskFilter=f;document.querySelectorAll('.ftab').forEach(b=>b.classList.remove('on'));btn.classList.add('on');renderTasks();}
function retryActiveStageTaskGeneration(){
  initializeTasksForActiveStage({force:true,silentFallback:false,reason:'manual_retry'}).catch(()=>{});
}
function updTaskBadge(){const c=(S.tasks||[]).filter(t=>!t.done).length;const b=document.getElementById('task-badge');if(b){b.textContent=c;b.style.display=c>0?'':'none';}}
function saveTasks(){
  if(!canPersistUserData()) return;
  try{
    const snapshot=isExecutionStateObject(S.execution)
      ? getAllExecutionTasks()
        .filter((task)=>task.status!=='archived')
        .map((task)=>({
          ...task,
          linkedStage:Number(task.linkedStageIndex||0)+1,
          done:Boolean(task.done)||task.status==='done'
        }))
      : (S.tasks||[]);
    localStorage.setItem('sa_tasks',JSON.stringify(snapshot));
    localStorage.setItem('sa_context_summary',refreshContextSummary());
  }catch(e){}
}
function loadTasks(){
  if(!canPersistUserData()){S.tasks=[];return;}
  const stageIndex=getRoadmapActiveIndex();
  const stage=S.roadmap?.[stageIndex]||S.roadmap?.[0]||{};
  try{
    const raw=JSON.parse(localStorage.getItem('sa_tasks')||'[]');
    if(isExecutionStateObject(S.execution)){
      syncActiveTasksFromExecution();
    }else{
      S.tasks=normalizeTaskCollection(raw,{
        stageIndex,
        stageTitle:stage?.title||'Stage 1',
        stageObjective:stage?.objective||'',
        deadline:S.user.deadline||''
      }).map((task)=>({
        ...task,
        linkedStage:1,
        linkedStageIndex:0
      }));
    }
  }catch(e){
    S.tasks=[];
  }
  S.progress.tasksDone=(S.tasks||[]).filter(task=>task.done).length;
}
async function aiEditTasks(){
  const tasks=S.tasks||[];
  if(!tasks.length){toast2('Нет задач','Сначала добавь задачи');return;}
  const activeIndex=getExecutionActiveStageIndex();
  const activeStage=getExecutionStage(activeIndex)||S.roadmap?.[activeIndex]||S.roadmap?.[0]||{};
  const bar=document.getElementById('tasks-ai-bar');
  const txt=document.getElementById('tasks-ai-txt');
  bar.style.display='';
  txt.innerHTML='<span class="spin-sm"></span> Анализирую задачи через Gemini…';
  document.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{
    const scoped=sampleTasksForAudit(tasks);
    const existingById=new Map(tasks.map(task=>[Number(task.id),task]));
    const revisedSubset=normalizeAiTasks(
      await geminiJSON(buildTaskAuditPrompt(scoped.sample,scoped.total),taskAuditResponseJsonSchema(),700,sysp(),{temperature:0.2},'task_audit'),
      {
        existingById,
        stageObjective:activeStage?.objective||'',
        stageTitle:activeStage?.title||'Stage 1',
        deadline:S.user.deadline||''
      }
    );
    const revisedById=new Map(revisedSubset.map(task=>[task.id,task]));
    const untouched=tasks.filter(task=>!revisedById.has(task.id));
    aiTasksDraft=normalizeTaskCollection([...revisedSubset,...untouched],{
      stageIndex:activeIndex,
      stageTitle:activeStage?.title||'Stage 1',
      stageObjective:activeStage?.objective||'',
      deadline:S.user.deadline||''
    });
    txt.textContent=`Обновлена выборка ${revisedSubset.length} из ${tasks.length} задач. Нажми Apply, чтобы применить.`;
  }catch(e){
    txt.textContent='⚠ Ошибка: '+e.message;
  }
  document.querySelectorAll('button').forEach(b=>b.disabled=false);
}
function applyAiTasks(){
  if(!aiTasksDraft)return;
  ensureExecutionState();
  if(!hasExecutionStateReady()) return;
  const stageIndex=getExecutionActiveStageIndex();
  const stage=getExecutionStage(stageIndex)||S.roadmap?.[stageIndex]||S.roadmap?.[0]||{};
  const normalized=normalizeTaskCollection(aiTasksDraft,{
    stageIndex,
    stageTitle:stage?.title||'Stage 1',
    stageObjective:stage?.objective||'',
    deadline:S.user.deadline||''
  });
  setStageTasks(stageIndex,normalized,{replace:true});
  saveTasks();
  saveAll();
  renderTasks();
  updTaskBadge();
  updMilestoneBar();
  updRoadmapProgress();
  if(S.roadmap) renderRM();
  if(activeTaskDetailId) renderTaskDetail();
  document.getElementById('tasks-ai-bar').style.display='none';
  aiTasksDraft=null;
  toast2('Задачи обновлены','');
}

/* ══ GOALS ══ */
function addGoal(){document.getElementById('goal-form').style.display='flex';}
function saveGoal(){const t=document.getElementById('goal-title-input').value.trim();if(!t)return;const g={id:Date.now(),title:t,deadline:document.getElementById('goal-deadline-input').value,desc:document.getElementById('goal-desc-input').value.trim(),pct:0};S.goals=S.goals||[];S.goals.unshift(g);document.getElementById('goal-title-input').value='';document.getElementById('goal-desc-input').value='';document.getElementById('goal-form').style.display='none';saveGoals();renderGoals();toast2('Цель добавлена','');}
function renderGoals(){const el=document.getElementById('goal-list');if(!el)return;if(!(S.goals||[]).length){el.innerHTML='<div class="task-empty"><span class="task-empty-icon">◎</span>Целей пока нет</div>';return;}el.innerHTML=(S.goals||[]).map(g=>`<div class="goal-card"><div class="goal-card-progress"><div class="goal-card-fill" style="width:${g.pct||0}%"></div></div><div class="goal-card-body"><div class="goal-card-title" contenteditable="true" onblur="editGoalField(${g.id},'title',this.textContent)">${escHtml(g.title)}</div><div class="goal-card-desc" contenteditable="true" onblur="editGoalField(${g.id},'desc',this.textContent)">${escHtml(g.desc||'Добавь описание…')}</div><div class="goal-card-meta">${g.deadline?`<span class="goal-tag-item">📅 ${g.deadline}</span>`:''}<span class="goal-tag-item">Готово: ${g.pct||0}%</span></div></div><div class="goal-card-footer"><input class="goal-pct-in" type="number" min="0" max="100" value="${g.pct||0}" onchange="updateGoalPct(${g.id},this.value)"/> % <span style="font-family:var(--mono);font-size:10px;color:var(--muted);margin-left:4px">прогресс</span><button class="btn btn-danger btn-sm" onclick="deleteGoal(${g.id})" style="margin-left:auto">Удалить</button></div></div>`).join('');}
function editGoalField(id,f,val){const g=(S.goals||[]).find(g=>g.id===id);if(g&&val.trim()&&val.trim()!=='Добавь описание…'){g[f]=val.trim();saveGoals();}}
function updateGoalPct(id,val){const g=(S.goals||[]).find(g=>g.id===id);if(g){g.pct=Math.min(100,Math.max(0,parseInt(val)||0));saveGoals();renderGoals();}}
function deleteGoal(id){if(!confirm('Delete?'))return;S.goals=(S.goals||[]).filter(g=>g.id!==id);saveGoals();renderGoals();}
function saveGoals(){if(!canPersistUserData()) return;try{localStorage.setItem('sa_goals',JSON.stringify(S.goals||[]));localStorage.setItem('sa_context_summary',refreshContextSummary());}catch(e){}}
function loadGoals(){if(!canPersistUserData()){S.goals=[];return;}try{S.goals=JSON.parse(localStorage.getItem('sa_goals')||'[]');}catch(e){S.goals=[];}}
async function aiReviewGoals(){const goals=S.goals||[];if(!goals.length){toast2('Нет целей','Сначала добавь цели');return;}const bar=document.getElementById('goals-ai-bar'),txt=document.getElementById('goals-ai-txt');bar.style.display='';txt.innerHTML='<span class="spin-sm"></span> Разбираю цели через Gemini…';try{const reply=await gemini(buildGoalsReviewPrompt(goals),sysp(),500,{},'goals_review');txt.textContent=reply;}catch(e){txt.textContent='⚠ '+e.message;}}

/* ══ NOTES ══ */
let activeNoteId=null,aiNoteDraft=null,autoSaveTimer=null;
function addNote(){const n={id:Date.now(),title:'Untitled Note',body:'',updated:new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'})};S.notes=S.notes||[];S.notes.unshift(n);saveNotes();renderNoteList();openNote(n.id);}
function openNote(id){activeNoteId=id;const n=(S.notes||[]).find(n=>n.id===id);if(!n)return;document.getElementById('note-title').value=n.title;document.getElementById('note-body').value=n.body;renderNoteList();}
function autoSaveNote(){clearTimeout(autoSaveTimer);autoSaveTimer=setTimeout(()=>saveCurrentNote(true),800);}
function saveCurrentNote(silent=false){if(!activeNoteId)return;const n=(S.notes||[]).find(n=>n.id===activeNoteId);if(n){n.title=document.getElementById('note-title').value.trim()||'Untitled';n.body=document.getElementById('note-body').value;n.updated=new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'});saveNotes();renderNoteList();if(!silent)toast2('Note saved','');}}
function deleteCurrentNote(){if(!activeNoteId||!confirm('Delete?'))return;S.notes=(S.notes||[]).filter(n=>n.id!==activeNoteId);activeNoteId=null;document.getElementById('note-title').value='';document.getElementById('note-body').value='';saveNotes();renderNoteList();}
function renderNoteList(){const el=document.getElementById('note-list');if(!el)return;const n=S.notes||[];if(!n.length){el.innerHTML='<div style="padding:14px;font-family:var(--mono);font-size:11px;color:var(--muted);text-align:center">No notes yet</div>';return;}el.innerHTML=n.map(x=>`<div class="note-item ${x.id===activeNoteId?'active':''}" onclick="openNote(${x.id})"><div class="note-item-title">${escHtml(x.title)}</div><div class="note-item-preview">${escHtml((x.body||'').substring(0,60))}</div><div class="note-item-date">${x.updated||''}</div></div>`).join('');}
function saveNotes(){if(!canPersistUserData()) return;try{localStorage.setItem('sa_notes',JSON.stringify(S.notes||[]));localStorage.setItem('sa_context_summary',refreshContextSummary());}catch(e){}}
function loadNotes(){if(!canPersistUserData()){S.notes=[];return;}try{S.notes=JSON.parse(localStorage.getItem('sa_notes')||'[]');}catch(e){S.notes=[];}}
async function aiProcessNote(){const body=document.getElementById('note-body').value.trim();if(!body){toast2('Пустая заметка','');return;}const bar=document.getElementById('notes-ai-bar'),txt=document.getElementById('notes-ai-txt');bar.style.display='';txt.innerHTML='<span class="spin-sm"></span> Привожу заметку в порядок…';try{const reply=await gemini(buildNoteProcessPrompt(body),sysp(),700,{},'note_process');aiNoteDraft=reply;txt.textContent='Готово. Нажми Apply, чтобы заменить текущую заметку.';}catch(e){txt.textContent='⚠ '+e.message;}}
function applyAiNote(){if(!aiNoteDraft)return;document.getElementById('note-body').value=aiNoteDraft;saveCurrentNote();document.getElementById('notes-ai-bar').style.display='none';aiNoteDraft=null;toast2('Note updated','');}

/* ══ SETTINGS ══ */
function openExecutionTasks(){gp('work');switchWorkTab('tasks');}

/* ══ BILLING ══ */
function renderBillingBtns(){const plan=S.billing.plan;const freeBtn=document.getElementById('free-btn');if(freeBtn)freeBtn.textContent=plan==='free'?'✓ Current Plan':'Downgrade';}
function initPayPal(planKey,containerId){if(PAYPAL_CLIENT_ID==='YOUR_PAYPAL_CLIENT_ID_HERE'){toast2('PayPal not configured','See billing section setup guide');return;}if(S.paypalLoaded){_renderPayPalBtn(planKey,containerId);return;}const script=document.createElement('script');script.src=`${PAYPAL_SDK_URL}?client-id=${PAYPAL_CLIENT_ID}&vault=true&intent=subscription`;script.onload=()=>{S.paypalLoaded=true;_renderPayPalBtn(planKey,containerId);};document.head.appendChild(script);}
function _renderPayPalBtn(planKey,containerId){const planId=planKey==='pro'?PLAN_PRO:PLAN_TEAM;const el=document.getElementById(containerId);if(!el)return;el.innerHTML='<div id="pp-inner-'+containerId+'"></div>';try{paypal.Buttons({style:{shape:'rect',color:'blue',layout:'vertical',label:'subscribe'},createSubscription:(data,actions)=>actions.subscription.create({'plan_id':planId}),onApprove:(data)=>{S.billing.plan=planKey;S.billing.subscriptionId=data.subscriptionID;saveAll();applyUserToUI();renderBillingBtns();toast2('Upgraded! 🎉','');}}).render('#pp-inner-'+containerId);}catch(e){el.innerHTML='<div style="font-family:var(--mono);font-size:11px;color:var(--red);padding:8px">PayPal error: '+escHtml(String(e))+'</div>';}}

/* ══ ANALYTICS ══ */
let analyticsRangeDays=30;
function trackEvent(name){if(!canPersistUserData()) return;try{const events=JSON.parse(localStorage.getItem('sa_events')||'[]');events.push({event:name,ts:Date.now(),date:new Date().toDateString(),hour:new Date().getHours()});if(events.length>3000)events.splice(0,events.length-3000);localStorage.setItem('sa_events',JSON.stringify(events));const visits=JSON.parse(localStorage.getItem('sa_analytics_visits')||'{}');const day=new Date().toDateString();visits[day]=(visits[day]||0)+1;localStorage.setItem('sa_analytics_visits',JSON.stringify(visits));}catch(e){}}
function analyticsRange(days,btn){analyticsRangeDays=days;document.querySelectorAll('#pg-analytics .btn-ghost.btn-sm').forEach(b=>{b.style.borderColor='';b.style.color='';});if(btn){btn.style.borderColor='var(--blue)';btn.style.color='var(--blue-l)';}renderAnalytics();}
function renderAnalytics(){
  if(!canPersistUserData()) return;
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

async function resetAllData(){
  if(!canPersistUserData()){
    toast2('Not signed in','Sign in before resetting account data.');
    return;
  }
  const ok=confirm('Reset all your account data? This only resets the current signed-in user.');
  if(!ok) return;
  clearCurrentUserDataStorage();
  await flushCloudWriteQueue();
  resetInMemoryState();
  const appScreen=document.getElementById('app');
  const obScreen=document.getElementById('ob');
  if(appScreen){
    appScreen.classList.remove('app-on');
    appScreen.style.display='none';
  }
  if(obScreen) obScreen.style.display='flex';
  obGo(0);
  toast2('Data reset','Your account workspace was reset.');
}

/* ══ QUICK LOGIN ══ */
function quickLogin(){
  authSignIn();
}

/* ══ INIT ══ */
document.addEventListener('DOMContentLoaded',async ()=>{
  await loadRuntimeConfig();
  initBetaDeadlineInput();
  enforceBetaOnboardingModes();
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
