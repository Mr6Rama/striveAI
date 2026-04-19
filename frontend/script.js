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
    .map(line=>line.replace(/^\d+\.\s*/,'').trim())
    .map((line)=>{
      if(!line) return null;
      const parts=line.split(/\s*\|\|\s*/).map((part)=>part.trim()).filter(Boolean);
      if(parts.length>=4){
        return {
          title:parts[0],
          objective:parts[1],
          outcome:parts[2],
          reasoning:parts.slice(3).join(' || ')
        };
      }
      if(parts.length>=3){
        return {
          title:parts[0],
          objective:parts[1],
          outcome:parts.slice(2).join(' || ')
        };
      }
      return parts[0]||null;
    })
    .filter(Boolean);
}
function normalizeTaskContractValue(value,maxLen=220){
  return clipText(String(value||'').replace(/\s+/g,' ').trim(),maxLen);
}
function normalizeTaskSkeletonTitle(value){
  const compact=String(value||'')
    .replace(/\s+/g,' ')
    .trim()
    .replace(/[.!?,;:]+$/g,'');
  if(!compact) return '';
  const words=compact.split(' ').filter(Boolean).slice(0,8);
  return clipText(words.join(' '),96);
}
function normalizePlainTextDeadline(value){
  const raw=String(value||'').trim().toLowerCase();
  if(!raw||raw==='none'||raw==='null'||raw==='нет'||raw==='n/a') return '';
  return /^\d{4}-\d{2}-\d{2}$/.test(raw)?raw:'';
}
function parseTaskSkeletonContract(raw){
  const text=String(raw||'').replace(/\r/g,'').trim();
  if(!text) return [];
  const lines=text
    .split('\n')
    .map((line)=>line.trim())
    .filter(Boolean);
  if(lines[0]!=='TASKS_SKELETON_START'||lines[lines.length-1]!=='TASKS_SKELETON_END') return [];
  const body=lines.slice(1,-1);
  if(!body.length) return [];
  const usableBody=body.slice(0,10);
  return usableBody.map((line,index)=>{
    const match=line.match(/^(\d+)\s*\|\s*(.+)$/i);
    if(!match) return null;
    const ordinal=Number(match[1]);
    if(ordinal!==index+1) return null;
    const title=normalizeTaskSkeletonTitle(match[2]);
    if(!title) return null;
    return {
      title,
      linkedStage:index+1
    };
  }).filter(Boolean);
}
function parseTaskDetailContract(raw){
  const text=String(raw||'').replace(/\r/g,'').trim();
  if(!text) return null;
  const lines=text
    .split('\n')
    .map((line)=>line.trim())
    .filter(Boolean);
  if(lines[0]!=='TASK_DETAIL_START') return null;
  const hasEndMarker=lines[lines.length-1]==='TASK_DETAIL_END';
  const body=hasEndMarker?lines.slice(1,-1):lines.slice(1);
  const parsed={};
  const seen=new Set();
  for(const line of body){
    if(line==='TASK_DETAIL_END') continue;
    let match=line.match(/^TITLE\s*\|\s*(.+)$/i);
    if(match){
      if(seen.has('title')) return null;
      seen.add('title');
      parsed.title=normalizeTaskContractValue(match[1],96);
      continue;
    }
    match=line.match(/^DESCRIPTION\s*\|\s*(.+)$/i);
    if(match){
      if(seen.has('description')) return null;
      seen.add('description');
      parsed.description=normalizeTaskContractValue(match[1],220);
      continue;
    }
    match=line.match(/^WHY\s*\|\s*(.+)$/i);
    if(match){
      if(seen.has('why_it_matters')) return null;
      seen.add('why_it_matters');
      parsed.why_it_matters=normalizeTaskContractValue(match[1],200);
      continue;
    }
    match=line.match(/^DELIVERABLE\s*\|\s*(.+)$/i);
    if(match){
      if(seen.has('deliverable')) return null;
      seen.add('deliverable');
      parsed.deliverable=normalizeTaskContractValue(match[1],200);
      continue;
    }
    match=line.match(/^DONE\s*\|\s*(.+)$/i);
    if(match){
      if(seen.has('done_definition')) return null;
      seen.add('done_definition');
      parsed.done_definition=normalizeTaskContractValue(match[1],200);
      continue;
    }
    match=line.match(/^PRIORITY\s*\|\s*(high|med|low)$/i);
    if(match){
      if(seen.has('priority')) return null;
      seen.add('priority');
      parsed.priority=normalizeTaskPriority(match[1]);
      continue;
    }
    match=line.match(/^DEADLINE\s*\|\s*(.+)$/i);
    if(match){
      if(seen.has('deadline')) return null;
      seen.add('deadline');
      parsed.deadline=normalizePlainTextDeadline(match[1]);
      continue;
    }
    return null;
  }
  if(!parsed.title||!parsed.description||!parsed.why_it_matters) return null;
  if(!parsed.deliverable&&!parsed.done_definition) return null;
  if(!parsed.deliverable) parsed.deliverable=parsed.done_definition;
  if(!parsed.done_definition) parsed.done_definition=parsed.deliverable;
  if(!parsed.priority) parsed.priority='med';
  return parsed;
}
const ROADMAP_DEFAULT_MAX_TOKENS = 1700;
const TASKS_DEFAULT_MAX_TOKENS = 1000;
const TASK_SKELETON_DEFAULT_MAX_TOKENS = 500;
const TASK_DETAIL_DEFAULT_MAX_TOKENS = 1000;
const ROADMAP_SKELETON_MAX_TOKENS = 1600;
const ACTIVE_STAGE_ENRICH_MAX_TOKENS = 180;
function resolveRoadmapStageCountHint(options={},fallback=1){
  const fromOptions=Number(options?.stageCount);
  if(Number.isFinite(fromOptions)&&fromOptions>0) return Math.max(1,Math.floor(fromOptions));
  const fromExecution=Array.isArray(S?.execution?.stages)?S.execution.stages.length:0;
  if(fromExecution>0) return fromExecution;
  const fromRoadmap=Array.isArray(S?.roadmap)?S.roadmap.length:0;
  if(fromRoadmap>0) return fromRoadmap;
  const fallbackCount=Number(fallback);
  return Number.isFinite(fallbackCount)&&fallbackCount>0?Math.max(1,Math.floor(fallbackCount)):1;
}
function estimateFallbackRoadmapStageCount(context={}){
  const ctx=context?.context||context||buildRoadmapOnboardingContext();
  const deadlineDays=getRoadmapDeadlineDays(ctx?.deadline||S?.user?.deadline||'');
  const signals=[
    ctx?.project_name,
    ctx?.primary_goal,
    ctx?.current_stage,
    ctx?.built_status,
    ctx?.niche,
    ctx?.target_audience,
    ctx?.execution_style,
    ctx?.resources,
    ctx?.blocker,
    ctx?.daily_hours
  ].filter(Boolean).length;
  const deadlineBias=
    deadlineDays<=7?2:
    deadlineDays<=14?3:
    deadlineDays<=21?4:
    deadlineDays<=35?5:
    6;
  const complexityBias=Math.max(0,Math.ceil(signals/3));
  return Math.max(2,deadlineBias+complexityBias);
}
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
  return Math.max(7,Math.min(35,raw));
}
function getRoadmapDeadlineDays(deadline){
  return Math.max(1,getRoadmapWindowDays(deadline));
}
function getTargetTaskCountForStage(stageIndex,stageCount,deadline){
  const days=getRoadmapDeadlineDays(deadline);
  const safeStageCount=Math.max(1,Number(stageCount)||1);
  const safeStageIndex=Math.max(0,Number(stageIndex)||0);
  if(days<=14) return 5;
  if(days<=28){
    const minCount=6;
    const maxCount=8;
    const step=Math.floor(((maxCount-minCount)*safeStageIndex)/Math.max(1,safeStageCount-1));
    return Math.max(minCount,Math.min(maxCount,minCount+step));
  }
  const minCount=8;
  const maxCount=10;
  const step=Math.floor(((maxCount-minCount)*safeStageIndex)/Math.max(1,safeStageCount-1));
  return Math.max(minCount,Math.min(maxCount,minCount+step));
}
function toDateInputValueSafe(value){
  if(!value) return '';
  const date=value instanceof Date?new Date(value.getTime()):new Date(value);
  if(Number.isNaN(date.getTime())) return '';
  return toDateInputValue(date);
}
function addDaysToDateInput(value,days){
  const base=value?new Date(`${value}T00:00:00`):new Date();
  if(Number.isNaN(base.getTime())) return '';
  const copy=new Date(base.getTime());
  copy.setDate(copy.getDate()+Number(days||0));
  return toDateInputValue(copy);
}
function spreadDatesBetween(startDate,endDate,count){
  const total=Math.max(1,Number(count)||1);
  const start=toDateInputValueSafe(startDate)||toDateInputValueSafe(new Date());
  let end=toDateInputValueSafe(endDate);
  if(!start) return Array.from({length:total},()=>toDateInputValue(new Date()));
  if(!end) end=addDaysToDateInput(start,Math.max(total,3));
  const startTime=new Date(`${start}T00:00:00`).getTime();
  let endTime=new Date(`${end}T00:00:00`).getTime();
  if(!Number.isFinite(startTime)) return Array.from({length:total},()=>start);
  if(!Number.isFinite(endTime)||endTime<=startTime) endTime=startTime+Math.max(total,3)*24*60*60*1000;
  const spanDays=Math.max(1,Math.round((endTime-startTime)/(24*60*60*1000)));
  const out=[];
  for(let i=0;i<total;i+=1){
    const offset=Math.max(1,Math.round(((i+1)*spanDays)/total));
    out.push(toDateInputValue(new Date(startTime+offset*24*60*60*1000)));
  }
  return out;
}
function clampIsoDateToWindow(value,startDate='',endDate=''){
  const normalized=toIsoDateOnly(value);
  const start=toIsoDateOnly(startDate);
  const end=toIsoDateOnly(endDate);
  if(!normalized){
    if(start) return start;
    if(end) return end;
    return '';
  }
  let time=new Date(`${normalized}T00:00:00`).getTime();
  if(start){
    const startTime=new Date(`${start}T00:00:00`).getTime();
    if(Number.isFinite(startTime)&&time<startTime) time=startTime;
  }
  if(end){
    const endTime=new Date(`${end}T00:00:00`).getTime();
    if(Number.isFinite(endTime)&&time>endTime) time=endTime;
  }
  return toDateInputValue(new Date(time));
}
function buildTaskDeadlinePlan({stageStartDate='',stageTargetDate='',deadline='',taskCount=1}={}){
  const total=Math.max(1,Number(taskCount)||1);
  const today=toDateInputValue(new Date());
  const rawStart=toIsoDateOnly(stageStartDate)||today;
  const rawEnd=toIsoDateOnly(stageTargetDate)||toIsoDateOnly(deadline)||addDaysToDateInput(rawStart,Math.max(total,3));
  const effectiveStart=clampIsoDateToWindow(rawStart,today,rawEnd)||today;
  let effectiveEnd=clampIsoDateToWindow(rawEnd,effectiveStart,rawEnd)||rawEnd||effectiveStart;
  if(!effectiveEnd||effectiveEnd<=effectiveStart){
    effectiveEnd=addDaysToDateInput(effectiveStart,Math.max(total,3));
  }
  const planned=spreadDatesBetween(effectiveStart,effectiveEnd,total);
  return planned.map((date)=>clampIsoDateToWindow(date,effectiveStart,effectiveEnd)||effectiveEnd);
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
function fallbackRoadmapForMvp(count){
  const project=clipText((S?.user?.project||S?.user?.idea||''),70)||'проект';
  const goal=clipText((S?.user?.goal||''),70)||'ключевой цели';
  const horizonDays=getRoadmapDeadlineDays(S?.user?.deadline);
  const targetCount=Math.max(3,Number(count)||estimateFallbackRoadmapStageCount({context:buildRoadmapOnboardingContext()}));
  const targetDates=spreadDatesBetween(new Date(),S?.user?.deadline||addDaysToDateInput(toDateInputValue(new Date()),targetCount*4),targetCount);
  const templates=[
    {
      title:`Validate ${project}`.trim(),
      objective:`Проверить спрос и подтвердить ключевую боль для ${goal}`,
      outcome:'Появляется ясный сигнал спроса и 1-2 сильных инсайта от пользователей',
      reasoning:'Сначала нужен реальный пользовательский сигнал, а не абстрактный план.',
      criteria:[
        'Проведены интервью с целевой аудиторией',
        'Сформулированы топ-3 боли и триггеры покупки',
        'Есть подтверждённый следующий шаг по продукту'
      ]
    },
    {
      title:'Shape MVP scope',
      objective:'Сузить MVP до одного проверяемого сценария и измеримых исходов',
      outcome:'Чёткий MVP-scope и список обязательных экранов/флоу',
      reasoning:'Без жёсткого скоупа команда распыляется и теряет скорость.',
      criteria:[
        'Определён один основной пользовательский сценарий',
        'Список must-have фич зафиксирован',
        'Есть план измерения результата'
      ]
    },
    {
      title:'Build beta path',
      objective:'Собрать рабочую beta-версию с трекингом ключевых действий',
      outcome:'Пользователь может пройти основной сценарий end-to-end',
      reasoning:'Рабочий путь нужен, чтобы получать не мнение, а поведение.',
      criteria:[
        'Основной флоу проходит без блокеров',
        'Подключены события аналитики',
        'Фиксируются критичные ошибки и падения'
      ]
    },
    {
      title:'Launch acquisition',
      objective:'Запустить первый устойчивый канал привлечения',
      outcome:'Появляются первые входящие лиды и записи на следующий шаг',
      reasoning:'Продукт должен получить внешний поток, а не жить в вакууме.',
      criteria:[
        'Есть рабочий канал трафика',
        'Собираются заявки или регистрации',
        'Понятен текущий CAC/конверсия'
      ]
    },
    {
      title:'Improve activation',
      objective:'Убрать трение в онбординге и повысить активацию',
      outcome:'Пользователи быстрее доходят до первого ценного действия',
      reasoning:'Раннее удержание определяет, есть ли у продукта шанс на рост.',
      criteria:[
        'Описан первый wow-moment',
        'Сокращены лишние шаги онбординга',
        'Измерена конверсия до активации'
      ]
    },
    {
      title:'Monetize usage',
      objective:'Доказать ценность через оплату, LOI или предзаказ',
      outcome:'Есть денежный или квази-денежный сигнал',
      reasoning:'План должен вести не только к использованию, но и к выручке.',
      criteria:[
        'Есть сформированное предложение',
        'Проведены продажи или pricing tests',
        'Получен один платящий клиент или LOI'
      ]
    },
    {
      title:'Stabilize growth',
      objective:'Закрепить работающий цикл и подготовить следующий рывок',
      outcome:'Сформирован повторяемый execution loop и список улучшений',
      reasoning:'Последний этап должен не закрывать план, а открывать масштабирование.',
      criteria:[
        'Повторяемый процесс подтверждён',
        'Устранены основные операционные риски',
        'Определён следующий приоритет роста'
      ]
    }
  ];
  return templates.slice(0,targetCount).map((stage,index)=>({
    week:index+1,
    title:clipText(stage.title||buildFallbackStageTitle(index,goal),80),
    objective:clipText(stage.objective||goal,180),
    outcome:clipText(stage.outcome||`Достижение измеримого прогресса для ${goal}`,140),
    reasoning:clipText(stage.reasoning||`Этот этап двигает проект к результату в пределах ${horizonDays} дней.`,220),
    completion_criteria:(Array.isArray(stage.criteria)?stage.criteria:[]).slice(0,4).map((item)=>clipText(item,90)),
    target_date:targetDates[index]||'',
    days:tasksToDays((Array.isArray(stage.criteria)?stage.criteria:[]).slice(0,4),Math.max(3,Math.round(horizonDays/Math.max(1,targetCount))),'2-4ч')
  }));
}
function normalizeBetaRoadmap(raw){
  const source=Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.stages)
      ? raw.stages
      : Array.isArray(raw?.phases)
        ? raw.phases
        : (raw&&typeof raw==='object'?[raw]:[]);
  const targetCount=Math.max(3,source.length||estimateFallbackRoadmapStageCount({context:buildRoadmapOnboardingContext()}));
  const base=fallbackRoadmapForMvp(targetCount);
  const activeWindow=getRoadmapDeadlineDays(S?.user?.deadline);
  const phaseFallbackTasks=base[0]?.days?.map((d)=>d.task)||[];
  const fallbackFlags=[];
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'normalizeBetaRoadmap',
    action:'roadmap_count_resolved',
    sourceStageCount:source.length,
    fallbackStageCount:base.length,
    normalizedStageCount:targetCount
  });
  const normalized=Array.from({length:targetCount},(_,index)=>{
    const candidate=source[index]||{};
    const rawTitle=clipText(candidate?.title||'',80);
    const fallbackBase=base[index]||base[base.length-1]||{};
    const title=rawTitle||clipText(fallbackBase?.title||buildFallbackStageTitle(index,S?.user?.goal||''),80)||`Stage ${index+1}`;
    const objectiveRaw=clipText(candidate?.objective||'',180);
    const outcomeRaw=clipText(candidate?.outcome||'',140);
    const reasoningRaw=clipText(candidate?.reasoning||'',220);
    const parsedObjective=parseObjectiveOutcome(objectiveRaw||fallbackBase.objective||'',outcomeRaw||fallbackBase.outcome||'');
    const objective=clipText(parsedObjective.objective||fallbackBase.objective||'достичь измеримого прогресса этапа',180);
    const outcome=clipText(parsedObjective.outcome||extractOutcomeFromObjective(objective)||fallbackBase.outcome||'',140);
    const reasoning=reasoningRaw||clipText(fallbackBase?.reasoning||`Этот этап нужен, чтобы подготовить входные условия для следующего шага после "${title}".`,220);
    const criteriaFromResponse=(Array.isArray(candidate?.completion_criteria)?candidate.completion_criteria:[])
      .map((item)=>clipText(item,80))
      .filter(Boolean);
    const extracted=extractTaskTexts(candidate);
    const usedFallbackTitle=!rawTitle;
    const usedFallbackObjective=!objectiveRaw;
    fallbackFlags.push({index,usedFallbackTitle,usedFallbackObjective});
    const criterionPool=[
      ...criteriaFromResponse,
      ...extracted.filter((task)=>!isWeakExecutionTask(task))
    ].filter(Boolean);
    while(criterionPool.length<3){
      const fallbackCriterion=fallbackBase.criteria?.[criterionPool.length]||fallbackBase.criteria?.[0]||`Завершить ${title}`;
      criterionPool.push(clipText(fallbackCriterion,90));
    }
    const completionCriteria=criterionPool.slice(0,4).map((item)=>clipText(item,90));
    const fallbackTask=fallbackBase.days?.[0]?.task||`выполнить ключевой шаг фазы ${title}`;
    const days=tasksToDays(
      completionCriteria.length?completionCriteria:[fallbackTask],
      Math.max(3,Math.round(activeWindow/Math.max(1,targetCount))),
      '2-4ч'
    );
    const targetDate=toIsoDateOnly(candidate?.target_date||fallbackBase?.target_date||'');
    return {
      week:index+1,
      title,
      objective,
      outcome,
      reasoning,
      completion_criteria:completionCriteria,
      target_date:targetDate,
      days
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
function getTaskPriorityWeight(task){
  const priority=normalizeTaskPriority(task?.priority||task?.prio);
  if(priority==='high') return 30;
  if(priority==='med') return 20;
  return 10;
}
function normalizeTaskDeadlineValue(value){
  const raw=String(value||'').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw)?raw:'';
}
function normalizeTaskDeadlineValueInWindow(value,options={}){
  const parsed=normalizeTaskDeadlineValue(value);
  if(!parsed) return '';
  return clampIsoDateToWindow(parsed,options.stageStartDate||'',options.stageTargetDate||options.deadline||'');
}
function getMilestonePalette(index,total=0){
  const palette=[
    {accent:'#8FB7FF', tint:'rgba(143,183,255,.12)', border:'rgba(143,183,255,.24)', glow:'rgba(143,183,255,.16)'},
    {accent:'#83E4D0', tint:'rgba(131,228,208,.12)', border:'rgba(131,228,208,.22)', glow:'rgba(131,228,208,.14)'},
    {accent:'#F3C66C', tint:'rgba(243,198,108,.11)', border:'rgba(243,198,108,.22)', glow:'rgba(243,198,108,.14)'},
    {accent:'#C2A6FF', tint:'rgba(194,166,255,.11)', border:'rgba(194,166,255,.22)', glow:'rgba(194,166,255,.14)'},
    {accent:'#F59FB2', tint:'rgba(245,159,178,.11)', border:'rgba(245,159,178,.22)', glow:'rgba(245,159,178,.14)'},
    {accent:'#9BE19E', tint:'rgba(155,225,158,.11)', border:'rgba(155,225,158,.22)', glow:'rgba(155,225,158,.14)'},
    {accent:'#7FD4F9', tint:'rgba(127,212,249,.11)', border:'rgba(127,212,249,.22)', glow:'rgba(127,212,249,.14)'}
  ];
  const safeIndex=Number.isFinite(Number(index))?Math.max(0,Number(index)):0;
  return palette[safeIndex%palette.length];
}
function getMilestoneVisualMeta(stageIndex,total=getExecutionStages().length||S.roadmap?.length||1){
  const stage=getExecutionStage(stageIndex)||S.roadmap?.[stageIndex]||{};
  const palette=getMilestonePalette(stageIndex,total);
  const startDate=toIsoDateOnly(stage?.startDate||stage?.start_date||'')||'';
  const targetDate=toIsoDateOnly(stage?.targetDate||stage?.target_date||'')||'';
  return {
    stageIndex,
    stageId:String(stage?.id||''),
    title:String(stage?.title||`Stage ${stageIndex+1}`),
    label:`M${stageIndex+1}`,
    startDate,
    targetDate,
    rangeLabel:[startDate,targetDate].filter(Boolean).join(' → ')||'Window not set',
    ...palette
  };
}
function getCalendarMilestoneIndexForDate(dateKey){
  const day=normalizeTaskCalendarDate(dateKey);
  if(!day) return -1;
  const dateTime=new Date(`${day}T00:00:00`).getTime();
  if(!Number.isFinite(dateTime)) return -1;
  const stages=getExecutionStages().length?getExecutionStages():(Array.isArray(S.roadmap)?S.roadmap:[]);
  let matchIndex=-1;
  stages.forEach((stage,idx)=>{
    const start=toIsoDateOnly(stage?.startDate||stage?.start_date||'');
    const end=toIsoDateOnly(stage?.targetDate||stage?.target_date||'');
    const startTime=start?new Date(`${start}T00:00:00`).getTime():NaN;
    const endTime=end?new Date(`${end}T00:00:00`).getTime():NaN;
    if(Number.isFinite(startTime)&&Number.isFinite(endTime)&&dateTime>=startTime&&dateTime<=endTime){
      matchIndex=idx;
    }
  });
  return matchIndex;
}
function getMilestoneVisualMetaForDate(dateKey){
  const stageIndex=getCalendarMilestoneIndexForDate(dateKey);
  if(stageIndex<0) return null;
  return getMilestoneVisualMeta(stageIndex);
}
function getTaskTitle(task){
  return clipText(task?.title||task?.text||'Задача',80)||'Задача';
}
function decorateTaskWithMilestoneMeta(task){
  if(!task) return task;
  const stageIndex=Number.isFinite(Number(task?.linkedStageIndex))
    ? Math.max(0,Number(task.linkedStageIndex))
    : Math.max(0,(Number(task?.linkedStage)||1)-1);
  const meta=getMilestoneVisualMeta(stageIndex,getExecutionStages().length||S.roadmap?.length||1);
  return {
    ...task,
    milestoneId:String(task?.milestoneId||meta.stageId||''),
    milestoneIndex:stageIndex,
    milestoneTitle:String(task?.milestoneTitle||meta.title||`Stage ${stageIndex+1}`),
    milestoneLabel:String(task?.milestoneLabel||meta.label||`M${stageIndex+1}`),
    milestoneColor:String(task?.milestoneColor||meta.accent||''),
    milestoneTint:String(task?.milestoneTint||meta.tint||''),
    milestoneBorder:String(task?.milestoneBorder||meta.border||''),
    milestoneGlow:String(task?.milestoneGlow||meta.glow||''),
    milestoneStartDate:String(task?.milestoneStartDate||meta.startDate||''),
    milestoneTargetDate:String(task?.milestoneTargetDate||meta.targetDate||'')
  };
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
  const stagePrefix=clipText(stageLabel,24)?`${clipText(stageLabel,24)} · `:'';
  const dates=spreadTaskDeadlines(deadline,10);
  return [
    {
      title:`${stagePrefix}Созвониться с 5 ICP-пользователями и подтвердить ключевую боль`,
      description:`Провести 5 интервью с ICP и проверить, насколько ${safeObjective} решает боль.`,
      whyItMatters:'Без подтверждённой боли рост будет случайным и дорогим.',
      deliverable:'5 интервью, заметки и таблица повторяющихся паттернов.',
      doneDefinition:'Есть 5 интервью и 3 повторяющиеся боли с цитатами.',
      priority:'high',
      deadline:dates[0]||'',
      stageObjective:safeObjective
    },
    {
      title:`${stagePrefix}Запустить лендинг с CTA и собрать 20 регистраций`,
      description:`Собрать лендинг под "${safeGoal}" с понятным оффером и формой регистрации.`,
      whyItMatters:'Проверяет реальный интерес до масштабной разработки.',
      deliverable:'Лендинг в проде и минимум 20 целевых регистраций.',
      doneDefinition:'Лендинг опубликован, в аналитике минимум 20 регистраций.',
      priority:'high',
      deadline:dates[1]||'',
      stageObjective:safeObjective
    },
    {
      title:`${stagePrefix}Выпустить clickable demo ключевого сценария`,
      description:`Собрать кликабельный демо-поток для фазы "${stageLabel}" и показать его 5 людям.`,
      whyItMatters:'Демо ускоряет обратную связь и снижает риск неверной реализации.',
      deliverable:'Clickable demo + список блокеров от пользователей.',
      doneDefinition:'5 просмотров демо и список замечаний с приоритетами.',
      priority:'med',
      deadline:dates[2]||'',
      stageObjective:safeObjective
    },
    {
      title:`${stagePrefix}Провести 10 ответов на форму и выделить 3 главных паттерна`,
      description:'Собрать ответы через форму/чат, выделить ключевые возражения и триггеры покупки.',
      whyItMatters:'Уточняет positioning и снижает шум в следующих итерациях.',
      deliverable:'10 ответов + summary с 3 ключевыми паттернами.',
      doneDefinition:'Подготовлен отчёт с 3 паттернами и следующими действиями.',
      priority:'med',
      deadline:dates[3]||'',
      stageObjective:safeObjective
    },
    {
      title:`${stagePrefix}Закрыть 1 платящего пользователя или LOI`,
      description:'Довести один квалифицированный лид до оплаты или подписанного LOI.',
      whyItMatters:'Показывает монетизацию и валидирует ценность продукта.',
      deliverable:'Оплата или подписанный LOI с подтверждённым use-case.',
      doneDefinition:'Есть подтверждённая оплата или LOI от целевого клиента.',
      priority:'high',
      deadline:dates[4]||'',
      stageObjective:safeObjective
    },
    {
      title:`${stagePrefix}Подготовить список гипотез и критерии успеха`,
      description:'Зафиксировать 3-5 гипотез, которые должны подтвердиться на этом этапе.',
      whyItMatters:'Без критериев успеха невозможно понять, двигается ли проект вперёд.',
      deliverable:'Список гипотез и измеримых критериев для проверки.',
      doneDefinition:'Есть список гипотез с приоритетами и критериями верификации.',
      priority:'med',
      deadline:dates[5]||'',
      stageObjective:safeObjective
    },
    {
      title:`${stagePrefix}Собрать и протестировать первый рабочий флоу`,
      description:'Собрать минимальный end-to-end flow и проверить его на реальном сценарии.',
      whyItMatters:'Рабочий путь важнее презентационного макета.',
      deliverable:'Проверенный основной flow и список багов.',
      doneDefinition:'Основной сценарий проходит без блокирующих ошибок.',
      priority:'high',
      deadline:dates[6]||'',
      stageObjective:safeObjective
    },
    {
      title:`${stagePrefix}Подключить аналитику ключевых действий`,
      description:'Добавить события, которые покажут активацию, удержание и конверсию.',
      whyItMatters:'Без аналитики продукт невозможно улучшать осознанно.',
      deliverable:'Подключённые события аналитики и проверка их качества.',
      doneDefinition:'Ключевые события приходят и доступны для анализа.',
      priority:'med',
      deadline:dates[7]||'',
      stageObjective:safeObjective
    },
    {
      title:`${stagePrefix}Запустить первый канал привлечения`,
      description:'Выбрать и запустить один канал, который может дать первые заявки.',
      whyItMatters:'Execution должен быстро выходить за пределы внутренних проверок.',
      deliverable:'Работающий канал и первые лиды.',
      doneDefinition:'Канал запущен и даёт измеримый входящий поток.',
      priority:'high',
      deadline:dates[8]||'',
      stageObjective:safeObjective
    },
    {
      title:`${stagePrefix}Зафиксировать следующий шаг по монетизации`,
      description:'Сформулировать оффер, pricing или LOI-шаг для следующей итерации.',
      whyItMatters:'План должен вести к выручке, а не только к активности.',
      deliverable:'Черновик предложения и следующий шаг к оплате.',
      doneDefinition:'Есть ясный monetization step с конкретным owner action.',
      priority:'high',
      deadline:dates[9]||'',
      stageObjective:safeObjective
    }
  ];
}
function normalizeFounderTask(raw,options={}){
  const stageObjective=clipText(options.stageObjective||raw?.stageObjective||'',150);
  const stageIndex=Number.isFinite(Number(raw?.linked_stage??raw?.linkedStage))?Number(raw?.linked_stage??raw?.linkedStage):Number(options.stageIndex||0);
  const stageCount=resolveRoadmapStageCountHint(options,stageIndex+1);
  const stageLabel=clipText(options.stageTitle||'',40)||'Stage 1';
  const title=getTaskTitle(raw);
  const deadlinePlan=Array.isArray(options.deadlinePlan)?options.deadlinePlan:[];
  const taskIndex=Number.isFinite(Number(options.taskIndex))?Number(options.taskIndex):0;
  const plannedDeadline=deadlinePlan[taskIndex]||deadlinePlan[deadlinePlan.length-1]||'';
  const windowStart=options.stageStartDate||'';
  const windowEnd=options.stageTargetDate||options.deadline||'';
  const rawDeadline=normalizeTaskDeadlineValueInWindow(raw?.deadline,{stageStartDate:windowStart,stageTargetDate:windowEnd});
  const fallbackDeadline=normalizeTaskDeadlineValueInWindow(plannedDeadline,{stageStartDate:windowStart,stageTargetDate:windowEnd});
  const normalized={
    id:Number(raw?.id)||0,
    title,
    text:title,
    description:clipText(raw?.description||raw?.desc||'',220),
    whyItMatters:clipText(raw?.why_it_matters||raw?.whyItMatters||'',200),
    deliverable:clipText(raw?.deliverable||'',200),
    doneDefinition:clipText(raw?.done_definition||raw?.doneDefinition||'',200),
    prio:normalizeTaskPriority(raw?.priority??raw?.prio),
    deadline:rawDeadline||fallbackDeadline||clampIsoDateToWindow(windowEnd,windowStart,windowEnd)||'',
    linkedStage:Math.max(1,Math.min(stageCount,stageIndex+1)),
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
function buildLocalTaskDetailFallback(taskSkeleton,stage,options={}){
  const normalizedStage=normalizeStageForEnrichment(stage||{},Number(options.stageIndex)||0);
  const taskTitle=getTaskTitle(taskSkeleton)||clipText(options.taskTitle||'',80)||`Task ${Number(options.taskIndex)||1}`;
  const stageTitle=clipText(normalizedStage.title||options.stageTitle||'Stage 1',60)||'Stage 1';
  const stageObjective=clipText(normalizedStage.objective||options.stageObjective||'',150)||'validate demand and keep execution moving';
  const stageOutcome=clipText(normalizedStage.outcome||options.stageOutcome||'',120)||'a measurable stage outcome';
  const deadlinePlan=buildTaskDeadlinePlan({
    stageStartDate:options.stageStartDate||'',
    stageTargetDate:options.stageTargetDate||'',
    deadline:options.deadline||S.user.deadline||'',
    taskCount:1
  });
  return normalizeFounderTask({
    title:taskTitle,
    description:`Выполнить "${taskTitle}" как конкретный шаг этапа ${stageTitle}.`,
    whyItMatters:`Двигает этап ${stageTitle} к результату: ${stageObjective}.`,
    deliverable:`Проверяемый результат задачи "${taskTitle}".`,
    doneDefinition:`Задача завершена, результат зафиксирован, этап ${stageTitle} продвинут.`,
    priority:'med',
    deadline:normalizeTaskDeadlineValueInWindow(taskSkeleton?.deadline,{stageStartDate:options.stageStartDate||'',stageTargetDate:options.stageTargetDate||options.deadline||S.user.deadline||''})||deadlinePlan[0]||options.stageTargetDate||options.deadline||S.user.deadline||'',
    linkedStage:Number(options.stageIndex||0)+1,
    stageObjective,
    stageOutcome
  },{
    stageObjective,
    stageTitle,
    stageIndex:Number(options.stageIndex||0),
    deadline:options.stageTargetDate||options.deadline||S.user.deadline||'',
    stageStartDate:options.stageStartDate||'',
    stageTargetDate:options.stageTargetDate||'',
    taskIndex:Number(options.taskIndex||0),
    deadlinePlan,
    allowBlueprintFallback:false
  });
}
function normalizeFounderTasks(raw,options={}){
  const source=Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.tasks)
      ? raw.tasks
      : [];
  const stageObjective=clipText(options.stageObjective||'',150);
  const stageTitle=clipText(options.stageTitle||'',40)||'Stage 1';
  const targetCount=Math.max(1,Number(options.targetCount)||5);
  const allowBlueprintFallback=options.allowBlueprintFallback!==false;
  const stageWindowStart=options.stageStartDate||'';
  const stageWindowEnd=options.stageTargetDate||options.deadline||S?.user?.deadline||'';
  const fallback=fallbackFounderTaskBlueprints({
    goal:S?.user?.goal||'',
    stageObjective,
    deadline:stageWindowEnd,
    stageLabel:stageTitle
  });
  const seen=new Set();
  const out=[];
  const deadlinePlan=Array.isArray(options.deadlinePlan)&&options.deadlinePlan.length
    ? options.deadlinePlan
    : buildTaskDeadlinePlan({
      stageStartDate:stageWindowStart,
      stageTargetDate:stageWindowEnd,
      deadline:stageWindowEnd,
      taskCount:targetCount
    });
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'normalizeFounderTasks',
    action:'task_normalization_started',
    inputCount:source.length,
    targetCount,
    stageTitle,
    stageObjective
  });
  source.forEach((item,index)=>{
    if(out.length>=targetCount) return;
    const normalized=normalizeFounderTask(item,{...options,stageObjective,stageTitle,taskIndex:index,deadlinePlan,stageStartDate:stageWindowStart,stageTargetDate:stageWindowEnd,deadline:stageWindowEnd});
    const key=normalized.title.toLowerCase();
    if(seen.has(key)) return;
    seen.add(key);
    out.push(normalized);
  });
  if(!allowBlueprintFallback) return out.slice(0,targetCount);
  let fallbackIndex=0;
  while(out.length<targetCount){
    const candidate=normalizeFounderTask(fallback[fallbackIndex%fallback.length],{...options,stageObjective,stageTitle,taskIndex:out.length,deadlinePlan,stageStartDate:stageWindowStart,stageTargetDate:stageWindowEnd,deadline:stageWindowEnd});
    fallbackIndex+=1;
    const key=candidate.title.toLowerCase();
    if(seen.has(key)) continue;
    seen.add(key);
    out.push(candidate);
  }
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'normalizeFounderTasks',
    action:'task_normalization_completed',
    outputCount:out.length,
    taskIds:out.map((task)=>Number(task.id)).filter((id)=>Number.isFinite(id)),
    priorities:out.map((task)=>String(task.priority||task.prio||'')),
    hasPriorityWeight:out.map((task)=>Boolean(task.priorityWeight))
  });
  return out.slice(0,targetCount);
}
function fallbackTasksForMvp(options={}){
  return normalizeFounderTasks([],options);
}
function normalizeBetaTasks(raw,options={}){
  return normalizeFounderTasks(raw,{...options,allowBlueprintFallback:false});
}
function normalizeTaskCollection(raw,options={}){
  const source=Array.isArray(raw)?raw:[];
  const stageCount=resolveRoadmapStageCountHint(options,source.length||1);
  const normalizedStageIndex=Number.isFinite(Number(options.stageIndex))
    ? Math.max(0,Math.min(stageCount-1,Number(options.stageIndex)))
    : 0;
  const baseId=Date.now();
  const usedIds=new Set();
  const stageStartDate=options.stageStartDate||'';
  const stageTargetDate=options.stageTargetDate||options.deadline||'';
  const deadlinePlan=Array.isArray(options.deadlinePlan)&&options.deadlinePlan.length
    ? options.deadlinePlan
    : buildTaskDeadlinePlan({
      stageStartDate,
      stageTargetDate,
      deadline:stageTargetDate,
      taskCount:Math.max(1,source.length||1)
    });
  return source.map((item,index)=>{
    const rawId=Number(item?.id);
    let id=Number.isFinite(rawId)&&rawId>0?rawId:(baseId+index);
    while(usedIds.has(id)) id+=1;
    usedIds.add(id);
    const rawLinkedStage=Number(item?.linkedStage??item?.linked_stage);
    const stageIndex=Number.isFinite(rawLinkedStage)
      ? Math.max(0,Math.min(stageCount-1,rawLinkedStage-1))
      : normalizedStageIndex;
    const normalized=normalizeFounderTask(
      {
      ...item,
      id,
      done:Boolean(item?.done)
    },
      {
        ...options,
        stageIndex,
        stageStartDate,
        stageTargetDate,
        deadlinePlan
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
      linkedStage:Math.max(1,Math.min(stageCount,Number(normalized.linkedStage)||stageIndex+1))
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
  if(base.length>=3) return base.slice(0,4);
  const seeds=[
    clipText(objective,90),
    clipText(extractOutcomeFromObjective(objective),90)
  ].filter(Boolean);
  const out=[...base];
  if(seeds[0]) out.push(`Достичь: ${seeds[0]}`);
  if(seeds[1]) out.push(`Подтвердить результат: ${seeds[1]}`);
  if(out.length<3) out.push('Выполнить ключевой outcome этапа.');
  if(out.length<3) out.push('Зафиксировать измеримый результат и переход к следующему шагу.');
  return out.slice(0,4);
}
function resolvePhaseCompletionCriteria(phase){
  const direct=(Array.isArray(phase?.completion_criteria)?phase.completion_criteria:[])
    .map((entry)=>clipText(entry,90))
    .filter(Boolean);
  if(direct.length>=3) return direct.slice(0,4);
  return normalizeCompletionCriteria(phase?.days||[],phase?.objective||'');
}
function normalizeExecutionTask(task,stage){
  const stageIndex=Math.max(0,(stage?.index||1)-1);
  const milestoneMeta=getMilestoneVisualMeta(stageIndex,getExecutionStages().length||S.roadmap?.length||1);
  const safe=normalizeFounderTask(task,{
    stageIndex,
    stageTitle:stage?.title||'Stage 1',
    stageObjective:stage?.objective||'',
    deadline:stage?.targetDate||S.user.deadline||'',
    stageStartDate:stage?.startDate||'',
    stageTargetDate:stage?.targetDate||S.user.deadline||'',
    deadlinePlan:Array.isArray(task?.deadlinePlan)?task.deadlinePlan:[],
    taskIndex:Number.isFinite(Number(task?.taskIndex))?Number(task.taskIndex):0
  });
  const isDone=Boolean(task?.done)||String(task?.status||'')==='done';
  const rawStatus=String(task?.status||'active');
  const status=rawStatus==='done'||rawStatus==='blocked'||rawStatus==='archived'
    ? rawStatus
    : (isDone?'done':'active');
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
    deadline:normalizeTaskDeadlineValueInWindow(task?.deadline||safe.deadline||'',{
      stageStartDate:stage?.startDate||'',
      stageTargetDate:stage?.targetDate||S.user.deadline||''
    }),
    status:status==='archived'
      ? 'archived'
      : (status==='done'?'done':(status==='blocked'?'blocked':'active')),
    done:isDone,
    createdAt:String(task?.createdAt||nowIso()),
    completedAt:isDone?String(task?.completedAt||nowIso()):'',
    created:String(task?.created||new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'})).trim(),
    stageTitle:stage?.title||'',
    stageObjective:stage?.objective||'',
    linked_stage:Math.max(1,(Number(task?.linkedStageIndex)||stageIndex)+1),
    milestoneId:String(stage?.id||''),
    milestoneIndex:stageIndex,
    milestoneTitle:String(stage?.title||`Stage ${stageIndex+1}`),
    milestoneLabel:milestoneMeta.label,
    milestoneColor:milestoneMeta.accent,
    milestoneTint:milestoneMeta.tint,
    milestoneBorder:milestoneMeta.border,
    milestoneGlow:milestoneMeta.glow,
    milestoneStartDate:milestoneMeta.startDate,
    milestoneTargetDate:milestoneMeta.targetDate
  };
}
const SESSION_STATUSES=new Set(['planned','running','completed','interrupted','blocked']);
function createExecutionSessionTemplate(partial={}){
  const baseTaskIds=Array.isArray(partial.taskIds)
    ? partial.taskIds
    : Array.isArray(partial.selectedTaskIds)
      ? partial.selectedTaskIds
      : [];
  const baseline=partial.baseline&&typeof partial.baseline==='object'
    ? partial.baseline
    : {
        stageDone:0,
        stageTotal:0,
        overallDone:0,
        overallTotal:0,
        stageProgress:0,
        overallProgress:0
      };
  const review=partial.review&&typeof partial.review==='object'
    ? partial.review
    : {};
  return {
    id:String(partial.id||createClientRequestId('session')),
    stageId:String(partial.stageId||''),
    taskIds:Array.from(new Set(baseTaskIds.map((taskId)=>Number(taskId)).filter((taskId)=>Number.isFinite(taskId)))).slice(0,3),
    goal:String(partial.goal||''),
    startedAt:String(partial.startedAt||''),
    endedAt:String(partial.endedAt||''),
    status:SESSION_STATUSES.has(String(partial.status||'planned'))?String(partial.status||'planned'):'planned',
    review:normalizeExecutionSessionReview(review),
    progressDelta:normalizeSessionProgressDelta(partial.progressDelta),
    notes:String(partial.notes||''),
    outcomeSummary:String(partial.outcomeSummary||''),
    baseline:{
      stageDone:Number(baseline.stageDone||0),
      stageTotal:Number(baseline.stageTotal||0),
      overallDone:Number(baseline.overallDone||0),
      overallTotal:Number(baseline.overallTotal||0),
      stageProgress:Number(baseline.stageProgress||0),
      overallProgress:Number(baseline.overallProgress||0)
    },
    reviewOpenedAt:String(partial.reviewOpenedAt||''),
    reviewAppliedAt:String(partial.reviewAppliedAt||'')
  };
}
function normalizeExecutionSessionReview(raw={}){
  const safe=raw&&typeof raw==='object'?raw:{};
  return {
    openedAt:String(safe.openedAt||''),
    appliedAt:String(safe.appliedAt||''),
    summary:String(safe.summary||''),
    blockers:String(safe.blockers||''),
    notes:String(safe.notes||''),
    outcome:String(safe.outcome||''),
    nextSteps:String(safe.nextSteps||''),
    answers:normalizeSessionReviewAnswers(safe.answers||safe.responses||{}),
    interpretation:normalizeSessionReviewInterpretation(safe.interpretation||safe.analysis||{}),
    appliedChanges:normalizeSessionReviewAppliedChanges(safe.appliedChanges||{})
  };
}
function normalizeSessionReviewAnswers(raw={}){
  const safe=raw&&typeof raw==='object'?raw:{};
  return {
    completed:String(safe.completed||safe.summary||''),
    blocked:String(safe.blocked||safe.blockers||''),
    changed:String(safe.changed||safe.notes||safe.nextSteps||'')
  };
}
function normalizeSessionReviewAppliedChanges(raw={}){
  const safe=raw&&typeof raw==='object'?raw:{};
  const toIdList=(value)=>Array.from(new Set((Array.isArray(value)?value:[]).map((item)=>Number(item)).filter((item)=>Number.isFinite(item))));
  return {
    taskIdsCompleted:toIdList(safe.taskIdsCompleted),
    taskIdsBlocked:toIdList(safe.taskIdsBlocked),
    taskIdsPartiallyUpdated:toIdList(safe.taskIdsPartiallyUpdated)
  };
}
function normalizeSessionReviewTaskUpdate(raw={}){
  const safe=raw&&typeof raw==='object'?raw:{};
  return {
    taskId:Number(safe.taskId||0),
    status:String(safe.status||'partial'),
    completionPct:clampPercentage(safe.completionPct),
    note:String(safe.note||''),
    blockReason:String(safe.blockReason||'')
  };
}
function normalizeSessionReviewMilestoneUpdate(raw={}){
  const safe=raw&&typeof raw==='object'?raw:{};
  return {
    stageId:String(safe.stageId||''),
    progressPct:clampPercentage(safe.progressPct),
    progressDelta:clampNumber(safe.progressDelta,-100,100),
    status:String(safe.status||''),
    note:String(safe.note||'')
  };
}
function normalizeSessionReviewOverallUpdate(raw={}){
  const safe=raw&&typeof raw==='object'?raw:{};
  return {
    doneDelta:clampNumber(safe.doneDelta,-25,25),
    pctDelta:clampNumber(safe.pctDelta,-100,100),
    note:String(safe.note||'')
  };
}
function normalizeSessionReviewNextAction(raw={}){
  const safe=raw&&typeof raw==='object'?raw:{};
  return {
    taskId:Number(safe.taskId||0),
    stageId:String(safe.stageId||''),
    title:String(safe.title||''),
    reason:String(safe.reason||'')
  };
}
function normalizeSessionReviewInterpretation(raw={}){
  const safe=raw&&typeof raw==='object'?raw:{};
  return {
    summary:String(safe.summary||''),
    taskUpdates:Array.isArray(safe.taskUpdates)
      ? safe.taskUpdates.map((item)=>normalizeSessionReviewTaskUpdate(item)).filter((item)=>Number.isFinite(item.taskId))
      : [],
    milestoneUpdate:normalizeSessionReviewMilestoneUpdate(safe.milestoneUpdate||{}),
    overallUpdate:normalizeSessionReviewOverallUpdate(safe.overallUpdate||{}),
    nextBestAction:normalizeSessionReviewNextAction(safe.nextBestAction||{}),
    signals:{
      completed:Boolean(safe.signals?.completed),
      interrupted:Boolean(safe.signals?.interrupted),
      blocked:Boolean(safe.signals?.blocked)
    }
  };
}
function normalizeSessionProgressDelta(raw={}){
  const safe=raw&&typeof raw==='object'?raw:{};
  return {
    stageDoneDelta:Number(safe.stageDoneDelta||0),
    stagePctDelta:Number(safe.stagePctDelta||0),
    overallDoneDelta:Number(safe.overallDoneDelta||0),
    overallPctDelta:Number(safe.overallPctDelta||0),
    stageProgressDelta:Number(safe.stageProgressDelta||0),
    overallProgressDelta:Number(safe.overallProgressDelta||0)
  };
}
function clampNumber(value,min,max){
  const n=Number(value);
  if(!Number.isFinite(n)) return min;
  if(n<min) return min;
  if(n>max) return max;
  return n;
}
function clampPercentage(value){
  return Math.round(clampNumber(value,0,100));
}
function normalizeExecutionSession(raw,context={}){
  const fallbackStageId=String(context.stageId||getExecutionStage(getExecutionActiveStageIndex())?.id||'');
  const fallbackGoal=String(context.goal||S.user.goal||S.roadmap?.[getExecutionActiveStageIndex()]?.objective||'');
  const base=createExecutionSessionTemplate({
    stageId:fallbackStageId,
    goal:fallbackGoal,
    status:'planned'
  });
  if(!raw||typeof raw!=='object') return base;
  const session=createExecutionSessionTemplate({
    ...base,
    ...raw,
    stageId:String(raw.stageId||fallbackStageId),
    goal:String(raw.goal||fallbackGoal),
    taskIds:Array.isArray(raw.taskIds)?raw.taskIds:Array.isArray(raw.selectedTaskIds)?raw.selectedTaskIds:base.taskIds,
    review:normalizeExecutionSessionReview(raw.review),
    progressDelta:normalizeSessionProgressDelta(raw.progressDelta),
    baseline:raw.baseline&&typeof raw.baseline==='object'
      ? raw.baseline
      : base.baseline
  });
  session.reviewOpenedAt=String(raw.reviewOpenedAt||session.reviewOpenedAt||session.review.openedAt||'');
  session.reviewAppliedAt=String(raw.reviewAppliedAt||session.reviewAppliedAt||session.review.appliedAt||'');
  session.review.openedAt=String(session.review.openedAt||session.reviewOpenedAt||'');
  session.review.appliedAt=String(session.review.appliedAt||session.reviewAppliedAt||'');
  if(!SESSION_STATUSES.has(session.status)) session.status='planned';
  session.taskIds=session.taskIds.slice(0,3);
  return session;
}
function getExecutionSession(){
  if(!isExecutionStateObject(S.execution)) return null;
  return normalizeExecutionSession(S.execution.session||null);
}
function getExecutionSessionStage(){
  const session=getExecutionSession();
  if(!session) return null;
  const stages=getExecutionStages();
  return stages.find((stage)=>String(stage.id)===String(session.stageId))||getExecutionStage(getExecutionActiveStageIndex());
}
function getExecutionSessionTaskIds(){
  const session=getExecutionSession();
  return session?session.taskIds.slice(0,3):[];
}
function isSessionRunning(){
  return String(getExecutionSession()?.status||'')==='running';
}
function isSessionReviewOpen(){
  const session=getExecutionSession();
  return Boolean(session&&session.review&&session.review.openedAt&&!session.review.appliedAt);
}
function syncActiveSessionRuntime(){
  const session=getExecutionSession();
  if(!session){
    if(S.activeSession&&S.activeSession.timerInterval){
      clearInterval(S.activeSession.timerInterval);
    }
    S.activeSession=null;
    return null;
  }
  const timerInterval=S.activeSession?.timerInterval||null;
  S.activeSession={
    ...session,
    timerInterval
  };
  return S.activeSession;
}
function clearSessionTimer(){
  if(S.activeSession&&S.activeSession.timerInterval){
    clearInterval(S.activeSession.timerInterval);
    S.activeSession.timerInterval=null;
  }
}
function startSessionTimer(){
  clearSessionTimer();
  if(!isSessionRunning()) return;
  if(!S.activeSession) syncActiveSessionRuntime();
  if(!S.activeSession) return;
  S.activeSession.timerInterval=setInterval(()=>{
    renderDashboardSessionControls();
    renderSessionOverlay();
    renderSessionWorkspace();
  },1000);
}
function buildSessionBaseline(stageIndex){
  const stage=getExecutionStage(stageIndex);
  const stageTasks=stage?getTasksForStage(stageIndex,{includeArchived:false}):[];
  const overallTasks=getAllExecutionTasks().filter((task)=>task.status!=='archived');
  return {
    stageDone:stageTasks.filter((task)=>task.status==='done'||task.done).length,
    stageTotal:stageTasks.length,
    overallDone:overallTasks.filter((task)=>task.status==='done'||task.done).length,
    overallTotal:overallTasks.length,
    stageProgress:calculateTaskProgressValue(stageTasks),
    overallProgress:calculateTaskProgressValue(overallTasks)
  };
}
function recommendSessionTaskIds(stageIndex){
  const stageTasks=getTasksForStage(stageIndex,{includeArchived:false});
  return stageTasks
    .filter((task)=>task.status!=='done'&&task.status!=='archived')
    .sort((a,b)=>{
      const weightA=getTaskPriorityWeight(a);
      const weightB=getTaskPriorityWeight(b);
      if(weightA!==weightB) return weightB-weightA;
      return String(getTaskTitle(a)||'').localeCompare(String(getTaskTitle(b)||''),undefined,{sensitivity:'base'});
    })
    .slice(0,3)
    .map((task)=>Number(task.id))
    .filter((taskId)=>Number.isFinite(taskId));
}
function prepareExecutionSession(options={}){
  ensureExecutionState();
  if(!hasExecutionStateReady()) return null;
  const activeIndex=getExecutionActiveStageIndex();
  const stage=getExecutionStage(activeIndex);
  if(!stage) return null;
  const existing=getExecutionSession();
  const preserveRunning=Boolean(existing&&existing.status==='running'&&!options.forceRetarget);
  const preserveEnded=Boolean(existing&&existing.status!=='planned'&&existing.status!=='running'&&!options.forceRetarget);
  const existingTaskIds=getExecutionSessionTaskIds();
  const sourceTaskIds=preserveRunning||preserveEnded
    ? existing.taskIds
    : ((Array.isArray(options.taskIds)&&options.taskIds.length>0)
      ? options.taskIds
      : (existingTaskIds.length>0
        ? existingTaskIds
        : recommendSessionTaskIds(activeIndex)));
  const taskIds=Array.from(new Set(sourceTaskIds.map((taskId)=>Number(taskId)).filter((taskId)=>Number.isFinite(taskId)))).slice(0,3);
  const baseline=(preserveRunning||preserveEnded)&&existing?.baseline
    ? existing.baseline
    : buildSessionBaseline(activeIndex);
  const targetStatus=preserveRunning
    ? 'running'
    : (preserveEnded ? existing.status : 'planned');
  const prepared=normalizeExecutionSession({
    ...(existing||{}),
    id:existing?.id||createClientRequestId('session'),
    stageId:String(stage.id||existing?.stageId||''),
    goal:String(options.goal||existing?.goal||stage.objective||S.user.goal||''),
    taskIds:taskIds.length?taskIds:((Array.isArray(existing?.taskIds)&&existing.taskIds.length>0)?existing.taskIds:recommendSessionTaskIds(activeIndex)).slice(0,3),
    status:targetStatus,
    startedAt:String((preserveRunning||preserveEnded)?existing?.startedAt||'':''),
    endedAt:String((preserveRunning||preserveEnded)?existing?.endedAt||'':''),
    review:(preserveRunning||preserveEnded)?existing?.review||{}:{},
    baseline,
    notes:String((preserveRunning||preserveEnded)?existing?.notes||options.notes||'':options.notes||''),
    outcomeSummary:String((preserveRunning||preserveEnded)?existing?.outcomeSummary||'':'')
  },{stageId:stage.id,goal:stage.objective||S.user.goal||''});
  const previousSignature=JSON.stringify(existing?{
    id:existing.id,
    stageId:existing.stageId,
    taskIds:existing.taskIds,
    goal:existing.goal,
    status:existing.status
  }:null);
  const preparedSignature=JSON.stringify({
    id:prepared.id,
    stageId:prepared.stageId,
    taskIds:prepared.taskIds,
    goal:prepared.goal,
    status:prepared.status
  });
  S.execution.session=prepared;
  if(previousSignature!==preparedSignature){
    S.execution.updatedAt=nowIso();
  }
  syncActiveSessionRuntime();
  if(!options.silent&&previousSignature!==preparedSignature){
    logInfo({
      area:'frontend',
      module:'frontend/script.js',
      function:'session_flow',
      action:'session_prepared',
      sessionId:prepared.id,
      stageId:prepared.stageId,
      taskIds:prepared.taskIds,
      goal:prepared.goal
    });
  }
  return prepared;
}
function getSessionDurationMinutes(session=getExecutionSession()){
  if(!session||!session.startedAt) return 0;
  const startedAt=new Date(session.startedAt);
  if(Number.isNaN(startedAt.getTime())) return 0;
  const end=session.endedAt?new Date(session.endedAt):new Date();
  if(Number.isNaN(end.getTime())) return 0;
  return Math.max(0,Math.round((end.getTime()-startedAt.getTime())/60000));
}
function getSessionTimerLabel(session=getExecutionSession()){
  if(!session||!session.startedAt) return '00:00';
  const startedAt=new Date(session.startedAt);
  if(Number.isNaN(startedAt.getTime())) return '00:00';
  const end=session.status==='running'?new Date():new Date(session.endedAt||Date.now());
  const elapsed=Math.max(0,end.getTime()-startedAt.getTime());
  const minutes=Math.floor(elapsed/60000);
  const seconds=Math.floor((elapsed%60000)/1000);
  return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
}
function getSessionProgressDelta(session=getExecutionSession(),nextBaseline=null){
  if(!session) return normalizeSessionProgressDelta();
  const baseline=session.baseline||{stageDone:0,stageTotal:0,overallDone:0,overallTotal:0};
  const stageIndex=getExecutionStages().findIndex((stage)=>String(stage.id)===String(session.stageId));
  const currentStage=stageIndex>=0?getExecutionStage(stageIndex):getExecutionSessionStage();
  const currentStageTasks=currentStage?getTasksForStage(stageIndex>=0?stageIndex:getExecutionActiveStageIndex(),{includeArchived:false}):[];
  const currentOverall=getAllExecutionTasks().filter((task)=>task.status!=='archived');
  const currentStageProgress=calculateTaskProgressValue(currentStageTasks);
  const currentOverallProgress=calculateTaskProgressValue(currentOverall);
  const current={
    stageDone:currentStageTasks.filter((task)=>task.status==='done'||task.done).length,
    stageTotal:currentStageTasks.length,
    stageProgress:currentStageProgress,
    overallDone:currentOverall.filter((task)=>task.status==='done'||task.done).length,
    overallTotal:currentOverall.length,
    overallProgress:currentOverallProgress
  };
  const before=nextBaseline||baseline;
  const stagePctBefore=before.stageTotal>0?Math.round((before.stageDone/before.stageTotal)*100):0;
  const stagePctAfter=current.stageTotal>0?Math.round((current.stageDone/current.stageTotal)*100):0;
  const overallPctBefore=before.overallTotal>0?Math.round((before.overallDone/before.overallTotal)*100):0;
  const overallPctAfter=current.overallTotal>0?Math.round((current.overallDone/current.overallTotal)*100):0;
  return normalizeSessionProgressDelta({
    stageDoneDelta:current.stageDone-before.stageDone,
    stagePctDelta:stagePctAfter-stagePctBefore,
    overallDoneDelta:current.overallDone-before.overallDone,
    overallPctDelta:overallPctAfter-overallPctBefore,
    stageProgressDelta:Math.round(current.stageProgress)-Math.round(Number(before.stageProgress||0)),
    overallProgressDelta:Math.round(current.overallProgress)-Math.round(Number(before.overallProgress||0))
  });
}
function updateSessionRuntimeSession(nextSession){
  if(!isExecutionStateObject(S.execution)) return;
  S.execution.session=normalizeExecutionSession(nextSession||getExecutionSession(),{
    stageId:getExecutionSessionStage()?.id||'',
    goal:getExecutionSession()?.goal||S.user.goal||''
  });
  S.execution.updatedAt=nowIso();
  syncActiveSessionRuntime();
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
  const total=Math.max(3,list.length);
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
    const startDate=index===0
      ? toDateInputValue(baseDate)
      : hasDeadline
        ? toDateInputValue(new Date(baseDate.getTime()+(((deadline.getTime()-baseDate.getTime())*index)/total)))
        : toDateInputValue(new Date(baseDate.getTime()+(index*7*24*60*60*1000)));
    return {
      id:stageId,
      index:index+1,
      title:clipText(phase?.title||buildFallbackStageTitle(index,S?.user?.goal||''),80),
      objective:objectiveClean,
      outcome:outcomeClean,
      whyThisStageMatters:reasoningClean,
      reasoning:reasoningClean,
      startDate,
      targetDate,
      status:index===0?'active':'locked',
      completionCriteria:Array.isArray(phase?.completion_criteria) && phase.completion_criteria.length>=3
        ? phase.completion_criteria.map((item)=>clipText(item,90)).filter(Boolean).slice(0,4)
        : resolvePhaseCompletionCriteria(phase),
      executionFocus:clipText(phase?.executionFocus||phase?.execution_focus||'',160),
      tasksGenerated:false,
      tasksGeneratedAt:'',
      detailsGenerated:false,
      detailsGeneratedAt:'',
      progress:0,
      tasksPromptSignature:'',
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
    taskHistoryById:{},
    taskHistoryByStage:{},
    tasksStatus:'not_generated',
    tasksByStage:{},
    taskGenerationByStage:{},
    taskGenerationErrorsByStage:{},
    session:createExecutionSessionTemplate({
      stageId:list[0]?.id||'',
      goal:S.user.goal||'',
      taskIds:[]
    }),
    sessionHistory:[]
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
  if(S.execution?.taskHistoryById&&Object.prototype.hasOwnProperty.call(S.execution.taskHistoryById,key)){
    return S.execution.taskHistoryById[key];
  }
  return null;
}
function getCanonicalExecutionActiveStageIndex(){
  return getExecutionActiveStageIndex();
}
function getCanonicalExecutionActiveStage(){
  return getExecutionStage(getCanonicalExecutionActiveStageIndex());
}
function getExecutionRoadmapView(){
  const stages=getExecutionStages();
  return stages.map((stage,index)=>{
    const stageTasks=getTasksForStage(index,{includeArchived:false});
    const progress=Number.isFinite(Number(stage?.progress))
      ? Math.max(0,Math.min(100,Number(stage.progress)))
      : (stageTasks.length
        ? Math.round((stageTasks.filter((task)=>task.status==='done'||task.done).length/stageTasks.length)*100)
        : 0);
    return {
      ...stage,
      index,
      progress,
      taskCount:stageTasks.length,
      tasks:stageTasks
    };
  });
}
function getRoadmapViewStages(){
  const executionStages=getExecutionRoadmapView();
  if(executionStages.length) return executionStages;
  return Array.isArray(S.roadmap)?S.roadmap:[];
}
function getExecutionActiveTasks(){
  return getTasksForStage(getCanonicalExecutionActiveStageIndex(),{includeArchived:false});
}
function getVisibleActiveTasks(){
  const activeTasks=getExecutionActiveTasks();
  return activeTasks.length?activeTasks:(Array.isArray(S.tasks)?S.tasks:[]);
}
function getAllExecutionTasks(){
  const activeTasks=S.execution?.tasksById&&typeof S.execution.tasksById==='object'
    ? Object.values(S.execution.tasksById)
    : [];
  const historyTasks=S.execution?.taskHistoryById&&typeof S.execution.taskHistoryById==='object'
    ? Object.values(S.execution.taskHistoryById)
    : [];
  const seen=new Set();
  return [...activeTasks,...historyTasks].filter((task)=>{
    const key=String(task?.id||'');
    if(!key||seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
function ensureExecutionTaskHistoryStore(){
  if(!isExecutionStateObject(S.execution)) return;
  if(!S.execution.taskHistoryById||typeof S.execution.taskHistoryById!=='object') S.execution.taskHistoryById={};
  if(!S.execution.taskHistoryByStage||typeof S.execution.taskHistoryByStage!=='object') S.execution.taskHistoryByStage={};
}
function cloneExecutionTaskRecord(task){
  if(!task) return null;
  return JSON.parse(JSON.stringify(task));
}
function addExecutionTaskToHistory(task,stage){
  if(!isExecutionStateObject(S.execution)||!task) return;
  ensureExecutionTaskHistoryStore();
  const snapshot=cloneExecutionTaskRecord(task);
  if(!snapshot) return;
  const stageId=String(stage?.id||snapshot.linkedStageId||'');
  const key=String(snapshot.id);
  S.execution.taskHistoryById[key]=snapshot;
  if(stageId){
    if(!Array.isArray(S.execution.taskHistoryByStage[stageId])) S.execution.taskHistoryByStage[stageId]=[];
    if(!S.execution.taskHistoryByStage[stageId].some((existingId)=>String(existingId)===key)){
      S.execution.taskHistoryByStage[stageId].push(snapshot.id);
    }
  }
}
function removeExecutionTaskFromActiveStore(taskId){
  if(!isExecutionStateObject(S.execution)) return;
  delete S.execution.tasksById[String(taskId)];
}
function archiveStageTasksToHistory(stageIndex,opts={}){
  const stage=getExecutionStage(stageIndex);
  if(!stage) return [];
  const includeActive=opts.includeActive!==false;
  const keepStageTaskIds=opts.keepStageTaskIds!==false;
  const taskIds=Array.isArray(stage.taskIds)?[...stage.taskIds]:[];
  const archived=[];
  taskIds.forEach((taskId)=>{
    const task=getExecutionTaskById(taskId);
    if(!task) return;
    if(task.status==='archived') return;
    const snapshot=cloneExecutionTaskRecord(task);
    if(!snapshot) return;
    snapshot.status='done';
    snapshot.done=true;
    snapshot.completedAt=snapshot.completedAt||nowIso();
    archived.push(snapshot);
    addExecutionTaskToHistory(snapshot,stage);
    if(includeActive) removeExecutionTaskFromActiveStore(snapshot.id);
  });
  if(!keepStageTaskIds){
    stage.taskIds=[];
  }
  return archived;
}
function pruneFutureStageTasks(activeStageIndex){
  const stages=getExecutionStages();
  if(!stages.length||!isExecutionStateObject(S.execution)) return false;
  let changed=false;
  const futureStageIds=new Set();
  stages.forEach((stage,idx)=>{
    if(idx<=activeStageIndex) return;
    if(Array.isArray(stage.taskIds)&&stage.taskIds.length){
      stage.taskIds.forEach((taskId)=>{
        futureStageIds.add(String(taskId));
        removeExecutionTaskFromActiveStore(taskId);
      });
      changed=true;
    }
    stage.taskIds=[];
    stage.tasksGenerated=false;
    stage.tasksGeneratedAt='';
    stage.tasksPromptSignature='';
    const stageId=String(stage.id||'');
    if(stageId){
      S.execution.taskGenerationByStage[stageId]='not_generated';
      if(S.execution.tasksByStage&&typeof S.execution.tasksByStage==='object'){
        delete S.execution.tasksByStage[stageId];
      }
    }
  });
  if(futureStageIds.size){
    Object.keys(S.execution.taskHistoryById||{}).forEach((taskId)=>{
      if(futureStageIds.has(String(taskId))){
        delete S.execution.taskHistoryById[taskId];
      }
    });
    Object.keys(S.execution.taskHistoryByStage||{}).forEach((stageId)=>{
      const ids=Array.isArray(S.execution.taskHistoryByStage[stageId])?S.execution.taskHistoryByStage[stageId]:[];
      S.execution.taskHistoryByStage[stageId]=ids.filter((taskId)=>!futureStageIds.has(String(taskId)));
      if(!S.execution.taskHistoryByStage[stageId].length){
        delete S.execution.taskHistoryByStage[stageId];
      }
    });
  }
  return changed;
}
function reconcileExecutionTaskStores(activeStageIndex){
  if(!isExecutionStateObject(S.execution)) return false;
  ensureExecutionTaskHistoryStore();
  const stages=getExecutionStages();
  if(!stages.length) return false;
  const safeActiveIndex=Math.max(0,Math.min(stages.length-1,Number(activeStageIndex)||0));
  let changed=false;
  const activeStoreTasks=Object.values(S.execution.tasksById||{});
  const activeStageTasks=activeStoreTasks.filter((task)=>{
    const taskStageIndex=Number(task?.linkedStageIndex);
    return Number.isFinite(taskStageIndex)&&taskStageIndex===safeActiveIndex&&task.status!=='archived';
  });
  const activeStageTaskIds=activeStageTasks.map((task)=>Number(task.id)).filter((id)=>Number.isFinite(id));
  stages.forEach((stage,idx)=>{
    if(!stage) return;
    const stageId=String(stage.id||'');
    const stageTaskIds=Array.isArray(stage.taskIds)?stage.taskIds.map((id)=>Number(id)).filter((id)=>Number.isFinite(id)):[];
    if(idx<safeActiveIndex){
      activeStoreTasks.forEach((task)=>{
        const taskStageIndex=Number(task?.linkedStageIndex);
        if(!Number.isFinite(taskStageIndex)||taskStageIndex!==idx||task.status==='archived') return;
        addExecutionTaskToHistory(task,stage);
        delete S.execution.tasksById[String(task.id)];
        changed=true;
      });
      const mergedIds=new Set(stageTaskIds);
      Object.values(S.execution.taskHistoryById||{}).forEach((task)=>{
        if(Number(task?.linkedStageIndex)===idx) mergedIds.add(Number(task.id));
      });
      stage.taskIds=[...mergedIds].filter((id)=>Number.isFinite(id));
      stage.status='completed';
      stage.progress=100;
      stage.tasksGenerated=stage.taskIds.length>0;
      if(stage.taskIds.length) stage.tasksGeneratedAt=stage.tasksGeneratedAt||nowIso();
      if(stageId){
        S.execution.tasksByStage[stageId]=[...stage.taskIds];
        S.execution.taskGenerationByStage[stageId]='ready';
        delete S.execution.taskGenerationErrorsByStage[stageId];
      }
      return;
    }
    if(idx===safeActiveIndex){
      const activeIds=activeStageTaskIds;
      stage.taskIds=[...activeIds];
      stage.status='active';
      stage.tasksGenerated=activeIds.length>0;
      if(activeIds.length) stage.tasksGeneratedAt=stage.tasksGeneratedAt||nowIso();
      if(stageId){
        S.execution.tasksByStage[stageId]=[...stage.taskIds];
        S.execution.taskGenerationByStage[stageId]=activeIds.length?'ready':'not_generated';
        delete S.execution.taskGenerationErrorsByStage[stageId];
      }
      return;
    }
    activeStoreTasks.forEach((task)=>{
      const taskStageIndex=Number(task?.linkedStageIndex);
      if(!Number.isFinite(taskStageIndex)||taskStageIndex!==idx||task.status==='archived') return;
      delete S.execution.tasksById[String(task.id)];
      changed=true;
    });
    if(stageTaskIds.length||stage.taskIds.length){
      stage.taskIds=[];
      changed=true;
    }
    stage.status='locked';
    stage.progress=0;
    stage.tasksGenerated=false;
    stage.tasksGeneratedAt='';
    stage.tasksPromptSignature='';
    if(stageId){
      S.execution.tasksByStage[stageId]=[];
      S.execution.taskGenerationByStage[stageId]='not_generated';
      delete S.execution.taskGenerationErrorsByStage[stageId];
    }
  });
  Object.values(activeStoreTasks).forEach((task)=>{
    const taskStageIndex=Number(task?.linkedStageIndex);
    if(!Number.isFinite(taskStageIndex)) return;
    if(taskStageIndex>safeActiveIndex){
      delete S.execution.tasksById[String(task.id)];
      changed=true;
    }
  });
  return changed;
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
    }))
    .map((task)=>decorateTaskWithMilestoneMeta(task));
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
    S.progress.tasksDone=getVisibleActiveTasks().filter((task)=>task.done||task.status==='done').length;
    return;
  }
  stages.forEach((stage,idx)=>{
    const tasks=getTasksForStage(idx,{includeArchived:false});
    if(stage.status==='completed') stage.progress=100;
    else if(!tasks.length) stage.progress=0;
    else stage.progress=Math.round(calculateTaskProgressValue(tasks));
  });
  const completedStages=stages.filter((stage)=>stage.status==='completed').length;
  const allTasks=getAllExecutionTasks().filter((task)=>task.status!=='archived');
  const doneTasks=allTasks.filter((task)=>task.status==='done'||task.done).length;
  S.progress.milestones=completedStages;
  S.progress.tasksDone=doneTasks;
}
function calculateTaskProgressValue(tasks=[]){
  const items=Array.isArray(tasks)?tasks:[];
  if(!items.length) return 0;
  const weighted=items.reduce((sum,task)=>sum+getTaskProgressWeight(task),0);
  return Math.max(0,Math.min(100,(weighted/items.length)*100));
}
function getTaskProgressWeight(task){
  if(!task||typeof task!=='object') return 0;
  if(task.status==='done'||task.done) return 1;
  if(task.status==='blocked') return clampPercentage(task.progressPct||0)/100;
  const pct=Number(task.progressPct||task.completionPct||0);
  if(!Number.isFinite(pct) || pct<=0) return 0;
  return Math.max(0,Math.min(1,pct/100));
}
function syncActiveTasksFromExecution(){
  const stages=getExecutionStages();
  const activeIndex=getExecutionActiveStageIndex();
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'syncActiveTasksFromExecution',
    action:'tasks_sync_started',
    activeStageIndex:activeIndex,
    stageCount:stages.length,
    activeTaskIds:stages[activeIndex]
      ? getTasksForStage(activeIndex,{includeArchived:false}).map((task)=>Number(task.id)).filter((id)=>Number.isFinite(id))
      : []
  });
  if(!stages.length){
    S.progress.tasksDone=getVisibleActiveTasks().filter((task)=>task.done).length;
    return;
  }
  if(S.execution?.status==='completed'){
    S.execution.currentStageIndex=Math.max(0,stages.length-1);
    S.tasks=[];
    logInfo({
      area:'frontend',
      module:'frontend/script.js',
      function:'syncActiveTasksFromExecution',
      action:'tasks_sync_completed',
      activeStageIndex:S.execution.currentStageIndex,
      taskCount:0
    });
    return;
  }
  S.execution.currentStageIndex=activeIndex;
  const activeTasks=getTasksForStage(activeIndex,{includeArchived:false});
  S.tasks=activeTasks.map((task)=>({
    ...task,
    prio:normalizeTaskPriority(task.prio||task.priority),
    priority:normalizeTaskPriority(task.prio||task.priority),
    done:Boolean(task.done)||task.status==='done',
    text:getTaskTitle(task),
    linkedStage:Math.max(1,(Number(task.linkedStageIndex)||0)+1)
  })).map((task)=>decorateTaskWithMilestoneMeta(task));
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'syncActiveTasksFromExecution',
    action:'tasks_sync_completed',
    activeStageIndex:activeIndex,
    taskCount:activeTasks.length,
    taskIds:activeTasks.map((task)=>Number(task.id)).filter((id)=>Number.isFinite(id))
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
    stage.tasksPromptSignature='';
    stage.detailsGenerated=false;
    stage.detailsGeneratedAt='';
    stage.whyThisStageMatters=clipText(stage.whyThisStageMatters||stage.reasoning||'',220);
    stage.executionFocus=clipText(stage.executionFocus||'',160);
    stage.completionCriteria=Array.isArray(stage.completionCriteria)?stage.completionCriteria:[];
    applyMvpStageDetailsDefaults(stage);
    setStageTaskStatus(idx,'not_generated');
  });
  S.execution.session=normalizeExecutionSession(S.execution.session,{
    stageId:S.execution.stages[0]?.id||'',
    goal:S.user.goal||''
  });
  S.execution.session.status='planned';
  S.execution.session.startedAt='';
  S.execution.session.endedAt='';
  S.execution.session.review=normalizeExecutionSessionReview();
  S.execution.session.progressDelta=normalizeSessionProgressDelta();
  S.execution.session.reviewOpenedAt='';
  S.execution.session.reviewAppliedAt='';
  S.execution.session.baseline=buildSessionBaseline(0);
  S.execution.session.taskIds=Array.isArray(S.execution.session.taskIds)&&S.execution.session.taskIds.length
    ? S.execution.session.taskIds.slice(0,3)
    : recommendSessionTaskIds(0);
  S.execution.session.goal=String(S.execution.session.goal||S.user.goal||S.execution.stages[0]?.objective||'');
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
    S.activeSession=null;
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
  if(!Array.isArray(S.execution.sessionHistory)){
    S.execution.sessionHistory=[];
    changed=true;
  }
  if(!S.execution.session||typeof S.execution.session!=='object'){
    S.execution.session=createExecutionSessionTemplate({
      stageId:getExecutionStage(getExecutionActiveStageIndex())?.id||'',
      goal:S.user.goal||''
    });
    changed=true;
  }
  const sessionBefore=JSON.stringify(S.execution.session);
  const normalizedSession=normalizeExecutionSession(S.execution.session,{
    stageId:getExecutionStage(getExecutionActiveStageIndex())?.id||'',
    goal:S.user.goal||S.execution.session?.goal||''
  });
  if(normalizedSession.stageId!==S.execution.session.stageId||normalizedSession.goal!==S.execution.session.goal||normalizedSession.status!==S.execution.session.status||JSON.stringify(normalizedSession.taskIds)!==JSON.stringify(S.execution.session.taskIds)){
    changed=true;
  }
  S.execution.session=normalizedSession;
  if(!String(S.execution.tasksStatus||'')){
    S.execution.tasksStatus='not_generated';
    changed=true;
  }
  const stages=getExecutionStages();
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
    stage.tasksPromptSignature=String(stage.tasksPromptSignature||'');
    stage.detailsGenerated=Boolean(stage.detailsGenerated);
    stage.detailsGeneratedAt=String(stage.detailsGeneratedAt||'');
    stage.progress=Number(stage.progress)||0;
    stage.whyThisStageMatters=clipText(stage.whyThisStageMatters||stage.reasoning||'',220);
    stage.reasoning=clipText(stage.reasoning||stage.whyThisStageMatters||'',220);
    stage.completionCriteria=normalizeCompletionCriteria(stage.completionCriteria||stage.completion_criteria||[],stage.objective||'');
    stage.executionFocus=clipText(stage.executionFocus||stage.execution_focus||'',160);
    applyMvpStageDetailsDefaults(stage);
  });
  const hasStoredTasks=Object.keys(S.execution.tasksById).length>0;
  const canMigrateLegacy=Array.isArray(S.tasks)&&S.tasks.length>0;
  if((!hasStoredTasks&&canMigrateLegacy)||options.mergeLegacyTasks){
    if(migrateLegacyTasksIntoExecution(S.tasks)) changed=true;
  }
  normalizeExecutionStatuses();
  const activeIndex=getExecutionActiveStageIndex();
  if(pruneFutureStageTasks(activeIndex)) changed=true;
  if(reconcileExecutionTaskStores(activeIndex)) changed=true;
  normalizeExecutionStatuses();
  refreshExecutionProgress();
  syncActiveTasksFromExecution();
  syncActiveSessionRuntime();
  if(isSessionRunning()) startSessionTimer();
  else clearSessionTimer();
  return changed;
}
function hasExecutionStateReady(){
  return isExecutionStateObject(S.execution)&&getExecutionStages().length>0;
}
function setStageTasks(stageIndex,tasks,opts={}){
  const stage=getExecutionStage(stageIndex);
  if(!stage||!Array.isArray(tasks)) return [];
  const replace=opts.replace!==false;
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'setStageTasks',
    action:'stage_tasks_persistence_started',
    stageIndex,
    taskCount:tasks.length,
    taskIds:tasks.map((task)=>Number(task.id)).filter((id)=>Number.isFinite(id)),
    priorities:tasks.map((task)=>String(task.priority||task.prio||'')),
    replace
  });
  if(replace){
    archiveStageTasksToHistory(stageIndex,{includeActive:true,keepStageTaskIds:false});
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
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'setStageTasks',
    action:'stage_tasks_persistence_completed',
    stageIndex,
    taskCount:persisted.length,
    taskIds:persisted.map((task)=>Number(task.id)).filter((id)=>Number.isFinite(id))
  });
  logStageTaskSnapshot('stage_tasks_saved',stageIndex,{savedTaskCount:persisted.length});
  return persisted;
}
function buildStageTaskGenerationSignature(stage,context={}){
  const normalizedStage=normalizeStageForEnrichment(stage||{},Number(stage?.index||1)-1);
  const parts=[
    'tasks-skeleton-detail-v1',
    clipText(normalizedStage.title,80),
    clipText(normalizedStage.objective,180),
    clipText(normalizedStage.outcome,140),
    clipText(normalizedStage.reasoning||normalizedStage.whyThisStageMatters||'',160),
    clipText(context.project_name,90),
    clipText(context.startup_idea,220),
    clipText(context.primary_goal,140),
    clipText(context.current_stage,50),
    clipText(context.built_status,180),
    clipText(context.niche,90),
    clipText(context.target_audience,120),
    clipText(context.resources,180),
    clipText(context.blocker,120),
    clipText(context.daily_hours,40),
    clipText(context.deadline,30),
    clipText(context.stageStartDate||'',20),
    clipText(context.stageTargetDate||'',20),
    String(context.targetTaskCount||'')
  ];
  return parts.join('|').toLowerCase();
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
  if(S.execution?.status==='completed'){
    logWarn({
      area:'frontend',
      module:'frontend/script.js',
      function:'generateTasksForStage',
      action:'generate_stage_tasks_skipped_execution_completed',
      stageIndex
    });
    return getTasksForStage(stageIndex,{includeArchived:false});
  }
  const activeIndex=getExecutionActiveStageIndex();
  if(stageIndex!==activeIndex){
    logWarn({
      area:'frontend',
      module:'frontend/script.js',
      function:'generateTasksForStage',
      action:'generate_stage_tasks_skipped_non_active_stage',
      stageIndex,
      activeIndex
    });
    return getTasksForStage(stageIndex,{includeArchived:false});
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
  const onboardingContext=buildRoadmapOnboardingContext();
  const phase=S.roadmap?.[stageIndex]||{};
  const normalizedStage=normalizeStageForEnrichment({
    title:stage?.title||phase?.title||`Stage ${stageIndex+1}`,
    objective:stage?.objective||phase?.objective||'',
    outcome:stage?.outcome||phase?.outcome||''
  },stageIndex);
  const existing=getTasksForStage(stageIndex,{includeArchived:false});
  const stageCount=Math.max(1,getExecutionStages().length||S.roadmap?.length||1);
  const targetTaskCount=getTargetTaskCountForStage(stageIndex,stageCount,S.user.deadline);
  const stageStartDate=toIsoDateOnly(stage?.startDate||phase?.startDate||'')||toDateInputValue(new Date());
  const stageTargetDate=toIsoDateOnly(stage?.targetDate||phase?.target_date||S.user.deadline||'')||S.user.deadline||'';
  const deadlinePlan=buildTaskDeadlinePlan({
    stageStartDate,
    stageTargetDate,
    deadline:stageTargetDate||S.user.deadline||'',
    taskCount:targetTaskCount
  });
  const tasksPromptSignature=buildStageTaskGenerationSignature(normalizedStage,{
    ...onboardingContext,
    stageStartDate,
    stageTargetDate,
    targetTaskCount
  });
  if(existing.length>=targetTaskCount&&stage.tasksGenerated&&!options.force&&stage.tasksPromptSignature===tasksPromptSignature){
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
    const taskOutputLanguage=detectTaskOutputLanguage(
      normalizedStage.title||'',
      normalizedStage.objective||'',
      normalizedStage.outcome||'',
      onboardingContext.project_name||'',
      onboardingContext.startup_idea||'',
      onboardingContext.primary_goal||S.user.goal||''
    );
    const intensityDesc=taskOutputLanguage==='English'
      ? 'balanced working pace'
      : 'сбалансированный рабочий темп';
    const contextMapping=roadmapContextPresence(onboardingContext);
    const skeletonRequestId=createClientRequestId(`tasks-skeleton-s${stageIndex+1}`);
    const tasksPrompt=buildMilestoneTasksPrompt(normalizedStage,String(targetTaskCount),intensityDesc,{
      stageIndex,
      context:onboardingContext,
      taskCount:targetTaskCount,
      stageStartDate,
      stageTargetDate
    });
    logRoadmapPipelineEvent('active_stage_task_generation_started',{
      requestId:skeletonRequestId,
      stageCount:getExecutionStages().length,
      activeStageId:stage.id,
      activeStageIndex:stageIndex,
      promptChars:tasksPrompt.length,
      requestedMaxTokens:TASK_SKELETON_DEFAULT_MAX_TOKENS
    });
    logInfo({
      area:'frontend',
      module:'frontend/script.js',
      function:'generateTasksForStage',
      action:'tasks_skeleton_request_prepared',
      stageIndex,
      activeStageId:stage.id,
      activeStageTitle:clipText(stage?.title||normalizedStage.title||'',80),
      stageTargetDate,
      deadlinePlanCount:Array.isArray(deadlinePlan)?deadlinePlan.length:0
    });
    try{
      const skeletonResult=await geminiJSON(
        tasksPrompt,
        null,
        TASK_SKELETON_DEFAULT_MAX_TOKENS,
        '',
        {
          temperature:0.2,
          clientRequestId:skeletonRequestId,
          stageObjective:normalizedStage.objective||stage.objective||'',
          stageTitle:normalizedStage.title||stage.title||`Stage ${stageIndex+1}`,
          stageIndex,
          stageStartDate,
          stageTargetDate,
          deadline:stageTargetDate||S.user.deadline||'',
          taskDeadline:stageTargetDate||S.user.deadline||'',
          targetCount:targetTaskCount,
          returnMeta:true,
          contextFields:contextMapping.present,
          missingContextFields:contextMapping.missing
      },
        'tasks_skeleton'
      );
      const skeletonTasks=Array.isArray(skeletonResult?.data)?skeletonResult.data.slice(0,targetTaskCount):[];
      logRoadmapPipelineEvent('active_stage_tasks_skeleton_parsed',{
        requestId:skeletonResult?.meta?.requestId||skeletonRequestId,
        stageCount:getExecutionStages().length,
        activeStageId:stage.id,
        activeStageIndex:stageIndex,
        taskCount:skeletonTasks.length,
        targetCount:targetTaskCount
      });
      while(skeletonTasks.length<targetTaskCount){
        const fallbackTitle=fallbackFounderTaskBlueprints({
          goal:onboardingContext.primary_goal||S.user.goal||'',
          stageObjective:normalizedStage.objective||stage.objective||'',
          deadline:stageTargetDate||S.user.deadline||'',
          stageLabel:normalizedStage.title||stage.title||`Stage ${stageIndex+1}`
        })[skeletonTasks.length % 10]?.title||`Task ${skeletonTasks.length+1}`;
        skeletonTasks.push({title:fallbackTitle,linkedStage:stageIndex+1});
      }
      logRoadmapPipelineEvent('active_stage_task_detail_generation_started',{
        requestId:skeletonResult?.meta?.requestId||skeletonRequestId,
        stageCount:getExecutionStages().length,
        activeStageId:stage.id,
        activeStageIndex:stageIndex,
        taskCount:skeletonTasks.length
      });
      const enrichedTasks=[];
      const detailFailures=[];
      for(let taskIdx=0;taskIdx<skeletonTasks.length;taskIdx+=1){
        const skeletonTask=skeletonTasks[taskIdx]||{};
        const detailRequestId=createClientRequestId(`task-detail-s${stageIndex+1}-t${taskIdx+1}`);
        const detailPrompt=buildMilestoneTaskDetailPrompt(skeletonTask,normalizedStage,intensityDesc,{
          stageIndex,
          context:onboardingContext,
          taskCount:targetTaskCount,
          taskIndex:taskIdx+1,
          stageStartDate,
          stageTargetDate,
          taskDeadline:deadlinePlan[taskIdx]||stageTargetDate||S.user.deadline||''
        });
        try{
          const detailResult=await geminiJSON(
            detailPrompt,
            null,
            TASK_DETAIL_DEFAULT_MAX_TOKENS,
            '',
            {
              temperature:0.2,
              clientRequestId:detailRequestId,
              stageObjective:normalizedStage.objective||stage.objective||'',
              stageTitle:normalizedStage.title||stage.title||`Stage ${stageIndex+1}`,
              stageIndex,
              stageStartDate,
              stageTargetDate,
              deadline:stageTargetDate||S.user.deadline||'',
              targetCount:targetTaskCount,
              returnMeta:true,
              contextFields:contextMapping.present,
              missingContextFields:contextMapping.missing
            },
            'task_detail'
          );
          const detailTask=Array.isArray(detailResult?.data)?detailResult.data[0]:null;
          if(!detailTask) throw new Error('Task detail response contained no enriched task.');
          enrichedTasks.push({
            ...detailTask,
            title:getTaskTitle(detailTask)||skeletonTask.title,
            text:getTaskTitle(detailTask)||skeletonTask.title,
            priority:normalizeTaskPriority(detailTask?.priority??detailTask?.prio),
            prio:normalizeTaskPriority(detailTask?.prio??detailTask?.priority),
            deadline:detailTask?.deadline||'',
            linkedStage:stageIndex+1,
            linked_stage:stageIndex+1
          });
        }catch(detailError){
          const errorMessage=String(detailError?.message||'');
          detailFailures.push({taskNumber:taskIdx+1,errorMessage});
          const fallbackTask=buildLocalTaskDetailFallback(skeletonTask,normalizedStage,{
            stageIndex,
            stageTitle:normalizedStage.title||stage.title||`Stage ${stageIndex+1}`,
            stageObjective:normalizedStage.objective||stage.objective||'',
            stageOutcome:normalizedStage.outcome||stage.outcome||'',
            stageStartDate,
            stageTargetDate,
            deadline:stageTargetDate||S.user.deadline||'',
            taskDeadline:deadlinePlan[taskIdx]||stageTargetDate||S.user.deadline||'',
            taskIndex:taskIdx+1,
            taskTitle:skeletonTask?.title||`Task ${taskIdx+1}`
          });
          enrichedTasks.push(fallbackTask);
          logWarn({
            area:'frontend',
            module:'frontend/script.js',
            function:'generateTasksForStage',
            action:'task_detail_generation_failed',
            stageIndex,
            taskNumber:taskIdx+1,
            errorMessage,
            fallbackApplied:true
          });
        }
      }
      logRoadmapPipelineEvent('active_stage_task_detail_generation_completed',{
        requestId:skeletonResult?.meta?.requestId||skeletonRequestId,
        stageCount:getExecutionStages().length,
        activeStageId:stage.id,
        activeStageIndex:stageIndex,
        taskCount:enrichedTasks.length,
        detailFailures:detailFailures.length
      });
      const normalized=normalizeFounderTasks(enrichedTasks,{
        stageObjective:phase?.objective||stage.objective||'',
        stageTitle:phase?.title||stage.title||`Stage ${stageIndex+1}`,
        stageIndex,
        deadline:stageTargetDate||S.user.deadline||'',
        stageStartDate,
        stageTargetDate,
        targetCount:targetTaskCount,
        deadlinePlan,
        allowBlueprintFallback:true
      }).slice(0,targetTaskCount);
      if(!normalized.length){
        throw new Error('Task enrichment failed for all generated skeleton tasks.');
      }
      logRoadmapPipelineEvent('active_stage_task_persistence_started',{
        requestId:skeletonResult?.meta?.requestId||skeletonRequestId,
        stageCount:getExecutionStages().length,
        activeStageId:stage.id,
        activeStageIndex:stageIndex,
        taskCount:normalized.length
      });
      const persisted=setStageTasks(stageIndex,normalized,{replace:true});
      stage.tasksGenerated=persisted.length>=targetTaskCount;
      stage.tasksPromptSignature=tasksPromptSignature;
      setStageTaskStatus(stageIndex,'ready');
      logRoadmapPipelineEvent('stage_task_generation_succeeded',{
        requestId:skeletonResult?.meta?.requestId||skeletonRequestId,
        stageCount:getExecutionStages().length,
        activeStageId:stage.id,
        activeStageIndex:stageIndex,
        taskCount:persisted.length
      });
      logStageTaskSnapshot('stage_tasks_generated',stageIndex,{
        generatedCount:normalized.length,
        detailFailures:detailFailures.length
      });
      logExecutionFlowEvent('tasks_generated_count',stageIndex,{generatedCount:persisted.length,fallback:false});
      logExecutionFlowEvent('tasks_saved',stageIndex,{savedCount:persisted.length});
      logInfo({
        area:'frontend',
        module:'frontend/script.js',
        function:'generateTasksForStage',
        action:'tasks_generated_count',
        stageIndex,
        generatedCount:persisted.length,
        fallback:false,
        detailFailures:detailFailures.length
      });
      logRoadmapPipelineEvent('active_stage_tasks_generated',{
        requestId:skeletonResult?.meta?.requestId||skeletonRequestId,
        stageCount:getExecutionStages().length,
        activeStageId:stage.id,
        activeStageIndex:stageIndex,
        promptChars:skeletonResult?.meta?.promptChars||tasksPrompt.length,
        requestedMaxTokens:TASK_SKELETON_DEFAULT_MAX_TOKENS,
        finishReason:skeletonResult?.meta?.finishReason||'',
        taskCount:persisted.length
      });
      logRoadmapPipelineEvent('active_stage_tasks_saved',{
        requestId:skeletonResult?.meta?.requestId||skeletonRequestId,
        stageCount:getExecutionStages().length,
        activeStageId:stage.id,
        activeStageIndex:stageIndex,
        promptChars:skeletonResult?.meta?.promptChars||tasksPrompt.length,
        requestedMaxTokens:TASK_SKELETON_DEFAULT_MAX_TOKENS,
        finishReason:skeletonResult?.meta?.finishReason||'',
        taskCount:persisted.length
      });
      saveTasks();
      saveAll();
      return persisted;
    }catch(error){
      const errorMessage=String(error?.message||'');
      logError({
        area:'frontend',
        module:'frontend/script.js',
        function:'generateTasksForStage',
        action:'tasks_generation_failed_error',
        stageIndex,
        errorMessage,
        existingTaskCount:existing.length,
        activeTaskIds:getActiveStageTasks().map((task)=>Number(task.id)).filter((id)=>Number.isFinite(id))
      });
      logInfo({
        area:'frontend',
        module:'frontend/script.js',
        function:'generateTasksForStage',
        action:'tasks_generation_failed',
        stageIndex,
        errorMessage
      });
      const preservedCount=existing.length;
      setStageTaskStatus(stageIndex,preservedCount?'ready':'error',errorMessage);
      logStageTaskSnapshot('stage_tasks_generated',stageIndex,{generatedCount:preservedCount,fallback:false,errorMessage});
      logExecutionFlowEvent('tasks_generated_count',stageIndex,{generatedCount:preservedCount,fallback:false});
      logInfo({
        area:'frontend',
        module:'frontend/script.js',
        function:'generateTasksForStage',
        action:'tasks_generated_count',
        stageIndex,
        generatedCount:preservedCount,
        fallback:false
      });
      logRoadmapPipelineEvent('tasks_generation_failed',{
        requestId:skeletonRequestId,
        stageCount:getExecutionStages().length,
        activeStageId:stage.id,
        activeStageIndex:stageIndex,
        promptChars:tasksPrompt.length,
        requestedMaxTokens:TASK_SKELETON_DEFAULT_MAX_TOKENS,
        finishReason:'',
        taskCount:preservedCount,
        errorMessage
      });
      logRoadmapPipelineEvent('stage_task_generation_failed_nonfatal',{
        requestId:skeletonRequestId,
        stageCount:getExecutionStages().length,
        activeStageId:stage.id,
        activeStageIndex:stageIndex,
        promptChars:tasksPrompt.length,
        requestedMaxTokens:TASK_SKELETON_DEFAULT_MAX_TOKENS,
        finishReason:'',
        taskCount:preservedCount,
        errorMessage:'ai_tasks_not_replaced_with_fallback'
      });
      saveTasks();
      saveAll();
      if(options.silentFallback!==true){
        toast2('Task generation failed','AI tasks were not replaced with static fallback tasks.');
      }
      return existing;
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
  if(S.execution?.status==='completed'){
    logInfo({
      area:'frontend',
      module:'frontend/script.js',
      function:'initializeTasksForActiveStage',
      action:'stage_task_generation_skipped_execution_completed'
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
  const strategyDesc=String(options.strategyDesc||'').trim();
  const prompt=buildRoadmapSkeletonPrompt({strategyDesc,context});
  return {
    context,
    contextMapping,
    strategyDesc,
    prompt,
    requestedMaxTokens:ROADMAP_SKELETON_MAX_TOKENS,
    clientRequestId:createClientRequestId('roadmap-skeleton')
  };
}
async function generateStageTasksAfterRoadmap(activeIndex,activeStage,reason){
  const stages=getExecutionStages();
  setStageTaskStatus(activeIndex,'loading');
  logRoadmapPipelineEvent('post_roadmap_task_generation_started',{
    stageCount:stages.length,
    activeStageId:activeStage?.id||'',
    activeStageIndex:activeIndex,
    errorMessage:String(reason||'')
  });
  return initializeTasksForActiveStage({force:true,silentFallback:false,reason:String(reason||'roadmap_created')});
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
  logRoadmapPipelineEvent('post_roadmap_tasks_generation_deferred',{
    roadmapId:S.execution?.id||'',
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
    archiveStageTasksToHistory(currentIndex,{includeActive:true,keepStageTaskIds:true});
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
    const nextStage=stages[nextIndex];
    toast2('Milestone completed',`Next milestone unlocked: ${nextStage?.title||`Stage ${nextIndex+1}`}`);
    await initializeTasksForActiveStage({force:true,silentFallback:false,reason:String(options.reason||'milestone_completed')});
    saveTasks();
    saveAll();
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
  const plainTextTaskAction=action==='tasks'||action==='tasks_skeleton'||action==='task_detail';
  if(plainTextTaskAction){
    callOpts.responseMimeType='text/plain';
    if(Object.prototype.hasOwnProperty.call(callOpts,'responseJsonSchema')) delete callOpts.responseJsonSchema;
    if(Object.prototype.hasOwnProperty.call(callOpts,'responseSchema')) delete callOpts.responseSchema;
  }
  if(action!=='roadmap'&&!plainTextTaskAction){
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
    deadline:opts?.deadline||S?.user?.deadline||'',
    stageStartDate:opts?.stageStartDate||'',
    stageTargetDate:opts?.stageTargetDate||opts?.deadline||S?.user?.deadline||'',
    taskDeadline:opts?.taskDeadline||''
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
        responseShape:Array.isArray(response.stages)?`structured:${response.stages.length}`:typeof response.text,
        responseText:clipText(response.text||'',200),
        responseStages:Array.isArray(response.stages)
          ? response.stages.slice(0,6).map((stage,index)=>({
              index,
              title:typeof stage==='string'?stage:clipText(stage?.title||'',80),
              objective:typeof stage==='string'?'':clipText(stage?.objective||'',120),
              outcome:typeof stage==='string'?'':clipText(stage?.outcome||'',120),
            }))
          : [],
        responseStageCount:Number(response.stageCount||0),
        rawPreview:clipText(response.text||'',200)
      });
      const structuredStages=Array.isArray(response.stages)&&response.stages.length?response.stages:null;
      if(structuredStages){
        logExecutionFlowEvent('roadmap_parsed',0,{
          requestId:response.requestId||'',
          stages:summarizeRoadmapStagesForLog(structuredStages.map((item,index)=>({
            title:item?.title||`Stage ${index+1}`,
            objective:item?.objective||'',
            outcome:item?.outcome||'',
            status:index===0?'active':''
          })))
        });
      }
      const parsedStages=structuredStages||parseStages(response.text);
      logInfo({
        area:'frontend',
        module:'frontend/script.js',
        function:'geminiJSON',
        action:'roadmap_parse_inputs',
        requestId:response.requestId||'',
        responseStageCount:Number(response.stageCount||0),
        parsedStageCount:Array.isArray(parsedStages)?parsedStages.length:0,
        structuredStageCount:structuredStages?structuredStages.length:0
      });
      if(!structuredStages){
        logExecutionFlowEvent('roadmap_parsed',0,{
          requestId:response.requestId||'',
          stages:summarizeRoadmapStagesForLog(parsedStages.map((item,index)=>({
            title:typeof item==='string'?item:(item?.title||''),
            objective:typeof item==='string'?'':(item?.objective||''),
            outcome:typeof item==='string'?'':(item?.outcome||''),
            status:index===0?'active':''
          })))
        });
      }
      const normalized=normalizeRoadmapSkeleton(parsedStages);
      logExecutionFlowEvent('roadmap_normalized',0,{
        requestId:response.requestId||'',
        stages:summarizeRoadmapStagesForLog(normalized)
      });
      if(opts?.returnMeta) return {data:normalized,meta};
      return normalized;
    }
    if(action==='tasks'){
      throw new Error('Legacy single-step task generation is disabled.');
    }
    if(action==='tasks_skeleton'){
      const parsedSkeleton=parseTaskSkeletonContract(response.text);
      if(!parsedSkeleton.length){
        throw new Error('Task skeleton response does not match the plain-text contract.');
      }
      if(opts?.returnMeta) return {data:parsedSkeleton,meta};
      return parsedSkeleton;
    }
    if(action==='task_detail'){
      const parsedDetail=parseTaskDetailContract(response.text);
      if(!parsedDetail){
        throw new Error('Task detail response does not match the plain-text contract.');
      }
      const normalizedTasks=normalizeBetaTasks([parsedDetail],{
        ...taskNormalizationContext,
        deadlinePlan:[taskNormalizationContext.taskDeadline||taskNormalizationContext.stageTargetDate||taskNormalizationContext.deadline||'']
      });
      if(!normalizedTasks.length){
        throw new Error('Task detail response contained no usable AI task.');
      }
      if(opts?.returnMeta) return {data:normalizedTasks,meta};
      return normalizedTasks;
    }
    const parsed=parseJSON(response.text,{allowPartial:response.finishReason==='MAX_TOKENS'});
    if(opts?.returnMeta) return {data:parsed,meta};
    return parsed;
  }catch(parseErr){
    if(action==='roadmap'){
      const salvageStages=Array.isArray(response.stages)&&response.stages.length?response.stages:null;
      logWarn({
        area:'frontend',
        module:'frontend/script.js',
        function:'geminiJSON',
        action:salvageStages?'roadmap_salvage_used':'roadmap_partial_fallback',
        errorMessage:String(parseErr?.message||''),
        finishReason:response.finishReason||'',
        requestId:response.requestId||'',
        responseShape:salvageStages?`structured:${salvageStages.length}`:typeof response.text,
        responseText:clipText(response.text||'',200),
        responseStages:Array.isArray(response.stages)
          ? response.stages.slice(0,6).map((stage,index)=>({
              index,
              title:typeof stage==='string'?stage:clipText(stage?.title||'',80),
              objective:typeof stage==='string'?'':clipText(stage?.objective||'',120),
              outcome:typeof stage==='string'?'':clipText(stage?.outcome||'',120),
            }))
          : [],
        responseStageCount:Number(response.stageCount||0)
      });
      const fallback=salvageStages||fallbackRoadmapForMvp();
      logExecutionFlowEvent('fallback_used',0,{requestId:response.requestId||'',stages:summarizeRoadmapStagesForLog(fallback)});
      if(opts?.returnMeta) return {data:fallback,meta};
      return fallback;
    }
    if(action==='tasks'||action==='tasks_skeleton'||action==='task_detail'){
      logWarn({area:'frontend',module:'frontend/script.js',function:'geminiJSON',action:'tasks_parse_failed',errorMessage:String(parseErr?.message||''),finishReason:response.finishReason||'',requestId:response.requestId||''});
      throw parseErr;
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
  progress:{sessions:0,completedSessions:0,interruptedSessions:0,blockedSessions:0,sessionCompletionRate:0,streak:0,hours:0,milestones:0,tasksDone:0,activityLog:[],sessionLog:[]},
  tasks:[], // derived mirror of the active execution stage for legacy UI compatibility
  goals:[], notes:[],
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
        app.style.display='grid';
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
    built_status:clipText(S.user.built||S.user.idea||'',180),
    niche:clipText(S.user.niche,90),
    target_audience:clipText(S.user.audience,120),
    resources:clipText(S.user.resources||S.user.executionStyle||'',180),
    blocker:clipText(S.user.blockers,120),
    daily_hours:clipText(S.user.hours,40),
    deadline:clipText(S.user.deadline,30),
    execution_style:clipText(S.user.executionStyle||S.user.resources||'',180)
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
    'execution_style',
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
  const topTasks=getVisibleActiveTasks().filter(t=>!t.done).slice(0,7).map((t)=>clipText(getTaskTitle(t),60)).join('; ');
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
    ctx.execution_style?`Execution style: ${ctx.execution_style}`:'Execution style: not set',
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
    ensureSessionProgressCounters();
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
function ensureSessionProgressCounters(){
  const sessionLog=Array.isArray(S.progress.sessionLog)?S.progress.sessionLog:[];
  if(!Number.isFinite(Number(S.progress.completedSessions))){
    S.progress.completedSessions=0;
  }
  if(!Number.isFinite(Number(S.progress.interruptedSessions))){
    S.progress.interruptedSessions=0;
  }
  if(!Number.isFinite(Number(S.progress.blockedSessions))){
    S.progress.blockedSessions=0;
  }
  if(Number(S.progress.completedSessions||0)===0 && sessionLog.length){
    S.progress.completedSessions=sessionLog.filter((entry)=>String(entry.status||'')==='completed').length;
    S.progress.interruptedSessions=sessionLog.filter((entry)=>String(entry.status||'')==='interrupted').length;
    S.progress.blockedSessions=sessionLog.filter((entry)=>String(entry.status||'')==='blocked').length;
  }
  S.progress.sessionCompletionRate=Number(S.progress.sessions||0)>0
    ? Math.round(((Number(S.progress.completedSessions||0))/Number(S.progress.sessions||1))*100)
    : 0;
}

/* ══ HELPERS ══ */
function escHtml(s){
  if(s!==null&&s!==undefined&&typeof s!=='string'){
    logDebug({
      area:'frontend',
      module:'frontend/script.js',
      function:'escHtml',
      action:'non_string_input_coerced',
      valueType:typeof s,
      isArray:Array.isArray(s),
      isNull:s===null,
      isObject:typeof s==='object'&&s!==null,
      sampleKeys:typeof s==='object'&&s!==null&&!Array.isArray(s)?Object.keys(s).slice(0,5):[]
    });
  }
  return String(s??'')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}
function toast2(title,body=''){document.getElementById('tt').textContent=title;document.getElementById('tb2').textContent=body;const t=document.getElementById('toast');t.classList.add('on');clearTimeout(t._tm);t._tm=setTimeout(()=>t.classList.remove('on'),3200);}
function togglePill(el){el.classList.toggle('on');}
function getSelectedPills(id){return Array.from(document.querySelectorAll('#'+id+' .pill.on')).map(p=>p.textContent.trim());}
function aiLanguageRules(){return `ВАЖНО:\n- Весь смысловой текст, все формулировки задач, milestones, целей, заметок и советов пиши только на русском языке.\n- Английский допустим только в обязательных ключах JSON, если схема ниже требует английские ключи.\n- Если требуется JSON, верни только чистый JSON без markdown, без комментариев и без пояснений.\n- Значения полей title, objective, task, text, desc и day должны быть на русском языке.`;}
function detectTaskOutputLanguage(...values){
  const sample=values.filter(Boolean).join(' ');
  if(/[А-Яа-яЁё]/.test(sample)) return 'Russian';
  if(/[A-Za-z]/.test(sample)) return 'English';
  return 'Russian';
}
function taskPlainTextLanguageRules(language='Russian'){
  return language==='English'
    ? `LANGUAGE:\n- Write every task value in English.\n- Return only plain-text in the exact contract.\n- No markdown, no commentary, no extra lines outside the contract.`
    : `ЯЗЫК:\n- Пиши все значения задач только на русском языке.\n- Верни только plain-text в точном контракте.\n- Без markdown, без комментариев и без лишних строк вне контракта.`;
}
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
function roadmapMaxTokens(variant='balanced'){
  const _safeVariant=normalizeRoadmapVariant(variant);
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
function buildRoadmapPrompt(strategyDesc=''){
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
  return `Собери milestone roadmap.

Контекст:
- Project: ${ctx.project_name||'не указано'}
- Goal: ${ctx.primary_goal||'не указано'}
- Stage: ${ctx.current_stage||'не указано'}
- Built: ${ctx.built_status||'не указано'}
- Niche: ${ctx.niche||'не указано'}
- Audience: ${ctx.target_audience||'не указано'}
- Execution style: ${ctx.execution_style||'не указано'}
- Resources: ${ctx.resources||'не указано'}
- Blocker: ${ctx.blocker||'нет явных'}
- Hours/day: ${ctx.daily_hours||'не указано'}
- ${horizonLabel}
- Active horizon: ${windowDays} дней
${strategyDesc?`- Pace: ${strategyDesc}`:''}

Сводка:
${summary}

Верни только JSON-объект вида { "stages": [...] }.
Определи число milestones/stages самостоятельно по реальному масштабу, срокам и сложности проекта.
Итоговый roadmap должен содержать минимум 3 milestones.
Не используй фиксированное число.
Каждый stage содержит: title, objective, outcome, reasoning, completion_criteria, target_date.
Later milestones must stay concrete and execution-heavy.
Пиши компактно: короткие поля, без повторов, без пояснений вне JSON.`;
}
function buildRoadmapSkeletonPrompt(context={}){
  const strategyDesc=String(context.strategyDesc||'').trim();
  const ctx=context.context||buildRoadmapOnboardingContext();
  const summary=clipText(getContextSummary(),280);
  const deadline=ctx.deadline||S.user.deadline||'';
  const windowDays=getRoadmapPromptWindowDays(deadline);
  const horizonLabel=deadline?`Дедлайн: ${deadline}`:'Дедлайн: в пределах 14 дней';
  return `Собери roadmap skeleton.

Контекст:
- Project: ${ctx.project_name||'не указано'}
- Goal: ${ctx.primary_goal||'не указано'}
- Stage: ${ctx.current_stage||'не указано'}
- Built: ${ctx.built_status||'не указано'}
- Niche: ${ctx.niche||'не указано'}
- Audience: ${ctx.target_audience||'не указано'}
- Execution style: ${ctx.execution_style||'не указано'}
- Resources: ${ctx.resources||'не указано'}
- Blocker: ${ctx.blocker||'нет явных'}
- Hours/day: ${ctx.daily_hours||'не указано'}
- ${horizonLabel}
- Active horizon: ${windowDays} дней
${strategyDesc?`- Pace: ${strategyDesc}`:''}

Сводка:
${summary}

Верни только список стадий:
1. Stage name || objective || outcome || reasoning
2. Stage name || objective || outcome || reasoning
...
N. Stage name || objective || outcome || reasoning

Правила:
- каждая строка начинается с порядкового номера
- objective, outcome и reasoning короткие, но конкретные
- later milestones must not be hollow
- каждая стадия должна вести к реальному execution
- выбери количество стадий самостоятельно по scope и timeline
- не ограничивайся фиксированным количеством
- итоговый roadmap должен содержать минимум 3 стадии
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
  const fallbackCount=Math.max(3,source.length||estimateFallbackRoadmapStageCount({context:buildRoadmapOnboardingContext()}));
  const fallback=fallbackRoadmapForMvp(fallbackCount);
  const targetCount=Math.max(3,source.length||fallback.length);
  const targetDates=spreadDatesBetween(new Date(),S?.user?.deadline||addDaysToDateInput(toDateInputValue(new Date()),targetCount*4),targetCount);
  return Array.from({length:targetCount},(_,index)=>{
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
    const completionCriteria=normalizeCompletionCriteria(
      candidate?.completion_criteria||fallbackStage?.completion_criteria||fallbackStage?.days||[],
      normalized.objective||normalized.outcome||fallbackStage?.objective||''
    );
    return {
      week:index+1,
      title:normalized.title,
      objective:normalized.objective,
      outcome:normalized.outcome,
      target_date:toIsoDateOnly(candidate?.target_date||fallbackStage?.target_date||targetDates[index]||''),
      completion_criteria:completionCriteria,
      reasoning:clipText(candidate?.reasoning||fallbackStage?.reasoning||'',220),
      days:tasksToDays(
        completionCriteria,
        Math.max(3,Math.round(getRoadmapDeadlineDays(S?.user?.deadline)/Math.max(1,targetCount))),
        '2-4ч'
      )
    };
  });
}
function buildMilestoneTasksPrompt(ms1,_countDesc,intensityDesc='',options={}){
  const stage=normalizeStageForEnrichment(ms1||{},Number(options.stageIndex)||0);
  const context=options.context||buildRoadmapOnboardingContext();
  const taskCount=Math.max(1,Number(options.taskCount)||5);
  const stageTitle=clipText(stage.title||'Этап 1',60)||'Этап 1';
  const stageObjective=clipText(stage.objective||'',170)||'проверить спрос и довести MVP до первых пользователей';
  const goal=clipText(context.primary_goal||S.user.goal||'',140)||'запуск продукта';
  const deadline=context.deadline||S.user.deadline||'не задан';
  const stageWindowStart=clipText(options.stageStartDate||'',20)||'today';
  const stageWindowEnd=clipText(options.stageTargetDate||deadline,20);
  return `Generate ${taskCount} execution tasks.

Context:
Goal: ${goal}
Stage: ${stageTitle}
Objective: ${stageObjective}
Deadline: ${deadline}
Stage window start: ${stageWindowStart}
Stage window end: ${stageWindowEnd}

Output:
TASKS_SKELETON_START
1 | <task title>
2 | <task title>
...
${taskCount} | <task title>
TASKS_SKELETON_END

Rules:
- exactly ${taskCount} lines
- short action titles (max 6-8 words)
- each task must be concrete and stage-specific
- keep the sequence chronological inside the milestone window
- prefer execution work, not placeholders
- no extra text

Language: Russian`;
}
function buildMilestoneTaskDetailPrompt(taskSkeleton,stage,intensityDesc='',options={}){
  const normalizedStage=normalizeStageForEnrichment(stage||{},Number(options.stageIndex)||0);
  const context=options.context||buildRoadmapOnboardingContext();
  const taskCount=Math.max(1,Number(options.taskCount)||5);
  const taskIndex=Math.max(1,Number(options.taskIndex)||1);
  const taskDeadline=clipText(options.taskDeadline||'',20);
  const outputLanguage=detectTaskOutputLanguage(
    taskSkeleton?.title||'',
    normalizedStage.title||'',
    normalizedStage.objective||'',
    normalizedStage.outcome||'',
    context.project_name||'',
    context.startup_idea||'',
    context.primary_goal||S.user.goal||''
  );
  const isEnglish=outputLanguage==='English';
  const stageTitle=clipText(normalizedStage.title||(isEnglish?'Stage 1':'Этап 1'),60)||(isEnglish?'Stage 1':'Этап 1');
  const stageObjective=clipText(normalizedStage.objective||'',170)||(isEnglish?'validate demand and move MVP to real users':'проверить спрос и довести MVP до первых пользователей');
  const stageOutcome=clipText(normalizedStage.outcome||'',130)||(isEnglish?'a measurable outcome for this stage':'измеримый результат текущего этапа');
  const goal=clipText(context.primary_goal||S.user.goal||'',140)||(isEnglish?'ship the product':'запуск продукта');
  const deadline=context.deadline||S.user.deadline||(isEnglish?'not set':'не задан');
  const stageStart=clipText(options.stageStartDate||'',20)||toDateInputValue(new Date());
  const stageTarget=clipText(options.stageTargetDate||deadline,20)||deadline;
  return `Task detail.
Lang: ${outputLanguage}
Goal: ${goal}
Stage: ${stageTitle}
Objective: ${stageObjective}
Task: ${clipText(taskSkeleton?.title||'',96)}
Deadline: ${deadline}
Window: ${stageStart} -> ${stageTarget}
Suggested due date: ${taskDeadline||stageTarget}
Slot: ${taskIndex}/${taskCount}

Return only:
TASK_DETAIL_START
TITLE | ...
DESCRIPTION | ...
WHY | ...
DELIVERABLE | ...
DONE | ...
PRIORITY | high|med|low
DEADLINE | YYYY-MM-DD or none
TASK_DETAIL_END

Keep each field to one short sentence. No extra text.

${taskPlainTextLanguageRules(outputLanguage)}`;
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
    const stageCount=resolveRoadmapStageCountHint(options,Number.isFinite(stageIdxRaw)?stageIdxRaw:1);
    const stageIndex=Number.isFinite(stageIdxRaw)?Math.max(0,Math.min(stageCount-1,stageIdxRaw-1)):0;
    const normalized=normalizeFounderTask(merged,{
      stageIndex,
      stageTitle:options.stageTitle||'Stage 1',
      stageObjective:options.stageObjective||existing?.stageObjective||'',
      deadline:options.deadline||S.user.deadline||'',
      stageCount
    });
    return {
      ...normalized,
      id:safeId,
      text:getTaskTitle(normalized),
      done:Boolean(merged.done),
      created:String(merged.created||normalized.created||new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'})).trim(),
      linkedStage:Math.max(1,Math.min(stageCount,Number(normalized.linkedStage)||1))
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
let taskPreviewPending=false;
let taskPreviewStageIndex=null;
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
let flowOverlayTimer=null;
let flowOverlayMessages=[];
let flowOverlayIndex=0;
function stopFlowOverlayTimer(){
  if(flowOverlayTimer){
    clearInterval(flowOverlayTimer);
    flowOverlayTimer=null;
  }
}
function updateFlowOverlayMessage(){
  const el=document.getElementById('flow-rotator');
  if(!el) return;
  if(!flowOverlayMessages.length){
    el.textContent='';
    return;
  }
  const index=flowOverlayIndex%flowOverlayMessages.length;
  el.textContent=flowOverlayMessages[index];
  flowOverlayIndex+=1;
}
function setFlowOverlayMode(mode,{kicker='',title='',copy='',messages=[],actionsHtml=''}={}){
  const overlay=document.getElementById('flow-overlay');
  const card=document.getElementById('flow-card');
  const kickerEl=document.getElementById('flow-kicker');
  const titleEl=document.getElementById('flow-title');
  const copyEl=document.getElementById('flow-copy');
  const rotatorEl=document.getElementById('flow-rotator');
  const actionsEl=document.getElementById('flow-actions');
  const spinnerEl=document.getElementById('flow-spinner');
  if(!overlay||!card) return;
  stopFlowOverlayTimer();
  flowOverlayMessages=Array.isArray(messages)?messages.filter(Boolean):[];
  flowOverlayIndex=0;
  overlay.classList.add('on');
  overlay.dataset.mode=mode||'loading';
  card.classList.toggle('is-loading',mode==='loading');
  card.classList.toggle('is-prompt',mode!=='loading');
  if(kickerEl) kickerEl.textContent=kicker||'';
  if(titleEl) titleEl.textContent=title||'';
  if(copyEl) copyEl.textContent=copy||'';
  if(rotatorEl) rotatorEl.textContent='';
  if(actionsEl) actionsEl.innerHTML=actionsHtml||'';
  if(spinnerEl) spinnerEl.classList.toggle('idle',mode!=='loading');
  if(flowOverlayMessages.length){
    updateFlowOverlayMessage();
    if(mode==='loading'){
      flowOverlayTimer=setInterval(updateFlowOverlayMessage,1400);
    }
  }
}
function hideFlowOverlay(){
  stopFlowOverlayTimer();
  flowOverlayMessages=[];
  flowOverlayIndex=0;
  const overlay=document.getElementById('flow-overlay');
  const actionsEl=document.getElementById('flow-actions');
  const previewEl=document.getElementById('flow-preview');
  if(overlay) overlay.classList.remove('on');
  if(actionsEl) actionsEl.innerHTML='';
  if(previewEl) previewEl.innerHTML='';
}
function showRoadmapReadyPrompt(){
  setFlowOverlayMode('prompt',{
    kicker:'Roadmap ready',
    title:'Your roadmap is ready',
    copy:'Review the roadmap preview below, then continue to task generation or regenerate from the same onboarding context.',
    messages:[
      'Milestones mapped.',
      'Execution path ready.',
      'Previewing the generated roadmap.'
    ],
    actionsHtml:[
      '<button class="btn btn-primary btn-sm" onclick="continueRoadmapToTasks()">Continue to Tasks</button>',
      '<button class="btn btn-ghost btn-sm" onclick="regenerateRoadmapFromPreview()">Regenerate</button>'
    ].join('')
  });
  renderRoadmapPreview();
}
function showTaskPreviewPrompt({stageIndex=0,regenerated=false}={}){
  ensureExecutionState();
  const stage=getExecutionStage(stageIndex)||getExecutionSessionStage()||getExecutionStage(getExecutionActiveStageIndex());
  const tasks=getTasksForStage(stageIndex,{includeArchived:false});
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'showTaskPreviewPrompt',
    action:'task_preview_input_shape',
    stageIndex,
    regenerated:Boolean(regenerated),
    taskCount:tasks.length,
    firstTaskShape:tasks[0]?{
      titleType:typeof tasks[0].title,
      textType:typeof tasks[0].text,
      deadlineType:typeof tasks[0].deadline,
      priorityType:typeof tasks[0].priority,
      milestoneTitleType:typeof tasks[0].milestoneTitle
    }:null
  });
  const previewTasks=tasks.slice(0,3);
  const taskCards=previewTasks.map((task)=>{
    const prio=normalizeTaskPriority(task.priority||task.prio);
    const title=getTaskTitle(task);
    return `<div class="flow-task-preview-item">
      <div class="flow-task-preview-head">
        <div class="flow-task-preview-title">${escHtml(title)}</div>
        <div class="flow-task-preview-prio prio-${prio}">${escHtml(taskPrioLabel(prio))}</div>
      </div>
      <div class="flow-task-preview-meta">
        <span>${escHtml(task.deadline||'No deadline')}</span>
        <span>${escHtml(task.estimateHours||2)}h</span>
      </div>
      <div class="flow-task-preview-copy">${escHtml(task.milestoneTitle||stage?.title||'')}</div>
    </div>`;
  }).join('');
  setFlowOverlayMode('prompt',{
    kicker:regenerated?'Tasks regenerated':'Tasks ready',
    title:stage?.title||'Active milestone tasks',
    copy:'Are these the right tasks for this milestone? Review the set, regenerate if needed, or continue into execution.',
    messages:[
      'Previewing the generated task set.',
      'Choose whether to keep this batch.',
      'Continue when the set looks right.'
    ],
    actionsHtml:[
      '<button class="btn btn-primary btn-sm" onclick="continueTaskPreviewToWork()">Continue</button>',
      '<button class="btn btn-ghost btn-sm" onclick="regenerateTasksFromPreview()">Regenerate Tasks</button>'
    ].join('')
  });
  const previewEl=document.getElementById('flow-preview');
  if(previewEl){
    previewEl.innerHTML=`<div class="flow-task-preview-shell">
      <div class="flow-task-preview-headline">
        <div class="flow-task-preview-kicker">Milestone preview</div>
        <div class="flow-task-preview-title-main">${escHtml(stage?.title||'Active milestone')}</div>
        <div class="flow-task-preview-sub">${escHtml(stage?.objective||S.user.goal||'')}</div>
      </div>
      <div class="flow-task-preview-grid">
        ${taskCards || '<div class="flow-task-preview-empty">No generated tasks are available yet.</div>'}
      </div>
    </div>`;
  }
  taskPreviewPending=true;
  taskPreviewStageIndex=stageIndex;
}
function showFlowLoading(title,copy,messages){
  setFlowOverlayMode('loading',{
    kicker:'Processing',
    title:title||'Loading',
    copy:copy||'',
    messages:messages||['Building the next step...']
  });
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
  obVariant=normalizeRoadmapVariant(S.user.roadmapStyle||obVariant||BETA_ALLOWED_ROADMAP_VARIANT);
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
  obVariant=normalizeRoadmapVariant(v);
  S.user.roadmapStyle=obVariant;
  syncRoadmapVariantUI();
  renderObReview();
}
function obSelectTaskVar(v){
  if(v!==BETA_ALLOWED_TASK_VARIANT) return;
  obTaskVariant=BETA_ALLOWED_TASK_VARIANT;
  syncTaskVariantUI();
}
function capitalizeLabel(value){
  const map={safe:'Conservative',balanced:'Balanced',aggressive:'Aggressive'};
  return map[String(value||'').trim().toLowerCase()]||'Balanced';
}
function renderObReview(){
  const host=document.getElementById('ob-review');
  if(!host) return;
  const rows=[
    ['Your name',S.user.name||'Not set'],
    ['Project / company',S.user.project||'Not set'],
    ['Primary goal',S.user.goal||'Not set'],
    ['Deadline',S.user.deadline||'Not set'],
    ['Daily hours',S.user.hours||'Not set'],
    ['Biggest blocker',S.user.blockers||'Not set'],
    ['Stage',S.user.stage||'Not set'],
    ['Niche',S.user.niche||'Not set'],
    ['Target audience',S.user.audience||'Not set'],
    ['Execution style',clipText(S.user.executionStyle||S.user.resources||'',120)||'Not set'],
    ['Roadmap style',capitalizeLabel(normalizeRoadmapVariant(S.user.roadmapStyle||obVariant))],
    ['90-day vision',S.user.win||'Not set']
  ];
  host.innerHTML=rows.map(([label,value])=>`<div class="ob-review-item"><div class="ob-review-label">${escHtml(label)}</div><div class="ob-review-value">${escHtml(value)}</div></div>`).join('');
}
function obGo(step){
  const maxStep=3;
  const safeStep=Math.max(0,Math.min(maxStep,Number(step)||0));
  document.querySelectorAll('.ob-step').forEach((s)=>s.classList.remove('on'));
  const active=document.getElementById(`obs-${safeStep}`);
  if(active) active.classList.add('on');
  for(let i=0;i<=maxStep;i++){
    const d=document.getElementById(`pd${i}`);
    if(d)d.classList.toggle('done',i<=safeStep);
  }
  if(safeStep===3) renderObReview();
}
function obNext(from){
  if(from===0){
    const n=document.getElementById('ob-nm').value.trim();
    const p=document.getElementById('ob-proj').value.trim();
    if(!n){document.getElementById('ob-nm').style.borderColor='var(--red)';document.getElementById('ob-nm').focus();return;}
    S.user.name=n;S.user.project=p;S.user.mode=obMode;S.user.role=resolveUserRole();
  }
  if(from===1){
    S.user.goal=document.getElementById('ob-goal').value.trim();
    const deadlineInput=document.getElementById('ob-deadline');
    const deadlineCheck=validateBetaDeadline(deadlineInput?.value||'');
    if(!deadlineCheck.ok){
      setObDeadlineError(deadlineCheck.error);
      if(deadlineInput) deadlineInput.focus();
      return;
    }
    setObDeadlineError('');
    S.user.deadline=deadlineCheck.value;
    S.user.hours=document.getElementById('ob-hrs').value;
    S.user.blockers=document.getElementById('ob-block').value.trim();
    S.user.idea=document.getElementById('ob-idea').value.trim();
    S.user.built=S.user.idea;
  }
  if(from===2){
    S.user.stage=document.getElementById('ob-stage').value;
    S.user.niche=document.getElementById('ob-niche').value.trim();
    S.user.audience=document.getElementById('ob-audience').value.trim();
    S.user.resources=document.getElementById('ob-resources').value.trim();
    S.user.executionStyle=S.user.resources;
    S.user.roadmapStyle=normalizeRoadmapVariant(obVariant);
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
    renderObReview();
  }
  obGo(from+1);
}
async function obGenerateRoadmap(){
  const {pipelineId,signal}=startRoadmapPipelineSession();
  roadmapRequestInFlight=true;
  setRoadmapButtonsBusy(true);
  showFlowLoading(
    'Generating roadmap',
    'The roadmap pipeline is shaping milestones, execution windows, and the first task scaffold.',
    ['Mapping the path to the deadline.', 'Balancing scope and sequence.', 'Preparing the first milestone.']
  );
  let roadmapReady=false;
  try{
    const deadlineCheck=validateBetaDeadline(S.user.deadline);
    if(!deadlineCheck.ok) throw new Error(deadlineCheck.error);
    S.user.deadline=deadlineCheck.value;
    const deadlineInput=document.getElementById('ob-deadline');
    if(deadlineInput) deadlineInput.value=deadlineCheck.value;
    setObDeadlineError('');
    const roadmapVariant=normalizeRoadmapVariant(obVariant);
    obVariant=roadmapVariant;
    S.user.roadmapStyle=roadmapVariant;
    syncRoadmapVariantUI();
    const variantDesc={safe:'Conservative pace: 2-4 focused hours per day, lower risk and tighter scope',balanced:'Balanced pace: 4-6 focused hours per day, steady shipping rhythm',aggressive:'Aggressive pace: 8-10 intense hours per day, maximum output'}[roadmapVariant];
    const roadmapCtx=buildRoadmapOnboardingContext();
    const pipelineResult=await runRoadmapPipeline({
      strategyDesc:variantDesc,
      context:roadmapCtx,
      reason:'post_roadmap_onboarding',
      pipelineId,
      signal
    });
    if(!isRoadmapPipelineActive(pipelineId)) return;
    roadmapReady=true;
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
    saveAll();
    showRoadmapReadyPrompt();
    if(pipelineResult?.degraded){
      toast2('Roadmap ready','Roadmap shown in degraded mode.');
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
        saveAll();
        hideFlowOverlay();
        obLaunch({startTour:false,page:'roadmap'});
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
    if(!roadmapReady) hideFlowOverlay();
  }
}
function renderRoadmapPreview(){
  const host=document.getElementById('flow-preview');
  if(!host||!S.roadmap||!S.roadmap.length) return;
  host.innerHTML=buildRoadmapSurfaceMarkup({
    showFocus:true,
    showDetail:true,
    showFooter:false,
    interactiveNodes:true,
    surfaceClass:'rm-roadmap-shell--preview',
    canvasKicker:'Roadmap preview',
    canvasTitle:'Milestones flow along a single execution path'
  });
}
async function continueRoadmapToTasks(){
  if(taskRequestInFlight){
    logWarn({
      area:'frontend',
      module:'frontend/script.js',
      function:'continueRoadmapToTasks',
      action:'continue_to_tasks_skipped_request_in_flight'
    });
    return;
  }
  ensureExecutionState();
  const activeIndex=getExecutionActiveStageIndex();
  const activeStage=getExecutionStage(activeIndex);
  const existingCount=getActiveStageTasks().length;
  logRoadmapPipelineEvent('continue_to_tasks_clicked',{
    roadmapId:S.execution?.id||'',
    stageCount:getExecutionStages().length,
    activeStageId:activeStage?.id||'',
    activeStageIndex:activeIndex,
    taskCount:existingCount
  });
  hideFlowOverlay();
  showFlowLoading(
    'Preparing tasks',
    'Generating the first milestone tasks from the same roadmap context.',
    ['Loading milestone scope.', 'Building the first execution list.', 'Preparing Tasks & Goals.']
  );
  try{
    let tasks=getActiveStageTasks();
    if(!tasks.length){
      logRoadmapPipelineEvent('continue_to_tasks_generation_started',{
        roadmapId:S.execution?.id||'',
        stageCount:getExecutionStages().length,
        activeStageId:activeStage?.id||'',
        activeStageIndex:activeIndex
      });
      tasks=await handleGenerateTasksClick({skipPreview:true});
    }else{
      logRoadmapPipelineEvent('continue_to_tasks_existing_tasks_used',{
        roadmapId:S.execution?.id||'',
        stageCount:getExecutionStages().length,
        activeStageId:activeStage?.id||'',
        activeStageIndex:activeIndex,
        taskCount:tasks.length
      });
      syncActiveTasksFromExecution();
      saveAll();
      renderTasks();
    }
    const finalCount=Array.isArray(tasks)?tasks.length:getActiveStageTasks().length;
    if(!finalCount){
      throw new Error('No tasks were created for the active milestone');
    }
    logRoadmapPipelineEvent('continue_to_tasks_generation_completed',{
      roadmapId:S.execution?.id||'',
      stageCount:getExecutionStages().length,
      activeStageId:activeStage?.id||'',
      activeStageIndex:activeIndex,
      taskCount:finalCount
    });
    logRoadmapPipelineEvent('continue_to_tasks_route_transition',{
      roadmapId:S.execution?.id||'',
      stageCount:getExecutionStages().length,
      activeStageId:activeStage?.id||'',
      activeStageIndex:activeIndex,
      taskCount:finalCount
    });
    hideFlowOverlay();
    if(!taskPreviewPending){
      showTaskPreviewPrompt({stageIndex:activeIndex,regenerated:false});
    }
  }catch(error){
    logWarn({
      area:'frontend',
      module:'frontend/script.js',
      function:'continueRoadmapToTasks',
      action:'continue_to_tasks_failed',
      activeStageIndex:activeIndex,
      activeStageId:activeStage?.id||'',
      taskCount:getActiveStageTasks().length,
      errorMessage:String(error?.message||'')
    });
    hideFlowOverlay();
    toast2('Task generation failed',mapGeminiErrorMessage(error,'tasks'));
  }
}
async function regenerateRoadmapFromPreview(){
  hideFlowOverlay();
  await obGenerateRoadmap();
}
async function continueTaskPreviewToWork(){
  ensureExecutionState();
  if(taskPreviewPending&&Number.isFinite(taskPreviewStageIndex)){
    const stageIndex=taskPreviewStageIndex;
    const session=prepareExecutionSession({forceRetarget:true});
    if(session){
      session.taskIds=getTasksForStage(stageIndex,{includeArchived:false}).map((task)=>Number(task.id)).filter((id)=>Number.isFinite(id)).slice(0,3);
      session.status='planned';
      session.review=normalizeExecutionSessionReview();
      session.reviewOpenedAt='';
      session.reviewAppliedAt='';
      session.baseline=buildSessionBaseline(stageIndex);
      updateSessionRuntimeSession(session);
    }
    taskPreviewPending=false;
    taskPreviewStageIndex=null;
  }
  hideFlowOverlay();
  obLaunch({page:'work',workTab:'tasks'});
}
async function regenerateTasksFromPreview(){
  ensureExecutionState();
  const stageIndex=Number.isFinite(taskPreviewStageIndex)?taskPreviewStageIndex:getExecutionActiveStageIndex();
  const stage=getExecutionStage(stageIndex);
  if(!stage){
    toast2('No active milestone','Generate a roadmap first.');
    return;
  }
  showFlowLoading(
    'Regenerating tasks',
    'Refreshing the task set for the same milestone.',
    ['Building a fresh milestone task set.', 'Replacing the preview with new tasks.', 'Keeping execution state canonical.']
  );
  try{
    const tasks=await handleGenerateTasksClick({regenerated:true});
    const finalTasks=Array.isArray(tasks)&&tasks.length?tasks:getActiveStageTasks();
    if(!finalTasks.length) throw new Error('No tasks generated for preview');
    hideFlowOverlay();
  }catch(error){
    hideFlowOverlay();
    toast2('Task generation failed',mapGeminiErrorMessage(error,'tasks'));
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
  const newGoals=stageSource.slice(0,7).map((wk,i)=>({id:Date.now()+i,title:wk.title,deadline:'',desc:[wk.objective,wk.reasoning?`Why this stage matters: ${wk.reasoning}`:''].filter(Boolean).join(' · '),pct:0}));
  S.goals=newGoals;saveGoals();
  const el=document.getElementById('ob-goals-preview');
  if(!el) return;
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
function obContinueToLaunch(){obPrepLaunch();obLaunch({startTour:true});}
async function handleGenerateTasksClick(options={}){
  if(!S.roadmap||taskRequestInFlight)return;
  taskRequestInFlight=true;
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
    logInfo({
      area:'frontend',
      module:'frontend/script.js',
      function:'handleGenerateTasksClick',
      action:'continue_to_tasks_stage_resolved',
      source:'execution_recovery',
      activeStageId:activeStage?.id||'',
      activeStageTitle:clipText(activeStage?.title||'',80),
      activeStageIndex
    });
    logInfo({
      area:'frontend',
      module:'frontend/script.js',
      function:'handleGenerateTasksClick',
      action:'task_generation_entry_shape',
      activeStageIndex,
      activeStageId:activeStage?.id||'',
      hasRoadmap:Array.isArray(S.roadmap),
      hasExecution:isExecutionStateObject(S.execution),
      hasExistingTasks:getActiveStageTasks().length>0
    });
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
    const previewSession=prepareExecutionSession({forceRetarget:true});
    if(previewSession){
      previewSession.taskIds=recommendSessionTaskIds(activeStageIndex).slice(0,3);
      previewSession.status='planned';
      previewSession.review=normalizeExecutionSessionReview();
      previewSession.reviewOpenedAt='';
      previewSession.reviewAppliedAt='';
      previewSession.baseline=buildSessionBaseline(activeStageIndex);
      updateSessionRuntimeSession(previewSession);
    }
    if(options.skipPreview!==true){
      showTaskPreviewPrompt({stageIndex:activeStageIndex,regenerated:Boolean(options.regenerated)});
    }
    saveAll();
    logRoadmapPipelineEvent('tasks_generation_manual_completed',{
      roadmapId:S.execution?.id||'',
      stageCount:getExecutionStages().length,
      activeStageId:getExecutionStage(getExecutionActiveStageIndex())?.id||'',
      activeStageIndex:getExecutionActiveStageIndex(),
      taskCount:Array.isArray(tasks)?tasks.length:getActiveStageTasks().length
    });
    toast2('Задачи сгенерированы',`Подготовлено ${getActiveStageTasks().length} задач для первого этапа`);
    return tasks;
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
    throw e;
  }finally{
    taskRequestInFlight=false;
  }
}
async function obGenerateTasks(){
  return handleGenerateTasksClick();
}
async function runFirstMilestoneTaskFlow(){
  return continueRoadmapToTasks();
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
  if(appScreen){appScreen.style.display='grid';appScreen.classList.add('app-on');}
  S.user.role=resolveUserRole();
  try{applyUserToUI();}catch(e){}
  try{initHM();}catch(e){}
  try{if(S.roadmap){updDashboard();renderRM();updRoadmapProgress();}}catch(e){}
  try{saveAll();}catch(e){}
  markUserRegistered();
  const targetPage=opts.page||'dashboard';
  gp(targetPage);
  if(targetPage==='work') switchWorkTab(opts.workTab||'tasks');
  feedLine(`System initialized for ${S.user.name}.`);
  trackEvent('app_start');
  trackEvent('registration');
  showApiKeyBanner();
  if(opts.startTour)startGuidedTour();
}

/* ══ PAGE NAV ══ */
function gp(id){
  if(id==='chat') id='notes';
  if(id==='analytics'&&!isAdmin()){toast2('Restricted','Analytics is available only to admins');id='dashboard';}
  closeTaskDetail(true);
  const topbarMap={
    dashboard:{eyebrow:'Strategy Hub',title:'Dashboard'},
    work:{eyebrow:'Execution Loop',title:'Tasks & Goals'},
    notes:{eyebrow:'Daily Loop',title:'AI Chat'},
    roadmap:{eyebrow:'Roadmap Command',title:'Roadmap'},
    analytics:{eyebrow:'Signal Center',title:'Analytics'},
    settings:{eyebrow:'Workspace',title:'Settings'},
    billing:{eyebrow:'Monetization',title:'Plans & Billing'}
  };
  const topbar=topbarMap[id]||topbarMap.dashboard;
  const topbarEyebrow=document.getElementById('topbar-eyebrow');
  const topbarTitle=document.getElementById('topbar-title');
  if(topbarEyebrow) topbarEyebrow.textContent=topbar.eyebrow;
  if(topbarTitle) topbarTitle.textContent=topbar.title;
  document.title=`StriveAI // ${topbar.title}`;
  document.body.dataset.activeView=id;
  document.querySelectorAll('.pg').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('.htab').forEach(b=>b.classList.remove('on'));
  const pg=document.getElementById('pg-'+id);if(pg)pg.classList.add('on');
  document.querySelectorAll('.htab').forEach(b=>{if(b.getAttribute('onclick')&&b.getAttribute('onclick').includes("'"+id+"'"))b.classList.add('on');});
  if(id==='work'){
    renderTasks();
    renderGoals();
    updTaskBadge();
  }
  if(id==='notes'){renderChatPage();}
  if(id==='analytics'){renderAnalytics();}
  if(id==='roadmap'){updRoadmapProgress();if(S.roadmap)renderRM();}
  if(id==='billing'){renderBillingBtns();}
  renderDashboardSessionControls();
  renderSessionOverlay();
  trackEvent('page_'+id);
}

/* ══ GUIDED TOUR ══ */
let guidedTourIndex=0;
function getGuidedTourSteps(){
  const steps=[
    {page:'dashboard',target:'tab-dashboard',title:'Dashboard',body:'This is your operating surface. Daily focus, session state, streak, and execution signal live here.'},
    {page:'work',target:'tab-work',title:'Tasks & Goals',body:'Your daily tasks and milestone goals stay in one place. This is where the plan turns into concrete work.'},
    {page:'notes',target:'tab-notes',title:'AI Chat',body:'Use this space for daily check-ins, blockers, and quick guidance from the coach.'},
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
    actions.innerHTML=`<button class="btn btn-primary btn-sm" onclick="focusTaskInput()">+ Add Task</button>`;
  } else {
    actions.innerHTML=`<button class="btn btn-primary btn-sm" onclick="addGoal()">+ Add Goal</button>`;
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
  if(isSessionRunning()){
    endSession('completed');
    return;
  }
  if(isSessionReviewOpen()){
    applySessionReviewResults().catch((error)=>console.error('Session review apply failed',error));
    return;
  }
  toast2('Start a session first','Select tasks and start the session from Tasks & Goals.');
}
function logActivityInternal(focus,durationMin){const today=new Date().toDateString();if(!S.progress.activityLog.includes(today)){S.progress.activityLog.push(today);S.lastActivity=Date.now();updStreak();}}
function updStreak(){let s=0;const today=new Date();for(let i=0;i<60;i++){const d=new Date(today);d.setDate(d.getDate()-i);if(S.progress.activityLog.includes(d.toDateString()))s++;else break;}S.progress.streak=s;}

/* ══ MILESTONE BAR ══ */
function updMilestoneBar(){
  const activeTasks=getVisibleActiveTasks();
  const total=activeTasks.length;const done=activeTasks.filter((task)=>task.done||task.status==='done').length;
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
  set('rm-sess',S.progress.completedSessions||0);
  set('rm-streak',S.progress.streak+'🔥');
  set('rm-hrs',Math.round(S.progress.hours)+'h invested');
  const roadmapStages=getRoadmapViewStages();
  const currentMilestone=roadmapStages.length?Math.min(getRoadmapActiveIndex()+1,roadmapStages.length):0;
  set('rm-ms',currentMilestone);
  set('rm-tasks',S.progress.tasksDone||0);
  set('rm-prog-label',pct===0?'Start your first milestone':pct<50?'Building milestone momentum':'On track!');
  const totalWks = roadmapStages.length || '?';
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
  return Math.min(100,Math.round((Number(S.progress.completedSessions||0)/tot)*100));
}
function updProgress(){
  const pct=totalPct();
  const s=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  s('pr-pct',pct+'%');s('pr-sess',S.progress.completedSessions||0);s('pr-streak',S.progress.streak);
  s('pr-hrs',Math.round(S.progress.hours)+'h');s('pr-ms',S.progress.milestones);
  s('pr-label',pct===0?'Start your first completed session':pct<50?'Building momentum':'On track!');
  s('pr-analysis',(S.progress.completedSessions||0)===0?'No data yet.\nComplete your first session.':`${pct}% complete · ${S.progress.streak} day streak\n${S.progress.completedSessions||0} completed sessions`);
  updDashboard();
}
function updDashboard(){
  refreshExecutionProgress();
  const s=S.progress.completedSessions||0,t=S.progress.tasksDone;
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
  renderDashboardSessionControls();
  renderSessionOverlay();
}

/* ══ FEED ══ */
let feedLines=[];
function feedLine(txt){feedLines.unshift(txt);if(feedLines.length>6)feedLines=feedLines.slice(0,6);const el=document.getElementById('lf');if(el)el.innerHTML=feedLines.map(l=>`<div class="feed-line">${escHtml(l)}</div>`).join('');}

/* ══ ROADMAP ══ */
let focusedRoadmapStageIndex=null, openRoadmapMilestoneIndex=null, openRoadmapTimelineKey='';

function getRoadmapActiveIndex(){
  if(getExecutionStages().length) return getCanonicalExecutionActiveStageIndex();
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
  const tasks=getTasksForStage(index,{includeArchived:false});
  if(tasks.length){
    return Math.round((tasks.filter(t=>t.done).length/tasks.length)*100);
  }
  const phase=S.roadmap?.[index];
  const phaseSize=Math.max(1,Array.isArray(phase?.days)&&phase.days.length?phase.days.length:7);
  return Math.round(((Math.min(phaseSize-1,getRoadmapDayProgress())+1)/phaseSize)*100);
}
function getRoadmapTargetDate(index,total){
  const stage=getExecutionStage(index)||S.roadmap?.[index];
  const explicit=toIsoDateOnly(stage?.targetDate||stage?.target_date||'');
  if(explicit){
    return new Date(`${explicit}T00:00:00`).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
  }
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
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'toggleRoadmapMilestone',
    action:'roadmap_preview_milestone_clicked',
    selectedMilestoneIndex:index,
    selectedMilestoneId:getExecutionStage(index)?.id||S.roadmap?.[index]?.id||'',
    selectedMilestoneTitle:clipText(getExecutionStage(index)?.title||S.roadmap?.[index]?.title||'',80)
  });
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
function getRoadmapCanvasLayout(total){
  const safeTotal=Math.max(1,Number(total)||0);
  const leftPad=safeTotal===1?50:8;
  const rightPad=safeTotal===1?50:8;
  const span=Math.max(0,100-leftPad-rightPad);
  const mid=50;
  const amplitude=safeTotal===1?0:safeTotal===2?18:safeTotal<=4?21:Math.max(15,22-Math.min(8,safeTotal-4)*.9);
  return Array.from({length:safeTotal},(_,index)=>{
    const t=safeTotal===1?0.5:index/(safeTotal-1);
    const x=safeTotal===1?50:leftPad+(span*t);
    const wave=amplitude*Math.cos(index*Math.PI);
    return {
      x:Math.max(6,Math.min(94,x)),
      y:Math.max(18,Math.min(82,mid+wave))
    };
  });
}
function buildRoadmapPath(points=[]){
  if(!points.length) return '';
  const safePoints=points.map((point)=>({
    x:Number(point?.x)||0,
    y:Number(point?.y)||0
  }));
  if(safePoints.length===1){
    const only=safePoints[0];
    return `M ${only.x} ${only.y}`;
  }
  const samplesPerSegment=16;
  let d=`M ${safePoints[0].x.toFixed(2)} ${safePoints[0].y.toFixed(2)}`;
  for(let i=0;i<safePoints.length-1;i+=1){
    const start=safePoints[i];
    const end=safePoints[i+1];
    for(let step=1;step<=samplesPerSegment;step+=1){
      const t=step/samplesPerSegment;
      const eased=(1-Math.cos(Math.PI*t))/2;
      const x=start.x+((end.x-start.x)*t);
      const y=start.y+((end.y-start.y)*eased);
      d+=` L ${x.toFixed(2)} ${y.toFixed(2)}`;
    }
  }
  return d;
}
function buildRoadmapDetailPanel(index){
  if(index===null||index===undefined||!S.roadmap||!S.roadmap[index]) return '';
  const wk=S.roadmap[index];
  const stage=getExecutionStage(index);
  const stageTitle=stage?.title||wk.title||`Этап ${index+1}`;
  const stageObjective=getStageObjectiveText(stage||wk)||'';
  const stageOutcome=getStageOutcomeText(stage||wk)||'';
  const stageReasoning=getStageReasoningText(stage||wk)||'';
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'buildRoadmapDetailPanel',
    action:'roadmap_detail_input_shape',
    milestoneIndex:index,
    stageTitleType:typeof stageTitle,
    objectiveType:typeof stageObjective,
    outcomeType:typeof stageOutcome,
    reasoningType:typeof stageReasoning,
    stageTitleIsArray:Array.isArray(stageTitle),
    objectiveIsArray:Array.isArray(stageObjective),
    outcomeIsArray:Array.isArray(stageOutcome),
    reasoningIsArray:Array.isArray(stageReasoning)
  });
  const pct=getRoadmapStagePct(index);
  const taskCount=getTasksForStage(index,{includeArchived:false}).length;
  const stageCriteria=getRoadmapStageCriteria(index);
  const criteriaCount=Math.max(1,stageCriteria.length);
  const criteriaDone=Math.round((pct/100)*criteriaCount);
  const checklist=stageCriteria.slice(0,3).map((day,dayIndex)=>{
    let status='pending';
    if(getRoadmapStageStatus(index)==='done') status='done';
    else if(getRoadmapStageStatus(index)==='active'){
      if(dayIndex<criteriaDone) status='done';
      else if(dayIndex===criteriaDone) status='active';
    }
    return `<div class="rm-check-item ${status}"><div class="rm-check-icon">${status==='done'?'✓':status==='active'?'●':'·'}</div><div class="rm-check-copy"><strong>${escHtml(day.task||'Milestone step')}</strong><span>${escHtml(day.day||'DAY')} · ${escHtml(day.duration||'no estimate')}</span></div></div>`;
  }).join('');
  return `<div class="rm-detail-head">
    <div>
      <div class="rm-detail-kicker">Milestone snapshot</div>
      <div class="rm-detail-title">${escHtml(stageTitle)}</div>
      <div class="rm-detail-copy">${escHtml(clipText([stageObjective,stageOutcome].filter(Boolean).join(' · ')||'Execution objective pending',180))}</div>
    </div>
    <button class="btn btn-ghost btn-sm" onclick="toggleRoadmapMilestone(${index})">Close</button>
  </div>
  <div class="rm-detail-grid">
    <div class="rm-detail-stat"><strong>${pct}%</strong><span>Progress</span></div>
    <div class="rm-detail-stat"><strong>${taskCount}</strong><span>Tasks</span></div>
    <div class="rm-detail-stat"><strong>${escHtml(getRoadmapTargetDate(index,S.roadmap.length))}</strong><span>Target</span></div>
    <div class="rm-detail-stat"><strong>${stageCriteria.length}</strong><span>Checks</span></div>
  </div>
  <div class="rm-detail-list">
    <div>
      <div class="rm-list-title">Milestone checks</div>
      <div class="rm-checklist">${checklist||'<div class="rm-check-item pending"><div class="rm-check-icon">·</div><div class="rm-check-copy"><strong>No criteria yet</strong><span>Waiting for generated stage details</span></div></div>'}</div>
    </div>
    <div>
      <div class="rm-list-title">Execution brief</div>
      <div class="rm-related-list">
        <div class="rm-related-item rm-related-item--brief">
          <div class="rm-check-icon">↗</div>
          <div class="rm-related-copy">
            <strong>Tasks live in Tasks &amp; Goals</strong>
            <span>${escHtml(clipText(stageReasoning||stageObjective||stageOutcome||'Open the execution list to work through the full task inventory for this milestone.',160))}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
  <div class="rm-detail-actions">
    <button class="btn btn-primary btn-sm" onclick="openExecutionTasks()">Go to Tasks &amp; Goals</button>
  </div>`;
}
function buildRoadmapSurfaceMarkup(opts={}){
  const roadmapStages=getRoadmapViewStages();
  if(!roadmapStages.length) return '';
  ensureExecutionState();
  const activeIndex=getRoadmapActiveIndex();
  const lastIndex=roadmapStages.length-1;
  const focusedIndex=Math.max(0,Math.min(lastIndex,Number.isFinite(Number(opts.focusedIndex))?Number(opts.focusedIndex):(focusedRoadmapStageIndex===null||focusedRoadmapStageIndex===undefined?activeIndex:focusedRoadmapStageIndex)));
  const showFocus=opts.showFocus!==false;
  const showDetail=opts.showDetail!==false;
  const showFooter=opts.showFooter!==false;
  const surfaceClass=String(opts.surfaceClass||'').trim();
  focusedRoadmapStageIndex=focusedIndex;
  if(openRoadmapMilestoneIndex===null||openRoadmapMilestoneIndex===undefined){
    openRoadmapMilestoneIndex=Math.max(0,Math.min(lastIndex,activeIndex>=0?activeIndex:0));
  }
  if(openRoadmapMilestoneIndex<0||openRoadmapMilestoneIndex>lastIndex){
    openRoadmapMilestoneIndex=Math.max(0,Math.min(lastIndex,openRoadmapMilestoneIndex));
  }
  const focusedMilestone=roadmapStages[focusedIndex]||{};
  const focusedStage=getExecutionStage(focusedIndex);
  const focusedPct=getRoadmapStagePct(focusedIndex);
  const focusedStatus=getRoadmapStageStatus(focusedIndex);
  const focusTasks=getTasksForStage(focusedIndex,{includeArchived:false});
  const completedStages=getExecutionStages().length
    ? getExecutionStages().filter((stage)=>stage.status==='completed').length
    : Math.min(activeIndex,roadmapStages.length);
  const focusStatusLabel=focusedStatus==='done'?'Completed':focusedStatus==='active'?'Active':'Upcoming';
  const focusTitle=(focusedStage?.title||focusedMilestone.title||`Stage ${focusedIndex+1}`);
  const focusObjective=getStageObjectiveText(focusedStage||focusedMilestone)||'Execution objective not specified yet.';
  const focusOutcome=getStageOutcomeText(focusedStage||focusedMilestone);
  const focusReasoning=getStageReasoningText(focusedStage||focusedMilestone);
  const layout=getRoadmapCanvasLayout(S.roadmap.length);
  const pathD=buildRoadmapPath(layout);
  const focusSummary=clipText([focusObjective,focusOutcome].filter(Boolean).join(' · ')||'Execution objective not specified yet.',180);
  const focusStageLabel=`Stage ${focusedIndex+1} of ${roadmapStages.length}`;
  const focusTaskCount=focusTasks.length;
  const timelineMeta=`${roadmapStages.length} stages · ${completedStages} completed · Active stage ${Math.min(activeIndex+1,roadmapStages.length)}`;
  const canvasTitle=String(opts.canvasTitle||'Milestones flow along a single execution path');
  const canvasKicker=String(opts.canvasKicker||'Roadmap canvas');
  const footerChipTarget=String(opts.footerTarget||`Target ${escHtml(getRoadmapTargetDate(activeIndex,roadmapStages.length)).toUpperCase()}`);
  const detailHtml=showDetail
    ? (openRoadmapMilestoneIndex!==null
      ? `<section class="rm-detail-panel" id="rm-detail-panel" style="display:block">${buildRoadmapDetailPanel(openRoadmapMilestoneIndex)}</section>`
      : `<section class="rm-detail-panel" id="rm-detail-panel" style="display:none"></section>`)
    : '';
  const focusHtml=showFocus?`<aside class="rm-roadmap-focus" id="rm-focus-panel">
        <div class="rm-focus-kicker">${focusedStatus==='active'?'Current milestone':'Selected milestone'}</div>
        <div class="rm-focus-head">
          <div>
            <div class="rm-focus-title">${escHtml(focusTitle)}</div>
            <div class="rm-focus-sub">${escHtml(focusStageLabel)} · ${escHtml(focusStatusLabel)} · ${focusTaskCount} tasks</div>
          </div>
          <div class="rm-focus-score">${focusedPct}%</div>
        </div>
        <p class="rm-focus-copy">${escHtml(focusSummary)}</p>
        ${focusReasoning?`<div class="rm-focus-note"><span>Why it matters</span><p>${escHtml(focusReasoning)}</p></div>`:''}
        <div class="rm-focus-mini-grid">
          <div class="rm-focus-mini"><span>Progress</span><strong>${focusedPct}%</strong></div>
          <div class="rm-focus-mini"><span>Tasks</span><strong>${focusTaskCount}</strong></div>
          <div class="rm-focus-mini"><span>Target</span><strong>${escHtml(getRoadmapTargetDate(focusedIndex,S.roadmap.length))}</strong></div>
        </div>
        <div class="rm-focus-actions">
          <button class="btn btn-primary btn-sm" onclick="openExecutionTasks()">Go to Tasks &amp; Goals</button>
          <button class="btn btn-ghost btn-sm" onclick="toggleRoadmapMilestone(${focusedIndex})">${openRoadmapMilestoneIndex===focusedIndex?'Hide detail':'Open detail'}</button>
        </div>
      </aside>`:'';
  const footerHtml=showFooter?`<div class="rm-roadmap-footer">
      <span class="rm-roadmap-footer-chip">Path-driven roadmap</span>
      <span class="rm-roadmap-footer-chip">${timelineMeta}</span>
      <span class="rm-roadmap-footer-chip">${footerChipTarget}</span>
    </div>`:'';
  const detailAnchors=roadmapStages.map((_,i)=>`<div id="rm-stage-${i}" class="rm-stage-anchor" aria-hidden="true"></div>`).join('');
  return `<div class="rm-roadmap-shell ${showFocus?'':'rm-roadmap-shell--preview'} ${surfaceClass}">
      <section class="rm-roadmap-canvas">
        <div class="rm-roadmap-canvas-head">
          <div>
            <div class="rm-canvas-kicker">${escHtml(canvasKicker)}</div>
            <div class="rm-canvas-title">${escHtml(canvasTitle)}</div>
          </div>
          <div class="rm-canvas-meta">${timelineMeta}</div>
        </div>
        <div class="rm-roadmap-canvas-inner">
          <svg class="rm-roadmap-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="rm-roadmap-line-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="rgba(143,188,255,0.16)"/>
                <stop offset="50%" stop-color="rgba(143,188,255,0.92)"/>
                <stop offset="100%" stop-color="rgba(143,188,255,0.20)"/>
              </linearGradient>
              <filter id="rm-roadmap-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="5" result="blur"/>
                <feMerge>
                  <feMergeNode in="blur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            <path class="rm-roadmap-path-shadow" d="${pathD}"></path>
            <path class="rm-roadmap-path-line" d="${pathD}"></path>
          </svg>
          <div class="rm-roadmap-nodes">
            ${roadmapStages.map((wk,i)=>{
              const status=getRoadmapStageStatus(i);
              const isSelected=focusedIndex===i;
              const pos=layout[i]||{x:50,y:50};
              const stageNumber=String(i+1).padStart(2,'0');
              const stageTitle=wk.title||`Stage ${i+1}`;
              const milestoneMeta=getMilestoneVisualMeta(i,roadmapStages.length||1);
              const nodeClick=opts.interactiveNodes===false?'':`toggleRoadmapMilestone(${i});`;
              return `<button class="rm-roadmap-node ${status} ${isSelected?'selected':''}" style="left:${pos.x}%;top:${pos.y}%;--milestone-accent:${milestoneMeta.accent};--milestone-tint:${milestoneMeta.tint};--milestone-border:${milestoneMeta.border};--milestone-glow:${milestoneMeta.glow};" onclick="${nodeClick}" aria-label="Focus stage ${i+1} - ${escHtml(stageTitle)}">
                <span class="rm-roadmap-node-badge">${stageNumber}</span>
              </button>`;
            }).join('')}
          </div>
        </div>
      </section>
      ${focusHtml}
    </div>
    ${footerHtml}
    ${detailHtml}
    ${detailAnchors}`;
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
    const roadmapVariant=BETA_ALLOWED_ROADMAP_VARIANT;
    const variantDesc={safe:'Консервативный темп: 2-4 часа в день, упор на устойчивость и низкий риск',balanced:'Сбалансированный темп: 4-6 часов в день, сочетание скорости и качества',aggressive:'Агрессивный темп: 8-10 часов в день, высокий фокус на быстрый результат'}[roadmapVariant];
    const roadmapCtx=buildRoadmapOnboardingContext();
    const pipelineResult=await runRoadmapPipeline({
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
      const roadmapCount=Array.isArray(S.roadmap)?S.roadmap.length:getExecutionStages().length;
      toast2('Roadmap готов',`Построен план на ${Math.max(1,roadmapCount)} milestone${Math.max(1,roadmapCount)===1?'':'s'}.`);
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
  const roadmapStages=getRoadmapViewStages();
  if(!roadmapStages.length)return;
  ensureExecutionState();
  const rb=document.getElementById('rb');
  const activeIndex=getRoadmapActiveIndex();
  if(focusedRoadmapStageIndex===null||focusedRoadmapStageIndex===undefined) focusedRoadmapStageIndex=activeIndex;
  if(openRoadmapMilestoneIndex===null||openRoadmapMilestoneIndex===undefined) openRoadmapMilestoneIndex=activeIndex;
  if(openRoadmapMilestoneIndex!==null&&openRoadmapMilestoneIndex!==undefined){
    openRoadmapMilestoneIndex=Math.max(0,Math.min(roadmapStages.length-1,openRoadmapMilestoneIndex));
  }
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'renderRM',
    action:'roadmap_render_payload',
    activeStageIndex:activeIndex,
    stageCount:roadmapStages.length,
    stages:summarizeRoadmapStagesForLog(roadmapStages)
  });
  rb.innerHTML=buildRoadmapSurfaceMarkup({
    showFocus:true,
    showDetail:true,
    showFooter:true,
    surfaceClass:'',
    canvasKicker:'Roadmap canvas',
    canvasTitle:'Milestones flow along a single execution path'
  });
  document.getElementById('rm-span').textContent=`Plan for ${roadmapStages.length} stages · Active stage ${Math.min(activeIndex+1,roadmapStages.length)}`;
}

/* ══ AI CHAT — paywall for free users ══ */
function renderChatPage(){
  const wrap=document.getElementById('chat-inner');
  const plan=S.billing.plan;
  // Paywall for free users
  if(plan==='free'){
    wrap.innerHTML=`<div class="paywall-overlay">
      <div class="paywall-icon">✦</div>
      <div class="paywall-title">AI Chat</div>
      <div class="paywall-desc">Get unlimited access to your personal AI execution coach. Use it for daily check-ins, blockers, planning, and quick guidance — powered by Gemini.</div>
      <div class="paywall-features">
        <div class="paywall-feat">Unlimited AI chat sessions</div>
        <div class="paywall-feat">Daily check-ins</div>
        <div class="paywall-feat">Blocker breakthrough prompts</div>
        <div class="paywall-feat">Quick planning prompts</div>
        <div class="paywall-feat">Roadmap guidance</div>
        <div class="paywall-feat">Weekly reflection loops</div>
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
let taskCalendarMonthAnchor=null,taskCalendarSelectedDate='';
function getTaskById(id){
  const canonical=getExecutionTaskById(id);
  if(canonical){
    return decorateTaskWithMilestoneMeta({
      ...canonical,
      done:Boolean(canonical.done)||canonical.status==='done',
      linkedStage:Math.max(1,(Number(canonical.linkedStageIndex)||0)+1),
      text:getTaskTitle(canonical)
    });
  }
  const legacy=(S.tasks||[]).find(t=>Number(t.id)===Number(id));
  return legacy?decorateTaskWithMilestoneMeta(legacy):legacy;
}
function getActiveStageTasks(){
  ensureExecutionState();
  if(!hasExecutionStateReady()||S.execution?.status==='completed') return [];
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
  if(S.execution?.status==='completed'){
    titleEl.textContent='Roadmap completed';
    metaEl.textContent='All milestones are completed.';
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
function renderDashboardSessionControls(){
  const session=getExecutionSession();
  const running=Boolean(session&&session.status==='running');
  const reviewOpen=isSessionReviewOpen();
  const focusInputRow=document.getElementById('focus-input-row');
  const defaultActions=document.getElementById('default-actions');
  const activeRow=document.getElementById('session-active-row');
  const focusDisplay=document.getElementById('focus-display-text');
  const timerDisplay=document.getElementById('session-timer-display');
  const focusInput=document.getElementById('focus-input');
  const focusText=session?.goal||getExecutionSessionStage()?.objective||S.user.goal||'';
  if(focusInput&&document.activeElement!==focusInput&&focusText) focusInput.value=focusText;
  if(focusInputRow) focusInputRow.style.display=running||reviewOpen?'none':'flex';
  if(defaultActions) defaultActions.style.display=running||reviewOpen?'none':'flex';
  if(activeRow) activeRow.style.display=running||reviewOpen?'block':'none';
  if(focusDisplay) focusDisplay.textContent=focusText?`🎯 Focus: ${focusText}`:'🎯 Focus: execution';
  if(timerDisplay) timerDisplay.textContent=getSessionTimerLabel(session);
}
function renderSessionWorkspace(){
  const host=document.getElementById('session-workspace');
  if(!host) return;
  ensureExecutionState();
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'renderSessionWorkspace',
    action:'session_workspace_render_started',
    executionReady:hasExecutionStateReady(),
    activeStageIndex:getExecutionActiveStageIndex(),
    sessionTaskIds:getExecutionSessionTaskIds()
  });
  if(!hasExecutionStateReady()){
    host.innerHTML=`<div class="tasks-session-hero">
      <div class="tasks-session-hero-main">
        <div class="tasks-session-kicker">Session first</div>
        <div class="tasks-session-title">Generate a roadmap to unlock session prep.</div>
        <div class="tasks-session-copy">Your active milestone, selected tasks, and session review context will appear here once execution is available.</div>
      </div>
    </div>`;
    return;
  }
  const session=prepareExecutionSession();
  const stage=getExecutionSessionStage()||getExecutionStage(getExecutionActiveStageIndex());
  const stageIndex=stage?getExecutionStages().findIndex((item)=>String(item.id)===String(stage.id)):getExecutionActiveStageIndex();
  const stageTasks=getTasksForStage(stageIndex,{includeArchived:false});
  const selectedIds=new Set((session?.taskIds||[]).map((taskId)=>Number(taskId)).filter((taskId)=>Number.isFinite(taskId)));
  const recommendedIds=new Set(recommendSessionTaskIds(stageIndex));
  const selectedTasks=(session?.taskIds||[])
    .map((taskId)=>getExecutionTaskById(taskId))
    .filter(Boolean);
  const canEditSelection=String(session?.status||'planned')==='planned';
  const sessionTasks=[...selectedTasks];
  stageTasks.forEach((task)=>{
    if(sessionTasks.length>=3) return;
    if(!sessionTasks.some((item)=>Number(item.id)===Number(task.id))) sessionTasks.push(task);
  });
  const taskCards=sessionTasks.slice(0,3).map((task)=>{
    const taskId=Number(task.id);
    const checked=selectedIds.has(taskId);
    const isRecommended=recommendedIds.has(taskId);
    const status=String(task.status||'active');
    return `<label class="tasks-session-task ${checked?'on':''} ${status==='done'?'done':''}">
      <input type="checkbox" ${checked?'checked':''} ${canEditSelection?'':'disabled'} onchange="toggleSessionTaskSelection(${taskId}, this.checked)"/>
      <div class="tasks-session-task-copy">
        <div class="tasks-session-task-top">
          <span class="tasks-session-task-title">${escHtml(getTaskTitle(task))}</span>
          <span class="tasks-session-task-pill ${status}">${status==='blocked'?'Blocked':status==='done'?'Done':isRecommended?'Recommended':'Task'}</span>
        </div>
        <div class="tasks-session-task-meta">${escHtml(task.priority||task.prio||'med')} · ${task.estimateHours||2}h</div>
      </div>
    </label>`;
  }).join('');
  const timerLabel=getSessionTimerLabel(session);
  const statusLabel=String(session?.status||'planned');
  const milestoneDoneCount=stageTasks.filter((task)=>task.status==='done'||task.done).length;
  const nextBestAction=String(
    session?.review?.interpretation?.nextBestAction?.title
    || S.execution?.lastReviewResult?.review?.interpretation?.nextBestAction?.title
    || session?.outcomeSummary
    || ''
  ).trim();
  const reviewCompact=buildSessionReviewCompactMarkup(S.execution?.lastReviewResult||session);
  const primaryLabel=statusLabel==='running'?'Open Session':'Start Session';
  const primaryDisabled=statusLabel!=='running'&&!selectedIds.size;
  const primaryAction=statusLabel==='running'?'openSessionOverlay()':'startSession()';
  host.innerHTML=`<div class="tasks-session-hero">
    <div class="tasks-session-hero-main">
      <div class="tasks-session-kicker">${escHtml(statusLabel==='running'?'Session in progress':'Current milestone')}</div>
      <div class="tasks-session-title">${escHtml(stage?.title||'No active milestone')}</div>
      <div class="tasks-session-copy">${escHtml(stage?.objective||S.user.goal||'Generate a roadmap to define the next milestone objective.')}</div>
      <div class="tasks-session-meta">
        <span>${escHtml(stage?.status||'active')} milestone</span>
        <span>${selectedTasks.length ? `${selectedTasks.length} task${selectedTasks.length===1?'':'s'} selected` : 'Choose up to 3 tasks'}</span>
        <span>${timerLabel}</span>
      </div>
    </div>
    <div class="tasks-session-hero-side">
      <div class="tasks-session-side-head">
        <div class="tasks-session-side-label">Recommended tasks</div>
        <div class="tasks-session-side-sub">${canEditSelection?'Pick 1-3 tasks for the next session.':'Selection is locked while the session is running.'}</div>
      </div>
      <div class="tasks-session-task-list">
        ${taskCards || '<div class="session-empty-copy">No recommended tasks available yet.</div>'}
      </div>
      <div class="tasks-session-actions">
        <button class="btn btn-primary btn-sm" onclick="${primaryAction}" ${primaryDisabled?'disabled':''}>${primaryLabel}</button>
        <button class="btn btn-ghost btn-sm" onclick="openSessionOverlay()">Open Focus Mode</button>
      </div>
    </div>
  </div>
  <div class="tasks-session-context">
    <div class="tasks-session-context-item">
      <span>Milestone progress</span>
      <strong>${milestoneDoneCount}/${stageTasks.length||0} done</strong>
    </div>
    <div class="tasks-session-context-item">
      <span>Selection</span>
      <strong>${selectedTasks.length ? `${selectedTasks.length}/3 ready` : 'Select one clear task'}</strong>
    </div>
    <div class="tasks-session-context-item">
      <span>Next best action</span>
      <strong>${escHtml(nextBestAction||'Choose the clearest task and start.')}</strong>
    </div>
  </div>
  ${reviewCompact?`<div class="tasks-session-review-row">${reviewCompact}</div>`:''}`;
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'renderSessionWorkspace',
    action:'session_workspace_render_completed',
    taskCount:stageTasks.length,
    selectedTaskIds:selectedTasks.map((task)=>Number(task.id)).filter((id)=>Number.isFinite(id)),
    hasReviewResult:Boolean(S.execution?.lastReviewResult)
  });
  if(statusLabel==='running'||isSessionReviewOpen()) renderSessionOverlay();
  else hideSessionOverlay();
}
function buildSessionReviewCompactMarkup(session){
  const review=normalizeExecutionSessionReview(session?.review||{});
  const interpretation=review.interpretation||{};
  if(!review.appliedAt) return '';
  const stageDelta=Number(session?.progressDelta?.stageProgressDelta||interpretation.milestoneUpdate?.progressDelta||0);
  const overallDelta=Number(session?.progressDelta?.overallProgressDelta||interpretation.overallUpdate?.pctDelta||0);
  const nextActionTitle=String(interpretation.nextBestAction?.title||review.nextSteps||'').trim();
  const nextActionReason=String(interpretation.nextBestAction?.reason||'').trim();
  const summary=String(review.summary||interpretation.summary||session?.outcomeSummary||'').trim();
  const statusLabel=String(session?.status||'completed');
  return `<details class="tasks-review-compact">
    <summary>
      <span class="tasks-review-compact-kicker">Review</span>
      <span class="tasks-review-compact-summary">${escHtml(summary||'Execution state updated')}</span>
      <span class="tasks-review-compact-chip">${statusLabel==='completed'?'Applied':'Updated'}</span>
    </summary>
    <div class="tasks-review-compact-body">
      <div class="tasks-review-compact-row">
        <span>Milestone ${stageDelta>=0?'+':''}${stageDelta}%</span>
        <span>Overall ${overallDelta>=0?'+':''}${overallDelta}%</span>
      </div>
      ${nextActionTitle?`<div class="tasks-review-compact-next">
        <div class="tasks-review-compact-next-label">Next best action</div>
        <div class="tasks-review-compact-next-title">${escHtml(nextActionTitle)}</div>
        ${nextActionReason?`<div class="tasks-review-compact-next-copy">${escHtml(nextActionReason)}</div>`:''}
      </div>`:''}
    </div>
  </details>`;
}
function buildSessionReviewImpactMarkup(session){
  const review=normalizeExecutionSessionReview(session?.review||{});
  const interpretation=review.interpretation||{};
  if(!review.appliedAt) return '';
  const appliedChanges=review.appliedChanges||{};
  const taskUpdates=Array.isArray(interpretation.taskUpdates)?interpretation.taskUpdates:[];
  const completedTitles=(appliedChanges.taskIdsCompleted||[]).map((taskId)=>getExecutionTaskById(taskId)?.title).filter(Boolean);
  const blockedTitles=(appliedChanges.taskIdsBlocked||[]).map((taskId)=>getExecutionTaskById(taskId)?.title).filter(Boolean);
  const partialTitles=(appliedChanges.taskIdsPartiallyUpdated||[]).map((taskId)=>getExecutionTaskById(taskId)?.title).filter(Boolean);
  const nextActionTitle=String(interpretation.nextBestAction?.title||review.nextSteps||'').trim();
  const stageDelta=Number(session?.progressDelta?.stageProgressDelta||interpretation.milestoneUpdate?.progressDelta||0);
  const overallDelta=Number(session?.progressDelta?.overallProgressDelta||interpretation.overallUpdate?.pctDelta||0);
  const summary=String(review.summary||interpretation.summary||session?.outcomeSummary||'').trim();
  const changeLine=[
    completedTitles.length?`Completed: ${completedTitles.slice(0,3).join(' · ')}`:'',
    blockedTitles.length?`Blocked: ${blockedTitles.slice(0,3).join(' · ')}`:'',
    partialTitles.length?`Adjusted: ${partialTitles.slice(0,3).join(' · ')}`:''
  ].filter(Boolean).join(' | ');
  const taskUpdateCount=taskUpdates.length;
  return `<div class="session-review-impact-head">
    <div>
      <div class="session-list-title">Review result</div>
      <div class="session-review-impact-title">${escHtml(summary||'Execution state updated')}</div>
    </div>
    <div class="session-status-chip completed">Applied</div>
  </div>
  <div class="session-review-impact-grid">
    <div class="session-metric"><strong>${stageDelta>=0?'+':''}${stageDelta}%</strong><span>Milestone delta</span></div>
    <div class="session-metric"><strong>${overallDelta>=0?'+':''}${overallDelta}%</strong><span>Goal delta</span></div>
    <div class="session-metric"><strong>${taskUpdateCount}</strong><span>Task updates</span></div>
  </div>
  <div class="session-review-impact-copy">${escHtml(changeLine||'No direct task change was needed.')}</div>
  ${nextActionTitle?`<div class="session-review-next">
    <div class="session-review-next-label">Next best action</div>
    <div class="session-review-next-title">${escHtml(nextActionTitle)}</div>
    ${interpretation.nextBestAction?.reason?`<div class="session-review-next-copy">${escHtml(interpretation.nextBestAction.reason)}</div>`:''}
  </div>`:''}`;
}
function renderSessionOverlay(){
  const host=document.getElementById('session-overlay');
  if(!host) return;
  ensureExecutionState();
  const session=getExecutionSession();
  const visible=Boolean(session&&((session.status==='running')||isSessionReviewOpen()));
  host.classList.toggle('on',visible);
  if(!visible){
    host.innerHTML='';
    clearSessionTimer();
    return;
  }
  if(session.status==='running'&&!S.activeSession?.timerInterval) startSessionTimer();
  const stage=getExecutionSessionStage()||getExecutionStage(getExecutionActiveStageIndex());
  const taskIds=(session?.taskIds||[]).slice(0,3);
  const sessionTasks=taskIds
    .map((taskId)=>getExecutionTaskById(taskId))
    .filter(Boolean);
  const statusLabel=String(session.status||'planned');
  const reviewOpen=isSessionReviewOpen();
  const reviewAnswers=session?.review?.answers||normalizeSessionReviewAnswers(session?.review||{});
  const reviewSummary=buildSessionReviewImpactMarkup(session);
  const taskRows=sessionTasks.map((task)=>{
    const taskStatus=String(task.status||'active');
    return `<div class="session-run-task ${taskStatus}">
      <div class="session-run-task-copy">
        <div class="session-run-task-title">${escHtml(getTaskTitle(task))}</div>
        <div class="session-run-task-meta">${escHtml(task.priority||task.prio||'med')} · ${task.estimateHours||2}h · ${taskStatus}</div>
      </div>
      <div class="session-run-task-actions">
        <button class="btn btn-primary btn-sm" onclick="completeSessionTask(${Number(task.id)})" ${taskStatus==='done'?'disabled':''}>Complete Task</button>
        <button class="btn btn-ghost btn-sm" onclick="blockSessionTask(${Number(task.id)})" ${taskStatus==='blocked'?'disabled':''}>Mark Blocked</button>
      </div>
    </div>`;
  }).join('');
  const showReviewFields=reviewOpen||statusLabel!=='running';
  host.innerHTML=`<div class="session-modal">
    <div class="session-modal-head">
      <div>
        <div class="session-kicker">Focused Execution</div>
        <div class="session-modal-title">${escHtml(stage?.title||'Active milestone')}</div>
        <div class="session-modal-sub">${escHtml(stage?.objective||session.goal||S.user.goal||'')}</div>
      </div>
      <div class="session-status-chip ${statusLabel}">${statusLabel}</div>
    </div>
    <div class="session-modal-metrics">
      <div class="session-metric"><strong>${getSessionTimerLabel(session)}</strong><span>Elapsed</span></div>
      <div class="session-metric"><strong>${escHtml(session.goal||stage?.objective||S.user.goal||'')}</strong><span>Session goal</span></div>
      <div class="session-metric"><strong>${taskIds.length}</strong><span>Selected tasks</span></div>
    </div>
    <div class="session-modal-body">
      <div class="session-modal-list">
        <div class="session-list-head">
          <div class="session-list-title">Selected tasks</div>
          <div class="session-list-sub">Complete or block tasks directly from the session surface.</div>
        </div>
        ${taskRows || '<div class="session-empty-copy">No session tasks selected.</div>'}
      </div>
      <div class="session-modal-side">
      <div class="session-review-card ${reviewOpen?'on':''}">
        <div class="session-list-title">${reviewOpen?'Review session':'Session controls'}</div>
        <div class="session-review-copy">${reviewOpen?'Answer 3 short questions. The system will interpret them and update tasks, milestone progress, and the next session direction.':'Use the controls below to pause or end the session.'}</div>
          <div class="session-review-field" style="display:${showReviewFields?'flex':'none'}">
            <label>What did you actually complete?</label>
            <textarea id="session-review-summary" class="inp session-review-text" placeholder="Completed task, shipped result, or concrete outcome.">${escHtml(reviewAnswers.completed||session.review?.summary||session.outcomeSummary||'')}</textarea>
          </div>
          <div class="session-review-field" style="display:${showReviewFields?'flex':'none'}">
            <label>What stayed blocked or unfinished?</label>
            <textarea id="session-review-blockers" class="inp session-review-text" placeholder="Blocked tasks, unfinished work, or unresolved issues.">${escHtml(reviewAnswers.blocked||session.review?.blockers||'')}</textarea>
          </div>
          <div class="session-review-field" style="display:${showReviewFields?'flex':'none'}">
            <label>What slowed you down or changed?</label>
            <textarea id="session-review-notes" class="inp session-review-text" placeholder="Scope changes, blockers, or the next direction.">${escHtml(reviewAnswers.changed||session.review?.notes||session.notes||'')}</textarea>
          </div>
          <div class="session-review-actions">
            ${statusLabel==='running'
              ? "<button class=\"btn btn-ghost btn-sm\" onclick=\"pauseSession()\">Pause</button><button class=\"btn btn-danger btn-sm\" onclick=\"endSession('completed')\">End Session</button>"
              : ''}
            <button class="btn btn-primary btn-sm" onclick="openSessionReview()">Review</button>
            ${reviewOpen?'<button class="btn btn-primary btn-sm" onclick="applySessionReviewResults()">Apply Review</button>':''}
          </div>
          ${reviewSummary?`<div class="session-review-summary-wrap">${reviewSummary}</div>`:''}
        </div>
      </div>
    </div>
  </div>`;
}
function hideSessionOverlay(){
  const host=document.getElementById('session-overlay');
  if(!host) return;
  host.classList.remove('on');
  host.innerHTML='';
}
function onSessionOverlayClick(event){
  if(event&&event.target!==event.currentTarget) return;
}
function toggleSessionTaskSelection(taskId,checked){
  ensureExecutionState();
  if(!hasExecutionStateReady()) return;
  const session=prepareExecutionSession();
  if(!session||session.status!=='planned'){
    toast2('Session locked','Change task selection before starting the session.');
    return;
  }
  const numericId=Number(taskId);
  const nextIds=new Set((session.taskIds||[]).map((id)=>Number(id)).filter((id)=>Number.isFinite(id)));
  if(checked){
    if(nextIds.size>=3&&!nextIds.has(numericId)){
      toast2('Select up to 3 tasks','Remove one task before adding another.');
      renderSessionWorkspace();
      return;
    }
    nextIds.add(numericId);
  }else{
    nextIds.delete(numericId);
  }
  updateSessionRuntimeSession({
    ...session,
    taskIds:Array.from(nextIds).slice(0,3),
    status:'planned'
  });
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'session_flow',
    action:'session_task_selection_changed',
    sessionId:getExecutionSession()?.id||session.id,
    stageId:getExecutionSession()?.stageId||session.stageId,
    taskIds:Array.from(nextIds).slice(0,3)
  });
  saveAll();
  renderSessionWorkspace();
}
function openSessionOverlay(){
  ensureExecutionState();
  if(!hasExecutionStateReady()) return;
  const session=getExecutionSession();
  if(!session){
    prepareExecutionSession();
  }
  if((getExecutionSession()?.status||session?.status)==='planned'){
    startSession();
    return;
  }
  renderSessionOverlay();
  if(!S.activeSession?.timerInterval&&isSessionRunning()) startSessionTimer();
}
function startSession(){
  ensureExecutionState();
  if(!hasExecutionStateReady()) return;
  const prepared=prepareExecutionSession();
  if(!prepared){
    toast2('No active milestone','Generate a roadmap first.');
    return;
  }
  const taskIds=(prepared.taskIds||[]).slice(0,3);
  if(!taskIds.length){
    toast2('Select tasks first','Choose 1-3 tasks for the session.');
    renderSessionWorkspace();
    return;
  }
  const focusInput=String(document.getElementById('focus-input')?.value||'').trim();
  const startedAt=nowIso();
  const nextSession=normalizeExecutionSession({
    ...prepared,
    startedAt,
    endedAt:'',
    status:'running',
    goal:String(focusInput||prepared.goal||getExecutionSessionStage()?.objective||S.user.goal||''),
    review:{...prepared.review,openedAt:'',appliedAt:''},
    reviewOpenedAt:'',
    reviewAppliedAt:'',
    progressDelta:normalizeSessionProgressDelta(),
    outcomeSummary:String(prepared.outcomeSummary||''),
    notes:String(prepared.notes||document.getElementById('session-review-notes')?.value||'')
  },{stageId:prepared.stageId,goal:prepared.goal});
  S.execution.session=nextSession;
  S.execution.updatedAt=nowIso();
  syncActiveSessionRuntime();
  startSessionTimer();
  renderDashboardSessionControls();
  renderSessionWorkspace();
  renderSessionOverlay();
  saveAll();
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'session_flow',
    action:'session_started',
    sessionId:nextSession.id,
    stageId:nextSession.stageId,
    taskIds:nextSession.taskIds,
    goal:nextSession.goal,
    startedAt:nextSession.startedAt
  });
  feedLine(`Session started: "${nextSession.goal || getExecutionSessionStage()?.objective || 'execution focus'}"`);
  toast2('Session started!',nextSession.goal||'Focused execution mode active');
  trackEvent('session_started');
}
function openSessionReview(){
  ensureExecutionState();
  const session=getExecutionSession();
  if(!session){
    toast2('No session to review','Start and end a session first.');
    return;
  }
  const nextReview=normalizeExecutionSessionReview({
    ...session.review,
    openedAt:session.review?.openedAt||nowIso()
  });
  updateSessionRuntimeSession({
    ...session,
    review:nextReview,
    reviewOpenedAt:nextReview.openedAt
  });
  renderDashboardSessionControls();
  renderSessionOverlay();
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'session_flow',
    action:'session_review_opened',
    sessionId:session.id,
    stageId:session.stageId,
    status:session.status
  });
  trackEvent('session_review_started');
}
function endSession(outcome='completed'){
  ensureExecutionState();
  const session=getExecutionSession();
  if(!session||session.status!=='running'){
    toast2('No active session','Start a session before ending it.');
    return;
  }
  const status=String(outcome||'completed');
  const nextStatus=status==='blocked'
    ? 'blocked'
    : (status==='interrupted' ? 'interrupted' : 'completed');
  const endedAt=nowIso();
  const reviewOpenedAt=session.review?.openedAt||endedAt;
  const nextSession=normalizeExecutionSession({
    ...session,
    status:nextStatus,
    endedAt,
    review:{
      ...session.review,
      openedAt:reviewOpenedAt
    },
    reviewOpenedAt,
    reviewAppliedAt:'',
    progressDelta:getSessionProgressDelta(session),
    outcomeSummary:String(session.outcomeSummary||document.getElementById('session-review-summary')?.value||'')
  },{stageId:session.stageId,goal:session.goal});
  S.execution.session=nextSession;
  S.execution.updatedAt=nowIso();
  clearSessionTimer();
  syncActiveSessionRuntime();
  renderDashboardSessionControls();
  renderSessionWorkspace();
  renderSessionOverlay();
  saveAll();
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'session_flow',
    action:'session_ended',
    sessionId:nextSession.id,
    stageId:nextSession.stageId,
    status:nextSession.status,
    endedAt:nextSession.endedAt,
    progressDelta:nextSession.progressDelta
  });
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'session_flow',
    action:'session_review_opened',
    sessionId:nextSession.id,
    stageId:nextSession.stageId,
    status:nextSession.status
  });
  trackEvent('session_review_started');
  feedLine(`Session ended: ${nextSession.status}`);
  toast2('Session ended',nextSession.status);
}
function pauseSession(){
  endSession('interrupted');
}
function completeSessionTask(taskId){
  ensureExecutionState();
  if(!hasExecutionStateReady()) return;
  const canonical=getExecutionTaskById(taskId);
  if(!canonical) return;
  canonical.status='done';
  canonical.done=true;
  canonical.progressPct=100;
  canonical.completedAt=nowIso();
  delete canonical.blockedAt;
  delete canonical.blockReason;
  S.execution.updatedAt=nowIso();
  refreshExecutionProgress();
  syncActiveTasksFromExecution();
  saveTasks();
  saveAll();
  renderDashboardSessionControls();
  renderTasks();
  renderSessionWorkspace();
  renderSessionOverlay();
  updTaskBadge();
  updMilestoneBar();
  updRoadmapProgress();
  if(S.roadmap) renderRM();
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'session_flow',
    action:'session_task_completed',
    taskId:Number(taskId),
    sessionId:getExecutionSession()?.id||''
  });
}
function blockSessionTask(taskId){
  ensureExecutionState();
  if(!hasExecutionStateReady()) return;
  const canonical=getExecutionTaskById(taskId);
  if(!canonical) return;
  canonical.status='blocked';
  canonical.done=false;
  canonical.progressPct=0;
  canonical.blockedAt=nowIso();
  canonical.blockReason=String(document.getElementById('session-review-blockers')?.value||'').trim();
  S.execution.updatedAt=nowIso();
  refreshExecutionProgress();
  syncActiveTasksFromExecution();
  saveTasks();
  saveAll();
  renderDashboardSessionControls();
  renderTasks();
  renderSessionWorkspace();
  renderSessionOverlay();
  updTaskBadge();
  updMilestoneBar();
  updRoadmapProgress();
  if(S.roadmap) renderRM();
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'session_flow',
    action:'session_task_blocked',
    taskId:Number(taskId),
    sessionId:getExecutionSession()?.id||''
  });
}
function buildSessionReviewAnswersFromUI(session){
  return {
    completed:String(document.getElementById('session-review-summary')?.value||session.review?.answers?.completed||session.review?.summary||session.outcomeSummary||'').trim(),
    blocked:String(document.getElementById('session-review-blockers')?.value||session.review?.answers?.blocked||session.review?.blockers||'').trim(),
    changed:String(document.getElementById('session-review-notes')?.value||session.review?.answers?.changed||session.review?.notes||session.notes||'').trim()
  };
}
function sessionReviewResponseJsonSchema(){
  return {
    type:'object',
    additionalProperties:false,
    required:['summary','taskUpdates','milestoneUpdate','overallUpdate','nextBestAction','signals'],
    properties:{
      summary:{type:'string',maxLength:180},
      taskUpdates:{
        type:'array',
        maxItems:6,
        items:{
          type:'object',
          additionalProperties:false,
          required:['taskId','status','completionPct','note'],
          properties:{
            taskId:{type:'number'},
            status:{type:'string',enum:['done','blocked','partial','todo']},
            completionPct:{type:'number'},
            note:{type:'string',maxLength:180},
            blockReason:{type:'string',maxLength:180}
          }
        }
      },
      milestoneUpdate:{
        type:'object',
        additionalProperties:false,
        required:['stageId','progressPct','progressDelta','status','note'],
        properties:{
          stageId:{type:'string'},
          progressPct:{type:'number'},
          progressDelta:{type:'number'},
          status:{type:'string',enum:['active','completed','blocked','pending']},
          note:{type:'string',maxLength:180}
        }
      },
      overallUpdate:{
        type:'object',
        additionalProperties:false,
        required:['doneDelta','pctDelta','note'],
        properties:{
          doneDelta:{type:'number'},
          pctDelta:{type:'number'},
          note:{type:'string',maxLength:180}
        }
      },
      nextBestAction:{
        type:'object',
        additionalProperties:false,
        required:['taskId','stageId','title','reason'],
        properties:{
          taskId:{type:'number'},
          stageId:{type:'string'},
          title:{type:'string',maxLength:140},
          reason:{type:'string',maxLength:180}
        }
      },
      signals:{
        type:'object',
        additionalProperties:false,
        required:['completed','interrupted','blocked'],
        properties:{
          completed:{type:'boolean'},
          interrupted:{type:'boolean'},
          blocked:{type:'boolean'}
        }
      }
    }
  };
}
function buildSessionReviewPrompt({session,stage,tasks,selectedTasks,answers,baseline,progressDelta}){
  const taskLines=(tasks||[]).map((task)=>`- ${task.id}: ${getTaskTitle(task)} [${String(task.status||'todo')}] (${task.estimateHours||2}h)`).join('\n');
  const selectedLineList=(selectedTasks||[]).map((task)=>`- ${task.id}: ${getTaskTitle(task)} [${String(task.status||'todo')}]`).join('\n');
  return `Review this finished execution session and convert it into canonical execution updates.

Current stage:
- stageId: ${stage?.id||''}
- stageTitle: ${stage?.title||''}
- stageObjective: ${stage?.objective||''}

Session context:
- sessionId: ${session?.id||''}
- sessionStatus: ${session?.status||''}
- startedAt: ${session?.startedAt||''}
- endedAt: ${session?.endedAt||''}
- baselineStageDone: ${baseline.stageDone}
- baselineStageTotal: ${baseline.stageTotal}
- baselineOverallDone: ${baseline.overallDone}
- baselineOverallTotal: ${baseline.overallTotal}
- baselineStageProgress: ${baseline.stageProgress}
- baselineOverallProgress: ${baseline.overallProgress}
- currentStageDelta: ${progressDelta.stageProgressDelta}
- currentOverallDelta: ${progressDelta.overallProgressDelta}

Selected tasks:
${selectedLineList || '- none'}

Current milestone task inventory:
${taskLines || '- none'}

User answers:
1. What did you actually complete?
${answers.completed || '-'}
2. What stayed blocked or unfinished?
${answers.blocked || '-'}
3. What slowed you down or changed?
${answers.changed || '-'}

Rules:
- Use only the supplied session and answers.
- Keep the output concise and execution-focused.
- If a task was completed, mark it done.
- If a task is partially done, give a completionPct between 1 and 99.
- If a task is blocked, mark it blocked and include a blockReason.
- milestoneUpdate.progressPct should reflect the resulting milestone progress after applying the task updates.
- overallUpdate should describe the resulting goal progress change.
- nextBestAction must point to one concrete next task or the next session direction.
- Return JSON only.`;
}
function buildFallbackSessionReviewInterpretation({session,stage,answers,taskIds,progressDelta}){
  const firstTaskId=Number(taskIds?.[0]||0);
  const blockedTaskId=Number(taskIds?.find((taskId)=>getExecutionTaskById(taskId)?.status!=='done')||firstTaskId||0);
  const summary=answers.completed
    ? clipText(`Completed: ${answers.completed}`,140)
    : 'Execution state updated from the session review.';
  const taskUpdates=[];
  if(firstTaskId&&(answers.completed||session?.status==='completed')){
    taskUpdates.push({
      taskId:firstTaskId,
      status:'done',
      completionPct:100,
      note:clipText(answers.completed||'Marked complete from session review.',160),
      blockReason:''
    });
  }
  if(answers.blocked && blockedTaskId){
    taskUpdates.push({
      taskId:blockedTaskId,
      status:'blocked',
      completionPct:0,
      note:clipText(answers.blocked,160),
      blockReason:clipText(answers.blocked,160)
    });
  }
  return normalizeSessionReviewInterpretation({
    summary,
    taskUpdates,
    milestoneUpdate:{
      stageId:String(stage?.id||session?.stageId||''),
      progressPct:clampPercentage(50+Number(progressDelta.stageProgressDelta||0)),
      progressDelta:Number(progressDelta.stageProgressDelta||0),
      status:Number(progressDelta.stageProgressDelta||0)>=0?'active':'blocked',
      note:clipText(answers.changed||summary,160)
    },
    overallUpdate:{
      doneDelta:Number(progressDelta.overallDoneDelta||0),
      pctDelta:Number(progressDelta.overallProgressDelta||0),
      note:clipText(answers.changed||summary,160)
    },
    nextBestAction:{
      taskId:Number(taskIds?.find((taskId)=>Number(taskId)!==firstTaskId)||0),
      stageId:String(stage?.id||session?.stageId||''),
      title:clipText(answers.changed||`Continue the current milestone with one concrete step.`,140),
      reason:clipText('Fallback interpretation used because AI output was unavailable.',180)
    },
    signals:{
      completed:session?.status==='completed',
      interrupted:session?.status==='interrupted',
      blocked:session?.status==='blocked'||Boolean(answers.blocked)
    }
  });
}
async function interpretSessionReviewWithAi(context){
  try{
    const response=await geminiJSON(
      buildSessionReviewPrompt(context),
      sessionReviewSystemCtx(),
      900,
      '',
      {temperature:0.15},
      'session_review'
    );
    return normalizeSessionReviewInterpretation(response||{});
  }catch(error){
    logWarn({
      area:'frontend',
      module:'frontend/script.js',
      function:'session_flow',
      action:'session_review_ai_fallback',
      sessionId:context.session?.id||'',
      errorMessage:String(error?.message||'AI review failed')
    });
    return buildFallbackSessionReviewInterpretation(context);
  }
}
function sessionReviewSystemCtx(){
  return `You are an execution analyst. Return concise English JSON only. Do not add motivational text. Focus on concrete work completed, blocked work, milestone impact, overall progress impact, and the next best action.`;
}
function applySessionReviewTaskUpdate(task, update, session){
  if(!task||!update) return null;
  const nextTask=task;
  const status=String(update.status||'partial');
  const pct=clampPercentage(update.completionPct);
  if(status==='done'||pct>=100){
    nextTask.status='done';
    nextTask.done=true;
    nextTask.progressPct=100;
    nextTask.completedAt=nextTask.completedAt||nowIso();
    delete nextTask.blockedAt;
    delete nextTask.blockReason;
  }else if(status==='blocked'){
    nextTask.status='blocked';
    nextTask.done=false;
    nextTask.progressPct=0;
    nextTask.blockedAt=nowIso();
    nextTask.blockReason=String(update.blockReason||update.note||'');
  }else{
    nextTask.status=nextTask.status==='done'?'done':'todo';
    nextTask.done=Boolean(nextTask.done);
    nextTask.progressPct=Math.max(0,Math.min(99,pct||Number(nextTask.progressPct||0)));
    if(update.note) nextTask.reviewNote=String(update.note);
  }
  nextTask.reviewSource='session_review';
  nextTask.reviewSessionId=String(session?.id||'');
  nextTask.reviewUpdatedAt=nowIso();
  return nextTask;
}
async function applySessionReviewResults(){
  ensureExecutionState();
  const session=getExecutionSession();
  if(!session){
    toast2('No session to apply','Start and end a session first.');
    return;
  }
  const stage=getExecutionSessionStage()||getExecutionStage(getExecutionActiveStageIndex());
  const answers=buildSessionReviewAnswersFromUI(session);
  const selectedTaskIds=Array.from(new Set((session.taskIds||[]).map((taskId)=>Number(taskId)).filter((taskId)=>Number.isFinite(taskId))));
  const selectedTasks=selectedTaskIds.map((taskId)=>getExecutionTaskById(taskId)).filter(Boolean);
  const stageIndexForReview=getExecutionStages().findIndex((item)=>String(item.id)===String(stage?.id||session.stageId));
  const stageTasksForReview=stageIndexForReview>=0
    ? getTasksForStage(stageIndexForReview,{includeArchived:false})
    : selectedTasks;
  const baseline=session.baseline||buildSessionBaseline(getExecutionActiveStageIndex());
  const appliedAt=nowIso();
  const progressBefore=getSessionProgressDelta(session);
  const interpretation=await interpretSessionReviewWithAi({
    session,
    stage,
    tasks:stageTasksForReview,
    selectedTasks,
    answers,
    baseline,
    progressDelta:progressBefore
  });
  const normalizedInterpretation=normalizeSessionReviewInterpretation(interpretation);
  const appliedChanges={
    taskIdsCompleted:[],
    taskIdsBlocked:[],
    taskIdsPartiallyUpdated:[]
  };
  const applyTargetTaskIds=(normalizedInterpretation.taskUpdates||[]).length
    ? normalizedInterpretation.taskUpdates
    : [];
  if(!applyTargetTaskIds.length&&selectedTaskIds.length){
    const fallbackTaskId=selectedTaskIds[0];
    if(answers.completed){
      applyTargetTaskIds.push(normalizeSessionReviewTaskUpdate({
        taskId:fallbackTaskId,
        status:'done',
        completionPct:100,
        note:answers.completed
      }));
    }else if(answers.blocked){
      applyTargetTaskIds.push(normalizeSessionReviewTaskUpdate({
        taskId:fallbackTaskId,
        status:'blocked',
        completionPct:0,
        note:answers.blocked,
        blockReason:answers.blocked
      }));
    }else if(answers.changed){
      applyTargetTaskIds.push(normalizeSessionReviewTaskUpdate({
        taskId:fallbackTaskId,
        status:'partial',
        completionPct:50,
        note:answers.changed
      }));
    }
  }
  applyTargetTaskIds.forEach((update)=>{
    const target=getExecutionTaskById(update.taskId);
    if(!target) return;
    applySessionReviewTaskUpdate(target, update, session);
    if(update.status==='done'){
      appliedChanges.taskIdsCompleted.push(Number(update.taskId));
    }else if(update.status==='blocked'){
      appliedChanges.taskIdsBlocked.push(Number(update.taskId));
    }else{
      appliedChanges.taskIdsPartiallyUpdated.push(Number(update.taskId));
    }
  });
  const stageRecord=getExecutionStages()[stageIndexForReview]||getExecutionStages().find((item)=>String(item.id)===String(stage?.id||session.stageId));
  const stageTasks=stageRecord?getTasksForStage(stageIndexForReview>=0?stageIndexForReview:getExecutionStages().findIndex((item)=>String(item.id)===String(stageRecord.id)),{includeArchived:false}):selectedTasks;
  if(stageRecord){
    const milestoneUpdate=normalizedInterpretation.milestoneUpdate||{};
    const weightedProgress=calculateTaskProgressValue(stageTasks);
    stageRecord.progress=clampPercentage(
      Number.isFinite(Number(milestoneUpdate.progressPct))
        ? milestoneUpdate.progressPct
        : weightedProgress
    );
    if(milestoneUpdate.status==='completed'||stageRecord.progress>=100){
      stageRecord.status='completed';
    }else if(milestoneUpdate.status==='blocked'){
      stageRecord.status='active';
    }else if(stageRecord.status!=='completed'){
      stageRecord.status='active';
    }
  }
  refreshExecutionProgress();
  syncActiveTasksFromExecution();
  const progressDelta=getSessionProgressDelta(session);
  const appliedReview=normalizeExecutionSessionReview({
    ...session.review,
    openedAt:session.review?.openedAt||session.reviewOpenedAt||appliedAt,
    appliedAt,
    summary:String(normalizedInterpretation.summary||answers.completed||session.review?.summary||'').trim(),
    blockers:answers.blocked,
    notes:answers.changed,
    outcome:session.status,
    nextSteps:String(normalizedInterpretation.nextBestAction?.title||answers.changed||'').trim(),
    answers,
    interpretation:{
      ...normalizedInterpretation,
      taskUpdates:applyTargetTaskIds.map((update)=>normalizeSessionReviewTaskUpdate(update)),
      nextBestAction:normalizeSessionReviewNextAction({
        ...normalizedInterpretation.nextBestAction,
        taskId:Number(normalizedInterpretation.nextBestAction?.taskId||0)
      })
    },
    appliedChanges
  });
  const nextSession=normalizeExecutionSession({
    ...session,
    review:appliedReview,
    reviewOpenedAt:appliedReview.openedAt,
    reviewAppliedAt:appliedAt,
    progressDelta,
    outcomeSummary:String(appliedReview.summary||answers.completed||'').trim(),
    notes:answers.changed,
    status:session.status==='running'?'completed':session.status
  },{stageId:session.stageId,goal:session.goal});
  const historyEntry={
    ...nextSession,
    review:appliedReview,
    progressDelta,
    appliedAt
  };
  if(!Array.isArray(S.execution.sessionHistory)) S.execution.sessionHistory=[];
  S.execution.sessionHistory.unshift(historyEntry);
  if(S.execution.sessionHistory.length>25) S.execution.sessionHistory.length=25;
  S.execution.lastReviewResult=historyEntry;
  S.execution.session=nextSession;
  const durationMinutes=getSessionDurationMinutes(nextSession);
  const completedDelta=Math.max(0,Number(progressDelta.overallDoneDelta||0));
  S.progress.sessions=(Number(S.progress.sessions||0)+1);
  if(nextSession.status==='completed') S.progress.completedSessions=Number(S.progress.completedSessions||0)+1;
  else if(nextSession.status==='interrupted') S.progress.interruptedSessions=Number(S.progress.interruptedSessions||0)+1;
  else if(nextSession.status==='blocked') S.progress.blockedSessions=Number(S.progress.blockedSessions||0)+1;
  S.progress.hours=Number(S.progress.hours||0)+(durationMinutes/60);
  if(nextSession.status==='completed'){
    logActivityInternal(nextSession.goal||'session',durationMinutes);
  }
  if(!Array.isArray(S.progress.sessionLog)) S.progress.sessionLog=[];
  const todayLabel=new Date().toDateString();
  const existingLog=S.progress.sessionLog.find((entry)=>entry.date===todayLabel);
  const sessionLogPayload={
    date:todayLabel,
    sessions:1,
    tasks:completedDelta,
    focus:nextSession.goal||session.goal||'',
    duration:Math.max(1,durationMinutes),
    status:nextSession.status,
    completedSessions:Number(S.progress.completedSessions||0),
    interruptedSessions:Number(S.progress.interruptedSessions||0),
    blockedSessions:Number(S.progress.blockedSessions||0),
    reviewSummary:String(appliedReview.summary||'').trim(),
    nextAction:String(appliedReview.interpretation?.nextBestAction?.title||'').trim()
  };
  if(existingLog){
    existingLog.sessions=(Number(existingLog.sessions||0)+1);
    existingLog.tasks=(Number(existingLog.tasks||0)+completedDelta);
    existingLog.focus=sessionLogPayload.focus;
    existingLog.duration=Math.max(Number(existingLog.duration||0),sessionLogPayload.duration);
    existingLog.status=nextSession.status;
    existingLog.completedSessions=sessionLogPayload.completedSessions;
    existingLog.interruptedSessions=sessionLogPayload.interruptedSessions;
    existingLog.blockedSessions=sessionLogPayload.blockedSessions;
    existingLog.reviewSummary=sessionLogPayload.reviewSummary;
    existingLog.nextAction=sessionLogPayload.nextAction;
  }else{
    S.progress.sessionLog.push(sessionLogPayload);
  }
  const completionRate=Number(S.progress.sessions||0)>0
    ? Math.round(((Number(S.progress.completedSessions||0))/Number(S.progress.sessions||1))*100)
    : 0;
  S.progress.sessionCompletionRate=completionRate;
  if(appliedReview.summary) feedLine(`Session review applied: ${appliedReview.summary}`);
  updateSessionRuntimeSession({
    ...nextSession,
    review:appliedReview,
    reviewAppliedAt:appliedAt
  });
  S.execution.updatedAt=nowIso();
  refreshExecutionProgress();
  syncActiveTasksFromExecution();
  await maybeAutoAdvanceRoadmapStage();
  const nextStageIndex=getExecutionActiveStageIndex();
  const nextStage=getExecutionStage(nextStageIndex);
  const nextActionTaskId=Number(appliedReview.interpretation?.nextBestAction?.taskId||0);
  const nextStageTaskIds=getTasksForStage(nextStageIndex,{includeArchived:false}).map((task)=>Number(task.id)).filter((taskId)=>Number.isFinite(taskId));
  const sessionTaskIds=nextActionTaskId&&nextStageTaskIds.includes(nextActionTaskId)
    ? [nextActionTaskId]
    : recommendSessionTaskIds(nextStageIndex);
  const nextPlannedSession=normalizeExecutionSession({
    id:createClientRequestId('session'),
    stageId:String(nextStage?.id||''),
    taskIds:sessionTaskIds,
    goal:String(appliedReview.interpretation?.nextBestAction?.title||nextStage?.objective||S.user.goal||''),
    startedAt:'',
    endedAt:'',
    status:'planned',
    review:{
      openedAt:'',
      appliedAt:'',
      summary:'',
      blockers:'',
      notes:'',
      outcome:'',
      nextSteps:'',
      answers:normalizeSessionReviewAnswers(),
      interpretation:normalizeSessionReviewInterpretation(),
      appliedChanges:normalizeSessionReviewAppliedChanges()
    },
    progressDelta:normalizeSessionProgressDelta(),
    notes:'',
    outcomeSummary:'',
    baseline:buildSessionBaseline(nextStageIndex)
  },{stageId:nextStage?.id||'',goal:nextStage?.objective||S.user.goal||''});
  S.execution.session=nextPlannedSession;
  syncActiveSessionRuntime();
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'session_flow',
    action:'session_prepared',
    sessionId:nextPlannedSession.id,
    stageId:nextPlannedSession.stageId,
    taskIds:nextPlannedSession.taskIds,
    goal:nextPlannedSession.goal
  });
  clearSessionTimer();
  saveTasks();
  saveAll();
  renderDashboardSessionControls();
  renderTasks();
  renderSessionWorkspace();
  renderSessionOverlay();
  updTaskBadge();
  updMilestoneBar();
  updRoadmapProgress();
  if(S.roadmap) renderRM();
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'session_flow',
    action:'session_review_completed',
    sessionId:nextSession.id,
    stageId:nextSession.stageId,
    status:nextSession.status,
    progressDelta,
    durationMinutes,
    summary:appliedReview.summary,
    taskUpdates:appliedReview.interpretation?.taskUpdates?.length||0
  });
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'session_flow',
    action:'session_progress_applied',
    sessionId:nextSession.id,
    stageId:nextSession.stageId,
    progressDelta,
    completedSessions:Number(S.progress.completedSessions||0),
    interruptedSessions:Number(S.progress.interruptedSessions||0),
    blockedSessions:Number(S.progress.blockedSessions||0)
  });
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'session_flow',
    action:'session_next_action_generated',
    sessionId:nextSession.id,
    stageId:nextSession.stageId,
    nextAction:nextPlannedSession.goal,
    nextTaskIds:nextPlannedSession.taskIds
  });
  toast2('Session review applied',appliedReview.summary||'Execution state updated.');
  trackEvent('session_review_completed');
  trackEvent('session_progress_applied');
  trackEvent('session_next_action_generated');
  if(nextSession.status==='completed'){
    trackEvent('completed_session_count');
    trackEvent('session_done');
  }else if(nextSession.status==='interrupted'){
    trackEvent('interrupted_session_count');
  }else if(nextSession.status==='blocked'){
    trackEvent('blocked_session_count');
  }
}
function getTaskCalendarSource(){
  if(isExecutionStateObject(S.execution)){
    return getAllExecutionTasks().filter((task)=>task.status!=='archived');
  }
  return (S.tasks||[]).filter((task)=>task.status!=='archived');
}
function normalizeTaskCalendarDate(value){
  const text=String(value||'').trim();
  if(!text) return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date=new Date(text);
  if(Number.isNaN(date.getTime())) return '';
  return toDateInputValue(date);
}
function getTaskCalendarMonthAnchor(){
  if(!(taskCalendarMonthAnchor instanceof Date)||Number.isNaN(taskCalendarMonthAnchor.getTime())){
    taskCalendarMonthAnchor=new Date();
    taskCalendarMonthAnchor.setDate(1);
    taskCalendarMonthAnchor.setHours(0,0,0,0);
  }
  return taskCalendarMonthAnchor;
}
function setTaskCalendarMonthAnchor(date){
  const source=date instanceof Date&&!Number.isNaN(date.getTime())?date:new Date();
  taskCalendarMonthAnchor=new Date(source.getFullYear(),source.getMonth(),1);
}
function formatTaskCalendarMonth(date){
  return new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric'}).format(date);
}
function compareCalendarTasks(a,b){
  const stageA=Number.isFinite(Number(a.milestoneIndex))?Number(a.milestoneIndex):Math.max(0,(Number(a.linkedStage)||1)-1);
  const stageB=Number.isFinite(Number(b.milestoneIndex))?Number(b.milestoneIndex):Math.max(0,(Number(b.linkedStage)||1)-1);
  if(stageA!==stageB) return stageA-stageB;
  const doneA=Boolean(a.done)||a.status==='done';
  const doneB=Boolean(b.done)||b.status==='done';
  if(doneA!==doneB) return doneA?1:-1;
  const prioRank={high:0,med:1,low:2};
  const prioA=prioRank[normalizeTaskPriority(a.priority||a.prio)]??1;
  const prioB=prioRank[normalizeTaskPriority(b.priority||b.prio)]??1;
  if(prioA!==prioB) return prioA-prioB;
  return String(getTaskTitle(a)||'').localeCompare(String(getTaskTitle(b)||''),undefined,{sensitivity:'base'});
}
function buildTaskCalendarBuckets(tasks){
  const buckets=new Map();
  const unscheduled=[];
  (tasks||[]).forEach((task)=>{
    const dateKey=normalizeTaskCalendarDate(task.deadline);
    const normalized=decorateTaskWithMilestoneMeta({
      ...task,
      deadline:dateKey,
      prio:normalizeTaskPriority(task.priority||task.prio),
      priority:normalizeTaskPriority(task.priority||task.prio),
      done:Boolean(task.done)||task.status==='done'
    });
    if(!dateKey){
      unscheduled.push(normalized);
      return;
    }
    if(!buckets.has(dateKey)) buckets.set(dateKey,[]);
    buckets.get(dateKey).push(normalized);
  });
  buckets.forEach((items,key)=>{
    items.sort(compareCalendarTasks);
    buckets.set(key,items);
  });
  unscheduled.sort(compareCalendarTasks);
  return {buckets,unscheduled};
}
function renderTaskCalendarWeekdays(host){
  if(!host) return;
  const labels=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  host.innerHTML=labels.map((label)=>`<div class="calendar-weekday">${label}</div>`).join('');
}
function renderTaskCalendar(){
  const titleEl=document.getElementById('task-calendar-title');
  const weekdaysEl=document.getElementById('task-calendar-weekdays');
  const gridEl=document.getElementById('task-calendar-grid');
  const footerEl=document.getElementById('task-calendar-footer');
  if(!titleEl||!weekdaysEl||!gridEl||!footerEl) return;
  const anchor=getTaskCalendarMonthAnchor();
  const monthStart=new Date(anchor.getFullYear(),anchor.getMonth(),1);
  const monthEnd=new Date(anchor.getFullYear(),anchor.getMonth()+1,0);
  const startGrid=new Date(monthStart);
  const startOffset=(monthStart.getDay()+6)%7;
  startGrid.setDate(monthStart.getDate()-startOffset);
  const source=getTaskCalendarSource();
  const {buckets,unscheduled}=buildTaskCalendarBuckets(source);
  const todayKey=toDateInputValue(new Date());
  const stages=getExecutionStages().length?getExecutionStages():(Array.isArray(S.roadmap)?S.roadmap:[]);
  const legendHostId='task-calendar-legend';
  let legendEl=document.getElementById(legendHostId);
  if(!legendEl){
    legendEl=document.createElement('div');
    legendEl.id=legendHostId;
    legendEl.className='calendar-legend';
    const topRow=titleEl.parentElement?.parentElement;
    if(topRow){
      topRow.insertAdjacentElement('afterend',legendEl);
    }else{
      titleEl.parentElement.insertAdjacentElement('afterend',legendEl);
    }
  }
  legendEl.innerHTML=stages.map((stage,index)=>{
    const meta=getMilestoneVisualMeta(index,stages.length||1);
    return `<div class="calendar-legend-item" style="--milestone-accent:${meta.accent};--milestone-tint:${meta.tint};--milestone-border:${meta.border};--milestone-glow:${meta.glow};">
      <span class="calendar-legend-swatch">${meta.label}</span>
      <div class="calendar-legend-copy">
        <strong>${escHtml(meta.title)}</strong>
        <span>${escHtml(meta.rangeLabel)}</span>
      </div>
    </div>`;
  }).join('');
  titleEl.textContent=formatTaskCalendarMonth(monthStart);
  renderTaskCalendarWeekdays(weekdaysEl);
  gridEl.innerHTML=Array.from({length:42},(_,index)=>{
    const cellDate=new Date(startGrid);
    cellDate.setDate(startGrid.getDate()+index);
    const cellKey=toDateInputValue(cellDate);
    const tasks=buckets.get(cellKey)||[];
    const inMonth=cellDate.getMonth()===monthStart.getMonth();
    const isToday=cellKey===todayKey;
    const isSelected=cellKey===taskCalendarSelectedDate;
    const milestoneMeta=getMilestoneVisualMetaForDate(cellKey);
    const visibleTasks=tasks.slice(0,3);
    const moreCount=Math.max(0,tasks.length-visibleTasks.length);
    const weekdayName=new Intl.DateTimeFormat('en-US',{weekday:'short'}).format(cellDate);
    const zoneVars=milestoneMeta
      ? `--milestone-accent:${milestoneMeta.accent};--milestone-tint:${milestoneMeta.tint};--milestone-border:${milestoneMeta.border};--milestone-glow:${milestoneMeta.glow};`
      : '';
    return `<div class="calendar-day ${inMonth?'':'out-month'} ${isToday?'today':''} ${isSelected?'selected':''} ${milestoneMeta?'milestone-zone':''}" style="${zoneVars}" onclick="openTaskCalendarDay(${JSON.stringify(cellKey)})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openTaskCalendarDay(${JSON.stringify(cellKey)})}" role="button" tabindex="0" aria-label="${weekdayName} ${cellDate.getDate()} ${formatTaskCalendarMonth(cellDate)}">
      <div class="calendar-day-head">
        <div class="calendar-day-number">${cellDate.getDate()}</div>
        <div class="calendar-day-meta">${tasks.length?`${tasks.length}`:'&nbsp;'}</div>
      </div>
      <div class="calendar-day-body">
        ${visibleTasks.map((task)=>{
          const prio=normalizeTaskPriority(task.priority||task.prio);
          const doneClass=task.done||task.status==='done'?'done':'';
          const taskMeta=decorateTaskWithMilestoneMeta(task);
          return `<button class="calendar-task-chip milestone-zone prio-${prio} ${doneClass}" style="--milestone-accent:${taskMeta.milestoneColor};--milestone-tint:${taskMeta.milestoneTint};--milestone-border:${taskMeta.milestoneBorder};--milestone-glow:${taskMeta.milestoneGlow};" onclick="event.stopPropagation();openTaskDetail(${Number(task.id)})" title="${escHtml(getTaskTitle(task))}">
            <span class="calendar-task-dot">${task.done||task.status==='done'?'✓':''}</span>
            <span class="calendar-task-title">${escHtml(clipText(getTaskTitle(task),48))}</span>
          </button>`;
        }).join('')}
        ${moreCount>0?`<button class="calendar-more-chip" onclick="event.stopPropagation();openTaskCalendarDay(${JSON.stringify(cellKey)})">+${moreCount} more</button>`:''}
      </div>
    </div>`;
  }).join('');
  const scheduledTotal=source.filter((task)=>normalizeTaskCalendarDate(task.deadline)).length;
  const totalCount=source.length;
  footerEl.innerHTML=`<button class="calendar-footer-chip" onclick="openTaskCalendarDay('__unscheduled__')" ${unscheduled.length?'':'disabled'}>
    <span>Unscheduled</span>
    <strong>${unscheduled.length}</strong>
  </button>
  <div class="calendar-footer-stat">
    <span>Scheduled</span>
    <strong>${scheduledTotal}</strong>
  </div>
  <div class="calendar-footer-stat">
    <span>Total tasks</span>
    <strong>${totalCount}</strong>
  </div>`;
}
function openTaskCalendarDay(dateKey){
  taskCalendarSelectedDate=dateKey;
  renderTaskCalendar();
  const overlay=document.getElementById('calendar-day-overlay');
  const content=document.getElementById('calendar-day-content');
  if(!overlay||!content) return;
  const source=getTaskCalendarSource();
  const {buckets,unscheduled}=buildTaskCalendarBuckets(source);
  const tasks=dateKey==='__unscheduled__'
    ? unscheduled
    : (buckets.get(dateKey)||[]);
  const milestoneMeta=dateKey==='__unscheduled__'?null:getMilestoneVisualMetaForDate(dateKey);
  const title=dateKey==='__unscheduled__'
    ? 'Unscheduled tasks'
    : new Intl.DateTimeFormat('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(new Date(`${dateKey}T00:00:00`));
  content.innerHTML=`<div class="calendar-day-headline">
    <div>
      <div class="calendar-day-kicker">Calendar Day</div>
      <div class="calendar-day-title" id="calendar-day-title">${escHtml(title)}</div>
      ${milestoneMeta?`<div class="calendar-day-zone-pill" style="--milestone-accent:${milestoneMeta.accent};--milestone-tint:${milestoneMeta.tint};--milestone-border:${milestoneMeta.border};"> ${escHtml(milestoneMeta.label)} · ${escHtml(milestoneMeta.title)}</div>`:''}
      <div class="calendar-day-sub">${tasks.length} task${tasks.length===1?'':'s'}</div>
    </div>
    <button class="calendar-day-close" onclick="closeCalendarDay()" aria-label="Close calendar day">✕</button>
  </div>
  <div class="calendar-day-list">
    ${tasks.length?tasks.map((task)=>{
      const prio=normalizeTaskPriority(task.priority||task.prio);
      const done=task.done||task.status==='done';
      const taskMeta=decorateTaskWithMilestoneMeta(task);
      return `<button class="calendar-day-task milestone-zone ${done?'done':''}" style="--milestone-accent:${taskMeta.milestoneColor};--milestone-tint:${taskMeta.milestoneTint};--milestone-border:${taskMeta.milestoneBorder};--milestone-glow:${taskMeta.milestoneGlow};" onclick="openTaskDetail(${Number(task.id)})">
        <div class="calendar-day-task-head">
          <span class="calendar-day-task-title">${escHtml(getTaskTitle(task))}</span>
          <span class="calendar-day-task-prio prio-${prio}">${escHtml(taskPrioLabel(prio))}</span>
        </div>
        <div class="calendar-day-task-meta">
          <span>${done?'Done':'Active'}</span>
          <span>${escHtml(task.deadline||'No deadline')}</span>
        </div>
      </button>`;
    }).join(''):'<div class="calendar-day-empty">No tasks scheduled for this day.</div>'}
  </div>`;
  overlay.classList.add('on');
  document.body.classList.add('task-detail-open');
}
function closeCalendarDay(silent=false){
  const overlay=document.getElementById('calendar-day-overlay');
  if(overlay) overlay.classList.remove('on');
  if(!silent){
    const content=document.getElementById('calendar-day-content');
    if(content) content.innerHTML='';
  }
  taskCalendarSelectedDate='';
  const taskOverlay=document.getElementById('task-detail-overlay');
  if(!taskOverlay||!taskOverlay.classList.contains('on')){
    document.body.classList.remove('task-detail-open');
  }
}
function onCalendarDayOverlayClick(event){
  if(event.target&&event.target.id==='calendar-day-overlay') closeCalendarDay();
}
function moveTaskCalendarMonth(delta){
  const anchor=getTaskCalendarMonthAnchor();
  setTaskCalendarMonthAnchor(new Date(anchor.getFullYear(),anchor.getMonth()+(Number(delta)||0),1));
  closeCalendarDay(true);
  renderTasks();
}
function goTaskCalendarToday(){
  setTaskCalendarMonthAnchor(new Date());
  closeCalendarDay(true);
  renderTasks();
}
function focusTaskInput(){document.getElementById('task-input').focus();}
function ensureTaskDetailBindings(){
  if(taskDetailEscBound) return;
  window.addEventListener('keydown',(event)=>{
    if(event.key!=='Escape') return;
    const taskOverlay=document.getElementById('task-detail-overlay');
    const calendarOverlay=document.getElementById('calendar-day-overlay');
    if(taskOverlay&&taskOverlay.classList.contains('on')) closeTaskDetail(true);
    else if(calendarOverlay&&calendarOverlay.classList.contains('on')) closeCalendarDay(true);
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
  const calendarOverlay=document.getElementById('calendar-day-overlay');
  if(!calendarOverlay||!calendarOverlay.classList.contains('on')){
    document.body.classList.remove('task-detail-open');
  }
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
    deadline:stage?.targetDate||S.user.deadline||'',
    stageStartDate:stage?.startDate||'',
    stageTargetDate:stage?.targetDate||S.user.deadline||''
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
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'renderTasks',
    action:'render_tasks_started',
    executionReady:hasExecutionStateReady(),
    activeStageIndex:getExecutionActiveStageIndex(),
    visibleTaskCount:getVisibleActiveTasks().length
  });
  syncActiveTasksFromExecution();
  renderSessionWorkspace();
  renderDashboardSessionControls();
  const source=getTaskCalendarSource();
  const sub=document.getElementById('task-count-sub');
  if(sub) sub.textContent=source.length?`(${source.length} tasks)`:''; 
  renderTaskCalendar();
  logInfo({
    area:'frontend',
    module:'frontend/script.js',
    function:'renderTasks',
    action:'render_tasks_completed',
    visibleTaskCount:source.length,
    taskIds:source.map((task)=>Number(task.id)).filter((id)=>Number.isFinite(id))
  });
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
function updTaskBadge(){
  const c=getVisibleActiveTasks().filter((task)=>!(task.done||task.status==='done')).length;
  const b=document.getElementById('task-badge');
  if(b){b.textContent=c;b.style.display=c>0?'':'none';}
}
function saveTasks(){
  if(!canPersistUserData()) return;
  try{
    const snapshot=isExecutionStateObject(S.execution)
      ? getExecutionActiveTasks()
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
        deadline:stage?.targetDate||S.user.deadline||'',
        stageStartDate:stage?.startDate||'',
        stageTargetDate:stage?.targetDate||S.user.deadline||''
      }).map((task)=>({
        ...task,
        linkedStage:1,
        linkedStageIndex:0
      }));
    }
  }catch(e){
    S.tasks=[];
  }
  S.progress.tasksDone=getVisibleActiveTasks().filter((task)=>task.done||task.status==='done').length;
}
async function aiEditTasks(){
  const tasks=getVisibleActiveTasks();
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
      deadline:activeStage?.targetDate||S.user.deadline||'',
      stageStartDate:activeStage?.startDate||'',
      stageTargetDate:activeStage?.targetDate||S.user.deadline||''
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
    deadline:stage?.targetDate||S.user.deadline||'',
    stageStartDate:stage?.startDate||'',
    stageTargetDate:stage?.targetDate||S.user.deadline||''
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
  for(let i=analyticsRangeDays-1;i>=0;i--){
    const d=new Date(now);
    d.setDate(d.getDate()-i);
    const key=d.toDateString();
    labels.push(d.toLocaleDateString('en-GB',{day:'numeric',month:'short'}));
    visitArr.push(visits[key]||0);
    const completedCount=events.filter((e)=>e.date===key&&(e.event==='completed_session_count'||e.event==='session_done')).length;
    sessArr.push(completedCount);
  }
  const totalVisits=visitArr.reduce((a,b)=>a+b,0);const activeDays=visitArr.filter(v=>v>0).length;
  const completedSessions=Number(S.progress.completedSessions||0);
  const completedSessionDays=events.filter((event)=>event.event==='completed_session_count').map((event)=>event.date).filter(Boolean);
  const completedDays=new Set(completedSessionDays).size;
  const spd=completedSessions>0?(completedSessions/analyticsRangeDays).toFixed(1):0;
  const avgSession=completedSessions>0?Math.round(S.progress.hours*60/Math.max(1,completedSessions))+'m':'—';
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  set('a-visits',totalVisits);set('a-visits-d','total page loads');
  set('a-users',completedDays);set('a-users-d','days with completed sessions');
  set('a-spd',spd);set('a-spd-d','completed sessions/day avg');
  set('a-dur',avgSession);set('a-dur-d','avg per session');
  set('live-count','1');
  const lu=document.getElementById('live-updated');if(lu)lu.textContent='Updated: '+new Date().toLocaleTimeString();
  const featureCounts={};events.forEach(e=>{featureCounts[e.event]=(featureCounts[e.event]||0)+1;});
  const hourly=new Array(24).fill(0);events.forEach(e=>hourly[e.hour]=(hourly[e.hour]||0)+1);
  drawLineChart('chart-visits',labels,visitArr,'Visits','#0052FF');
  drawLineChart('chart-users',labels,sessArr,'Completed Sessions','#10B981');
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
