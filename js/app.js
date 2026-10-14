
import { PROGRAM_CACHE } from "./config.js";
import { createInitialState } from "./state.js";
import { conv, tidy, today, uid, num, fmtDate, e1rm, round1, sortSessions, sortBody, esc } from "./workouts.js";
import { icon } from "./render.js";
import { scheduleIndexFor } from "./schedules.js";
import { createLocalStorage } from "./storage.js";
import { recommendProgression } from "./progression.js";
import { calculateRecords } from "./records.js";
import { analyticsRange,analyticsSummary } from "./analytics.js";
import { exerciseKey,hardSetCount,normalizeExerciseSetting,convertIncrement } from "./exercise-settings.js";
import { createTimers } from "./timers.js";

(() => {
"use strict";
const S = createInitialState();
const timerTools=createTimers();
let timerTicker=null;
const exUnit = (e, session) => e.unit || (session && session.unit) || DEFAULT_UNIT;
let PROGRAM = [], BASE_DAY = {}, ORDER = [], DEFAULT_UNIT = "lb", PROGRAM_NOTES = [];
let programSource = "JSON file";
const TYPES = [["pull","Pull"],["push","Push"],["legs","Legs"],["other","Other"]];


function parseProgram(j){
  if (!j || !Array.isArray(j.workouts) || !j.workouts.length || !Array.isArray(j.rotation)) throw new Error("Missing workouts or rotation");
  const ids = new Set();
  const workouts = j.workouts.map(w => {
    if (!w || typeof w.id !== "string" || !/^[a-zA-Z0-9_-]+$/.test(w.id) || ids.has(w.id) || typeof w.name !== "string" || !w.name.trim() || !["pull","push","legs","other"].includes(w.type) || !Array.isArray(w.exercises) || !w.exercises.length) throw new Error("Invalid workout");
    ids.add(w.id);
    return {id:w.id, name:w.name, type:w.type, unit:j.defaultUnit === "kg" ? "kg" : "lb", ex:w.exercises.map(e => {
      if (!e || typeof e.name !== "string" || !e.name.trim() || !Number.isInteger(e.sets) || e.sets < 1 || e.sets > 30 || !Number.isInteger(e.repsMin) || !Number.isInteger(e.repsMax) || e.repsMin < 1 || e.repsMax < e.repsMin || e.repsMax > 100 || (e.alternatives != null && (!Array.isArray(e.alternatives) || e.alternatives.some(a => typeof a !== "string")))) throw new Error("Invalid exercise");
      return {n:e.name, s:e.sets, lo:e.repsMin, hi:e.repsMax, alt:e.alternatives || []};
    })};
  });
  if (!j.rotation.length || j.rotation.some(id => !ids.has(id)) || new Set(j.rotation).size !== j.rotation.length || j.rotation.length !== workouts.length) throw new Error("Invalid rotation");
  return {workouts, order:j.rotation.slice(), unit:j.defaultUnit === "kg" ? "kg" : "lb", notes:Array.isArray(j.notes) ? j.notes.filter(n => typeof n === "string") : []};
}
function applyProgram(j){
  const p = parseProgram(j);
  PROGRAM = p.order.map(id => p.workouts.find(w => w.id === id));
  BASE_DAY = Object.fromEntries(PROGRAM.map(d => [d.id,d])); ORDER = p.order;
  DEFAULT_UNIT = p.unit; PROGRAM_NOTES = p.notes;
}
async function loadProgram(){
  try {
    const response = await fetch(new URL("./ppl-default-workouts.json", document.baseURI), {cache:"no-store"});
    if (!response.ok) throw new Error("Program file unavailable");
    const j = await response.json(); applyProgram(j);
    try { localStorage.setItem(PROGRAM_CACHE, JSON.stringify(j)); } catch {}
    programSource = "JSON file"; return true;
  } catch {
    try { const cached = JSON.parse(localStorage.getItem(PROGRAM_CACHE) || "null"); applyProgram(cached); programSource = "Saved program · file unavailable"; return true; } catch {}
    return false;
  }
}
function allDays(){ return [...PROGRAM, ...S.custom]; }
function getDay(id){ return BASE_DAY[id] || S.custom.find(c => c.id === id) || null; }
/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
let toastTimer;
function toast(msg){ const t=$("#toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove("show"),2200); }
/* ---------- browser storage ---------- */
const preferences = () => ({progressionEnabled:S.progressionEnabled!==false,bodyUnit:S.bodyUnit || "kg",selectedWorkoutId:S.dayId || null,progressExercise:S.progressEx || null,activeScheduleId:S.activeScheduleId || null,exerciseDefaults:S.exerciseDefaults||{}});
const {initialize, readLocal, writeLocal, loadDrafts, getMode, hasConflict} = createLocalStorage({state:S, preferences, toast});
let draftTimer,saveStatus="saved",saveVersion=0;
function setSaveStatus(status){
 saveStatus=status;
 const el=document.querySelector("[data-save-status]");
 if(el){el.dataset.state=status;el.textContent=({pending:"Saving changes…",saved:"Draft saved on this device",error:"Not saved — storage failed",conflict:"Not saved — another tab changed data"})[status];}
 const recovery=document.querySelector("[data-save-recovery]");
 if(recovery)recovery.hidden=status!=="error"&&status!=="conflict";
}
async function flushDrafts(){
 if(!S.ready||hasConflict()){if(hasConflict())setSaveStatus("conflict");return false;}
 clearTimeout(draftTimer);
 const version=saveVersion;
 const ok=await writeLocal();
 if(!ok){setSaveStatus(hasConflict()?"conflict":"error");toast(hasConflict()?"Another tab changed your data. Export a backup and reload.":"Browser storage unavailable. Export a backup.");return false;}
 if(version===saveVersion)setSaveStatus("saved");
 return true;
}
function saveDrafts(){
 saveVersion++;
 setSaveStatus(hasConflict()?"conflict":"pending");
 clearTimeout(draftTimer);
 if(!hasConflict())draftTimer=setTimeout(flushDrafts,250);
}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")void flushDrafts();});
window.addEventListener("pagehide",()=>{void flushDrafts();});
function setStatus(t){ $("#status").textContent = t; }
async function initStore(){
  S.mode = "local";
  const l = await initialize(); loadDrafts(l); S.sessions = sortSessions(l.sessions); S.body = sortBody(l.body); S.custom = l.custom.filter(c => !BASE_DAY[c.id]); S.ready = true;
  S.schedules=l.schedules;S.activeScheduleId=l.preferences.activeScheduleId;ensureSchedules();S.bodyUnit=l.preferences.bodyUnit=== "lb" ? "lb":"kg";S.progressEx=l.preferences.progressExercise || null;S.exerciseDefaults=l.preferences.exerciseDefaults||{};S.progressionEnabled=l.preferences.progressionEnabled!==false;setStatus(getMode()==="idb" ? "Saved to IndexedDB" : "Saved on this device"); S.dayId = getDay(l.preferences.selectedWorkoutId)?.id || nextDayId(); render();
}
async function persist(field, value){
  const previous = S[field]; S[field] = value;
  if (!await writeLocal()) { S[field] = previous; throw new Error("Browser storage unavailable"); }
}
async function putSession(s,advance=false){
  const previous={sessions:S.sessions,schedules:S.schedules,drafts:S.drafts,dayId:S.dayId};
  const active=activeSchedule();
  if(advance && active?.mode==="cycle" && nextSlot()===s.dayId)S.schedules=S.schedules.map(w=>w.id===active.id?{...w,cursor:(w.cursor+1)%w.days.length}:w);
  S.sessions=sortSessions([s,...S.sessions.filter(x=>x.id!==s.id)]);
  if(advance){
    const drafts={...S.drafts};delete drafts[s.dayId];S.drafts=drafts;
    S.dayId=nextDayId();
  }
  // One full-snapshot commit: session, schedule cursor, draft deletion and selection.
  if(!await writeLocal()){Object.assign(S,previous);throw new Error(hasConflict()?"Another tab changed your data":"Browser storage unavailable");}
}
async function removeSession(id){ await persist("sessions", S.sessions.filter(x => x.id !== id)); }
async function putBody(b){ await persist("body", sortBody([b, ...S.body.filter(x => x.id !== b.id)])); }
async function removeBody(id){ await persist("body", S.body.filter(x => x.id !== id)); }
async function putCustom(list){ await persist("custom", list); }
/* ---------- logic ---------- */
const WEEKDAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
function starterSchedule(sessions=S.sessions){
  const last=sortSessions(sessions).find(s=>ORDER.includes(s.dayId));
  return {id:"starter-ppl",name:"PPL starter",mode:"cycle",days:ORDER.slice(),cursor:last ? (ORDER.indexOf(last.dayId)+1)%ORDER.length : 0};
}
function activeSchedule(){return S.schedules.find(s=>s.id===S.activeScheduleId) || null;}
const scheduleIndex = (schedule=activeSchedule()) => scheduleIndexFor(schedule);
function nextSlot(){const s=activeSchedule();return s ? s.days[scheduleIndex(s)] : ORDER[0];}
function nextDayId(){
  const s=activeSchedule();
  if(s){for(let offset=0;offset<s.days.length;offset++){const id=s.days[(scheduleIndex(s)+offset)%s.days.length];if(id && getDay(id))return id;}}
  return ORDER.find(id=>getDay(id)) || S.custom[0]?.id;
}
function nextScheduleLabel(){return nextSlot()==null ? "Rest day" : getDay(nextSlot())?.name || "Choose workout";}
function validateSchedules(list,custom=S.custom){
  if(!Array.isArray(list) || !list.length || new Set(list.map(s=>s.id)).size!==list.length)throw new Error("Schedules must have unique IDs and include at least one schedule.");
  const ids=new Set([...PROGRAM,...custom].map(w=>w.id));
  for(const s of list){
    if(!s || typeof s.id!=="string" || !/^(?!(?:__proto__|constructor|prototype)$)[A-Za-z0-9_\-.~:@+]{1,190}$/.test(s.id) || typeof s.name!=="string" || !s.name.trim() || s.name.length>80 || !["cycle","weekly"].includes(s.mode) || !Array.isArray(s.days) || !s.days.length || s.days.length>28 || !s.days.some(id=>id!=null) || s.days.some(id=>id!==null && !ids.has(id)) || !Number.isInteger(s.cursor) || s.cursor<0 || s.cursor>=s.days.length || (s.mode==="weekly" && (s.days.length!==7 || s.cursor!==0)))throw new Error("Use valid workouts, at least one training day, and exactly seven days for a weekly schedule.");
  }
}
function ensureSchedules(){
  try{validateSchedules(S.schedules);}catch{S.schedules=[starterSchedule()];}
  if(!S.schedules.some(s=>s.id===S.activeScheduleId))S.activeScheduleId=S.schedules[0].id;
}
function scheduleDays(){
  const ids=[...new Set((activeSchedule()?.days || []).filter(Boolean))];
  return [...ids.map(getDay).filter(Boolean),...allDays().filter(w=>!ids.includes(w.id))];
}
async function saveScheduleList(list,activeId=S.activeScheduleId){
  validateSchedules(list);
  const previous={schedules:S.schedules,activeScheduleId:S.activeScheduleId,dayId:S.dayId};
  S.schedules=list;S.activeScheduleId=activeId;S.dayId=nextDayId();
  if(!await writeLocal()){Object.assign(S,previous);throw new Error("Browser storage is full or unavailable");}
}
async function useSchedule(id){
  if(!S.schedules.some(s=>s.id===id))return;
  await saveScheduleList(S.schedules,id);S.scheduleEditing=null;S.editing=null;render();
}
async function skipScheduleDay(){
  const s=activeSchedule();if(!s || s.mode!=="cycle")return;
  await saveScheduleList(S.schedules.map(w=>w.id===s.id ? {...w,cursor:(w.cursor+1)%w.days.length} : w));
  render();toast("Schedule advanced");
}
function schedulePanel(){
  const s=activeSchedule();if(!s)return "";
  return `<section class="schedule-panel"><div class="schedule-toolbar"><label>Active schedule<select data-act="useschedule" aria-label="Active schedule">${S.schedules.map(w=>`<option value="${esc(w.id)}" ${w.id===s.id?"selected":""}>${esc(w.name)}</option>`).join("")}</select></label><button class="btn" data-act="manageschedules">Manage schedules</button></div>
  <p class="muted">${s.mode==="weekly" ? "Monday–Sunday plan · today is "+WEEKDAYS[scheduleIndex(s)] : "Repeating sequence · completed scheduled workouts advance the next day"}. You can always log another workout.</p>
  <div class="schedule-preview">${s.days.map((id,i)=>`<span class="schedule-step ${i===scheduleIndex(s)?"current":""}" ${i===scheduleIndex(s)?'aria-current="step"':""}><small>${s.mode==="weekly"?WEEKDAYS[i].slice(0,3):"Step "+(i+1)}</small>${esc(id ? getDay(id)?.name || "Missing workout" : "Rest")}</span>`).join("")}</div>
  ${nextSlot()==null ? `<div class="rest-banner"><b>${s.mode==="weekly"?"Today is a rest day.":"Rest is next in your sequence."}</b><span>You can still log a workout below.</span>${s.mode==="cycle"?'<button class="btn small" data-act="skipscheduled">Mark rest complete</button>':""}</div>` : s.mode==="cycle" ? '<button class="btn small" data-act="skipscheduled">Skip scheduled day</button>' : ""}</section>`;
}
function newSchedule(mode){
  S.scheduleEditing={id:uid("schedule"),name:"",mode,days:mode==="weekly"?Array(7).fill(null):[allDays()[0].id],cursor:0};S.manageSchedules=false;render();
}
function viewScheduleManager(){
  return `<div class="section stack"><h2>Your schedules</h2><p class="muted">Choose any split: PPL, upper/lower, full body, or your own mix. Create custom workouts with + Custom in Train, then select them in a schedule.</p><div class="row-actions"><button class="btn primary" data-act="newschedule" data-mode="cycle">+ Repeating sequence</button><button class="btn" data-act="newschedule" data-mode="weekly">+ Weekly plan</button></div>${S.schedules.map(s=>`<div class="schedule-list-row"><div><h3>${esc(s.name)}</h3><p class="muted">${s.mode==="weekly"?"Monday–Sunday":"Repeating sequence"} · ${s.days.length} days ${s.id===S.activeScheduleId?"· Active":""}</p></div><div class="row-actions"><button class="btn small" data-act="editschedule" data-id="${esc(s.id)}">Edit / reorder</button>${s.id!==S.activeScheduleId?`<button class="btn small" data-act="activateschedule" data-id="${esc(s.id)}">Use schedule</button>`:""}${S.schedules.length>1?`<button class="btn small danger" data-act="deleteschedule" data-id="${esc(s.id)}">${S.armedDelete===s.id?"Tap again to delete":"Delete"}</button>`:""}</div></div>`).join("")}<button class="btn" data-act="closeschedules">Back to training</button></div>`;
}
function viewScheduleEditor(){
  const s=S.scheduleEditing;
  const options=id=>`<option value="" ${id==null?"selected":""}>Rest day</option>`+allDays().map(w=>`<option value="${esc(w.id)}" ${w.id===id?"selected":""}>${esc(w.name)}</option>`).join("");
  return `<div class="section stack"><h2>${S.schedules.some(w=>w.id===s.id)?"Edit schedule":"New schedule"}</h2><p class="muted">${s.mode==="weekly"?"Assign any workout or rest to each weekday.":"Reorder days, repeat workouts, or insert rest days. This sequence repeats independently of calendar weekdays."}</p><label>Schedule name<input type="text" maxlength="80" style="width:100%;margin-top:6px" data-schedule-name data-key="schedule-name" value="${esc(s.name)}" placeholder="e.g. Upper / Lower, Full body, My PPL"></label>
  ${s.days.map((id,i)=>`<div class="schedule-edit-row"><label>${s.mode==="weekly"?WEEKDAYS[i]:"Step "+(i+1)}<select data-schedule-day="${i}" aria-label="${s.mode==="weekly"?WEEKDAYS[i]:"Step "+(i+1)} workout">${options(id)}</select></label><div class="row-actions"><button class="btn small" data-act="movescheduleday" data-i="${i}" data-dir="-1" aria-label="Move day ${i+1} up" ${i===0?"disabled":""}>↑</button><button class="btn small" data-act="movescheduleday" data-i="${i}" data-dir="1" aria-label="Move day ${i+1} down" ${i===s.days.length-1?"disabled":""}>↓</button>${s.mode==="cycle"?`<button class="btn small danger" data-act="removescheduleday" data-i="${i}" ${s.days.length===1?"disabled":""}>Remove</button>`:""}</div></div>`).join("")}
  ${s.mode==="cycle"?`<button class="btn" data-act="addscheduleday" ${s.days.length>=28?"disabled":""}>+ Add day</button><label>Next step after saving<select data-schedule-cursor style="display:block;width:100%">${s.days.map((id,i)=>`<option value="${i}" ${i===s.cursor?"selected":""}>Step ${i+1} · ${esc(id?getDay(id)?.name:"Rest")}</option>`).join("")}</select></label>`:""}<p class="muted">Include at least one workout. Saving makes this your active schedule.</p><div class="row-actions"><button class="btn primary" data-act="saveschedule">Save & use schedule</button><button class="btn" data-act="cancelschedule">Cancel</button></div></div>`;
}
async function scheduleAction(b){
  const act=b.dataset.act,s=S.scheduleEditing;
  try{
    if(act==="manageschedules"){S.manageSchedules=true;S.editing=null;S.armedDelete=null;render();}
    else if(act==="closeschedules"){S.manageSchedules=false;render();}
    else if(act==="newschedule")newSchedule(b.dataset.mode);
    else if(act==="editschedule"){S.scheduleEditing=JSON.parse(JSON.stringify(S.schedules.find(w=>w.id===b.dataset.id)));S.manageSchedules=false;render();}
    else if(act==="cancelschedule"){S.scheduleEditing=null;S.manageSchedules=true;render();}
    else if(act==="activateschedule"){await useSchedule(b.dataset.id);toast("Schedule activated");}
    else if(act==="skipscheduled")await skipScheduleDay();
    else if(act==="movescheduleday"){const i=+b.dataset.i,j=i+(+b.dataset.dir);if(s && j>=0 && j<s.days.length){[s.days[i],s.days[j]]=[s.days[j],s.days[i]];render();}}
    else if(act==="addscheduleday" && s && s.days.length<28){s.days.push(null);render();}
    else if(act==="removescheduleday" && s && s.days.length>1){s.days.splice(+b.dataset.i,1);s.cursor=Math.min(s.cursor,s.days.length-1);render();}
    else if(act==="saveschedule" && s){const clean={...s,name:s.name.trim(),cursor:s.mode==="weekly"?0:s.cursor};await saveScheduleList(S.schedules.some(w=>w.id===s.id)?S.schedules.map(w=>w.id===s.id?clean:w):[...S.schedules,clean],s.id);S.scheduleEditing=null;S.manageSchedules=false;render();toast("Schedule saved");}
    else if(act==="deleteschedule" && S.schedules.length>1){if(S.armedDelete!==b.dataset.id){S.armedDelete=b.dataset.id;render();return;}const list=S.schedules.filter(w=>w.id!==b.dataset.id);await saveScheduleList(list,S.activeScheduleId===b.dataset.id?list[0].id:S.activeScheduleId);S.armedDelete=null;render();toast("Schedule deleted");}
  }catch(err){toast(err.message);}
}

function getDraft(dayId){
  let d = S.drafts[dayId];
  const day = getDay(dayId);
  const sig = day.ex.map(e => e.n).join("|");
  if (!d || !Array.isArray(d.ex)) {
    d = { sig, date: today(), notes:"", extra:[], ex: day.ex.map(e => ({ name:e.n, sets: Array.from({length:e.s}, () => ({w:"",r:""})) })) };
    S.drafts[dayId] = d;
  }
  if (!Array.isArray(d.extra)) d.extra = [];
  if(d.sig!==sig || d.ex.length!==day.ex.length)d.recoveryWarning=true;
  if(!Number.isFinite(d.startedAt))d.startedAt=Date.now();
  if(!Number.isInteger(d.restSeconds)||d.restSeconds<15||d.restSeconds>600)d.restSeconds=90;
  d.ex.forEach(e => { if (!e.unit) e.unit = unitFor(e.name, day); if(e.restSeconds==null)e.restSeconds=S.exerciseDefaults[exerciseKey(e.name,e.exerciseId)]?.restSeconds; });
  d.extra.forEach(e => { if (!e.unit) e.unit = day.unit || DEFAULT_UNIT; if(e.restSeconds==null)e.restSeconds=S.exerciseDefaults[exerciseKey(e.name,e.exerciseId)]?.restSeconds; });
  return d;
}
function lastFor(name){
  for (const s of S.sessions) { const e = (s.exercises||[]).find(x => x.name === name); if (e && e.sets && e.sets.length) return { date:s.date, sets:e.sets, unit: exUnit(e, s) }; }
  return null;
}
function unitFor(name, day){ const l = name ? lastFor(name) : null; return l ? l.unit : ((day && day.unit) || DEFAULT_UNIT); }
function unitSeg(g, i, u){ return `<span class="seg" role="group" aria-label="Weight unit">${["kg","lb"].map(x => `<button type="button" data-act="unit" data-g="${g}" data-i="${i}" data-u="${x}" aria-pressed="${u===x}">${x}</button>`).join("")}</span>`; }
function draftHasData(d){ return [...d.ex, ...(d.extra||[])].some(e => e.sets.some(s => String(s.w).trim() !== "" || String(s.r).trim() !== "")) || (d.notes||"").trim() !== ""; }

/* ---------- render ---------- */
function render(){
  document.querySelectorAll("nav.tabs button").forEach(b => b.setAttribute("aria-current", b.dataset.tab === S.tab ? "page" : "false"));
  const active = document.activeElement, key = active && active.dataset ? active.dataset.key : null;
  const selStart = key && "selectionStart" in active ? active.selectionStart : null;
  const app = $("#app");
  if (!S.ready) { app.innerHTML = `<div class="empty">Loading your log…</div>`; return; }
  const intro = {log:["YOUR TRAINING SPACE", "Make every rep count.", "A little stronger, one session at a time."], history:["YOUR TRAINING JOURNAL", "The work adds up.", "Every session, every set, all in one place."], progress:["YOUR PROGRESS", "See your strength grow.", "Follow your lifts and body measurements over time."], data:["YOUR DATA", "Keep your progress safe.", "Back up your log or bring it to another device."]}[S.tab];
  const weekStart = new Date(today()+"T00:00:00"); weekStart.setDate(weekStart.getDate() - (weekStart.getDay()+6)%7);
  const weekCount = S.sessions.filter(s => new Date(s.date+"T12:00:00") >= weekStart && s.date <= today()).length;
  app.innerHTML = `<div class="page-intro"><div><p class="eyebrow">${intro[0]}</p><h1>${intro[1]}</h1><p class="muted">${intro[2]}</p></div><span class="date-pill">${esc(new Date().toLocaleDateString(undefined,{month:"short",day:"numeric"}))}</span></div>
    <div class="overview"><div><span class="stat-icon">${icon("activity")}</span><p><b>${S.sessions.length}</b><span>Total sessions</span></p></div><div><span class="stat-icon lime">${icon("calendar")}</span><p><b>${weekCount}</b><span>This week</span></p></div><div><span class="stat-icon peach">${icon("arrow")}</span><p><b>${esc(nextScheduleLabel())}</b><span>${activeSchedule()?.mode==="weekly"?"Scheduled today":"Next in schedule"}</span></p></div></div>` + (S.tab === "log" ? viewLog() : S.tab === "history" ? viewHistory() : S.tab === "progress" ? viewProgress() : viewData());
  updateSessionMeter();
  applyExerciseFilter();
  if (key) { const el = app.querySelector(`[data-key="${CSS.escape(key)}"]`); if (el) { el.focus({preventScroll:true}); try { if (selStart != null) el.setSelectionRange(selStart, selStart); } catch {} } }
}

function timerLabel(seconds){const n=Math.max(0,seconds);return String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");}
function timerPanel(d){
 const rest=d.restTimer,seconds=timerTools.remaining(rest),elapsed=timerTools.elapsed(d.startedAt);
 return `<div class="timer-panel" aria-label="Workout timers"><div><span>Workout time</span><strong data-timer="workout">${timerLabel(elapsed)}</strong></div><div><span>Rest time</span><strong data-timer="rest">${rest?timerLabel(seconds):"—"}</strong></div><label>Rest <select data-act="restpreset" aria-label="Rest duration">${[30,60,90,120,180,240,300].map(n=>`<option value="${n}" ${d.restSeconds===n?"selected":""}>${n}s</option>`).join("")}</select></label><div class="timer-actions"><button class="btn small" data-act="timerpause" ${!rest||rest.pausedRemainingMs!=null?"disabled":""}>Pause</button><button class="btn small" data-act="timerresume" ${!rest||rest.pausedRemainingMs==null?"disabled":""}>Resume</button><button class="btn small" data-act="timerskip" ${!rest?"disabled":""}>Skip</button><button class="btn small" data-act="timerreset">Reset</button></div></div>`;
}
function updateTimers(){
 if(!S.ready||S.tab!=="log"||S.editing||S.scheduleEditing||S.manageSchedules)return;
 const d=getDraft(S.dayId),rest=d.restTimer;
 const elapsed=document.querySelector('[data-timer="workout"]'),remaining=document.querySelector('[data-timer="rest"]');
 if(elapsed)elapsed.textContent=timerLabel(timerTools.elapsed(d.startedAt));
 if(remaining)remaining.textContent=rest?timerLabel(timerTools.remaining(rest)):"—";
}
if(typeof setInterval === 'function')timerTicker=setInterval(updateTimers,1000);
document.addEventListener("visibilitychange",updateTimers);
function setRows(i, prefix, name, sets, last, lo, hi, unit){
  return sets.map((s, j) => {
    const ph = last && last.sets[j] ? { w: tidy(conv(last.sets[j].w ?? 0, last.unit, unit), unit), r: last.sets[j].r } : null;
    return `<div class="setrow"><span>Set ${j+1}</span>
      <input type="number" inputmode="decimal" step="any" min="0" aria-label="${esc(name)} set ${j+1} weight in ${unit === "kg" ? "kilograms" : "pounds"}" data-f="w" data-g="${prefix}" data-i="${i}" data-j="${j}" data-key="${prefix}w-${i}-${j}" value="${esc(s.w)}" placeholder="${ph ? esc(ph.w) : unit}">
      <input type="number" inputmode="numeric" step="1" min="0" aria-label="${esc(name)} set ${j+1} reps" data-f="r" data-g="${prefix}" data-i="${i}" data-j="${j}" data-key="${prefix}r-${i}-${j}" value="${esc(s.r)}" placeholder="${ph ? esc(ph.r ?? "") : (lo ? lo+"–"+hi : "reps")}">
      <select aria-label="${esc(name)} set ${j+1} type" data-act="settype" data-g="${prefix}" data-i="${i}" data-j="${j}">${["working","warmup","drop"].map(t=>`<option value="${t}" ${(s.type||"working")===t?"selected":""}>${t}</option>`).join("")}</select>
      <input type="number" min="0" max="10" step="1" inputmode="numeric" aria-label="${esc(name)} set ${j+1} RIR" data-f="rir" data-g="${prefix}" data-i="${i}" data-j="${j}" value="${s.rir??""}" placeholder="RIR">
      <button type="button" class="set-complete" data-act="completeset" data-g="${prefix}" data-i="${i}" data-j="${j}" aria-label="${esc(name)} set ${j+1} ${s.completed===true ? "mark incomplete" : "mark complete"}" aria-pressed="${s.completed===true}">${s.completed===true ? "✓ Done" : "○ Done"}</button>
    </div>`; }).join("");
}
function lastBlock(name, e, unit){
  const last = lastFor(name);
  if (!last || !name) return { last:null, html:`<p class="last">No history yet for this exercise. Start light and focus on form.</p>` };
  let html = `<p class="last">Last time (${esc(fmtDate(last.date))}): ${last.sets.map(s => `${esc(s.w ?? 0)}&thinsp;${last.unit} × ${esc(s.r)}`).join(", ")}${last.unit !== unit ? ` <span>(grey targets converted to ${unit})</span>` : ""}</p>`;
  if (e) {
    const allTop = last.sets.length >= e.s && last.sets.every(s => (num(s.r)||0) >= e.hi);
    html += allTop ? `<p class="hint">Every set hit ${e.hi} reps. Add ${unit === "kg" ? "2.5 kg" : "5 lb"} today, or the smallest jump available.</p>` : `<p class="hint">Aim to beat it by one rep on any set.</p>`;
  }
  return { last, html };
}

function exerciseDefaultControls(e,i,group,d){
 const key=exerciseKey(e.name,e.exerciseId),saved=S.exerciseDefaults?.[key]||{};
 const inc=e.loadIncrement??saved.loadIncrement??"",unit=e.incrementUnit||saved.incrementUnit||e.unit||"kg";
 const converted=inc!==""?convertIncrement(Number(inc),unit,e.unit||unit):null;
 const unitLabel=converted==null?"":`≈ ${converted} ${esc(e.unit||unit)}`;
 return `<div class="exercise-default-controls"><label>Rest (sec) <input type="number" min="15" max="600" step="5" data-f="exrest" data-g="${group}" data-i="${i}" value="${e.restSeconds??saved.restSeconds??d.restSeconds}"></label><label>Load increment <input type="number" min="0.1" max="100" step="0.1" data-f="increment" data-g="${group}" data-i="${i}" aria-label="${esc(e.name)} load increment" value="${esc(inc)}"></label><label>Increment unit <select data-act="incrementunit" data-g="${group}" data-i="${i}" aria-label="${esc(e.name)} increment unit"><option value="kg" ${unit==="kg"?"selected":""}>kg</option><option value="lb" ${unit==="lb"?"selected":""}>lb</option></select></label><span class="muted" aria-label="Converted load increment">${unitLabel}</span><button type="button" class="btn small" data-act="savedefault" data-g="${group}" data-i="${i}">Save default</button><button type="button" class="btn small" data-act="resetdefault" data-g="${group}" data-i="${i}">Reset default</button></div>`;
}
function progressionHint(e,definition){
 const settings=S.exerciseDefaults?.[exerciseKey(e.name,e.exerciseId)]||{};
 const result=recommendProgression({sessions:S.sessions,exerciseName:e.name,exerciseId:e.exerciseId,minimum:definition?.lo||6,maximum:definition?.hi||12,unit:e.unit||"lb",increment:settings.loadIncrement||2.5,incrementUnit:settings.incrementUnit||e.unit||"lb",enabled:S.progressionEnabled!==false});
 return `<p class="progression-hint" role="status"><strong>Next workout:</strong> ${esc(result.weight==null?"No load suggestion":result.weight+" "+result.unit)} — ${esc(result.reason)}</p>`;
}
let exerciseQuery="";
function exerciseNameSuggestions(){
 const names=[...new Set(allDays().flatMap(day=>(day.ex||[]).flatMap(e=>[e.n,...(e.alt||[])]).filter(Boolean)))].sort((a,b)=>a.localeCompare(b));
 return `<datalist id="exercise-name-suggestions">${names.map(n=>`<option value="${esc(n)}"></option>`).join("")}</datalist>`;
}
function exerciseSearchBox(){
 return `<div class="section"><label for="exercise-search">Search exercises</label>
 <input id="exercise-search" type="search" data-exercise-search aria-describedby="exercise-search-count" placeholder="Filter exercises by name" value="${esc(exerciseQuery)}" autocomplete="off">
 <button class="btn small" type="button" data-act="clearexercisesearch">Clear search</button>
 <p id="exercise-search-count" class="muted" data-exercise-search-count role="status"></p>
 <p class="muted" data-exercise-search-empty hidden>No matching exercises. Clear search to show all.</p></div>`;
}
function applyExerciseFilter(){
 const input=document.querySelector('[data-exercise-search]');
 if(!input)return;
 const needle=input.value.trim().toLocaleLowerCase();
 const items=[...document.querySelectorAll('[data-exercise-search-item]')];
 let shown=0;
 for(const item of items){
  const match=(item.dataset.exerciseSearchItem||"").toLocaleLowerCase().includes(needle);
  item.hidden=!match;
  if(match)shown++;
 }
 const count=document.querySelector('[data-exercise-search-count]');
 if(count)count.textContent=shown+' of '+items.length+' exercises shown';
 const empty=document.querySelector('[data-exercise-search-empty]');
 if(empty)empty.hidden=shown!==0;
}
function viewLog(){
  if(S.scheduleEditing)return viewScheduleEditor();
  if(S.manageSchedules)return viewScheduleManager();
  if (S.editing) return viewEditor();
  const next = nextSlot();
  const day = getDay(S.dayId) || getDay(nextDayId());
  S.dayId = day.id;
  const d = getDraft(day.id);
  const isCustom = !BASE_DAY[day.id];
  const plates = scheduleDays().map(p => `
    <button class="plate ${esc(p.type)}" data-act="day" data-id="${esc(p.id)}" aria-pressed="${p.id===day.id}">
      <span class="plate-top"><span class="type-dot"></span>${esc(p.type)}</span><span class="pn">${esc(p.name)}</span><span class="pt">${p.id===next ? "Next up" : (S.drafts[p.id] && draftHasData(S.drafts[p.id]) ? "In progress" : (BASE_DAY[p.id] ? `${p.ex.length} exercises` : "Custom"))}</span>
    </button>`).join("") + `<button class="plate new" data-act="newworkout"><span class="plate-top">Build your own</span><span class="pn">+ Custom</span><span class="pt">New workout</span></button>`;
  const cards = day.ex.map((e, i) => {
    const de = d.ex[i];
    const opts = [e.n, ...(e.alt||[])].map(o => `<option ${o===de.name?"selected":""}>${esc(o)}</option>`).join("");
    const lb = lastBlock(de.name, e, de.unit);
    const head = (e.alt && e.alt.length) ? `<select aria-label="Exercise or alternative" data-act="variant" data-i="${i}">${opts}</select>` : `<span class="ex-name" style="padding-top:6px">${esc(de.name)}</span>`;
    return `<section class="ex ${esc(day.type)}" data-exercise-search-item="${esc([e.n,...(e.alt||[]),de.name].join(" "))}">
      <div class="ex-head"><span class="ex-number">${String(i+1).padStart(2,"0")}</span>${head}</div><div class="exercise-meta"><span class="target">${e.s} sets · ${e.lo}–${e.hi} reps</span><span class="muted">${e.alt?.length ? "Alternatives available ↗" : ""}</span></div>
      ${lb.html}
      <div class="colhead"><span></span><span class="wcell">Weight ${unitSeg("", i, de.unit)}</span><span>Reps</span></div>
       ${exerciseDefaultControls(de,i,"",d)}
      ${progressionHint(de,e)}<div class="sets">${setRows(i, "", de.name, de.sets, lb.last, e.lo, e.hi, de.unit)}</div>
      <div class="row-actions"><button class="btn small" data-act="copyforward" data-i="${i}">Copy last sets</button><button class="btn small" data-act="addset" data-i="${i}">Add set</button>${de.sets.length>1?`<button class="btn small" data-act="rmset" data-i="${i}">Remove last set</button>`:""}</div>
    </section>`;
  }).join("");
  const extras = d.extra.map((x, i) => {
    const lb = lastBlock(x.name.trim(), null, x.unit);
    return `<section class="ex other" data-exercise-search-item="${esc(x.name)}">
      <div class="ex-head"><input type="text" class="ex-name" list="exercise-name-suggestions" aria-label="Extra exercise name" placeholder="Exercise name" data-f="xname" data-i="${i}" data-key="xname-${i}" value="${esc(x.name)}"><button class="btn small danger" data-act="rmextra" data-i="${i}">Remove</button></div>
      ${x.name.trim() ? lb.html : ""}
      <div class="colhead"><span></span><span class="wcell">Weight ${unitSeg("x", i, x.unit)}</span><span>Reps</span></div>
       ${exerciseDefaultControls(x,i,"x",d)}
      ${progressionHint(x,null)}<div class="sets">${setRows(i, "x", x.name, x.sets, lb.last, null, null, x.unit)}</div>
      <div class="row-actions"><button class="btn small" data-act="copyforward" data-g="x" data-i="${i}">Copy last sets</button><button class="btn small" data-act="addset" data-g="x" data-i="${i}">Add set</button>${x.sets.length>1?`<button class="btn small" data-act="rmset" data-g="x" data-i="${i}">Remove last set</button>`:""}</div>
    </section>`;
  }).join("");
  return `
    ${schedulePanel()}<label class="progression-toggle"><input type="checkbox" data-act="progressiontoggle" ${S.progressionEnabled===false?"":"checked"}> Show progression recommendations</label><div class="program-label"><h2>Workout library</h2><span>Any workout, any split</span></div>
    <div class="plates" role="group" aria-label="Choose workout">${plates}</div>
    <div class="workout-layout"><div class="workout-main">
      <div class="dayline"><div><p class="eyebrow">${isCustom ? "CUSTOM WORKOUT" : "TODAY’S WORKOUT"}</p><h2>${esc(day.name)} <span class="workout-tag ${esc(day.type)}">${esc(day.type)}</span></h2>${isCustom ? `<button class="btn small" style="margin-top:8px" data-act="editday" data-id="${esc(day.id)}">Edit workout</button>` : ""}</div>
      <label>Session date<input type="date" data-f="date" data-key="date" value="${esc(d.date)}"></label></div>
      <p class="workout-help">Choose an alternative from each exercise menu. Faded targets show your previous set; switch lb/kg below.</p>
      ${Object.keys(S.drafts).some(k=>S.drafts[k]?.recoveryWarning)?`<p class="muted" role="status">Your saved draft may be from an earlier program. Export a backup before editing.</p>`:""}
      ${exerciseSearchBox()}${exerciseNameSuggestions()}${cards}${extras}
      <button class="btn add-exercise" data-act="addextra">+ Add an exercise</button>
      <div class="section notes-card"><label for="notes"><h3>Session notes</h3></label><p class="muted">How did you feel today?</p>
        <textarea id="notes" data-f="notes" data-key="notes" placeholder="Energy, sleep, a new personal best…">${esc(d.notes)}</textarea></div>
    </div><aside class="session-sidebar">
      <div class="session-card"><p class="eyebrow">SESSION OVERVIEW</p><h3>${esc(day.name)}</h3><p class="muted">${day.ex.length + d.extra.length} exercises · <span id="plannedSets">${[...d.ex,...d.extra].reduce((a,e)=>a+e.sets.length,0)}</span> sets</p>
        <div class="meter-track"><div id="setMeter"></div></div><p class="meter-caption"><span id="loggedSets">0</span> sets logged <span>Keep showing up.</span></p>
        ${timerPanel(d)}<button class="btn primary" data-act="save">Finish & save session ${icon("arrow")}</button><p class="autosave-note" role="status" aria-live="polite" data-save-status data-state="${saveStatus}">${({pending:"Saving changes…",saved:"Draft saved on this device",error:"Not saved — storage failed",conflict:"Not saved — another tab changed data"})[saveStatus]}</p><div data-save-recovery ${saveStatus==="error"||saveStatus==="conflict"?"":"hidden"}><p class="muted">Your unsaved draft is still available in this tab. Export a backup before reloading.</p><button class="btn small" data-act="recoverbackup">Export unsaved backup</button><button class="btn small" data-act="reloadconflict">Reload stored data</button></div>
      </div>
      <div class="guide-card"><span class="guide-icon">${icon("spark")}</span><h3>A stronger next session.</h3><ul>${PROGRAM_NOTES.slice(1).map(n=>`<li>${esc(n)}</li>`).join("")}</ul></div>
    </aside></div>`;

}

function viewEditor(){
  const w = S.editing, isNew = !S.custom.some(c => c.id === w.id);
  const colors = TYPES.map(([t,label]) => `<label><input type="radio" name="edtype" data-ed="type" value="${t}" ${w.type===t?"checked":""}><span class="swatch" style="background:var(--${t})"></span>${label}</label>`).join("");
  const rows = w.ex.map((e, i) => `<div class="edrow" data-exercise-search-item="${esc(e.n)}">
      <input type="text" aria-label="Exercise ${i+1} name" list="exercise-name-suggestions" placeholder="Exercise name" data-ef="n" data-i="${i}" data-key="ed-n-${i}" value="${esc(e.n)}">
      <input type="number" inputmode="numeric" min="1" max="10" aria-label="Sets" data-ef="s" data-i="${i}" data-key="ed-s-${i}" value="${esc(e.s)}">
      <input type="number" inputmode="numeric" min="1" max="50" aria-label="Minimum reps" data-ef="lo" data-i="${i}" data-key="ed-lo-${i}" value="${esc(e.lo)}">
      <input type="number" inputmode="numeric" min="1" max="50" aria-label="Maximum reps" data-ef="hi" data-i="${i}" data-key="ed-hi-${i}" value="${esc(e.hi)}">
      <button class="iconbtn" data-act="edrmex" data-i="${i}" aria-label="Remove exercise ${i+1}">×</button>
    </div>`).join("");
  return `<div class="section">
    <h3>${isNew ? "New workout" : "Edit workout"}</h3>
    <label class="muted" style="font-size:14px;display:block">Name
      <input type="text" style="width:100%;margin-top:3px" data-ed="name" data-key="ed-name" placeholder="e.g. Arms + abs, Upper body, Home workout" value="${esc(w.name)}"></label>
    <p class="muted" style="font-size:14px;margin:12px 0 0">Workout category</p>
    <div class="colors" role="radiogroup" aria-label="Workout category">${colors}</div>
    <p class="muted" style="font-size:14px;margin:12px 0 0">Default weight unit</p>
    <div class="colors" role="radiogroup" aria-label="Default weight unit">${["lb","kg"].map(u => `<label><input type="radio" name="edunit" data-ed="unit" value="${u}" ${(w.unit||DEFAULT_UNIT)===u?"checked":""}>${u}</label>`).join("")}</div>
    ${exerciseSearchBox()}${exerciseNameSuggestions()}<div class="edhead"><span>Exercise</span><span>Sets</span><span>Min reps</span><span>Max reps</span><span></span></div>
    ${rows}
    <div class="row-actions"><button class="btn small" data-act="edaddex">Add exercise</button></div>
    <p class="muted" style="font-size:13px">Add this workout to any repeating or weekly schedule using Manage schedules.</p>
    <div class="stack" style="margin-top:14px">
      <button class="btn primary" data-act="edsave">Save workout</button>
      <button class="btn" data-act="edcancel">Cancel</button>
      ${isNew ? "" : `<button class="btn danger" data-act="eddelete">${S.armedDelete===w.id ? "Tap again to delete this workout" : "Delete workout"}</button>`}
    </div></div>`;
}

function viewSavedSessionEdit(){
 const s=savedSessionEdit;
 if(!s)return '';
 return `<div class="section stack" aria-label="Edit saved session"><h2>Edit saved session</h2>
 <p class="muted">Changes are not saved until you confirm. Your schedule will not advance.</p>
 <label>Date <input aria-label="Saved session date" type="date" data-history-field="date" value="${esc(s.date)}"></label>
 <label>Notes <textarea aria-label="Saved session notes" data-history-field="notes">${esc(s.notes||"")}</textarea></label>
 ${s.exercises.map((ex,i)=>`<fieldset><legend>${esc(ex.name)} (${esc(ex.unit||s.unit||DEFAULT_UNIT)})</legend>
 ${(ex.sets||[]).map((set,j)=>`<div class="row-actions"><label>Weight <input aria-label="${esc(ex.name)} set ${j+1} weight" type="number" min="0" step="any" data-history-set="w" data-i="${i}" data-j="${j}" value="${esc(set.w??0)}"></label>
 <label>Reps <input aria-label="${esc(ex.name)} set ${j+1} reps" type="number" min="1" step="1" data-history-set="r" data-i="${i}" data-j="${j}" value="${esc(set.r??0)}"></label>
 <button class="btn small" data-act="historyrmset" data-i="${i}" data-j="${j}">Remove set ${j+1}</button></div>`).join("")}
 <button class="btn small" data-act="historyaddset" data-i="${i}">Add set to ${esc(ex.name)}</button></fieldset>`).join("")}
 <div class="row-actions"><button class="btn primary" data-act="historysave">Save changes</button><button class="btn" data-act="historycancel">Cancel</button></div></div>`;
}
function viewHistory(){
  if(savedSessionEdit)return viewSavedSessionEdit();
  if (!S.sessions.length) return `<div class="empty">No sessions yet. Log your first workout and it will show up here.</div>`;
  return `<div class="section">` + S.sessions.map(s => {
    const gd = getDay(s.dayId); const day = { name: s.dayName || (gd && gd.name) || "Workout", type: (gd && gd.type) || s.type || "other" };
    const sets = (s.exercises||[]).reduce((a,e)=>a+(e.sets||[]).length,0);
    const units = [...new Set((s.exercises||[]).map(e => exUnit(e, s)))];
    const vu = units.length === 1 ? units[0] : "lb";
    const vol = Math.round((s.exercises||[]).reduce((a,e)=>a+(e.sets||[]).reduce((b,x)=>b+(conv(x.w||0, exUnit(e,s), vu)||0)*(num(x.r)||0),0),0));
    const rows = (s.exercises||[]).map(e => `<tr><td>${esc(e.name)}</td><td>${(e.sets||[]).map(x=>`${esc(x.w ?? 0)}×${esc(x.r)}`).join(", ")} ${exUnit(e,s)}</td></tr>`).join("");
    const armed = S.armedDelete === s.id;
    return `<details class="hist"><summary><span class="chip ${esc(day.type)}">${esc(day.name)}</span><span>${esc(fmtDate(s.date))}</span><span class="meta">${sets} sets · ${hardSetCount([s])} hard sets<br>${vol.toLocaleString()} ${vu}</span></summary>
      <div class="body"><table><tbody>${rows}</tbody></table>
      ${s.notes ? `<p class="muted">${esc(s.notes)}</p>` : ""}
      <div class="row-actions"><button class="btn small" data-act="historyedit" data-id="${esc(s.id)}">Edit session</button><button class="btn small danger" data-act="delsession" data-id="${esc(s.id)}">${armed ? "Tap again to delete" : "Delete session"}</button></div></div></details>`;
  }).join("") + `</div>`;
}

// Bound chart DOM without changing the underlying exact analytics or PR totals.
function sampleChartPoints(points,maxPoints=240){
 if(points.length<=maxPoints)return points;
 const selected=new Set([0,points.length-1]);
 const buckets=Math.max(1,Math.floor((maxPoints-2)/2));
 for(let i=0;i<buckets;i++){
  const start=1+Math.floor((points.length-2)*i/buckets),end=1+Math.floor((points.length-2)*(i+1)/buckets);
  let low=start,high=start;
  for(let j=start+1;j<end;j++){if(points[j].y<points[low].y)low=j;if(points[j].y>points[high].y)high=j;}
  selected.add(low);selected.add(high);
 }
 return [...selected].sort((a,b)=>a-b).slice(0,maxPoints).map(i=>points[i]);
}
const analyticsCache={sessions:null,key:null,value:null};
function cachedAnalytics(sessions,filter){
 const key=JSON.stringify(filter);
 if(analyticsCache.sessions!==sessions||analyticsCache.key!==key){
  const filtered=analyticsRange(sessions,filter);
  analyticsCache.sessions=sessions;analyticsCache.key=key;
  analyticsCache.value={filtered,summary:analyticsSummary(filtered,{...filter,from:"",to:"",workout:"",exercise:filter.exercise,unit:filter.unit})};
 }
 return analyticsCache.value;
}
function chartSVG(points, color, unit){
  if (points.length < 2) return `<div class="empty" style="margin-top:10px">Log this at least twice to see a trend line.</div>`;
  const displayed=sampleChartPoints(points);
  const W=600,H=230,P={l:44,r:14,t:16,b:30};
  const xs=points.map(p=>p.x), ys=points.map(p=>p.y);
  const x0=Math.min(...xs), x1=Math.max(...xs); let y0=Math.min(...ys), y1=Math.max(...ys);
  const pad=(y1-y0)*0.12 || 2; y0-=pad; y1+=pad;
  const X=x=>P.l+((x-x0)/((x1-x0)||1))*(W-P.l-P.r), Y=y=>H-P.b-((y-y0)/((y1-y0)||1))*(H-P.t-P.b);
  const path=displayed.map((p,i)=>`${i?"L":"M"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
  const dots=displayed.map(p=>`<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="4" fill="${color}"><title>${new Date(p.x).toLocaleDateString()}: ${round1(p.y)} ${unit}</title></circle>`).join("");
  const grid=[0,0.5,1].map(t=>{const v=y0+(y1-y0)*t;const y=Y(v);return `<line x1="${P.l}" x2="${W-P.r}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${P.l-6}" y="${y+4}" text-anchor="end" font-size="12" fill="var(--muted)">${Math.round(v)}</text>`;}).join("");
  const d0=new Date(x0).toLocaleDateString(undefined,{day:"numeric",month:"short"}), d1=new Date(x1).toLocaleDateString(undefined,{day:"numeric",month:"short"});
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" tabindex="0" aria-label="Trend chart: ${esc(unit)} with ${points.length} points, from ${esc(d0)} to ${esc(d1)}">${grid}
    <path d="${path}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>${dots}
    <text x="${P.l}" y="${H-8}" font-size="12" fill="var(--muted)">${d0}</text><text x="${W-P.r}" y="${H-8}" font-size="12" text-anchor="end" fill="var(--muted)">${d1}</text></svg></div>`;
}

function viewProgress(){
  const filter=S.analyticsFilter||{from:"",to:"",workout:"",exercise:""};
  const {filtered,summary}=cachedAnalytics(S.sessions,{...filter,unit:S.bodyUnit||"kg"});
  const workoutOptions=[...new Map(S.sessions.map(s=>[s.dayId,s.dayName||s.dayId])).entries()];
  const analyticsControls=`<div class="analytics-controls" aria-label="Analytics filters"><label>From <input type="date" data-analytics="from" value="${esc(filter.from||"")}"></label><label>To <input type="date" data-analytics="to" value="${esc(filter.to||"")}"></label><label>Workout <select data-analytics="workout"><option value="">All workouts</option>${workoutOptions.map(([id,name])=>`<option value="${esc(id)}" ${id===filter.workout?"selected":""}>${esc(name)}</option>`).join("")}</select></label><label>Exercise <select data-analytics="exercise"><option value="">All exercises</option>${[...new Set(S.sessions.flatMap(x=>(x.exercises||[]).map(e=>e.name)))].sort().map(n=>`<option ${n===filter.exercise?"selected":""}>${esc(n)}</option>`).join("")}</select></label></div>`;
  const weekPts=summary.weekly.map(w=>({x:Date.parse(w.week+"T12:00:00Z"),y:w.volume}));
  const hardPts=summary.weekly.map(w=>({x:Date.parse(w.week+"T12:00:00Z"),y:w.hardSets}));
  const analyticsHTML=`<section class="section analytics-dashboard"><h3>Training analytics</h3>${analyticsControls}<div class="stats"><div class="stat"><b>${summary.sessions}</b><small>Sessions</small></div><div class="stat"><b>${summary.hardSets}</b><small>Hard sets</small></div><div class="stat"><b>${Math.round(summary.volume)}</b><small>${filter.exercise?"Exercise volume":"Volume"} (${summary.unit}·reps)</small></div></div><h4>Weekly volume</h4>${weekPts.length?chartSVG(weekPts,"var(--push)",summary.unit+"·reps"):'<p class="empty">No training sessions match these filters.</p>'}<h4>Weekly hard sets</h4>${hardPts.length?chartSVG(hardPts,"var(--pull)","hard sets"):'<p class="empty">No hard-set trend available.</p>'}${summary.weekly.length?`<details><summary>Weekly data table</summary><table><thead><tr><th>Week of</th><th>Volume (${summary.unit}·reps)</th><th>Hard sets</th></tr></thead><tbody>${summary.weekly.map(w=>`<tr><td>${esc(w.week)}</td><td>${w.volume}</td><td>${w.hardSets}</td></tr>`).join("")}</tbody></table></details>`:""}</section>`;

  const names = [...new Set(filtered.flatMap(s => (s.exercises||[]).map(e => e.name)).filter(n=>!filter.exercise||n===filter.exercise))].sort();
  let exHtml;
  if (!names.length) exHtml = `<div class="empty">Your strength trends appear here once you've logged a session.</div>`;
  else {
    if (!names.includes(S.progressEx)) S.progressEx = names[0];
    const records=calculateRecords(filtered,S.progressEx,S.bodyUnit||"kg");
    const recordHTML=`<div class="pr-summary" aria-label="Personal records"><h3>Personal records</h3><div class="pr-grid"><span>Heaviest <strong>${records.heaviest?records.heaviest.value+" "+records.unit:"—"}</strong></span><span>Most reps <strong>${records.mostReps?records.mostReps.value:"—"}</strong></span><span>Best estimated 1RM <strong>${records.estimated1RM?records.estimated1RM.value+" "+records.unit:"—"}</strong></span><span>Best exercise-session volume <strong>${records.sessionVolume?records.sessionVolume.value+" "+records.unit+"·reps":"—"}</strong></span></div><p class="muted">Calculated for the selected exercise in matching sessions. Warm-up sets are excluded; drop sets contribute to volume. Ties share the record; estimated 1RM is calculated, not measured.</p></div>`;
    const pts = [], dayType = (()=>{ for (const d of allDays()) if (d.ex.some(e=>e.n===S.progressEx||(e.alt||[]).includes(S.progressEx))) return d.type; return "other"; })();
    let best=0, heaviest=0;
    const pu = S.bodyUnit || DEFAULT_UNIT;
    sortSessions(filtered).reverse().forEach(s => { const e=(s.exercises||[]).find(x=>x.name===S.progressEx); if(!e) return;
      const eu = exUnit(e, s);
      let top=0; e.sets.forEach(x=>{const w=num(x.w),r=num(x.r);if(x.type==="warmup"||x.completed===false||w==null||w<0||r==null||!Number.isInteger(r)||r<=0)return;const converted=conv(w,eu,pu)||0;top=Math.max(top,e1rm(converted,r));heaviest=Math.max(heaviest,converted);});
      if (top>0){ pts.push({x:new Date(s.date+"T12:00:00").getTime(), y:top}); best=Math.max(best,top);} });
    const first = pts[0] ? pts[0].y : 0, last = pts.length ? pts[pts.length-1].y : 0;
    const change = first ? Math.round(((last-first)/first)*100) : 0;
    exHtml = `<select aria-label="Exercise" data-act="progressEx" style="width:100%">${names.map(n=>`<option ${n===S.progressEx?"selected":""}>${esc(n)}</option>`).join("")}</select>
      <div class="stats"><div class="stat"><b>${round1(best)}</b><small>Best est. 1RM (${pu})</small></div>
      <div class="stat"><b>${round1(heaviest)}</b><small>Heaviest set (${pu})</small></div>
      <div class="stat"><b>${change>0?"+":""}${change}%</b><small>Since first log</small></div></div>
      ${recordHTML}${chartSVG(pts, `var(--${dayType})`, pu + " est. 1RM")}
      <p class="muted" style="font-size:13px">Estimated 1RM uses the Epley formula on your best set each session, so heavier weights and extra reps both count as progress. Sessions logged in a different unit are converted.</p>`;
  }
  const bu = S.body.length ? (S.body[S.body.length-1].unit || DEFAULT_UNIT) : (S.bodyUnit || "kg");
  const visibleBody=S.body.filter(b=>(!filter.from||b.date>=filter.from)&&(!filter.to||b.date<=filter.to));
  const bpts = visibleBody.filter(b=>num(b.weight)).map(b=>({x:new Date(b.date+"T12:00:00").getTime(), y:conv(b.weight, b.unit||DEFAULT_UNIT, bu)}));
  const wpts = visibleBody.filter(b=>num(b.waist)).map(b=>({x:new Date(b.date+"T12:00:00").getTime(), y:num(b.waist)}));
  const recent = visibleBody.slice().reverse().slice(0,8).map(b => `<li><span>${esc(fmtDate(b.date))}</span><span>${b.weight?esc(b.weight)+" "+(b.unit||DEFAULT_UNIT):""}${b.weight&&b.waist?" · ":""}${b.waist?esc(b.waist)+" cm waist":""}</span>
    <button class="btn small danger" data-act="delbody" data-id="${esc(b.id)}">${S.armedDelete===b.id?"Tap again":"Delete"}</button></li>`).join("");
  return `${analyticsHTML}<div class="section"><h3>Lifts</h3>${exHtml}</div>
    <div class="section"><h3>Body</h3>
      <div class="form-row">
        <label>Date<input type="date" id="bDate" value="${today()}"></label>
        <label><span>Weight <select id="bUnit" aria-label="Body weight unit" style="min-height:28px;padding:2px 6px">${["kg","lb"].map(u=>`<option ${u===(S.bodyUnit||bu)?"selected":""}>${u}</option>`).join("")}</select></span><input type="number" inputmode="decimal" step="any" id="bWeight" placeholder="${(S.bodyUnit||bu)==="kg"?"87":"192"}"></label>
        <label>Waist (cm)<input type="number" inputmode="decimal" step="0.5" id="bWaist" placeholder="optional"></label>
      </div>
      <div class="row-actions"><button class="btn" data-act="addbody">Add entry</button></div>
      <p class="muted" style="font-size:13px">Weigh in a few mornings a week. The trend matters more than any single day.</p>
      ${bpts.length ? `<p style="margin:12px 0 0;font-weight:600">Body weight</p>${chartSVG(bpts,"var(--ink)",bu)}` : ""}
      ${wpts.length ? `<p style="margin:12px 0 0;font-weight:600">Waist</p>${chartSVG(wpts,"var(--muted)","cm")}` : ""}
      ${recent ? `<ul class="list">${recent}</ul>` : `<div class="empty">No body entries yet.</div>`}
    </div>`;
}

function viewData(){
  return `<div class="data-grid"><div class="section stack"><span class="panel-icon">${icon("download")}</span><h3>Export app data</h3><p class="muted">${S.sessions.length} sessions · ${S.body.length} body entries · ${S.custom.length} custom workouts</p>
    <p class="muted">Export workouts, schedules, schedule progress, session drafts and preferences in one JSON backup.</p><button class="btn primary" data-act="export">Export app data (.json)</button>
    <textarea id="exportOut" readonly hidden aria-label="Exported JSON"></textarea><button class="btn" data-act="copyexport" id="copyBtn" hidden>Copy JSON instead</button></div>
    <div class="section stack"><span class="panel-icon">${icon("upload")}</span><h3>Restore a backup</h3><p class="muted">Choose a backup or paste its JSON. The complete file is validated before saving.</p><label class="file-label">Choose backup file<input type="file" id="importFile" accept="application/json,.json" aria-label="Choose JSON backup"></label>
    <label>Import mode<select id="importMode" style="display:block;width:100%"><option value="merge">Merge with existing data</option><option value="replace">Replace all local app data</option></select></label><p class="muted">Merge keeps unmatched entries. Replace removes entries absent from the file. Version 1 and 2 backups remain supported.</p><p id="importResult" role="status" hidden></p><textarea id="importText" placeholder='Paste your backup JSON here…' aria-label="Paste JSON backup"></textarea><button class="btn" data-act="import">Import backup</button></div></div>
    <div class="section program-details"><div><p class="eyebrow">DEFAULT PROGRAM</p><h3>Your workouts, one simple file.</h3><p class="muted">Loaded from <code>ppl-default-workouts.json</code> · ${esc(programSource)}</p><p class="muted">These are starter workouts. Use Manage schedules in Train to choose your own order, rest days and weekly or repeating split.</p><div class="rotation">${ORDER.map(id=>`<span class="chip ${BASE_DAY[id].type}">${esc(BASE_DAY[id].name)}</span>`).join('<span aria-hidden="true">→</span>')}</div></div><div><button class="btn" data-act="reloadprogram">Reload program</button><label class="file-label" style="margin-top:12px">Load program JSON<input type="file" id="programFile" accept="application/json,.json" aria-label="Load default workout program"></label></div></div>
    <p class="storage-footnote">Saved on this device and browser. Use a JSON backup to transfer data; clearing browser data removes your log.</p>`;
}
function updateSessionMeter(){
  if (S.tab !== "log" || S.editing || S.scheduleEditing || S.manageSchedules || !S.ready) return;
  const d = getDraft(S.dayId), sets = [...d.ex,...d.extra].flatMap(e=>e.sets), filled = sets.filter(s=>num(s.r)>0).length;
  const caption = $("#loggedSets"), meter = $("#setMeter");
  if (caption) caption.textContent = filled;
  if (meter) meter.style.width = (sets.length ? filled/sets.length*100 : 0) + "%";
}
function programError(){
  setStatus("Program file needed");
  $("#app").innerHTML = `<div class="empty load-error"><span class="panel-icon">${icon("activity")}</span><h2>Let’s load your program.</h2><p>Place <code>ppl-default-workouts.json</code> next to <code>index.html</code> on GitHub Pages. If you opened this HTML directly, choose the program file below.</p><button class="btn" data-act="retryprogram">Try again</button><label class="file-label">Choose program JSON<input type="file" id="programFile" accept="application/json,.json" aria-label="Choose default workout program"></label></div>`;
}
async function initApp(){ if (await loadProgram()) { await initStore(); } else programError(); }
async function useProgramFile(file){
  try {
    const j = JSON.parse(await file.text()); applyProgram(j); programSource = "Selected JSON file";
    try { localStorage.setItem(PROGRAM_CACHE, JSON.stringify(j)); } catch {}
    if (!S.ready) { await initStore(); } else { ensureSchedules(); S.dayId = nextDayId(); render(); }
    toast("Program loaded");
  } catch { toast("That file is not a valid workout program."); }
}

/* ---------- events ---------- */
document.querySelector("nav.tabs").addEventListener("click", e => {
  const b = e.target.closest("button[data-tab]"); if (!b) return;
  if (!S.ready) return;
  if(S.tab==="log"&&saveStatus==="pending")void flushDrafts();
  S.tab = b.dataset.tab; S.armedDelete = null; render(); window.scrollTo({top:0});
});

$("#app").addEventListener("input", e => {
  const t = e.target;
  if(t.matches("[data-exercise-search]")){exerciseQuery=t.value;applyExerciseFilter();return;}
  if(t.dataset.ef==="n" && S.editing){S.editing.ex[+t.dataset.i].n=t.value;const row=t.closest("[data-exercise-search-item]");if(row)row.dataset.exerciseSearchItem=t.value;return;}
  if(savedSessionEdit && t.dataset.historyField){savedSessionEdit[t.dataset.historyField]=t.value;return;}
  if(savedSessionEdit && t.dataset.historySet){savedSessionEdit.exercises[+t.dataset.i].sets[+t.dataset.j][t.dataset.historySet]=t.value;return;}
  if(t.hasAttribute?.("data-schedule-name") && S.scheduleEditing){S.scheduleEditing.name=t.value;return;}
  if (S.tab === "log" && S.editing) {
    if (t.dataset.ed === "name") S.editing.name = t.value;
    else if (t.dataset.ed === "type") S.editing.type = t.value;
    else if (t.dataset.ed === "unit") S.editing.unit = t.value;
    else if (t.dataset.ef) S.editing.ex[+t.dataset.i][t.dataset.ef] = t.value;
    return;
  }
  const f = t.dataset.f; if (!f || S.tab !== "log") return;
  if(f==="increment"){const e=(t.dataset.g==="x"?getDraft(S.dayId).extra:getDraft(S.dayId).ex)[+t.dataset.i];e.loadIncrement=t.value;saveDrafts();return;}
  const d = getDraft(S.dayId);
  if (f === "exrest") { const n=Number(t.value);if(Number.isInteger(n)&&n>=15&&n<=600)(t.dataset.g==="x"?d.extra:d.ex)[+t.dataset.i].restSeconds=n;else toast("Rest interval must be 15–600 seconds."); }
   else if (f === "w" || f === "r" || f==="rir") {const set=(t.dataset.g === "x" ? d.extra : d.ex)[+t.dataset.i].sets[+t.dataset.j];set[f]=f==="rir"?(t.value===""?null:Number(t.value)):t.value;if(set.completed===true && f!=="rir"){set.completed=false;delete set.completedAt;}}
  else if (f === "xname") d.extra[+t.dataset.i].name = t.value;
  else if (f === "notes") d.notes = t.value;
  else if (f === "date") d.date = t.value;
  saveDrafts(); updateSessionMeter();
});

$("#app").addEventListener("change", e => {
  if(e.target.dataset.analytics){S.analyticsFilter={...(S.analyticsFilter||{}),[e.target.dataset.analytics]:e.target.value};render();return;}
  if(e.target.dataset.act==="progressiontoggle"){S.progressionEnabled=e.target.checked;saveDrafts();render();return;}
  if(e.target.dataset.act==="incrementunit"){const t=e.target;(t.dataset.g==="x"?getDraft(S.dayId).extra:getDraft(S.dayId).ex)[+t.dataset.i].incrementUnit=t.value;saveDrafts();return;}
  if(e.target.dataset.act==="settype"){const t=e.target;const d=getDraft(S.dayId);(t.dataset.g==="x"?d.extra:d.ex)[+t.dataset.i].sets[+t.dataset.j].type=t.value;saveDrafts();return;}
  if(e.target.dataset.act==="restpreset"){getDraft(S.dayId).restSeconds=Number(e.target.value);saveDrafts();return;}
  const t = e.target;
  if(t.dataset.act==="useschedule"){useSchedule(t.value).catch(err=>toast(err.message));return;}
  if(t.dataset.scheduleDay!=null && S.scheduleEditing){S.scheduleEditing.days[+t.dataset.scheduleDay]=t.value || null;render();return;}
  if(t.hasAttribute?.("data-schedule-cursor") && S.scheduleEditing){S.scheduleEditing.cursor=+t.value;return;}
  if (t.id === "programFile" && t.files?.[0]) { useProgramFile(t.files[0]); return; }
  if (t.dataset.ed === "type" && S.editing) { S.editing.type = t.value; return; }
  if (t.dataset.act === "variant") { const de = getDraft(S.dayId).ex[+t.dataset.i]; de.name = t.value; de.unit = unitFor(t.value, getDay(S.dayId)); saveDrafts(); render(); }
  if (t.id === "bUnit") { S.bodyUnit = t.value; return; }
  if (t.dataset.act === "progressEx") { S.progressEx = t.value; render(); }
  if (t.id === "importFile" && t.files && t.files[0]) { t.files[0].text().then(txt => { $("#importText").value = txt; toast("File loaded. Tap Import JSON."); }); }
});

$("#app").addEventListener("click", async e => {
  const b = e.target.closest("[data-act]"); if (!b || b.tagName === "SELECT") return;
  const act = b.dataset.act;
  if(act==="recoverbackup"){S.tab="data";render();await exportJSON();return;}
  if(act==="reloadconflict"){window.location.reload();return;}
  if(["manageschedules","closeschedules","newschedule","editschedule","cancelschedule","activateschedule","skipscheduled","movescheduleday","addscheduleday","removescheduleday","saveschedule","deleteschedule"].includes(act)){await scheduleAction(b);return;}
  if (act === "retryprogram") { await initApp(); return; }
  if (act === "reloadprogram") { if (await loadProgram()) { ensureSchedules(); S.dayId = nextDayId(); render(); toast(programSource === "JSON file" ? "Program refreshed" : "Using the saved program; file unavailable"); } else toast("Program file unavailable"); return; }
  if (act === "day") { if(saveStatus==="pending")void flushDrafts();S.dayId = b.dataset.id; render(); flushDrafts(); return; }
  const grp = () => { const d = getDraft(S.dayId); return (b.dataset.g === "x" ? d.extra : d.ex)[+b.dataset.i]; };
  if (act === "completeset") { const entry=grp().sets[+b.dataset.j]; if(entry.completed===true){entry.completed=false;delete entry.completedAt;}else{if(!(num(entry.r)>0)){toast("Enter reps before completing a set.");return;}entry.completed=true;entry.completedAt=new Date().toISOString();const d=getDraft(S.dayId);const exercise=grp();d.restTimer=timerTools.start(exercise.restSeconds??d.restSeconds);}saveDrafts();render();return; }
  if (["timerpause","timerresume","timerskip","timerreset"].includes(act)){const d=getDraft(S.dayId);if(act==="timerpause"&&d.restTimer)d.restTimer=timerTools.pause(d.restTimer);if(act==="timerresume"&&d.restTimer)d.restTimer=timerTools.resume(d.restTimer);if(act==="timerskip")d.restTimer=null;if(act==="timerreset"){d.restTimer=null;d.startedAt=Date.now();}saveDrafts();render();return;}
  if(act==="resetdefault"){const e=grp(),key=exerciseKey(e.name,e.exerciseId),prior=S.exerciseDefaults||{},before={restSeconds:e.restSeconds,loadIncrement:e.loadIncrement,incrementUnit:e.incrementUnit};const next={...prior};delete next[key];S.exerciseDefaults=next;delete e.restSeconds;delete e.loadIncrement;delete e.incrementUnit;if(!await writeLocal()){S.exerciseDefaults=prior;Object.assign(e,before);toast("Could not reset defaults");}else{saveDrafts();render();toast("Exercise default reset");}return;}
  if(act==="savedefault"){const e=grp();const key=exerciseKey(e.name,e.exerciseId);const value=normalizeExerciseSetting({restSeconds:e.restSeconds,loadIncrement:Number(e.loadIncrement||S.exerciseDefaults?.[key]?.loadIncrement),incrementUnit:e.incrementUnit||S.exerciseDefaults?.[key]?.incrementUnit||"kg"});const prev=S.exerciseDefaults||{};S.exerciseDefaults={...prev,[key]:value};if(!await writeLocal()){S.exerciseDefaults=prev;toast("Could not save defaults");}else {render();toast("Exercise defaults saved");}return;}
  if(act==="copyforward"){const e=grp(),prev=lastFor(e.name);if(!prev){toast("No previous sets available");return;}const converted=prev.sets.map(x=>({w:String(tidy(conv(x.w||0,prev.unit,e.unit),e.unit)),r:String(x.r||"")}));if(!converted.length)return;e.sets=converted;saveDrafts();render();toast("Previous sets copied to draft");return;}
  if (act === "addset") { grp().sets.push({w:"",r:""}); saveDrafts(); render(); return; }
  if (act === "rmset") { const de = grp(); if (de.sets.length>1) de.sets.pop(); saveDrafts(); render(); return; }
  if (act === "unit") { const de = grp(); de.unit = b.dataset.u; saveDrafts(); render(); return; }
  if (act === "addextra") { getDraft(S.dayId).extra.push({ name:"", unit:(getDay(S.dayId).unit||DEFAULT_UNIT), sets:[{w:"",r:""},{w:"",r:""},{w:"",r:""}] }); saveDrafts(); render();
    const el = document.querySelector(`[data-key="xname-${getDraft(S.dayId).extra.length-1}"]`); if (el) el.focus(); return; }
  if (act === "rmextra") { getDraft(S.dayId).extra.splice(+b.dataset.i, 1); saveDrafts(); render(); return; }
  if (act === "newworkout") { S.editing = { id: uid("c"), name:"", type:"other", unit:DEFAULT_UNIT, ex:[{n:"",s:3,lo:8,hi:12}] }; S.armedDelete = null; render(); window.scrollTo({top:0}); return; }
  if (act === "editday") { const c = S.custom.find(x => x.id === b.dataset.id); if (c) { S.editing = JSON.parse(JSON.stringify(c)); S.armedDelete = null; render(); window.scrollTo({top:0}); } return; }
  if (act === "edaddex") { S.editing.ex.push({n:"",s:3,lo:8,hi:12}); render(); const el = document.querySelector(`[data-key="ed-n-${S.editing.ex.length-1}"]`); if (el) el.focus(); return; }
  if (act === "edrmex") { S.editing.ex.splice(+b.dataset.i, 1); if (!S.editing.ex.length) S.editing.ex.push({n:"",s:3,lo:8,hi:12}); render(); return; }
  if (act === "edcancel") { S.editing = null; S.armedDelete = null; render(); return; }
  if (act === "edsave") return saveWorkout(b);
  if (act === "eddelete") {
    const id = S.editing.id;
    if(S.schedules.some(s=>s.days.includes(id))){toast("Remove this workout from your schedules before deleting it.");return;}
    if (S.armedDelete !== id) { S.armedDelete = id; b.textContent = "Tap again to delete this workout"; return; }
    try { await putCustom(S.custom.filter(c => c.id !== id)); delete S.drafts[id]; saveDrafts(); S.editing = null; S.armedDelete = null; if (S.dayId === id) S.dayId = nextDayId(); render(); toast("Workout deleted"); }
    catch { toast("Couldn't delete. Try again."); }
    return;
  }
  if(act==="clearexercisesearch"){exerciseQuery="";const input=document.querySelector("[data-exercise-search]");if(input){input.value="";applyExerciseFilter();input.focus();}return;}
  if(act==="historyedit"){
    const original=S.sessions.find(x=>x.id===b.dataset.id);
    if(original){savedSessionEdit=structuredClone(original);render();window.scrollTo({top:0});}
    return;
  }
  if(act==="historycancel"){savedSessionEdit=null;render();return;}
  if(act==="historyaddset"&&savedSessionEdit){
    const ex=savedSessionEdit.exercises[+b.dataset.i];
    ex.sets.push({w:0,r:1,type:"working",completed:true});
    render();return;
  }
  if(act==="historyrmset"&&savedSessionEdit){
    savedSessionEdit.exercises[+b.dataset.i].sets.splice(+b.dataset.j,1);
    render();return;
  }
  if(act==="historysave"&&savedSessionEdit){
    if(savedSessionEditPending)return;
    const corrected=structuredClone(savedSessionEdit);
    if(!validDataDate(corrected.date)){toast("Enter a valid session date.");return;}
    if(!corrected.exercises.length||corrected.exercises.some(ex=>!ex.sets?.length||ex.sets.some(set=>!Number.isFinite(Number(set.w))||Number(set.w)<0||!Number.isInteger(Number(set.r))||Number(set.r)<1))){
      toast("Each exercise needs a set with non-negative weight and positive whole-number reps.");return;
    }
    corrected.notes=(corrected.notes||"").trim();
    for(const ex of corrected.exercises)for(const set of ex.sets){set.w=Number(set.w);set.r=Number(set.r);}
    if(!S.sessions.some(x=>x.id===corrected.id)){toast("Session no longer exists. Reload.");return;}
    savedSessionEditPending=true;b.disabled=true;
    try{
      await putSession(corrected,false);
      savedSessionEdit=null;render();toast("Session updated");
    }catch(err){toast("Could not save changes: "+err.message);b.disabled=false;}
    finally{savedSessionEditPending=false;}
    return;
  }
  if (act === "save") return saveSession(b);
  if (act === "delsession" || act === "delbody") {
    const id = b.dataset.id;
    if (S.armedDelete !== id) { S.armedDelete = id; b.textContent = act==="delsession" ? "Tap again to delete" : "Tap again"; return; }
    S.armedDelete = null;
    try { act === "delsession" ? await removeSession(id) : await removeBody(id); toast("Deleted"); } catch { toast("Couldn't delete. Try again."); }
    render(); return;
  }
  if (act === "addbody") return addBody();
  if (act === "export") return exportJSON();
  if (act === "copyexport") { const ta = $("#exportOut"); ta.select(); try { await navigator.clipboard.writeText(ta.value); toast("Copied"); } catch { document.execCommand && document.execCommand("copy"); toast("Copied"); } return; }
  if (act === "import") return importJSON();
});

let sessionSavePending=false;
let savedSessionEdit=null;
let savedSessionEditPending=false;
async function saveSession(btn){
  if(sessionSavePending)return;
  const day = getDay(S.dayId), d = getDraft(S.dayId);
  if([...d.ex,...d.extra].some(e=>e.sets.some(x=>(String(x.w).trim() && (num(x.w)==null || num(x.w)<0)) || (String(x.r).trim() && (num(x.r)==null || !Number.isInteger(num(x.r)) || num(x.r)<0))))){toast("Use non-negative weights and whole-number reps.");return;}
  const exercises = [...d.ex, ...d.extra.filter(x => x.name.trim())].map(e => ({ name:e.name.trim(), unit: e.unit || DEFAULT_UNIT, sets: e.sets.filter(s => num(s.r) > 0 && s.completed !== false).map(s => ({ w: num(s.w) ?? 0, r: num(s.r), completed: true, type:s.type||"working",...(s.rir===null||s.rir===""||s.rir===undefined?{}:{rir:Number(s.rir)}), ...(s.completedAt ? {completedAt:s.completedAt} : {}) })) })).filter(e => e.sets.length);
  if([...d.ex,...d.extra].some(e=>e.sets.some(x=>x.rir!=null&&( !Number.isInteger(Number(x.rir))||Number(x.rir)<0||Number(x.rir)>10)))){toast("RIR must be a whole number from 0 to 10.");return;}
  if (!exercises.length) { toast("Enter reps for at least one set first."); return; }
  if (!validDataDate(d.date)) { toast("Pick a valid date for this session."); return; }
  const s = { id: uid("s"), dayId: day.id, dayName: day.name, type: day.type, date: d.date, notes: (d.notes||"").trim(), exercises, createdAt: Date.now() };
  sessionSavePending=true;btn.disabled = true; btn.textContent = "Saving…";
  try {
    clearTimeout(draftTimer);
    await putSession(s,true);
    setSaveStatus("saved");
    S.tab = "history"; render(); window.scrollTo({top:0});
    toast("Session saved");
  } catch { btn.disabled = false; btn.textContent = "Save session"; toast("Couldn't save. Browser storage is full or unavailable. Download a backup."); } finally { sessionSavePending=false; }
}

async function saveWorkout(btn){
  const w = S.editing;
  const name = (w.name||"").trim();
  const ex = w.ex.map(e => {
    const s = Math.min(10, Math.max(1, Math.round(num(e.s) || 3)));
    let lo = Math.min(50, Math.max(1, Math.round(num(e.lo) || 8))), hi = Math.min(50, Math.max(1, Math.round(num(e.hi) || lo)));
    if (lo > hi) [lo, hi] = [hi, lo];
    return { n: (e.n||"").trim().slice(0,80), s, lo, hi, alt: [] };
  }).filter(e => e.n);
  if (!name) { toast("Give the workout a name."); return; }
  if (!ex.length) { toast("Add at least one exercise."); return; }
  const clean = { id: w.id, name: name.slice(0,30), type: TYPES.some(t => t[0]===w.type) ? w.type : "other", unit: w.unit === "kg" ? "kg" : "lb", ex };
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    const list = S.custom.some(c => c.id === clean.id) ? S.custom.map(c => c.id === clean.id ? clean : c) : [...S.custom, clean];
    await putCustom(list);
    S.editing = null; S.dayId = clean.id; flushDrafts(); render(); window.scrollTo({top:0}); toast("Workout saved");
  } catch { btn.disabled = false; btn.textContent = "Save workout"; toast("Couldn't save. Try again."); }
}

async function addBody(){
  const date = $("#bDate").value, weight = num($("#bWeight").value), waist = num($("#bWaist").value), unit = $("#bUnit").value === "lb" ? "lb" : "kg"; S.bodyUnit = unit;
  if (!validDataDate(date) || (weight!=null && weight<=0) || (waist!=null && waist<=0) || (!weight && !waist)) { toast("Add a weight or waist measurement."); return; }
  const b = { id: "b" + date, date, weight: weight ?? null, waist: waist ?? null, unit, createdAt: Date.now() };
  try { await putBody(b); render(); toast("Entry added"); }
  catch { toast("Couldn't save. Try again."); }
}

const DATA_SCHEMA = {"$schema":"https://json-schema.org/draft/2020-12/schema","title":"Gym Tracker app data","description":"Version 4 backup with flexible schedules. Default workouts remain in ppl-default-workouts.json. IDs are unique per collection; schedules must reference available workouts, include a training day, and weekly plans have seven days.","type":"object","properties":{"app":{"const":"ppl-tracker"},"version":{"const":4},"exportedAt":{"anyOf":[{"type":"string","format":"date-time"},{"type":"null"}]},"sessions":{"type":"array","items":{"$ref":"#/$defs/session"}},"body":{"type":"array","items":{"$ref":"#/$defs/body"}},"custom":{"type":"array","items":{"$ref":"#/$defs/custom"}},"drafts":{"type":"object","propertyNames":{"$ref":"#/$defs/id"},"additionalProperties":{"$ref":"#/$defs/draft"}},"preferences":{"$ref":"#/$defs/preferences"},"schedules":{"type":"array","minItems":1,"items":{"$ref":"#/$defs/schedule"}}},"required":["app","version","exportedAt","sessions","body","custom","drafts","preferences","schedules"],"additionalProperties":false,"$defs":{"id":{"type":"string","pattern":"^(?!(?:__proto__|constructor|prototype)$)[A-Za-z0-9_\\-.~:@+]{1,190}$"},"unit":{"type":"string","enum":["kg","lb"]},"date":{"type":"string","format":"date"},"set":{"type":"object","properties":{"w":{"type":"number","minimum":0},"r":{"type":"integer","minimum":1},"id":{"$ref":"#/$defs/id"},"type":{"type":"string","enum":["working","warmup","drop"]},"completed":{"type":"boolean"},"completedAt":{"anyOf":[{"type":"string","format":"date-time"},{"type":"null"}]},"rir":{"anyOf":[{"type":"integer","minimum":0,"maximum":10},{"type":"null"}]},"restSeconds":{"type":"integer","minimum":0,"maximum":3600}},"required":["w","r"],"additionalProperties":false},"exercise":{"type":"object","properties":{"name":{"type":"string","minLength":1},"unit":{"type":"string","enum":["kg","lb"]},"sets":{"type":"array","items":{"$ref":"#/$defs/set"},"minItems":1},"exerciseId":{"$ref":"#/$defs/id"}},"required":["name","unit","sets"],"additionalProperties":false},"session":{"type":"object","properties":{"id":{"$ref":"#/$defs/id"},"dayId":{"$ref":"#/$defs/id"},"dayName":{"type":"string"},"type":{"type":"string","enum":["pull","push","legs","other"]},"date":{"type":"string","format":"date"},"notes":{"type":"string"},"exercises":{"type":"array","items":{"$ref":"#/$defs/exercise"},"minItems":1},"createdAt":{"type":"integer","minimum":0}},"required":["id","dayId","dayName","type","date","notes","exercises","createdAt"],"additionalProperties":false},"body":{"type":"object","properties":{"id":{"$ref":"#/$defs/id"},"date":{"type":"string","format":"date"},"weight":{"anyOf":[{"type":"number","exclusiveMinimum":0},{"type":"null"}]},"waist":{"anyOf":[{"type":"number","exclusiveMinimum":0},{"type":"null"}]},"unit":{"type":"string","enum":["kg","lb"]},"createdAt":{"type":"integer","minimum":0}},"required":["id","date","weight","waist","unit","createdAt"],"additionalProperties":false},"customExercise":{"type":"object","properties":{"n":{"type":"string","minLength":1},"s":{"type":"integer","minimum":1,"maximum":30},"lo":{"type":"integer","minimum":1,"maximum":100},"hi":{"type":"integer","minimum":1,"maximum":100},"alt":{"type":"array","items":{"type":"string"}},"exerciseId":{"$ref":"#/$defs/id"}},"required":["n","s","lo","hi","alt"],"additionalProperties":false},"custom":{"type":"object","properties":{"id":{"$ref":"#/$defs/id"},"name":{"type":"string","minLength":1},"type":{"type":"string","enum":["pull","push","legs","other"]},"unit":{"type":"string","enum":["kg","lb"]},"ex":{"type":"array","items":{"$ref":"#/$defs/customExercise"},"minItems":1}},"required":["id","name","type","unit","ex"],"additionalProperties":false},"draftValue":{"anyOf":[{"type":"string"},{"type":"number"}]},"draftSet":{"type":"object","properties":{"w":{"$ref":"#/$defs/draftValue"},"r":{"$ref":"#/$defs/draftValue"},"id":{"type":"string"},"type":{"type":"string","enum":["working","warmup","drop"]},"completed":{"type":"boolean"},"completedAt":{"type":"string","format":"date-time"},"rir":{"anyOf":[{"type":"integer","minimum":0,"maximum":10},{"type":"null"}]},"restSeconds":{"type":"integer","minimum":0,"maximum":3600}},"required":["w","r"],"additionalProperties":false},"draftExercise":{"type":"object","properties":{"name":{"type":"string"},"unit":{"type":"string","enum":["kg","lb"]},"sets":{"type":"array","items":{"$ref":"#/$defs/draftSet"},"minItems":1},"exerciseId":{"type":"string"},"restSeconds":{"type":"integer","minimum":15,"maximum":600},"loadIncrement":{"anyOf":[{"type":"number","exclusiveMinimum":0,"maximum":100},{"type":"string"},{"type":"null"}]},"incrementUnit":{"type":"string","enum":["kg","lb"]}},"required":["name","unit","sets"],"additionalProperties":false},"draft":{"type":"object","properties":{"sig":{"type":"string"},"date":{"type":"string","format":"date"},"notes":{"type":"string"},"ex":{"type":"array","items":{"$ref":"#/$defs/draftExercise"},"minItems":1},"extra":{"type":"array","items":{"$ref":"#/$defs/draftExercise"}},"startedAt":{"type":"number","minimum":0},"restSeconds":{"type":"integer","minimum":15,"maximum":600},"recoveryWarning":{"type":"boolean"},"restTimer":{"anyOf":[{"type":"null"},{"type":"object","properties":{"durationSeconds":{"type":"integer","minimum":0,"maximum":3600},"deadline":{"type":"number"},"pausedRemainingMs":{"anyOf":[{"type":"number","minimum":0},{"type":"null"}]}},"required":["durationSeconds","deadline","pausedRemainingMs"],"additionalProperties":false}]}},"required":["sig","date","notes","ex","extra"],"additionalProperties":false},"preferences":{"type":"object","properties":{"bodyUnit":{"type":"string","enum":["kg","lb"]},"selectedWorkoutId":{"anyOf":[{"$ref":"#/$defs/id"},{"type":"null"}]},"progressExercise":{"anyOf":[{"type":"string"},{"type":"null"}]},"activeScheduleId":{"anyOf":[{"$ref":"#/$defs/id"},{"type":"null"}]},"exerciseDefaults":{"type":"object","propertyNames":{"type":"string","minLength":1,"maxLength":300,"pattern":"^(?!(__proto__|constructor|prototype)$).+$"},"additionalProperties":{"type":"object","properties":{"restSeconds":{"type":"integer","minimum":15,"maximum":600},"loadIncrement":{"type":"number","exclusiveMinimum":0,"maximum":100},"incrementUnit":{"type":"string","enum":["kg","lb"]}},"additionalProperties":false}},"progressionEnabled":{"type":"boolean"}},"required":["bodyUnit","selectedWorkoutId","progressExercise","activeScheduleId"],"additionalProperties":false},"schedule":{"type":"object","properties":{"id":{"$ref":"#/$defs/id"},"name":{"type":"string","minLength":1,"maxLength":80},"mode":{"type":"string","enum":["cycle","weekly"]},"days":{"type":"array","minItems":1,"maxItems":28,"items":{"anyOf":[{"$ref":"#/$defs/id"},{"type":"null"}]}},"cursor":{"type":"integer","minimum":0}},"required":["id","name","mode","days","cursor"],"additionalProperties":false}}};
function validDataDate(date){
  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date+"T12:00:00Z")) && new Date(date+"T12:00:00Z").toISOString().slice(0,10) === date;
}
function validateAppData(value){
  function check(v, schema, path){
    if (schema.$ref) return check(v, DATA_SCHEMA.$defs[schema.$ref.split("/").pop()], path);
    if (schema.anyOf) {
      if (!schema.anyOf.some(s=>{try {check(v,s,path);return true;}catch{return false;}})) throw new Error(path+": invalid value");
      return;
    }
    const fail = msg => {throw new Error(path+": "+msg);};
    if (Object.hasOwn(schema,"const") && v !== schema.const) fail("unexpected value");
    if (schema.enum && !schema.enum.includes(v)) fail("choose "+schema.enum.join(" or "));
    if (schema.type) {
      const type = schema.type;
      const valid = type === "null" ? v===null : type === "array" ? Array.isArray(v) : type === "object" ? v!==null && typeof v==="object" && !Array.isArray(v) : type === "integer" ? Number.isInteger(v) : type === "number" ? typeof v==="number" && Number.isFinite(v) : typeof v === type;
      if (!valid) fail("expected "+type);
    }
    if (typeof v === "string") {
      if(schema.maxLength!=null && v.length>schema.maxLength)fail("text is too long");
      if (schema.minLength != null && v.length < schema.minLength) fail("must not be empty");
      if (schema.pattern && !new RegExp(schema.pattern).test(v)) fail("invalid format");
      if (schema.format === "date" && !validDataDate(v)) fail("expected a valid YYYY-MM-DD date");
      if (schema.format === "date-time" && (!/^\d{4}-\d{2}-\d{2}T/.test(v) || !validDataDate(v.slice(0,10)) || !/(Z|[+-]\d{2}:\d{2})$/.test(v) || isNaN(Date.parse(v)))) fail("expected an ISO date and time with timezone");
    }
    if (typeof v === "number") {
      if (schema.minimum != null && v<schema.minimum || schema.maximum != null && v>schema.maximum || schema.exclusiveMinimum != null && v<=schema.exclusiveMinimum) fail("number is outside the allowed range");
    }
    if (Array.isArray(v)) {
      if(schema.maxItems!=null && v.length>schema.maxItems)fail("too many items");
      if (schema.minItems != null && v.length<schema.minItems) fail("requires at least "+schema.minItems+" item(s)");
      if (schema.items) v.forEach((item,i)=>check(item,schema.items,path+"["+i+"]"));
    } else if (v && typeof v === "object") {
      for (const key of schema.required || []) if (!Object.hasOwn(v,key)) fail("missing "+key);
      for (const [key,item] of Object.entries(v)) {
        if (schema.propertyNames) check(key,schema.propertyNames,path+" key");
        if (schema.properties && Object.hasOwn(schema.properties,key)) check(item,schema.properties[key],path+"."+key);
        else if (schema.additionalProperties === false) fail("unknown field "+key);
        else if (schema.additionalProperties && typeof schema.additionalProperties === "object") check(item,schema.additionalProperties,path+"."+key);
      }
    }
  }
  check(value,DATA_SCHEMA,"data");
  for (const key of ["sessions","body","custom","schedules"]) {
    if (new Set(value[key].map(x=>x.id)).size !== value[key].length) throw new Error("data."+key+": duplicate IDs");
  }
  value.custom.forEach(c=>{
    if (BASE_DAY[c.id]) throw new Error("Custom workout ID conflicts with the default program: "+c.id);
    c.ex.forEach(e=>{if(e.hi<e.lo)throw new Error("Custom exercise maximum reps must be at least its minimum reps");});
  });
  for(const s of value.schedules){if(!s.days.some(Boolean) || s.cursor>=s.days.length || s.mode==="weekly" && (s.days.length!==7 || s.cursor!==0))throw new Error("Invalid schedule days or cursor");}
  if(value.preferences.activeScheduleId!==null && !value.schedules.some(s=>s.id===value.preferences.activeScheduleId))throw new Error("Active schedule does not exist");
  return value;
}
function normalizeDrafts(drafts){
  return Object.fromEntries(Object.entries(drafts || {}).map(([id,d])=>[id,{sig:d.sig,date:d.date,notes:d.notes || "",ex:(d.ex || []).map(e=>({name:e.name,unit:e.unit || DEFAULT_UNIT,sets:e.sets})),extra:(d.extra || []).map(e=>({name:e.name,unit:e.unit || DEFAULT_UNIT,sets:e.sets}))}]));
}
function migrateLegacy(j){
  const normalizeUnit = u => u == null ? DEFAULT_UNIT : u;
  return {app:"ppl-tracker",version:4,exportedAt:j.exportedAt || null,
    sessions:(j.sessions || []).map(s=>({id:s.id,dayId:s.dayId || "legacy",dayName:s.dayName || "Workout",type:s.type || "other",date:s.date,notes:s.notes || "",createdAt:s.createdAt ?? 0,exercises:(s.exercises || []).map(e=>({name:e.name,...(e.exerciseId ? {exerciseId:e.exerciseId} : {}),unit:normalizeUnit(e.unit || s.unit),sets:Array.isArray(e.sets) ? e.sets.map(x=>({...Object.fromEntries(["id","type","completed","completedAt","rir","restSeconds"].filter(k=>x[k]!==undefined).map(k=>[k,x[k]])),w:x.w == null ? 0 : Number(x.w),r:Number(x.r)})) : e.sets}))})),
    body:(j.body || []).map(b=>({id:b.id,date:b.date,weight:b.weight == null ? null : Number(b.weight),waist:b.waist == null ? null : Number(b.waist),unit:normalizeUnit(b.unit),createdAt:b.createdAt ?? 0})),
    custom:(j.custom || []).map(c=>({id:c.id,name:c.name,type:c.type || "other",unit:normalizeUnit(c.unit),ex:(c.ex || []).map(e=>({n:e.n,s:e.s,lo:e.lo,hi:e.hi,alt:e.alt || [],...(e.exerciseId ? {exerciseId:e.exerciseId} : {})}))})),
    drafts:normalizeDrafts(j.drafts),schedules:j.schedules || [starterSchedule(j.sessions || [])],preferences:{...preferences(),...(j.preferences || {}),activeScheduleId:j.preferences?.activeScheduleId || j.schedules?.[0]?.id || "starter-ppl"}};
}
function buildAppData(){
  const normalized=migrateLegacy({exportedAt:new Date().toISOString(),sessions:S.sessions,body:S.body,custom:S.custom,drafts:{},schedules:S.schedules,preferences:preferences()});
  normalized.drafts=JSON.parse(JSON.stringify(S.drafts));
  return validateAppData(normalized);
}
function importFeedback(message, failed=false){
  const el = $("#importResult"); if(el){el.hidden=false;el.textContent=message;el.style.color=failed ? "#aa413b" : "var(--ok)";}
  toast(message);
}
async function exportJSON(){
  let json;
  try {json = JSON.stringify(buildAppData(),null,2);} catch(err){toast("Cannot export: "+err.message);return;}
  const ta = $("#exportOut"); ta.hidden=false;ta.value=json;$("#copyBtn").hidden=false;
  try {
    const url = URL.createObjectURL(new Blob([json],{type:"application/json"}));
    const a = document.createElement("a");a.href=url;a.download=`ppl-tracker-data-${today()}.json`;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);toast("App data export started");
  } catch {toast("Download unavailable. Copy the JSON below.");}
}
async function importJSON(){
  let incoming,legacy=false,importedPreferenceKeys=[];
  try {
    const j=JSON.parse($("#importText").value);
    if(!j || typeof j!=="object" || Array.isArray(j))throw new Error("Expected a tracker backup object");
    if(j.workouts)throw new Error("This is a default workout program. Use Load program JSON instead.");
    if(j.app!=="ppl-tracker")throw new Error("Expected app: ppl-tracker");
    if(![1,2,3,4].includes(j.version))throw new Error("Unsupported backup version");
    importedPreferenceKeys=Object.keys(j.preferences||{});
    legacy=j.version<3;incoming=validateAppData(j.version<4 ? migrateLegacy(j) : j);
  } catch(err){importFeedback("Import cancelled: "+err.message,true);return;}
  const replace=$("#importMode")?.value==="replace";
  const previous={sessions:S.sessions,body:S.body,custom:S.custom,drafts:S.drafts,dayId:S.dayId,bodyUnit:S.bodyUnit,progressEx:S.progressEx,schedules:S.schedules,activeScheduleId:S.activeScheduleId,exerciseDefaults:S.exerciseDefaults,progressionEnabled:S.progressionEnabled};
  const merge=(current,added)=>[...new Map([...current,...added].map(x=>[x.id,x])).values()];
  try {
    S.sessions=sortSessions(replace ? incoming.sessions : merge(S.sessions,incoming.sessions));
    S.body=sortBody(replace ? incoming.body : merge(S.body,incoming.body));
    S.custom=replace ? incoming.custom : merge(S.custom,incoming.custom);
    S.schedules=replace ? incoming.schedules : legacy ? S.schedules : merge(S.schedules,incoming.schedules);
    validateSchedules(S.schedules,S.custom);
    S.activeScheduleId=legacy && !replace ? S.activeScheduleId : incoming.preferences.activeScheduleId || S.schedules[0].id;
    S.drafts=replace ? incoming.drafts : {...S.drafts,...incoming.drafts};
    S.bodyUnit=incoming.preferences.bodyUnit;S.progressEx=incoming.preferences.progressExercise;
    // Replace takes backed-up settings (defaults for older backups); merge
    // preserves current keys absent from incoming and prefers incoming keys.
    const p=incoming.preferences;
    S.exerciseDefaults=replace ? {...(importedPreferenceKeys.includes("exerciseDefaults") ? p.exerciseDefaults||{} : {})} : {...(S.exerciseDefaults||{}),...(importedPreferenceKeys.includes("exerciseDefaults")?p.exerciseDefaults||{}:{})};
    S.progressionEnabled=replace ? (!importedPreferenceKeys.includes("progressionEnabled") || p.progressionEnabled!==false) : (importedPreferenceKeys.includes("progressionEnabled") ? p.progressionEnabled : S.progressionEnabled!==false);
    S.dayId=getDay(incoming.preferences.selectedWorkoutId)?.id || nextDayId();
    // All collections and drafts commit together in one atomic localStorage write.
    if(!await writeLocal())throw new Error("Browser storage is full or unavailable");
    clearTimeout(draftTimer);

    S.editing=null;S.scheduleEditing=null;S.manageSchedules=false;S.armedDelete=null;render();
    importFeedback(`${replace ? "Replaced local data" : "Imported app data"}: ${incoming.sessions.length} sessions, ${incoming.body.length} body entries, ${incoming.custom.length} workouts, ${Object.keys(incoming.drafts).length} drafts, ${legacy ? 0 : incoming.schedules.length} schedules.`);
  } catch(err){Object.assign(S,previous);importFeedback("Import failed; existing data kept. "+err.message,true);}
}

initApp();
})();
