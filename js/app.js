import { exerciseThumbnail, exercisePhotoDetail } from "./exercise-images.js";

import { PROGRAM_CACHE } from "./config.js";
import { createInitialState } from "./state.js";
import { conv, tidy, today, uid, num, fmtDate, e1rm, round1, sortSessions, sortBody, esc } from "./workouts.js";
import { icon } from "./render.js";
import { scheduleIndexFor } from "./schedules.js";
import { createLocalStorage } from "./storage.js";
import { recommendProgression } from "./progression.js";
import { calculateRecords, strengthHighlights } from "./records.js";
import { analyticsRange,analyticsSummary } from "./analytics.js";
import { muscleVolumeSummary } from "./muscle-analytics.js";
import { muscleMapData } from "./muscle-map-data.js";
import { renderMuscleMap,renderExerciseMusclePreview } from "./muscle-map-view.js";
import { exerciseKey,hardSetCount,normalizeExerciseSetting,convertIncrement,resolveRestSeconds } from "./exercise-settings.js";
import { createTimers } from "./timers.js";
import { resolveExerciseMetadata,resolveExerciseIdentity } from "./exercise-catalog.js";
import { validateCalendarEvents,upsertCalendarEvent,removeCalendarEvent,shiftCalendarMonth,calendarPeriod,calendarDays,calendarAdherence } from "./calendar.js";

(() => {
"use strict";
const S = createInitialState();
let calendarMonth=null,calendarMode="month",calendarWeekOffset=0;
let muscleMapMetric="hardSets",muscleMapSelected="chest";
const timerTools=createTimers();
let timerTicker=null;
let timerWorkoutId=null;
let analyticsFiltersOpen=false;
let templateId=null, sessionReview=null, savedSummary=null, savedSummaryMeta=null;
let homeWeekOffset=0;
// Bottom sheets: {kind:"swap"|"weight"|"session"|"exercise"|"set", g, i, j}.
let sheet=null, sheetReturn=null;
let historyMode="list", calendarSelected=null;
const openDisclosures=new Set();
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
      return {n:e.name, s:e.sets, lo:e.repsMin, hi:e.repsMax, alt:e.alternatives || [],...(resolveExerciseIdentity(e.name,e.exerciseId)?{exerciseId:resolveExerciseIdentity(e.name,e.exerciseId)}:{})};
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
// Re-derive stored catalog IDs in memory only; a later save writes them back.
const withCurrentIds=list=>list.map(c=>Array.isArray(c?.ex)?{...c,ex:c.ex.map(e=>e?.exerciseId?{...e,exerciseId:resolveExerciseIdentity(e.n,e.exerciseId)}:e)}:c);
/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
let toastTimer;
function toast(msg){ const t=$("#toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove("show"),2200); }
/* ---------- browser storage ---------- */
const preferences = () => ({...(S.defaultUnit?{defaultUnit:S.defaultUnit}:{}),globalRestSeconds:S.globalRestSeconds||90,progressionEnabled:S.progressionEnabled!==false,bodyUnit:S.bodyUnit || "kg",selectedWorkoutId:S.dayId || null,progressExercise:S.progressEx || null,activeScheduleId:S.activeScheduleId || null,exerciseDefaults:S.exerciseDefaults||{}});
const settingKey=(e,i,group="",dayId=S.dayId)=>exerciseKey(e.name,e.exerciseId||("legacy:"+dayId+":"+(group==="x"?"extra:":"planned:")+i));
function settingFor(e,i,group="",dayId=S.dayId){
 const key=settingKey(e,i,group,dayId),entries=S.exerciseDefaults||{};
 return Object.hasOwn(entries,key)?entries[key]:(entries[exerciseKey(e.name)]||{});
}
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
  const l = await initialize(); loadDrafts(l); S.sessions = sortSessions(l.sessions); S.calendarEvents=validateCalendarEvents(l.calendarEvents||[]); S.body = sortBody(l.body); S.custom = withCurrentIds(l.custom.filter(c => !BASE_DAY[c.id])); S.ready = true;
  S.defaultUnit=l.preferences.defaultUnit;S.schedules=l.schedules;S.activeScheduleId=l.preferences.activeScheduleId;ensureSchedules();S.bodyUnit=l.preferences.bodyUnit=== "lb" ? "lb":"kg";S.progressEx=l.preferences.progressExercise || null;S.exerciseDefaults=l.preferences.exerciseDefaults||{};S.progressionEnabled=l.preferences.progressionEnabled!==false;S.globalRestSeconds=Number.isInteger(l.preferences.globalRestSeconds)&&l.preferences.globalRestSeconds>=15&&l.preferences.globalRestSeconds<=600?l.preferences.globalRestSeconds:90;setStatus(getMode()==="idb" ? "Saved to IndexedDB" : "Saved on this device"); S.dayId = getDay(l.preferences.selectedWorkoutId)?.id || nextDayId();
  const draftsBefore=JSON.stringify(S.drafts);
  const migratedClocks=Object.keys(S.drafts).filter(id=>getDay(id)&&!S.drafts[id].workoutTimer);
  Object.keys(S.drafts).filter(id=>getDay(id)).forEach(id=>getDraft(id));
  const draftsChanged=JSON.stringify(S.drafts)!==draftsBefore;
  if((migratedClocks.length||draftsChanged)&&!await writeLocal())setSaveStatus("error");
  render();
  requestPersistentStorage();
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
  if(advance){timerWorkoutId=null;restOverlayOpen=false;}
}
async function saveCalendarEvent(event){
 const next=upsertCalendarEvent(S.calendarEvents,event);
 await persist("calendarEvents",next);
}
async function deleteCalendarEvent(id){
 const next=removeCalendarEvent(S.calendarEvents,id);
 await persist("calendarEvents",next);
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
function nextSlot(){const s=activeSchedule();return s ? s.days[scheduleIndex(s)] : null;}
function nextDayId(){
  const s=activeSchedule();
  if(s){for(let offset=0;offset<s.days.length;offset++){const id=s.days[(scheduleIndex(s)+offset)%s.days.length];if(id && getDay(id))return id;}}
  return ORDER.find(id=>getDay(id)) || S.custom[0]?.id;
}
function nextScheduleLabel(){if(!activeSchedule())return "Choose a plan";return nextSlot()==null ? "Rest day" : getDay(nextSlot())?.name || "Choose workout";}
function validateSchedules(list,custom=S.custom){
  if(!Array.isArray(list) || !list.length || new Set(list.map(s=>s.id)).size!==list.length)throw new Error("Schedules must have unique IDs and include at least one schedule.");
  const ids=new Set([...PROGRAM,...custom].map(w=>w.id));
  for(const s of list){
    if(!s || typeof s.id!=="string" || !/^(?!(?:__proto__|constructor|prototype)$)[A-Za-z0-9_\-.~:@+]{1,190}$/.test(s.id) || typeof s.name!=="string" || !s.name.trim() || s.name.length>80 || !["cycle","weekly"].includes(s.mode) || !Array.isArray(s.days) || !s.days.length || s.days.length>28 || !s.days.some(id=>id!=null) || s.days.some(id=>id!==null && !ids.has(id)) || !Number.isInteger(s.cursor) || s.cursor<0 || s.cursor>=s.days.length || (s.mode==="weekly" && (s.days.length!==7 || s.cursor!==0)))throw new Error("Use valid workouts, at least one training day, and exactly seven days for a weekly schedule.");
  }
}
function ensureSchedules(){
  try{validateSchedules(S.schedules);}catch{S.schedules=[starterSchedule()];}
  if(!S.schedules.some(s=>s.id===S.activeScheduleId))S.activeScheduleId=S.activeScheduleId===undefined&&S.sessions.length?S.schedules[0].id:null;
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

function newSchedule(mode){
  S.scheduleEditing={id:uid("schedule"),name:"",mode,days:mode==="weekly"?Array(7).fill(null):[null],cursor:0};S.manageSchedules=false;render();
}
function viewScheduleManager(){
  return `<div class="section stack schedule-manager"><button class="btn small ghost back-btn schedule-back" data-act="closeschedules">← Back to plan</button><h2 class="display-title">Your schedules</h2>${activeSchedule()?'<button class="btn ghost" data-act="noschedule">Train without a schedule</button>':'<p class="muted">No active schedule. Choose a saved plan or create your own.</p>'}<p class="muted">Choose any split: PPL, upper/lower, full body, or your own mix. Create custom workouts under Plan → Workouts, then select them in a schedule.</p><div class="row-actions two"><button class="btn primary" data-act="newschedule" data-mode="cycle">+ Repeating sequence</button><button class="btn" data-act="newschedule" data-mode="weekly">+ Weekly plan</button></div>${S.schedules.map(s=>`<div class="schedule-list-row ${s.id===S.activeScheduleId?"is-active":""}"><div><h3>${esc(s.name)}</h3><p class="muted">${s.mode==="weekly"?"Monday–Sunday":"Repeating sequence"} · ${s.days.length} days ${s.id===S.activeScheduleId?"· Active":""}</p></div><div class="row-actions"><button class="btn small" data-act="editschedule" data-id="${esc(s.id)}">Edit / reorder</button>${s.id!==S.activeScheduleId?`<button class="btn small" data-act="activateschedule" data-id="${esc(s.id)}">Use schedule</button>`:""}${S.schedules.length>1?`<button class="btn small danger" data-act="deleteschedule" data-id="${esc(s.id)}" aria-label="${S.armedDelete===s.id?"Confirm delete":"Delete"} schedule ${esc(s.name)}">${S.armedDelete===s.id?"Confirm delete schedule":"Delete schedule"}</button>`:""}</div></div>`).join("")}</div>`;
}
function viewScheduleEditor(){
  const s=S.scheduleEditing;
  const options=id=>`<option value="" ${id==null?"selected":""}>Rest day</option>`+allDays().map(w=>`<option value="${esc(w.id)}" ${w.id===id?"selected":""}>${esc(w.name)}</option>`).join("");
  return `<div class="section stack schedule-editor"><h2 class="display-title">${S.schedules.some(w=>w.id===s.id)?"Edit schedule":"New schedule"}</h2><p class="muted">${s.mode==="weekly"?"Assign any workout or rest to each weekday.":"Reorder days, repeat workouts, or insert rest days. This sequence repeats independently of calendar weekdays."}</p><label class="field-label">Schedule name<input type="text" maxlength="80" data-schedule-name data-key="schedule-name" value="${esc(s.name)}" placeholder="e.g. Upper / Lower, Full body, My PPL"></label>
  ${s.days.map((id,i)=>`<div class="schedule-edit-row"><label>${s.mode==="weekly"?WEEKDAYS[i]:"Step "+(i+1)}<select data-schedule-day="${i}" aria-label="${s.mode==="weekly"?WEEKDAYS[i]:"Step "+(i+1)} workout">${options(id)}</select></label><div class="row-actions"><button class="btn small" data-act="movescheduleday" data-i="${i}" data-dir="-1" aria-label="Move day ${i+1} up" ${i===0?"disabled":""}>↑</button><button class="btn small" data-act="movescheduleday" data-i="${i}" data-dir="1" aria-label="Move day ${i+1} down" ${i===s.days.length-1?"disabled":""}>↓</button>${s.mode==="cycle"?`<button class="btn small danger" data-act="removescheduleday" data-i="${i}" ${s.days.length===1?"disabled":""}>Remove</button>`:""}</div></div>`).join("")}
  ${s.mode==="cycle"?`<button class="btn" data-act="addscheduleday" ${s.days.length>=28?"disabled":""}>+ Add day</button><label class="field-label">Next step after saving<select data-schedule-cursor>${s.days.map((id,i)=>`<option value="${i}" ${i===s.cursor?"selected":""}>Step ${i+1} · ${esc(id?getDay(id)?.name:"Rest")}</option>`).join("")}</select></label>`:""}<p class="muted">Include at least one workout. Saving makes this your active schedule.</p><div class="row-actions two"><button class="btn primary" data-act="saveschedule">Save & use schedule</button><button class="btn" data-act="cancelschedule">Cancel</button></div></div>`;
}
async function scheduleAction(b){
  const act=b.dataset.act,s=S.scheduleEditing;
  try{
    if(act==="manageschedules"){S.tab="plan";S.manageSchedules=true;S.editing=null;S.armedDelete=null;render();}
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
    else if(act==="deleteschedule" && S.schedules.length>1){if(S.armedDelete!==b.dataset.id){S.armedDelete=b.dataset.id;render();document.querySelector(`[data-act="deleteschedule"][data-id="${CSS.escape(b.dataset.id)}"]`)?.focus({preventScroll:true});toast("Press again to delete this schedule, or choose another action to cancel.");return;}const list=S.schedules.filter(w=>w.id!==b.dataset.id);await saveScheduleList(list,S.activeScheduleId===b.dataset.id?null:S.activeScheduleId);S.armedDelete=null;render();toast("Schedule deleted");}
  }catch(err){toast(err.message);}
}

function getDraft(dayId){
  let d=S.drafts[dayId];
  const day=getDay(dayId);
  const sig=day.ex.map(e=>e.n).join("|");
  if(!d||typeof d!=="object"||Array.isArray(d)){
    d={sig,date:today(),notes:"",extra:[],ex:[]};
    S.drafts[dayId]=d;
  }
  if(!Array.isArray(d.ex)||!d.ex.length){
    if(d.ex!==undefined)d.recoveryWarning=true;
    d.ex=day.ex.map(e=>({name:e.n,...(e.exerciseId?{exerciseId:e.exerciseId}:{}),sets:Array.from({length:e.s},()=>({w:"",r:""}))}));
  }
  if(!Array.isArray(d.extra)){d.extra=[];d.recoveryWarning=true;}
  // A draft is a snapshot of the workout the user started. A template can
  // change later, so keep the saved exercise order and set counts intact.
  if(d.sig!==sig||d.ex.length!==day.ex.length)d.recoveryWarning=true;
  const normalizeExercise=(entry,index,extra=false)=>{
    if(!entry||typeof entry!=="object"||Array.isArray(entry)){
      d.recoveryWarning=true;
      return {name:extra?"":"Saved exercise",unit:S.defaultUnit||day.unit||DEFAULT_UNIT,sets:[]};
    }
    if(typeof entry.name!=="string"){entry.name=extra?"":"Saved exercise";d.recoveryWarning=true;}
    if(!Array.isArray(entry.sets)){entry.sets=[];d.recoveryWarning=true;}
    else{
      const valid=entry.sets.filter(set=>set&&typeof set==="object"&&!Array.isArray(set));
      if(valid.length!==entry.sets.length)d.recoveryWarning=true;
      entry.sets=valid.map(set=>({...set,w:set.w??"",r:set.r??""}));
    }
    if(!entry.unit)entry.unit=extra?(S.defaultUnit||day.unit||DEFAULT_UNIT):unitFor(entry.name,day);
    if(entry.exerciseId)entry.exerciseId=resolveExerciseIdentity(entry.name,entry.exerciseId);
    else if(entry.name)entry.exerciseId=resolveExerciseIdentity(entry.name)||undefined;
    if(entry.restSeconds==null)entry.restSeconds=settingFor(entry,index,extra?"x":"",dayId)?.restSeconds;
    return entry;
  };
  d.ex=d.ex.map((entry,index)=>normalizeExercise(entry,index));
  d.extra=d.extra.map((entry,index)=>normalizeExercise(entry,index,true));
  if(!d.workoutTimer){
    // Legacy drafts started timing merely by being opened. Freeze those clocks.
    d.workoutTimer=Number.isFinite(d.startedAt)&&draftHasData(d)
      ? {state:"paused",elapsedMs:timerTools.elapsed(d.startedAt)*1000,startedAt:null}
      : timerTools.idleWorkout();
  }
  if(!Number.isInteger(d.restSeconds)||d.restSeconds<15||d.restSeconds>600)d.restSeconds=S.globalRestSeconds||90;
  return d;
}
function lastFor(name){
  for (const s of S.sessions) { const e = (s.exercises||[]).find(x => x.name === name); if (e && e.sets && e.sets.length) return { date:s.date, sets:e.sets, unit: exUnit(e, s) }; }
  return null;
}
function unitFor(name, day){ const l = name ? lastFor(name) : null; return S.defaultUnit || (l ? l.unit : ((day && day.unit) || DEFAULT_UNIT)); }
function unitSeg(g, i, u){ return `<span class="seg" role="group" aria-label="Weight unit">${["kg","lb"].map(x => `<button type="button" data-act="unit" data-g="${g}" data-i="${i}" data-u="${x}" aria-pressed="${u===x}">${x}</button>`).join("")}</span>`; }
function draftHasData(d){ return [...d.ex, ...(d.extra||[])].some(e => e.sets.some(s => String(s.w).trim() !== "" || String(s.r).trim() !== "")) || (d.notes||"").trim() !== ""; }

function activeWorkoutId(){
 const entries=Object.entries(S.drafts).filter(([id,d])=>getDay(id)&&d&&Array.isArray(d.ex));
 return entries.find(([,d])=>d.workoutTimer?.state==="running")?.[0]
  ||entries.find(([,d])=>d.workoutTimer?.state==="paused"||d.workoutTimer?.state==="stopped"||draftHasData(d))?.[0];
}
function dateOffset(date, days){
 const value=new Date(date+"T12:00:00Z");value.setUTCDate(value.getUTCDate()+days);return value.toISOString().slice(0,10);
}
function dashboardWeek(){
 const now=today(),weekday=(new Date(now+"T12:00:00Z").getUTCDay()+6)%7;
 const from=dateOffset(now,-weekday+homeWeekOffset*7);
 return calendarDays(from,dateOffset(from,6),S.sessions,S.calendarEvents||[],activeSchedule());
}
const TYPE_LABEL={pull:"Pull",push:"Push",legs:"Legs",other:"Other"};
const typeTag=type=>{const t=TYPE_LABEL[type]?type:"other";return `<span class="tag tag-${t}">${TYPE_LABEL[t]}</span>`;};
const capitalize=s=>String(s||"").replace(/^./,c=>c.toUpperCase());
const clockState=clock=>({idle:"Ready",running:"Training",paused:"Paused",stopped:"Stopped"})[clock.state];
function draftProgress(d){const sets=[...d.ex,...d.extra].flatMap(e=>e.sets);return {done:sets.filter(s=>s.completed===true).length,total:sets.length};}
// Only ticked sets are saved; the review can opt in sets that have reps but no tick.
function loggedSet(s,includeUnticked){return s.completed===true||(!!includeUnticked&&num(s.r)>0&&s.completed!==false);}
// Weight fields are text inputs so a decimal comma ("72,5") survives; accept only empty or plain decimals, so "7a" is not read as 7.
function validWeightText(v){return /^\d*(?:[.,]\d+)?$/.test(String(v??"").trim());}
function nextSetLabel(d){
 for(const e of [...d.ex,...d.extra]){const j=e.sets.findIndex(s=>s.completed!==true);if(j>=0)return `${e.name||"Extra exercise"}, set ${j+1}`;}
 return "All sets done";
}
function planStepLabel(){
 const s=activeSchedule();if(!s)return "";
 return s.mode==="cycle"?`${esc(s.name)} · step ${scheduleIndex(s)+1}/${s.days.length}`:`${esc(s.name)} · ${WEEKDAYS[scheduleIndex(s)]}`;
}
function lastDoneLabel(id){const s=sortSessions(S.sessions).find(x=>x.dayId===id);return s?" · last "+fmtDate(s.date):"";}
function activityOverview(){
 const end=today(),start=dateOffset(end,-83),counts=new Map();
 for(const session of S.sessions)if(session.date>=start&&session.date<=end)counts.set(session.date,(counts.get(session.date)||0)+1);
 const total=[...counts.values()].reduce((a,b)=>a+b,0);
 return `<section class="section activity-overview"><div class="section-heading"><h2>Consistency</h2><span class="muted">${total} sessions · last 12 weeks</span></div><div class="activity-grid" role="img" aria-label="${total} sessions across ${counts.size} training days in the last 12 weeks">${Array.from({length:84},(_,i)=>{const date=dateOffset(start,i),count=counts.get(date)||0;return `<span class="activity-cell ${count?'trained':''}" title="${date}: ${count} sessions" aria-hidden="true"></span>`;}).join("")}</div><div class="axis-row"><span>${esc(fmtDate(start))}</span><span>Today</span></div></section>`;
}
// Whether the browser promised not to clear this site's data: true, false, or null when it has no Storage API or hasn't answered yet.
let storagePersisted=null,persistAskedAfterSave=false;
function requestPersistentStorage(){
 let storage;
 try{storage=globalThis.navigator?.storage;}catch{return;}
 if(!storage||typeof storage.persist!=="function")return;
 (async()=>{
  try{
   let kept=typeof storage.persisted==="function"?await storage.persisted():false;
   if(kept!==true)kept=await storage.persist();
   kept=kept===true;
   if(kept!==storagePersisted){storagePersisted=kept;if(S.ready&&["home","more","data"].includes(S.tab))render();}
  }catch{}
 })();
}
function backupInfo(){
 let exported=0,snoozed=0;
 try{exported=Number(localStorage.getItem("gt-last-export"))||0;snoozed=Number(localStorage.getItem("gt-backup-snooze"))||0;}catch{}
 const now=Date.now();if(exported<0||exported>now||!Number.isFinite(exported))exported=0;
 // Storage the browser may clear on its own gets a shorter reminder.
 const days=storagePersisted===false?14:30;
 return {exported,days,due:(S.sessions.length+S.body.length+S.custom.length>0)&&now>=snoozed&&(!exported||now-exported>=days*86400000)};
}
function backupStatus(){
 const {exported}=backupInfo();
 const storageLine=storagePersisted===true?'Storage: protected from automatic clearing.':storagePersisted===false?'Your browser may clear this data. Export backups regularly.':'';
 return `<p class="muted backup-export-status">${exported?'Last export started: '+esc(new Date(exported).toLocaleString()):'No export recorded on this device.'} Check that the downloaded file is saved somewhere safe.</p>${storageLine?`<p class="muted storage-status">${storageLine}</p>`:''}`;
}
function backupReminder(){
 const info=backupInfo();if(!info.due)return "";
 return `<aside class="backup-reminder" aria-label="Backup reminder">${icon('download')}<div><h2>Keep a copy of your training</h2><p class="muted">${info.exported?`It has been at least ${info.days} days since your last export.`:'Your log lives only on this device and has never been exported.'}</p></div><div class="row-actions"><button class="btn small" data-destination="data">Back up my data</button><button class="btn small ghost" data-act="snoozebackup">Remind me in a week</button></div></aside>`;
}
function weekOverview(week,count){
 return `<section class="section week-overview" aria-label="Weekly training overview"><div class="week-heading"><button class="icon-btn" data-act="homeweek" data-delta="-1" aria-label="Previous week">${icon('back')}</button><div><h2>${homeWeekOffset===0?'This week':esc(fmtDate(week[0].date))+' – '+esc(fmtDate(week[6].date))}</h2>${homeWeekOffset===0?`<p class="muted"><b>${count}</b> session${count===1?'':'s'} · Mon–Sun</p>`:'<button class="week-reset" data-act="homeweekreset">Back to this week</button>'}</div><button class="icon-btn" data-act="homeweek" data-delta="1" aria-label="Next week">${icon('next')}</button></div>
 <div class="week-strip">${week.map((d,i)=>`<div class="week-day ${d.type}" ${d.date===today()?'aria-current="date"':''} aria-label="${esc(fmtDate(d.date))}: ${d.type==='none'?'No scheduled workout':d.type}"><span>${['M','T','W','T','F','S','S'][i]}</span><strong>${Number(d.date.slice(-2))}</strong><small aria-hidden="true">${d.type==='completed'?icon('check'):d.type==='planned'?'•':d.type==='rest'?'Rest':d.type==='skipped'?'×':''}</small></div>`).join('')}</div></section>`;
}
function todayHero(active,day){
 if(active&&day){
  const d=getDraft(day.id),{done,total}=draftProgress(d),clock=d.workoutTimer;
  return `<section class="today-workout hero is-active" aria-label="Workout in progress"><div class="hero-row"><p class="eyebrow"><span class="live-dot" aria-hidden="true"></span>In progress · <span data-clock-state>${clockState(clock)}</span></p><strong class="hero-clock" data-timer="workout" role="timer" aria-label="Workout elapsed time">${timerLabel(timerTools.workoutElapsed(clock))}</strong></div><h2>${esc(day.name)}</h2><div class="hero-progress"><div><span>Next: ${esc(nextSetLabel(d))}</span><span>${done} / ${total}</span></div><span class="bar" aria-hidden="true"><span style="width:${total?Math.round(done/total*100):0}%"></span></span></div><button class="btn primary" data-act="homecontinue" data-id="${esc(day.id)}">Resume workout ${icon('arrow')}</button></section>`;
 }
 if(day){
  const sets=day.ex.reduce((n,e)=>n+e.s,0);
  return `<section class="today-workout hero type-${esc(day.type)}" aria-label="Up next"><div class="hero-row"><p class="eyebrow">${activeSchedule()?'Up next · '+planStepLabel():'Up next'}</p>${typeTag(day.type)}</div><h2>${esc(day.name)}</h2><div class="hero-stats"><span><b>${day.ex.length}</b>exercises</span><span><b>${sets}</b>sets</span><span><b>~${Math.round(sets*2.5/5)*5}</b>minutes</span></div><ul class="hero-thumbs" aria-label="Exercises in ${esc(day.name)}">${day.ex.slice(0,5).map(e=>`<li>${exerciseThumbnail(e.n)}</li>`).join('')}${day.ex.length>5?`<li class="more">+${day.ex.length-5}</li>`:''}</ul><button class="btn primary" data-act="homestart" data-id="${esc(day.id)}">Start workout ${icon('arrow')}</button><button class="btn ghost" data-act="opensheet" data-sheet="swap">${icon('swap')} Swap workout</button></section>`;
 }
 if(activeSchedule())return `<section class="today-workout hero is-rest" aria-label="Recovery day"><p class="eyebrow">Recovery day · ${planStepLabel()}</p><h2>Time to recover</h2><p class="muted">Rest is part of your plan. You can still train whenever you are ready.</p><button class="btn primary" data-act="opensheet" data-sheet="swap">Choose a workout</button>${activeSchedule().mode==='cycle'?'<button class="btn ghost" data-act="skipscheduled">Mark rest complete</button>':''}</section>`;
 const ppl=S.schedules.some(s=>s.id==="starter-ppl");
 return `<section class="today-workout hero is-choose" aria-label="Choose how you train"><p class="eyebrow">${S.sessions.length?'No active plan':'Welcome'}</p><h2>Choose how you train</h2><p class="muted">Pick a starting point. You can change exercises, sets and the schedule any time.</p><div class="starter-list">
 <button class="pick" data-act="reviewstarter" data-preset="full"><span class="badge badge-accent">FB</span><span><strong>Full body</strong><small>1 workout · 5 exercises · ~40 min</small></span></button>
 <button class="pick" data-act="reviewstarter" data-preset="upper"><span class="badge badge-pull">UP</span><span><strong>Upper body</strong><small>Upper/lower split · 6 exercises</small></span></button>
 <button class="pick" data-act="reviewstarter" data-preset="lower"><span class="badge badge-legs">LO</span><span><strong>Lower body</strong><small>Upper/lower split · 6 exercises</small></span></button>
 ${ppl?`<button class="pick" data-act="activateschedule" data-id="starter-ppl"><span class="badge badge-push">PPL</span><span><strong>Push / Pull / Legs</strong><small>6 workouts · repeating plan</small></span></button>`:''}
 <button class="pick dashed" data-act="homecreate"><span class="badge">${icon('plus')}</span><span><strong>Create my own workout</strong><small>Pick exercises and targets</small></span></button></div>
 <button class="btn ghost" data-act="opensheet" data-sheet="swap">Choose a workout</button>${S.sessions.length?'':'<button class="link-btn" data-destination="data">Have a backup? Restore it →</button>'}</section>`;
}
function viewHome(){
 const active=activeWorkoutId(),day=getDay(active||nextSlot()),last=sortSessions(S.sessions)[0],week=dashboardWeek();
 const body=sortBody(S.body).filter(b=>num(b.weight)>0).at(-1);
 const thisWeekStart=dateOffset(today(),-((new Date(today()+"T12:00:00Z").getUTCDay()+6)%7));
 const weeklyCount=S.sessions.filter(x=>x.date>=thisWeekStart&&x.date<=today()).length;
 const lastTile=last?`<button class="tile today-last" data-act="opensession" data-id="${esc(last.id)}"><span class="eyebrow">Last session</span><strong class="tile-title">${esc(last.dayName)}</strong><span class="muted">${esc(fmtDate(last.date))} · ${last.exercises.reduce((n,e)=>n+e.sets.length,0)} sets</span><span class="tile-action">View session →</span></button>`
  :`<div class="tile today-last"><span class="eyebrow">Last session</span><p class="muted">Your first completed workout will appear here.</p></div>`;
 return `<section class="today-dashboard" aria-label="Today dashboard">${weekOverview(week,weeklyCount)}${todayHero(active,day)}
 <div class="home-metrics"><button class="tile" data-act="homebody"><span class="eyebrow">Body weight</span><strong class="metric-value">${body?esc(body.weight)+' <small>'+esc(body.unit||DEFAULT_UNIT)+'</small>':'—'}</strong><span class="muted">${body?esc(fmtDate(body.date)):'No entries yet'}</span><span class="tile-action">+ Log weight</span></button>${lastTile}</div>${backupReminder()}</section>`;
}
const STARTER_WORKOUTS={
 full:{name:"Full Body",description:"One balanced session · squat, push, pull and core",names:["Back squat","Dumbbell bench press","Seated cable row","Romanian deadlift","Cable crunch"]},
 upper:{name:"Upper Body",description:"Upper/lower split · chest, back, shoulders and arms",names:["Dumbbell bench press","Lat pulldown","Seated cable row","Lateral raise","EZ-bar curl","Triceps pushdown"]},
 lower:{name:"Lower Body",description:"Upper/lower split · legs, hips and core",names:["Back squat","Romanian deadlift","Leg extension","Lying leg curl","Standing calf raise","Cable crunch"]}
};
function starterChoices(){
 return `<section class="starter-choices" aria-label="Starter workout choices"><h2 class="eyebrow">Add from starters</h2><div class="chip-row">${Object.entries(STARTER_WORKOUTS).map(([id,p])=>`<button class="chip-btn" data-act="reviewstarter" data-preset="${id}" title="${esc(p.description)}">${icon('plus')} ${esc(p.name)}</button>`).join("")}</div><p class="muted">Starters open in the editor so you can review them before saving. Combine saved workouts into a schedule under Schedule.</p></section>`;
}
function viewLibrary(){
 if(S.editing)return viewEditor();
 if(templateId&&getDay(templateId)){
  const day=getDay(templateId);
  return `<button class="btn small ghost back-btn" data-act="closetemplate">${icon('back')} Workouts</button><section class="section template-detail type-${esc(day.type)}"><div class="hero-row"><p class="eyebrow">Workout template</p>${typeTag(day.type)}</div><h2 class="display-title">${esc(day.name)}</h2><p class="muted">${day.ex.length} exercises · ${day.ex.reduce((n,e)=>n+e.s,0)} sets · starting a session keeps this template unchanged.</p><ol class="template-exercises">${day.ex.map(e=>`<li class="exercise-photo-row">${exerciseThumbnail(e.n)}<div><strong>${esc(e.n)}</strong><span class="muted">${e.s} sets · ${e.lo}–${e.hi} reps</span>${exercisePhotoDetail(e.n)}</div></li>`).join("")}</ol><div class="row-actions two"><button class="btn primary" data-act="starttemplate" data-id="${esc(day.id)}">Start this workout</button><button class="btn" data-act="${BASE_DAY[day.id]?'copytemplate':'editday'}" data-id="${esc(day.id)}">${BASE_DAY[day.id]?'Customize a copy':'Edit template'}</button></div></section>`;
 }
 return `<section aria-label="Workout templates"><div class="section-heading"><h2>Your workouts</h2><button class="btn small accent" data-act="newworkout">${icon('plus')} New workout</button></div><div class="template-grid">${allDays().map(day=>`<button class="template-card type-${esc(day.type)}" data-act="opentemplate" data-id="${esc(day.id)}"><span class="eyebrow">${esc(TYPE_LABEL[day.type]||"Other")}</span><strong>${esc(day.name)}</strong><span class="muted">${day.ex.length} exercises · ${day.ex.reduce((n,e)=>n+e.s,0)} sets${BASE_DAY[day.id]?'':' · custom'}</span></button>`).join("")}</div></section>${starterChoices()}`;
}
function viewExercises(){
 const names=[...new Set(allDays().flatMap(d=>d.ex.flatMap(e=>[e.n,...(e.alt||[])])))].sort((a,b)=>a.localeCompare(b));
 return `${exerciseSearchBox()}<details class="section exercise-library" open><summary>All exercises · ${names.length}</summary><ul>${names.map(n=>`<li class="exercise-photo-row" data-exercise-search-item="${esc(n)}">${exerciseThumbnail(n)}<div><strong>${esc(n)}</strong>${exercisePhotoDetail(n)}</div></li>`).join("")}</ul></details>`;
}
function viewPlan(){
 if(S.scheduleEditing)return viewScheduleEditor();
 if(S.manageSchedules)return viewScheduleManager();
 const s=activeSchedule();
 if(!s)return `<section class="section plan-overview is-empty" aria-label="Schedule overview"><p class="eyebrow">No active schedule</p><h2 class="display-title">Train your way</h2><p class="muted">Log any workout from Today, or set up a repeating sequence or weekly plan. Nothing is selected for you.</p><button class="btn primary" data-act="manageschedules">Manage schedules</button></section>`;
 const idx=scheduleIndex(s);
 const steps=s.days.map((id,i)=>{
  const w=id?getDay(id):null,state=i===idx?"current":s.mode==="cycle"&&i<idx?"done":"";
  return `<li class="plan-step ${state} type-${esc(w?.type||'rest')}" ${i===idx?'aria-current="step"':''}><span class="plan-step__num">${s.mode==="weekly"?WEEKDAYS[i].slice(0,3):i+1}</span><span class="dot" aria-hidden="true"></span><span class="plan-step__name">${esc(id?w?.name||"Missing workout":"Rest")}</span>${i===idx?`<span class="eyebrow accent">${s.mode==="weekly"?"Today":"Next"}</span>`:state==="done"?icon('check'):""}</li>`;
 }).join("");
 return `<section class="section plan-overview" aria-label="Active schedule"><div class="plan-overview-head"><div><p class="eyebrow">Active schedule</p><h2 class="display-title">${esc(s.name)}</h2><p class="muted">${s.mode==="weekly"?"Weekly plan · follows your calendar":"Repeating sequence · "+s.days.length+" steps · not tied to weekdays"}</p></div><button class="btn small" data-act="manageschedules">Manage schedules</button></div><ol class="plan-steps">${steps}</ol>
 ${nextSlot()==null?`<p class="notice">${s.mode==="weekly"?"Today is a rest day.":"Rest is next in your sequence."} You can still log any workout from Today.</p>`:""}
 <div class="row-actions two">${s.mode==="cycle"?`<button class="btn ghost" data-act="skipscheduled">${nextSlot()==null?"Mark rest complete":"Skip "+esc(getDay(nextSlot())?.name||"step")}</button>`:""}<button class="btn" data-act="editschedule" data-id="${esc(s.id)}">Edit ${s.mode==="weekly"?"week":"sequence"}</button></div></section>`;
}
function viewSettings(){
 const theme=document.documentElement?.dataset?.themePreference||"system";
 return `<section class="section settings-form" aria-label="Training settings"><h2 class="eyebrow">Preferences</h2><label class="setting-row"><span>Appearance</span><select id="theme-preference" aria-label="Color theme">${['system','light','dark'].map(t=>`<option value="${t}" ${theme===t?'selected':''}>${t==='system'?'Auto':t[0].toUpperCase()+t.slice(1)}</option>`).join('')}</select></label><label class="setting-row"><span>Default weight unit</span><select data-setting="unit">${['kg','lb'].map(u=>`<option ${(S.defaultUnit||DEFAULT_UNIT)===u?'selected':''}>${u}</option>`).join('')}</select></label><p class="muted setting-help">Used for new sessions. Existing sets keep their units.</p><label class="setting-row"><span>Default rest time</span><select data-setting="rest">${[...new Set([30,60,90,120,180,240,300,S.globalRestSeconds])].sort((a,b)=>a-b).map(n=>`<option value="${n}" ${S.globalRestSeconds===n?'selected':''}>${n} seconds</option>`).join('')}</select></label><label class="setting-row check-setting"><span>Show progression suggestions</span><input type="checkbox" data-act="progressiontoggle" ${S.progressionEnabled===false?'':'checked'}></label></section>
 <section class="section settings-data"><h2 class="eyebrow">Your data</h2>${backupStatus()}<p class="muted">Workouts are stored only in this browser. ${S.sessions.length} sessions · ${S.custom.length} custom workouts · ${S.body.length} body entries.</p><button class="btn" data-destination="data">${icon('download')} Data &amp; Backups →</button></section>`;
}
function sessionOverview(session){
 return `<ul class="session-review-list">${session.exercises.map(e=>`<li><strong>${esc(e.name)}</strong><span>${e.sets.map(x=>`${x.w} × ${x.r}`).join(' · ')} ${esc(e.unit)}</span></li>`).join('')}</ul>`;
}
function scheduleAdvanceHint(dayId){
 const s=activeSchedule();
 if(!s||s.mode!=="cycle"||nextSlot()!==dayId)return "Saved on this device";
 const next=s.days[(s.cursor+1)%s.days.length];
 return `Saved on this device · advances ${esc(s.name)} to ${esc(next?getDay(next)?.name||"the next step":"a rest day")}`;
}
function viewSessionReview(){
 if(!sessionReview)return viewLog();
 const count=sessionReview.exercises.reduce((n,e)=>n+e.sets.length,0),draft=getDraft(S.dayId),total=[...draft.ex,...draft.extra].reduce((n,e)=>n+e.sets.length,0);
 const pending=sessionReview.pending||0,empty=[...draft.ex,...draft.extra].reduce((n,e)=>n+e.sets.filter(s=>!(num(s.r)>0)).length,0);
 const unticked=total-count-empty-(sessionReview.includeUnticked?0:pending),plural=n=>n===1?"":"s";
 const leftOut=[empty>0?`${empty} empty set${plural(empty)}`:"",unticked>0?`${unticked} unticked set${plural(unticked)}`:""].filter(Boolean);
 const units=[...new Set(sessionReview.exercises.map(e=>e.unit))];
 const volume=units.length===1?Math.round(sessionReview.exercises.reduce((n,e)=>n+e.sets.reduce((m,x)=>m+x.w*x.r,0),0)):null;
 return `<section class="session-review" aria-labelledby="review-heading"><button class="link-btn back-btn" data-act="backtosession">${icon('back')} Keep training</button><h1 id="review-heading" class="eyebrow-heading">Review session</h1><p class="muted">Clock paused at ${timerLabel(timerTools.workoutElapsed(draft.workoutTimer))}</p><h2 class="display-title">${esc(sessionReview.dayName)}</h2>
 <div class="stats"><div class="stat"><b>${count}</b><small>sets logged</small></div><div class="stat"><b>${sessionReview.exercises.length}</b><small>exercises</small></div>${volume!=null?`<div class="stat"><b>${volume.toLocaleString()}</b><small>${esc(units[0])} volume</small></div>`:''}</div>
 ${pending>0?`<p class="notice" id="review-pending" role="status">${icon('info')} ${pending} ${pending===1?"set has reps but isn't":"sets have reps but aren't"} ticked.${sessionReview.forcedInclude?" Nothing is ticked, so they're included.":""}</p><label class="toggle-row"><span>Include them</span><input type="checkbox" id="review-include-unticked" data-act="reviewinclude" aria-describedby="review-pending" ${sessionReview.includeUnticked?"checked":""} ${sessionReview.forcedInclude?"disabled":""}></label>`:''}
 ${leftOut.length?`<p class="notice warn" role="status">${icon('info')} ${leftOut.join(' and ')} will be left out.</p>`:''}${sessionOverview(sessionReview)}
 <div class="review-fields"><label class="field-label session-date">Workout date<input type="date" id="review-workout-date" value="${esc(sessionReview.date)}"></label>${sessionReview.date!==today()?'<p class="muted">This draft is dated earlier or later than today. Check the date before saving.</p>':''}<button class="btn small ghost" data-act="reviewtoday">Use today (${esc(today())})</button><label class="field-label">How did it feel? (optional)<textarea id="review-notes" rows="2" placeholder="Energy, sleep, a new best…">${esc(draft.notes||'')}</textarea></label></div>
 <p id="session-validation" class="notice warn" role="alert" hidden></p><div class="bottom-actions"><button class="btn primary" data-act="save">Save session</button><p class="muted">${scheduleAdvanceHint(S.dayId)}</p></div></section>`;
}
function viewSessionSummary(){
 if(!savedSummary)return viewHome();
 const meta=savedSummaryMeta||{},sets=savedSummary.exercises.reduce((n,e)=>n+e.sets.length,0);
 return `<section class="session-summary" aria-labelledby="summary-heading"><span class="summary-mark" aria-hidden="true">${icon('check')}</span><p class="eyebrow">${esc(savedSummary.dayName)} · ${esc(fmtDate(savedSummary.date))} · saved</p><h1 id="summary-heading" class="display-title">Workout complete</h1>
 <div class="summary-stats">${meta.elapsed?`<div><b>${timerLabel(meta.elapsed)}</b><small>duration</small></div>`:''}<div><b>${sets}</b><small>sets</small></div><div><b>${savedSummary.exercises.length}</b><small>exercises</small></div></div>
 ${meta.records?.length?`<section class="section pr-list" aria-label="New personal records"><p><span class="tag tag-pr">${meta.records.length} PR${meta.records.length===1?'':'s'}</span> New personal records</p>${meta.records.map(r=>`<div class="pr-row"><span>${esc(r.name)}</span><span><b>${r.value} ${esc(r.unit)}</b> <small class="muted">${esc(r.label)}</small></span></div>`).join('')}</section>`:''}
 ${sessionOverview(savedSummary)}${meta.next?`<p class="muted next-up">${icon('calendar')} Up next in ${esc(meta.next.schedule)}: <b>${esc(meta.next.label)}</b></p>`:''}
 <div class="bottom-actions two"><button class="btn" data-destination="history">View history</button><button class="btn primary" data-destination="home">Back to Today</button></div></section>`;
}
/* ---------- render ---------- */
const TAB_FOR={log:"home",review:"home",summary:"home",history:"progress",lifts:"progress",body:"progress",calendar:"progress",data:"more",library:"plan",exercises:"plan"};
const TITLES={home:"Today",plan:"Plan",library:"Plan",exercises:"Plan",history:"Progress",calendar:"Progress",progress:"Progress",lifts:"Progress",body:"Progress",more:"Settings",data:"Data & Backups"};
function subnav(label,items){
 return `<nav class="subnav" aria-label="${label}">${items.map(([dest,text])=>`<button data-destination="${dest}" ${S.tab===dest||(dest==="history"&&S.tab==="calendar")?'aria-current="page"':''}>${text}</button>`).join("")}</nav>`;
}
function viewFor(tab){
 const planNav=subnav("Plan views",[["plan","Schedule"],["library","Workouts"],["exercises","Exercises"]]);
 const progressNav=subnav("Progress views",[["progress","Overview"],["lifts","Lifts"],["history","History"],["body","Body"]]);
 switch(tab){
  case "home":return viewHome();
  case "log":return viewLog();
  case "review":return viewSessionReview();
  case "summary":return viewSessionSummary();
  case "plan":return planNav+viewPlan();
  case "library":return planNav+viewLibrary();
  case "exercises":return planNav+viewExercises();
  case "progress":return progressNav+viewProgress();
  case "lifts":return progressNav+viewLifts();
  case "history":case "calendar":return progressNav+viewHistory();
  case "body":return progressNav+viewBody();
  case "more":return viewSettings();
  default:return `<nav class="subnav" aria-label="Settings views"><button data-destination="more">${icon('back')} Settings</button></nav>${viewData()}`;
 }
}
function render(){
  document.querySelectorAll("nav.tabs button").forEach(b => b.setAttribute("aria-current", b.dataset.tab === (TAB_FOR[S.tab] || S.tab) ? "page" : "false"));
  const active = document.activeElement, key = active && active.dataset ? active.dataset.key : null;
  const mapFocus = S.tab==="progress" && active?.matches?.(".muscle-map [data-muscle]") ? {muscle:active.dataset.muscle,id:active.id} : null;
  const selStart = key && "selectionStart" in active ? active.selectionStart : null;
  // Re-rendering replaces dialog content; return focus to the same control afterwards.
  const dialogControl = active?.closest?.(".sheet,[data-rest-overlay]") && active.dataset?.act ? `[data-act="${CSS.escape(active.dataset.act)}"]`+["type","g","i","j","kind","direction","u","seconds"].filter(k=>active.dataset[k]!=null).map(k=>`[data-${k}="${CSS.escape(active.dataset[k])}"]`).join("") : null;
  const app = $("#app");
  if (!S.ready) { app.innerHTML = `<div class="empty">Loading your log…</div>`; return; }
  const modal=!!(sheet||restOverlayOpen),root=document.documentElement;
  const intro=["log","review","summary"].includes(S.tab)?"":`<div class="page-intro"><div>${S.tab==="home"?`<p class="eyebrow">${esc(new Date().toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"}))}</p>`:""}<h1>${esc(TITLES[S.tab]||"Today")}</h1></div></div>`;
  const restDraft=restOverlayOpen?timerContext().draft:null;
  // Build the complete view before applying full-screen navigation styles. If
  // a render fails, the previous screen and its navigation remain available.
  app.innerHTML=`<div class="view view-${S.tab}"${modal?' inert aria-hidden="true"':''}>${intro}${viewFor(S.tab)}${resumeBar()}</div>${sheetMarkup()}${restDraft?restOverlayMarkup(restDraft):""}`;
  if(root){root.dataset.view=S.tab;if(modal)root.dataset.modal="true";else delete root.dataset.modal;}
  document.querySelector("header.top")?.toggleAttribute?.("inert",modal);
  updateSessionMeter();
  applyExerciseFilter();
  if (key) { const el = app.querySelector(`[data-key="${CSS.escape(key)}"]`); if (el) { el.focus({preventScroll:true}); try { if (selStart != null) el.setSelectionRange(selStart, selStart); } catch {} } }
  if(dialogControl)app.querySelector(`.sheet ${dialogControl},[data-rest-overlay] ${dialogControl}`)?.focus({preventScroll:true});
  if(mapFocus){const el=[...app.querySelectorAll(".muscle-map [data-muscle]")].find(x=>x.id===mapFocus.id&&x.dataset.muscle===mapFocus.muscle)||[...app.querySelectorAll(".muscle-map [data-muscle]")].find(x=>x.dataset.muscle===mapFocus.muscle);el?.focus({preventScroll:true});}
}

function timerLabel(seconds){const n=Math.max(0,seconds);return String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");}
let restOverlayOpen=false;
// Contain keyboard focus in the open sheet or rest dialog and restore it on dismissal.
document.addEventListener("keydown",e=>{
 const dialog=restOverlayOpen?document.querySelector("[data-rest-overlay]"):sheet?document.querySelector(".sheet"):null;
 if(!dialog)return;
 if(e.key==="Escape"){
  e.preventDefault();e.stopPropagation();
  if(restOverlayOpen){restOverlayOpen=false;render();document.querySelector("[data-act=timeropen]")?.focus({preventScroll:true});}
  else closeSheet();
  return;
 }
 if(e.key!=="Tab")return;
 const controls=[...dialog.querySelectorAll('button:not([disabled]):not([tabindex="-1"]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')].filter(x=>x.getClientRects().length);
 if(!controls.length)return;
 const first=controls[0],last=controls[controls.length-1];
 if(e.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){e.preventDefault();last.focus();}
 else if(!e.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){e.preventDefault();first.focus();}
},true);
function openSheet(next,opener){
 sheet=next;restOverlayOpen=false;
 sheetReturn=opener?.dataset?`[data-act="${CSS.escape(opener.dataset.act)}"]`+["sheet","g","i","j","id"].filter(k=>opener.dataset[k]!=null).map(k=>`[data-${k}="${CSS.escape(opener.dataset[k])}"]`).join(""):null;
 render();
 const panel=document.querySelector(".sheet");
 (panel?.querySelector("[data-autofocus]")||panel?.querySelector('button:not([disabled]):not([tabindex="-1"]),input,select,textarea'))?.focus({preventScroll:true});
}
function closeSheet(){
 if(!sheet)return;
 sheet=null;render();
 if(sheetReturn)document.querySelector(sheetReturn)?.focus({preventScroll:true});
}
function restOverlayMarkup(d){
 const rest=d.restTimer,remaining=timerTools.remaining(rest),paused=rest?.pausedRemainingMs!=null;
 return `<div class="rest-overlay" role="dialog" aria-modal="true" aria-label="Rest timer" aria-describedby="rest-timer-instructions" data-rest-overlay>
 <div class="rest-overlay__card"><button type="button" class="icon-btn rest-overlay__close" data-act="timerclose" aria-label="Close rest timer">${icon('close')}</button>
 <p class="eyebrow">Recover and reset</p><h2 class="display-title">Rest</h2>
 <strong class="rest-overlay__count" data-timer="overlay-rest" role="timer" aria-label="Remaining rest time">${rest?timerLabel(remaining):"00:00"}</strong>
 <span class="rest-overlay__state" data-rest-state>${!rest?"Timer is not running":remaining===0?"Rest complete":paused?"Paused":"Time to recover"}</span>
 <p class="muted" id="rest-timer-instructions">Your countdown stays accurate when the app is in the background.</p>
 <div class="rest-overlay__adjust" role="group" aria-label="Adjust rest duration">
 <button type="button" class="btn" data-act="timeradjust" data-seconds="-15" ${!rest?"disabled":""}>−15 sec</button>
 <button type="button" class="btn" data-act="timeradjust" data-seconds="15" ${!rest?"disabled":""}>+15 sec</button></div>
 <div class="rest-overlay__buttons" role="group" aria-label="Rest timer controls">
 <button type="button" class="btn primary" data-act="${paused?"timerresume":"timerpause"}" ${!rest?"disabled":""}>${paused?"Resume rest":"Pause rest"}</button>
 <button type="button" class="btn" data-act="timerskip" ${!rest?"disabled":""}>Skip rest</button></div>
 </div></div>`;
}
function timerContext(){
 const valid=id=>id&&getDay(id)&&S.drafts[id];
 if(valid(timerWorkoutId)&&S.drafts[timerWorkoutId].workoutTimer?.state==="idle"&&!S.drafts[timerWorkoutId].restTimer&&S.tab==="log"&&getDay(S.dayId))timerWorkoutId=S.dayId;
 if(!valid(timerWorkoutId)||(S.drafts[timerWorkoutId].workoutTimer?.state==="idle"&&activeWorkoutId()&&activeWorkoutId()!==timerWorkoutId)){
  timerWorkoutId=Object.keys(S.drafts).find(id=>valid(id)&&(S.drafts[id].workoutTimer?.state==="running"||S.drafts[id].restTimer))
   ||Object.keys(S.drafts).find(id=>valid(id)&&S.drafts[id].workoutTimer?.state==="paused")
   ||S.dayId||nextDayId();
 }
 return {id:timerWorkoutId,draft:getDraft(timerWorkoutId)};
}
function startWorkoutFor(id){
 for(const [otherId,other] of Object.entries(S.drafts)){
  if(otherId===id)continue;
  if(other.workoutTimer?.state==="running")other.workoutTimer=timerTools.pauseWorkout(other.workoutTimer);
  if(other.restTimer?.pausedRemainingMs==null&&other.restTimer)other.restTimer=timerTools.pause(other.restTimer);
 }
 const d=getDraft(id);
 if(d.workoutTimer.state==="idle"&&!draftHasData(d))d.date=today();
 d.workoutTimer=timerTools.startWorkout(d.workoutTimer);
 if(d.restTimer?.pausedRemainingMs!=null)d.restTimer=timerTools.resume(d.restTimer);
 timerWorkoutId=id;saveDrafts();
}
// A minimized workout stays one tap away on every other screen.
function resumeBar(){
 if(["home","log","review","summary"].includes(S.tab))return "";
 const id=activeWorkoutId();if(!id)return "";
 const d=getDraft(id),day=getDay(id),{done,total}=draftProgress(d);
 return `<button type="button" class="resume-bar" data-act="homecontinue" data-id="${esc(id)}" aria-label="Resume ${esc(day.name)}"><span class="live-dot" aria-hidden="true"></span><span class="resume-bar__name"><b>${esc(day.name)}</b> · ${done}/${total} sets</span><strong data-timer="workout">${timerLabel(timerTools.workoutElapsed(d.workoutTimer))}</strong><span class="resume-bar__cta">Resume</span></button>`;
}
function restBar(d){
 const rest=d.restTimer;if(!rest||restOverlayOpen)return "";
 const remaining=timerTools.remaining(rest),paused=rest.pausedRemainingMs!=null;
 const width=rest.durationSeconds?Math.min(100,Math.round(remaining/rest.durationSeconds*100)):0;
 return `<section class="rest-bar ${paused?"is-paused":""}" aria-label="Rest timer"><span class="rest-bar__track" aria-hidden="true"><span data-rest-progress style="width:${width}%"></span></span><button type="button" class="rest-bar__main" data-act="timeropen" aria-label="Open rest timer"><span><span class="eyebrow">${paused?"Rest paused":"Rest"}</span><small>Next: ${esc(nextSetLabel(d))}</small></span><strong data-timer="rest" role="timer">${remaining>0?timerLabel(remaining):"Done"}</strong></button><div class="rest-bar__actions"><button type="button" class="btn" data-act="timeradjust" data-seconds="-15" aria-label="Subtract 15 seconds">−15s</button><button type="button" class="btn" data-act="timeradjust" data-seconds="15" aria-label="Add 15 seconds">+15s</button><button type="button" class="btn light" data-act="timerskip">Skip rest</button></div></section>`;
}
function updateTimers(){
 if(!S.ready||(!activeWorkoutId()&&S.tab!=="log"))return;
 const {draft:d}=timerContext(),rest=d.restTimer;
 const restText=!rest?"—":timerTools.remaining(rest)>0?timerLabel(timerTools.remaining(rest)):"Done";
 const restState=document.querySelector('[data-rest-state]');
 if(restState){const text=!rest?"Timer is not running":timerTools.remaining(rest)===0?"Rest complete":rest.pausedRemainingMs!=null?"Paused":"Time to recover";if(restState.textContent!==text)restState.textContent=text;}
 const track=document.querySelector('[data-rest-progress]');
 if(track&&rest?.durationSeconds)track.style.width=Math.min(100,Math.round(timerTools.remaining(rest)/rest.durationSeconds*100))+"%";
 for(const el of document.querySelectorAll('[data-timer]')){
  const key=el.dataset.timer;
  const value=key==="workout"||key==="workout-panel"?timerLabel(timerTools.workoutElapsed(d.workoutTimer))
   :key==="rest"?restText:key==="overlay-rest"?rest?timerLabel(timerTools.remaining(rest)):"00:00":null;
  if(value!=null&&el.textContent!==value)el.textContent=value;
 }
}
if(typeof setInterval === 'function')timerTicker=setInterval(updateTimers,1000);
document.addEventListener("visibilitychange",updateTimers);
const SET_TYPE_BADGE={warmup:"W",drop:"D","reverse-drop":"R"};
function setRows(i, prefix, name, sets, last, lo, hi, unit){
  return sets.map((s, j) => {
    const ph = last && last.sets[j] ? { w: tidy(conv(last.sets[j].w ?? 0, last.unit, unit), unit), r: last.sets[j].r } : null;
    const badge = SET_TYPE_BADGE[s.type] || (s.toFailure ? "F" : "");
    return `<div class="setrow workout-set-row ${s.completed===true?"is-complete":""}" role="group" aria-label="${esc(name)} set ${j+1}"><span class="setrow__label">${j+1}${badge?`<small class="set-badge" title="${esc(s.type||"to failure")}">${badge}</small>`:""}</span>
      <input type="text" inputmode="decimal" autocomplete="off" aria-label="${esc(name)} set ${j+1} weight in ${unit === "kg" ? "kilograms" : "pounds"}" data-f="w" data-g="${prefix}" data-i="${i}" data-j="${j}" data-key="${prefix}w-${i}-${j}" value="${esc(s.w)}" placeholder="${ph ? esc(ph.w) : unit}">
      <input type="number" inputmode="numeric" step="1" min="0" aria-label="${esc(name)} set ${j+1} reps" data-f="r" data-g="${prefix}" data-i="${i}" data-j="${j}" data-key="${prefix}r-${i}-${j}" value="${esc(s.r)}" placeholder="${ph ? esc(ph.r ?? "") : (lo ? lo+"–"+hi : "reps")}">
      <button type="button" class="set-complete" data-act="completeset" data-g="${prefix}" data-i="${i}" data-j="${j}" aria-label="${esc(name)} set ${j+1} ${s.completed===true ? "mark incomplete" : "mark complete"}" aria-pressed="${s.completed===true}" title="${s.completed===true?"Mark set incomplete":"Complete set and start rest timer"}">${icon('check')}</button>
      <button type="button" class="set-more" data-act="opensheet" data-sheet="set" data-g="${prefix}" data-i="${i}" data-j="${j}" aria-label="${esc(name)} set ${j+1} options">${icon('moreV')}</button>
    </div>`; }).join("");
}
function lastBlock(name, e, unit){
  const last = lastFor(name);
  if (!last || !name) return { last:null, html:`<p class="last workout-previous">No history yet. Start light and focus on form.</p>` };
  return { last, html:`<p class="last workout-previous" aria-label="Previous performance"><span class="eyebrow">Last time · ${esc(fmtDate(last.date))}</span> <span>${last.sets.map(s => `${esc(s.w ?? 0)}&thinsp;×&thinsp;${esc(s.r)}`).join(" · ")} ${esc(last.unit)}</span>${last.unit !== unit ? ` <small>(placeholders converted to ${unit})</small>` : ""}</p>` };
}

function exerciseDefaultControls(e,i,group,d){
 const key=settingKey(e,i,group),saved=settingFor(e,i,group);
 const inc=e.loadIncrement??saved.loadIncrement??"",unit=e.incrementUnit||saved.incrementUnit||e.unit||"kg";
 const converted=inc!==""?convertIncrement(Number(inc),unit,e.unit||unit):null;
 const unitLabel=converted==null?"":`≈ ${converted} ${esc(e.unit||unit)}`;
 return `<div class="exercise-default-controls"><label class="field-label">Rest (sec)<input type="number" min="15" max="600" step="5" data-f="exrest" data-g="${group}" data-i="${i}" data-key="exrest-${group}-${i}" value="${e.restSeconds??saved.restSeconds??d.restSeconds}"></label><label class="field-label">Load increment<input type="number" min="0.1" max="100" step="0.1" data-f="increment" data-g="${group}" data-i="${i}" data-key="increment-${group}-${i}" aria-label="${esc(e.name)} load increment" value="${esc(inc)}"></label><label class="field-label">Increment unit<select data-act="incrementunit" data-g="${group}" data-i="${i}" aria-label="${esc(e.name)} increment unit"><option value="kg" ${unit==="kg"?"selected":""}>kg</option><option value="lb" ${unit==="lb"?"selected":""}>lb</option></select></label><span class="muted" aria-label="Converted load increment">${unitLabel}</span><div class="row-actions"><button type="button" class="btn small" data-act="savedefault" data-g="${group}" data-i="${i}">Save default</button><button type="button" class="btn small ghost" data-act="resetdefault" data-g="${group}" data-i="${i}">Reset default</button></div></div>`;
}
function suggestionFor(e,definition){
 const settings=S.exerciseDefaults?.[exerciseKey(e.name,e.exerciseId)]||{};
 return recommendProgression({sessions:S.sessions,exerciseName:e.name,exerciseId:e.exerciseId,minimum:definition?.lo||6,maximum:definition?.hi||12,unit:e.unit||"lb",increment:settings.loadIncrement||2.5,incrementUnit:settings.incrementUnit||e.unit||"lb",enabled:S.progressionEnabled!==false,assisted:isAssisted(e.name)});
}
const isAssisted=name=>resolveExerciseMetadata(name)?.equipment==="assisted";
// The single weight suggestion per exercise; it never edits the draft unless the user taps Fill.
function progressionHint(e,definition,group="",i=0){
 const result=suggestionFor(e,definition);
 const title=result.weight==null?"No load suggestion":(result.kind==="increase"?"Try ":"Stay at ")+result.weight+" "+result.unit+(isAssisted(e.name)?" assistance":"");
 const fillable=result.weight!=null&&e.sets.some(s=>s.completed!==true&&String(s.w??"").trim()==="");
 return `<div class="progression-hint suggestion kind-${esc(result.kind)}" role="status">${icon('trend')}<span><strong>${esc(title)}</strong><small>${esc(result.reason)}</small></span>${fillable?`<button type="button" class="btn small" data-act="applysuggestion" data-g="${group}" data-i="${i}" aria-label="Fill ${esc(result.weight+" "+result.unit)} into empty ${esc(e.name)} sets">Fill</button>`:""}</div>`;
}
let exerciseQuery="";
function exerciseNameSuggestions(){
 const names=[...new Set(allDays().flatMap(day=>(day.ex||[]).flatMap(e=>[e.n,...(e.alt||[])]).filter(Boolean)))].sort((a,b)=>a.localeCompare(b));
 return `<datalist id="exercise-name-suggestions">${names.map(n=>`<option value="${esc(n)}"></option>`).join("")}</datalist>`;
}
function exerciseSearchBox(){
 return `<div class="exercise-search-panel" role="search" aria-label="Find an exercise"><label class="search-field" for="exercise-search">${icon('search')}<span class="sr-only">Search exercises</span>
 <input id="exercise-search" type="search" data-exercise-search aria-describedby="exercise-search-count" placeholder="Search exercises" value="${esc(exerciseQuery)}" autocomplete="off"></label>
 <button class="btn small ghost" type="button" data-act="clearexercisesearch">Clear search</button>
 <p id="exercise-search-count" class="muted" data-exercise-search-count role="status" aria-live="polite"></p>
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
 if(count){count.textContent=shown+' of '+items.length+' exercises shown';count.hidden=!needle;}
 const clear=document.querySelector('[data-act=clearexercisesearch]');if(clear)clear.hidden=!needle;
 const empty=document.querySelector('[data-exercise-search-empty]');
 if(empty)empty.hidden=shown!==0;
}
function exerciseActivationInfo(name){
 const metadata=resolveExerciseMetadata(name);
 return `<details class="exercise-activation"><summary>Muscles worked</summary>${renderExerciseMusclePreview(metadata)}</details>`;
}
function muscleSummary(name){
 const m=resolveExerciseMetadata(name);
 return m?[m.primaryMuscle,...(m.secondaryMuscles||[]).slice(0,1)].filter(Boolean).map(capitalize).join(", "):"";
}
const workoutExpanded = new Set();

/* ---------- bottom sheets ---------- */
function sheetHead(eyebrow,title,meta=""){
 return `<header class="sheet-head"><div><p class="eyebrow">${eyebrow}</p><h2 id="sheet-title" class="display-title">${title}</h2></div>${meta?`<p class="sheet-meta">${meta}</p>`:""}</header>`;
}
function swapSheet(){
 const next=nextSlot(),active=activeWorkoutId();
 return `${sheetHead("Choose a workout","Train instead")}<ul class="pick-list">${allDays().map(w=>`<li><button class="pick type-${esc(w.type)} ${w.id===next?"is-next":""}" data-act="homestart" data-id="${esc(w.id)}"><span class="stripe" aria-hidden="true"></span><span><strong>${esc(w.name)}</strong><small>${w.ex.length} exercises · ${w.ex.reduce((n,e)=>n+e.s,0)} sets${esc(lastDoneLabel(w.id))}</small></span>${w.id===active?'<span class="eyebrow accent">In progress</span>':w.id===next?'<span class="eyebrow accent">Up next</span>':""}</button></li>`).join("")}</ul>
 <p class="muted">Logging a different workout keeps your schedule where it is.</p><div class="row-actions two"><button class="btn ghost" data-act="homecreate">${icon('plus')} New workout</button><button class="btn ghost" data-destination="library">Manage workouts</button></div>`;
}
function weightSheet(){
 const last=sortBody(S.body).filter(b=>num(b.weight)>0).at(-1),unit=S.bodyUnit||last?.unit||"kg";
 return `${sheetHead("Quick log","Body weight",last?`Last ${esc(last.weight)} ${esc(last.unit||DEFAULT_UNIT)} · ${esc(fmtDate(last.date))}`:"")}<div class="weight-entry"><label class="sr-only" for="bWeight">Weight</label><input type="text" inputmode="decimal" autocomplete="off" id="bWeight" data-autofocus placeholder="${unit==="kg"?"80":"175"}"><select id="bUnit" aria-label="Body weight unit">${["kg","lb"].map(u=>`<option ${u===unit?"selected":""}>${u}</option>`).join("")}</select></div>
 <div class="sheet-grid"><label class="field-label">Date<input type="date" id="bDate" value="${today()}"></label><label class="field-label">Waist cm (optional)<input type="text" inputmode="decimal" autocomplete="off" id="bWaist" placeholder="—"></label></div>
 <div class="sheet-actions"><button class="btn primary" data-act="addbody">Add entry</button></div><button class="link-btn" data-destination="body">See your trend in Progress →</button>`;
}
function sessionSheet(){
 const day=getDay(S.dayId),d=getDraft(S.dayId),clock=d.workoutTimer;
 const startAction=clock.state==="running"?"clockpause":"clockstart";
 const startLabel=clock.state==="running"?"Pause workout":clock.state==="paused"?"Resume workout":clock.state==="stopped"?"Restart workout timer":"Start workout timer";
 return `${sheetHead("Session options",esc(day.name),`<span>${clockState(clock)}</span> <strong data-timer="workout-panel">${timerLabel(timerTools.workoutElapsed(clock))}</strong>`)}
 <div class="sheet-group"><p class="eyebrow">Workout timer</p><div class="row-actions"><button type="button" class="btn" data-act="${startAction}">${startLabel}</button><button type="button" class="btn" data-act="clockstop" ${clock.state==="idle"||clock.state==="stopped"?"disabled":""}>Stop timer</button><button type="button" class="btn ghost" data-act="clockreset">Reset timer</button></div><p class="muted">Stopping the timer keeps your workout draft.</p></div>
 <div class="sheet-group"><p class="eyebrow">Rest</p><div class="sheet-grid"><label class="field-label">Rest duration<select data-act="restpreset" aria-label="Rest duration">${[...new Set([30,60,90,120,180,240,300,d.restSeconds])].sort((a,b)=>a-b).map(n=>`<option value="${n}" ${d.restSeconds===n?"selected":""}>${n} seconds</option>`).join("")}</select></label><button type="button" class="btn" data-act="reststart">Start rest</button></div>
 <details class="training-rest"><summary>Rest between exercises &amp; supersets</summary>${[["betweenExercisesRest","Between exercises",120],["supersetTransitionRest","Between superset exercises",0],["supersetRoundRest","After a superset round",90]].map(([key,label,fallback])=>`<label class="field-label">${label} (seconds)<input type="number" min="0" max="600" data-f="${key}" data-key="${key}" value="${d[key]??fallback}"></label>`).join("")}<p class="muted">Pair adjacent exercises in their options. A set-specific rest overrides these defaults. Zero means no timer.</p></details></div>
 <div class="sheet-group"><label class="field-label session-date">Session date<input type="date" data-f="date" data-key="date" value="${esc(d.date)}"></label><label class="field-label" for="notes">Notes</label><textarea id="notes" data-f="notes" data-key="notes" rows="2" placeholder="Energy, sleep, a new personal best…">${esc(d.notes)}</textarea></div>
 <div class="sheet-actions"><button type="button" class="btn primary" data-act="closesheet">Done</button></div>`;
}
function exerciseSheet(g,i){
 const d=getDraft(S.dayId),e=(g==="x"?d.extra:d.ex)[i];if(!e)return "";
 const definition=g==="x"?null:getDay(S.dayId)?.ex.find(def=>{
    const savedId=resolveExerciseIdentity(e.name,e.exerciseId),currentId=resolveExerciseIdentity(def.n,def.exerciseId);
    return (savedId&&currentId===savedId)||e.name===def.n||(def.alt||[]).includes(e.name);
  }),options=definition?.alt?.length?[definition.n,...definition.alt]:null;
 return `${sheetHead("Exercise options",esc(e.name||"Extra exercise"))}
 ${options?`<label class="field-label exercise-substitution">Swap exercise<select aria-label="Exercise or alternative" data-act="variant" data-i="${i}">${options.map(o=>`<option ${o===e.name?"selected":""}>${esc(o)}</option>`).join("")}</select></label>`:""}
 <div class="sheet-group"><p class="eyebrow">Weight unit</p>${unitSeg(g,i,e.unit)}</div>
 ${g!=="x"&&i<d.ex.length-1?`<label class="toggle-row"><span>Superset with ${esc(d.ex[i+1].name)}</span><input type="checkbox" data-act="supersetpair" data-i="${i}" ${e.supersetNext?"checked":""}></label>`:""}
 <div class="sheet-group"><p class="eyebrow">Defaults for this exercise</p>${exerciseDefaultControls(e,i,g,d)}</div>
 ${e.name.trim()?exerciseActivationInfo(e.name):""}
 <div class="sheet-actions">${g==="x"?`<button type="button" class="btn danger" data-act="rmextra" data-i="${i}">Remove exercise</button>`:""}<button type="button" class="btn primary" data-act="closesheet">Done</button></div>`;
}
function setSheet(g,i,j){
 const d=getDraft(S.dayId),e=(g==="x"?d.extra:d.ex)[i],s=e?.sets[j];if(!s)return "";
 const name=e.name||"Extra exercise",previous=lastFor(e.name),prior=previous?.sets[j];
 const ph=prior?{w:tidy(conv(prior.w??0,previous.unit,e.unit),e.unit),r:prior.r}:null;
 const saved=settingFor(e,i,g),amount=Number(e.loadIncrement||saved.loadIncrement)||(e.unit==="kg"?2.5:5);
 const step=Math.round(convertIncrement(amount,e.incrementUnit||saved.incrementUnit||e.unit,e.unit)*100)/100;
 const at=`data-g="${g}" data-i="${i}" data-j="${j}"`;
 return `${sheetHead(esc(name),`Set ${j+1}`,`${esc(String(s.w??"").trim()||"—")} ${esc(e.unit)} × ${esc(String(s.r??"").trim()||"—")}`)}
 <div class="sheet-group"><p class="eyebrow" id="set-type-label">Set type</p><div class="seg" role="group" aria-labelledby="set-type-label">${[["working","Working"],["warmup","Warm-up"],["drop","Drop"],["reverse-drop","Rev. drop"]].map(([t,l])=>`<button type="button" data-act="settype" data-type="${t}" ${at} aria-pressed="${(s.type||"working")===t}">${l}</button>`).join("")}</div></div>
 <div class="sheet-grid"><label class="field-label">Reps in reserve<input type="number" min="0" max="10" step="1" inputmode="numeric" aria-label="${esc(name)} set ${j+1} RIR" data-f="rir" ${at} data-key="rir-${g}-${i}-${j}" value="${s.rir??""}" placeholder="—"></label><label class="field-label">Rest after (sec)<input type="number" min="0" max="600" step="5" data-f="setrest" ${at} data-key="setrest-${g}-${i}-${j}" value="${s.restSeconds??""}" placeholder="Default"></label></div>
 <div class="sheet-group"><p class="eyebrow">Weight</p><div class="row-actions"><button type="button" class="btn" data-act="adjustweight" ${at} data-direction="-1" aria-label="Decrease ${esc(name)} set ${j+1} weight" ${s.completed?"disabled":""}>− ${step}</button><button type="button" class="btn" data-act="adjustweight" ${at} data-direction="1" aria-label="Increase ${esc(name)} set ${j+1} weight" ${s.completed?"disabled":""}>+ ${step}</button>${ph?`<button type="button" class="btn ghost" data-act="uselastset" ${at} aria-label="Use previous ${esc(name)} set ${j+1}" ${s.completed?"disabled":""}>Use last: ${esc(ph.w)} ${esc(e.unit)} × ${esc(ph.r)}</button>`:""}</div></div>
 <label class="toggle-row"><span>Taken to failure</span><input type="checkbox" data-act="setfailure" ${at} ${s.toFailure?"checked":""}></label>
 <div class="row-actions two"><button type="button" class="btn ghost" data-act="chainset" data-kind="drop" ${at}>+ Drop set</button><button type="button" class="btn ghost" data-act="chainset" data-kind="reverse-drop" ${at}>+ Reverse drop</button></div>
 <div class="sheet-actions"><button type="button" class="btn danger" data-act="rmsetat" ${at} ${e.sets.length<2?"disabled":""}>Remove set</button><button type="button" class="btn primary" data-act="closesheet">Done</button></div>`;
}
function sheetMarkup(s=sheet){
 if(!s||!S.ready)return "";
 const body=s.kind==="swap"?swapSheet():s.kind==="weight"?weightSheet():s.kind==="session"&&getDay(S.dayId)?sessionSheet():s.kind==="exercise"?exerciseSheet(s.g||"",+s.i):s.kind==="set"?setSheet(s.g||"",+s.i,+s.j):"";
 if(!body)return "";
 return `<div class="sheet-layer" data-sheet-layer><button type="button" class="sheet-backdrop" data-act="closesheet" tabindex="-1" aria-label="Close"></button><section class="sheet sheet-${esc(s.kind)}" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><span class="sheet-grabber" aria-hidden="true"></span>${body}</section></div>`;
}

function exerciseCard(d,e,i,isOpen,group="base"){
  const isExtra=group==="extra",de=isExtra?d.extra[i]:d.ex[i],g=isExtra?"x":"",id=(isExtra?"extra-":"base-")+i;
  const name=de.name||"",lb=lastBlock(name.trim(),e,de.unit),done=de.sets.filter(z=>z.completed===true).length,allDone=done===de.sets.length;
  const superset=!isExtra&&(de.supersetNext||d.ex[i-1]?.supersetNext)?" · Superset":"";
  const muscles=name.trim()?muscleSummary(name):"";
  const next=!isExtra&&i<d.ex.length-1?d.ex[i+1]:null;
  return `<details class="ex active-exercise focused-exercise ${allDone?"is-done":""}" data-exercise-id="${id}" ${isOpen?"open":""} data-exercise-search-item="${esc([name,...(e?[e.n,...(e.alt||[])]:[])].join(" "))}">
   <summary class="focused-exercise-summary">${exerciseThumbnail(name)}<span class="focused-exercise-summary-title">${esc(name||"Extra exercise")}<small>${done}/${de.sets.length} sets${e?` · ${e.lo}–${e.hi} reps`:""}${superset}</small></span>${allDone?`<span class="done-badge" role="img" aria-label="All sets done">${icon('check')}</span>`:`<span class="set-count" aria-hidden="true">${done}/${de.sets.length}</span>`}</summary>
   <div class="focused-exercise-body">
    <div class="exercise-head">${e?`<p class="target">Target <b>${e.s} × ${e.lo}–${e.hi}</b>${muscles?` · ${esc(muscles)}`:""}</p>`:isExtra?`<input type="text" class="ex-name" list="exercise-name-suggestions" aria-label="Extra exercise name" placeholder="Exercise name" data-f="xname" data-i="${i}" data-key="xname-${i}" value="${esc(name)}">`:`<p class="target">Saved exercise · not in the current template</p>`}<button type="button" class="icon-btn" data-act="opensheet" data-sheet="exercise" data-g="${g}" data-i="${i}" aria-label="Exercise options for ${esc(name||"extra exercise")}">${icon('more')}</button></div>
    ${name.trim()?lb.html+progressionHint(de,e,g,i):""}
    <div class="colhead workout-set-heading" aria-hidden="true"><span>Set</span><span>${esc(de.unit)}</span><span>Reps</span><span>Done</span><span></span></div>
    <div class="sets">${setRows(i, g, name||"Extra exercise", de.sets, lb.last, e?.lo, e?.hi, de.unit)}</div>
    <div class="row-actions two"><button class="btn small" data-act="addset" ${g?'data-g="x" ':''}data-i="${i}">${icon('plus')} Add set</button><button class="btn small" data-act="copyforward" ${g?'data-g="x" ':''}data-i="${i}">Copy last sets</button></div>
    ${next?`<button class="btn ghost next-exercise" data-act="nextexercise" data-i="${i+1}"><span><span class="muted">Next ·</span> ${esc(next.name)}</span>${icon('arrow')}</button>`:""}
    ${name.trim()?`<div class="exercise-media">${exercisePhotoDetail(name,true)}</div>`:""}
   </div></details>`;
}

function viewLog(){
  if (S.editing) return viewEditor();
  const day = getDay(S.dayId) || getDay(nextDayId());
  S.dayId = day.id;
  const d = getDraft(day.id), clock=d.workoutTimer, {done,total}=draftProgress(d);
  const firstOpen = Math.max(0,d.ex.findIndex(x=>x.sets.some(z=>!z.completed)));
  const isOpen=(id,i)=>workoutExpanded.size?workoutExpanded.has(id):id==="base-"+firstOpen;
  const startAction=clock.state==="running"?"clockpause":"clockstart";
  const clockLabel=clock.state==="running"?"Pause workout":clock.state==="paused"?"Resume workout":clock.state==="stopped"?"Restart workout timer":"Start workout timer";
  const definitionFor=de=>{
    const savedId=resolveExerciseIdentity(de.name,de.exerciseId);
    return day.ex.find(def=>{
      const currentId=resolveExerciseIdentity(def.n,def.exerciseId);
      return (savedId&&currentId===savedId)||de.name===def.n||(def.alt||[]).includes(de.name);
    })||null;
  };
  const cards=d.ex.map((de,i)=>exerciseCard(d,definitionFor(de),i,isOpen("base-"+i,i))).join("")+d.extra.map((x,i)=>exerciseCard(d,null,i,workoutExpanded.has("extra-"+i),"extra")).join("");
  const totalExercises=d.ex.length+d.extra.length;
  const position=Math.min(totalExercises,firstOpen+1);
  return `<header class="session-bar session-toolbar" aria-label="Session controls">
    <button type="button" class="icon-btn" data-act="minimize" aria-label="Minimize workout">${icon('down')}</button>
    <div class="page-intro session-title"><h1>${esc(day.name)}</h1><button type="button" class="session-clock state-${clock.state}" data-act="${startAction}" aria-label="${clockLabel}"><span class="clock-dot" aria-hidden="true"></span><strong data-timer="workout">${timerLabel(timerTools.workoutElapsed(clock))}</strong><span class="sr-only" data-clock-state>${clockState(clock)}</span></button></div>
    <button type="button" class="icon-btn" data-act="opensheet" data-sheet="session" aria-label="Session options">${icon('more')}</button>
    <button type="button" class="btn primary finish-btn" data-act="reviewworkout" aria-label="Finish workout">Finish</button>
    <div class="session-progress"><div><span>Exercise ${position} of ${totalExercises}</span><span><b id="loggedSets">${done}</b> / ${total} sets done</span></div><progress aria-label="Completed sets" max="${total||1}" value="${done}" data-session-meter></progress></div>
  </header>
  <p id="session-validation" class="notice warn" role="alert" hidden></p>
  <div class="workout-layout" id="workout-editor" tabindex="-1">
   ${Object.keys(S.drafts).some(k=>S.drafts[k]?.recoveryWarning)?`<p class="notice warn" role="status">Your saved draft may be from an earlier program. Export a backup before editing.</p>`:""}
   ${exerciseNameSuggestions()}${cards}
   <button class="btn add-exercise" data-act="addextra">${icon('plus')} Add an exercise</button>
   <div class="save-status"><p class="autosave-note" role="status" aria-live="polite" data-save-status data-state="${saveStatus}">${({pending:"Saving changes…",saved:"Draft saved on this device",error:"Not saved — storage failed",conflict:"Not saved — another tab changed data"})[saveStatus]}</p><div data-save-recovery ${saveStatus==="error"||saveStatus==="conflict"?"":"hidden"}><p class="muted">Your unsaved draft is still available in this tab. Export a backup before reloading.</p><div class="row-actions"><button class="btn small" data-act="recoverbackup">Export unsaved backup</button><button class="btn small ghost" data-act="reloadconflict">Reload stored data</button></div></div></div>
  </div>${restBar(d)}`;
}

function viewEditor(){
  const w = S.editing, isNew = !S.custom.some(c => c.id === w.id);
  const colors = TYPES.map(([t,label]) => `<label class="choice"><input type="radio" name="edtype" data-ed="type" value="${t}" ${w.type===t?"checked":""}><span class="swatch type-${t}" aria-hidden="true"></span>${label}</label>`).join("");
  const rows = w.ex.map((e, i) => `<div class="edrow" data-exercise-search-item="${esc(e.n)}">
      <input type="text" aria-label="Exercise ${i+1} name" list="exercise-name-suggestions" placeholder="Exercise name" data-ef="n" data-i="${i}" data-key="ed-n-${i}" value="${esc(e.n)}">
      <input type="number" inputmode="numeric" min="1" max="10" aria-label="Sets" data-ef="s" data-i="${i}" data-key="ed-s-${i}" value="${esc(e.s)}">
      <input type="number" inputmode="numeric" min="1" max="50" aria-label="Minimum reps" data-ef="lo" data-i="${i}" data-key="ed-lo-${i}" value="${esc(e.lo)}">
      <input type="number" inputmode="numeric" min="1" max="50" aria-label="Maximum reps" data-ef="hi" data-i="${i}" data-key="ed-hi-${i}" value="${esc(e.hi)}">
      <button class="icon-btn" data-act="edrmex" data-i="${i}" aria-label="Remove exercise ${i+1}">${icon('close')}</button>
    </div>`).join("");
  return `<div class="section workout-editor">
    <h2 class="display-title">${isNew ? "New workout" : "Edit workout"}</h2>
    <label class="field-label">Name
      <input type="text" data-ed="name" data-key="ed-name" placeholder="e.g. Arms + abs, Upper body, Home workout" value="${esc(w.name)}"></label>
    <p class="eyebrow">Workout category</p>
    <div class="colors" role="radiogroup" aria-label="Workout category">${colors}</div>
    <p class="eyebrow">Default weight unit</p>
    <div class="colors" role="radiogroup" aria-label="Default weight unit">${["lb","kg"].map(u => `<label class="choice"><input type="radio" name="edunit" data-ed="unit" value="${u}" ${(w.unit||DEFAULT_UNIT)===u?"checked":""}>${u}</label>`).join("")}</div>
    ${exerciseSearchBox()}${exerciseNameSuggestions()}<div class="edhead" aria-hidden="true"><span>Exercise</span><span>Sets</span><span>Min</span><span>Max</span><span></span></div>
    ${rows}
    <div class="row-actions"><button class="btn small" data-act="edaddex">${icon('plus')} Add exercise</button></div>
    <p class="muted">Add this workout to any repeating or weekly schedule using Manage schedules.</p>
    <div class="stack editor-actions">
      <button class="btn primary" data-act="edsave">Save workout</button>
      <button class="btn" data-act="edcancel">Cancel</button>
      ${isNew ? "" : `<button class="btn danger" data-act="eddelete">${S.armedDelete===w.id ? "Tap again to delete this workout" : "Delete workout"}</button>`}
    </div></div>`;
}

function viewSavedSessionEdit(){
 const s=savedSessionEdit;
 if(!s)return '';
 return `<div class="section stack session-editor" aria-label="Edit saved session"><h2 class="display-title">Edit saved session</h2>
 <p class="muted">Changes are not saved until you confirm. Your schedule will not advance.</p>
 <label class="field-label">Date <input aria-label="Saved session date" type="date" data-history-field="date" value="${esc(s.date)}"></label>
 <label class="field-label">Notes <textarea aria-label="Saved session notes" data-history-field="notes">${esc(s.notes||"")}</textarea></label>
 ${s.exercises.map((ex,i)=>`<fieldset><legend>${esc(ex.name)} (${esc(ex.unit||s.unit||DEFAULT_UNIT)})</legend>
 ${(ex.sets||[]).map((set,j)=>`<div class="edit-set-row"><label class="field-label">Weight <input aria-label="${esc(ex.name)} set ${j+1} weight" type="text" inputmode="decimal" autocomplete="off" data-history-set="w" data-i="${i}" data-j="${j}" value="${esc(set.w??0)}"></label>
 <label class="field-label">Reps <input aria-label="${esc(ex.name)} set ${j+1} reps" type="number" min="1" step="1" data-history-set="r" data-i="${i}" data-j="${j}" value="${esc(set.r??0)}"></label>
 <button class="btn small ghost" data-act="historyrmset" data-i="${i}" data-j="${j}">Remove set ${j+1}</button></div>`).join("")}
 <button class="btn small" data-act="historyaddset" data-i="${i}">Add set to ${esc(ex.name)}</button></fieldset>`).join("")}
 <div class="row-actions two"><button class="btn primary" data-act="historysave">Save changes</button><button class="btn" data-act="historycancel">Cancel</button></div></div>`;
}
function viewCalendar(){
 const month=calendarMonth||today().slice(0,7),period=calendarPeriod(month);
 const first=Date.parse(period.from+"T12:00:00Z");
 const offset=(new Date(first).getUTCDay()+6)%7;
 const start=new Date(first-offset*86400000).toISOString().slice(0,10);
 const finish=new Date(Date.parse(period.to+"T12:00:00Z")+(6-(new Date(period.to+"T12:00:00Z").getUTCDay()+6)%7)*86400000).toISOString().slice(0,10);
 const days=calendarDays(start,finish,S.sessions,S.calendarEvents,activeSchedule());
 const monthDays=days.filter(d=>d.date.slice(0,7)===month);
 const stats=calendarAdherence(monthDays);
 const label=new Date(month+"-01T12:00:00Z").toLocaleDateString(undefined,{month:"long",year:"numeric",timeZone:"UTC"});
 const activeDays=calendarMode==="week" ? days.slice(calendarWeekOffset*7,calendarWeekOffset*7+7) : days;
 const cards=activeDays.map(d=>{
  const kind=d.sessions[0]?(getDay(d.sessions[0].dayId)?.type||d.sessions[0].type||"other"):"";
  return `<button type="button" class="calendar-day ${d.date.slice(0,7)===month?"":"outside"} state-${esc(d.type)} ${d.date===today()?"is-today":""}" data-act="calendarday" data-date="${d.date}" data-calendar-date="${d.date}" aria-pressed="${d.date===calendarSelected}" aria-label="${esc(d.date)} ${esc(d.type)}">
  <span class="calendar-number">${Number(d.date.slice(-2))}</span><span class="calendar-state">${d.type==="none"?"":esc(d.type)}</span>${d.sessions.length?`<span class="calendar-mark type-${esc(kind)}" aria-hidden="true"></span><small class="sr-only">${d.sessions.length} session${d.sessions.length===1?"":"s"}</small>`:""}</button>`;
 }).join("");
 const selected=calendarSelected&&days.find(d=>d.date===calendarSelected);
 const detail=selected?`<section class="section calendar-detail" aria-live="polite"><p class="eyebrow">${esc(fmtDate(selected.date))} · ${esc(selected.type==="none"?"nothing logged":selected.type)}</p>${selected.sessions.length?selected.sessions.map(s=>`<div class="calendar-session"><div><h3 class="display-title">${esc(s.dayName)}</h3><p class="muted">${(s.exercises||[]).reduce((n,e)=>n+(e.sets||[]).length,0)} sets · ${(s.exercises||[]).slice(0,3).map(e=>esc(e.name)).join(" · ")}</p></div><button class="btn small" data-act="opensession" data-id="${esc(s.id)}">Open session</button></div>`).join(""):`<p class="muted">${selected.type==="planned"?"A workout is planned for this day.":selected.type==="rest"?"Planned rest day.":"No session logged."}</p>`}</section>`:"";
 return `<section class="section training-calendar" aria-label="Training calendar"><div class="calendar-toolbar"><h2>${esc(label)}</h2><div class="row-actions">
   <button class="icon-btn" data-act="calendarprev" aria-label="Previous month">${icon('back')}</button>
   <button class="btn small ghost" data-act="calendartoday">Today</button>
   <button class="icon-btn" data-act="calendarnext" aria-label="Next month">${icon('next')}</button>
  </div></div>
  <div class="calendar-toolbar"><label class="inline-field">View <select data-calendar-mode aria-label="Calendar view"><option value="month" ${calendarMode==="month"?"selected":""}>Month</option><option value="week" ${calendarMode==="week"?"selected":""}>Week</option></select></label>
  <p class="muted" aria-live="polite">Adherence: ${stats.percent===null?"No recorded decisions":stats.percent+"%"} · ${stats.completed} completed, ${stats.skipped} skipped</p></div>
  <div class="calendar-weekdays" aria-hidden="true">${WEEKDAYS.map(d=>`<span>${d.slice(0,1)}</span>`).join("")}</div>
  <div class="calendar-grid" role="group" aria-label="${esc(label)} calendar">${cards}</div>
  <div class="calendar-legend" aria-hidden="true"><span><i class="type-pull"></i>Pull</span><span><i class="type-push"></i>Push</span><span><i class="type-legs"></i>Legs</span><span><i class="type-other"></i>Other</span></div>
  <p class="muted">Unlogged days are not counted as missed. Projected dates are shown for weekly schedules only; repeating sequences do not imply calendar dates.</p>
 </section>${detail}`;
}
function viewHistory(){
  if(savedSessionEdit)return viewSavedSessionEdit();
  const toolbar=`<div class="history-toolbar"><h2 id="history-heading" class="section-title">Workout history</h2><div class="seg" role="group" aria-label="History view"><button type="button" data-act="historymode" data-mode="list" aria-pressed="${historyMode!=="calendar"}">List</button><button type="button" data-act="historymode" data-mode="calendar" aria-pressed="${historyMode==="calendar"}">Calendar</button></div></div>`;
  if(historyMode==="calendar")return toolbar+viewCalendar();
  if (!S.sessions.length) return toolbar+`<div class="empty">No sessions yet. Log your first workout and it will show up here.</div>`;
  return toolbar+`<div class="history-list" aria-labelledby="history-heading">` + S.sessions.map(s => {
    const gd = getDay(s.dayId); const day = { name: s.dayName || (gd && gd.name) || "Workout", type: (gd && gd.type) || s.type || "other" };
    const sets = (s.exercises||[]).reduce((a,e)=>a+(e.sets||[]).length,0);
    const units = [...new Set((s.exercises||[]).map(e => exUnit(e, s)))];
    const vu = units.length === 1 ? units[0] : "lb";
    const vol = Math.round((s.exercises||[]).reduce((a,e)=>a+(e.sets||[]).reduce((b,x)=>b+(conv(x.w||0, exUnit(e,s), vu)||0)*(num(x.r)||0),0),0));
    const rows = (s.exercises||[]).map(e => `<tr><td>${esc(e.name)}</td><td>${(e.sets||[]).map(x=>`${esc(x.w ?? 0)}×${esc(x.r)}${x.type&&x.type!=="working"?" ["+esc(x.type)+"]":""}${x.toFailure?" · failure":""}${x.restSeconds!=null?" · "+x.restSeconds+"s rest":""}`).join(", ")} ${exUnit(e,s)}</td></tr>`).join("");
    const armed = S.armedDelete === s.id;
    return `<details data-session-id="${esc(s.id)}" class="hist type-${esc(day.type)}"><summary><span class="hist-stripe" aria-hidden="true"></span><span class="hist-main"><strong>${esc(day.name)}</strong><span class="muted">${esc(fmtDate(s.date))}</span></span><span class="meta">${sets} sets · ${hardSetCount([s])} hard sets<br>${vol.toLocaleString()} ${vu}</span></summary>
      <div class="body"><div class="responsive-table" tabindex="0" role="region" aria-label="Exercise sets in saved session"><table><thead><tr><th scope="col">Exercise</th><th scope="col">Logged sets</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${s.notes ? `<p class="muted">${esc(s.notes)}</p>` : ""}
      <div class="row-actions"><button class="btn small" data-act="historyedit" data-id="${esc(s.id)}">Edit session</button><button class="btn small danger" data-act="delsession" data-id="${esc(s.id)}" aria-label="${armed?"Confirm delete":"Delete"} session ${esc(day.name)} on ${esc(fmtDate(s.date))}">${armed ? "Confirm delete session" : "Delete session"}</button></div></div></details>`;
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
  analyticsCache.value={filtered,summary:analyticsSummary(filtered,{...filter,from:"",to:"",workout:"",exercise:filter.exercise,unit:filter.unit,includeExercisePoints:false})};
 }
 return analyticsCache.value;
}
const recordsCache={sessions:null,exercise:null,unit:null,value:null};
function cachedRecords(sessions,exercise,unit){
 if(recordsCache.sessions!==sessions||recordsCache.exercise!==exercise||recordsCache.unit!==unit){
  recordsCache.sessions=sessions;recordsCache.exercise=exercise;recordsCache.unit=unit;
  recordsCache.value=calculateRecords(sessions,exercise,unit);
 }
 return recordsCache.value;
}
function chartSVG(points, color, unit){
  if (points.length < 2) return `<div class="empty">Log this at least twice to see a trend line.</div>`;
  const displayed=sampleChartPoints(points);
  const W=600,H=230,P={l:44,r:14,t:16,b:30};
  // Bounded-memory extrema: spread Math.min/Math.max fails for large histories.
  let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
  for(const p of points){if(p.x<x0)x0=p.x;if(p.x>x1)x1=p.x;if(p.y<y0)y0=p.y;if(p.y>y1)y1=p.y;}
  const pad=(y1-y0)*0.12 || 2; y0-=pad; y1+=pad;
  const X=x=>P.l+((x-x0)/((x1-x0)||1))*(W-P.l-P.r), Y=y=>H-P.b-((y-y0)/((y1-y0)||1))*(H-P.t-P.b);
  const path=displayed.map((p,i)=>`${i?"L":"M"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
  const dots=displayed.map(p=>`<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="4" fill="${color}" stroke="var(--surface)" stroke-width="2"><title>${new Date(p.x).toLocaleDateString()}: ${round1(p.y)} ${unit}</title></circle>`).join("");
  const grid=[0,0.5,1].map(t=>{const v=y0+(y1-y0)*t;const y=Y(v);return `<line x1="${P.l}" x2="${W-P.r}" y1="${y}" y2="${y}" stroke="var(--line)"/><text x="${P.l-6}" y="${y+4}" text-anchor="end" font-size="12" fill="var(--muted)">${Math.round(v)}</text>`;}).join("");
  const d0=new Date(x0).toLocaleDateString(undefined,{day:"numeric",month:"short"}), d1=new Date(x1).toLocaleDateString(undefined,{day:"numeric",month:"short"});
  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" tabindex="0" aria-label="Trend chart: ${esc(unit)} with ${points.length} points, from ${esc(d0)} to ${esc(d1)}">${grid}
    <path d="${path}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>${dots}
    <text x="${P.l}" y="${H-8}" font-size="12" fill="var(--muted)">${d0}</text><text x="${W-P.r}" y="${H-8}" font-size="12" text-anchor="end" fill="var(--muted)">${d1}</text></svg></div>`;
}
const compactNumber=n=>n>=10000?(Math.round(n/100)/10)+"k":String(Math.round(n));
// One row of range presets plus an expandable set of exact filters; every Progress view shares them.
function analyticsFilterBar(filter){
 const preset=filter.to?"":!filter.from?"all":String([28,84,365].find(n=>filter.from===dateOffset(today(),-(n-1)))||"");
 const workouts=[...new Map(S.sessions.map(s=>[s.dayId,s.dayName||s.dayId])).entries()];
 const active=filter.workout||filter.exercise||(!preset&&(filter.from||filter.to));
 return `<div class="filter-bar"><div class="range-chips" role="group" aria-label="Date range">${[["28","4W"],["84","12W"],["365","1Y"],["all","All"]].map(([value,label])=>`<button type="button" class="range-chip" data-act="analyticsrange" data-range="${value}" aria-pressed="${preset===value}">${label}</button>`).join("")}</div>
 <details class="analytics-filters" ${analyticsFiltersOpen?"open":""}><summary>${icon('search')} Filters${active?" · Active":""}</summary><div class="analytics-controls" role="group" aria-label="Analytics filters"><label class="field-label">From <input type="date" data-analytics="from" value="${esc(filter.from||"")}"></label><label class="field-label">To <input type="date" data-analytics="to" value="${esc(filter.to||"")}"></label><label class="field-label">Workout <select data-analytics="workout"><option value="">All workouts</option>${workouts.map(([id,name])=>`<option value="${esc(id)}" ${id===filter.workout?"selected":""}>${esc(name)}</option>`).join("")}</select></label><label class="field-label">Exercise <select data-analytics="exercise"><option value="">All exercises</option>${[...new Set(S.sessions.flatMap(x=>(x.exercises||[]).map(e=>e.name)))].sort().map(n=>`<option ${n===filter.exercise?"selected":""}>${esc(n)}</option>`).join("")}</select></label></div></details></div>`;
}
function progressHighlights(sessions){
 const rows=strengthHighlights(sessions,S.bodyUnit||"kg");
 return `<section class="section strength-highlights" aria-label="Recent strength highlights"><div class="section-heading"><h2>Recent strength</h2><span class="muted">est. 1RM vs previous</span></div>${rows.length?`<ul class="lift-list">${rows.map(r=>{const delta=r.previous===null?"First recorded session":Math.abs(r.latest-r.previous)<0.01?"= unchanged":(r.latest>r.previous?"▲ +":"▼ ")+(Math.round((r.latest-r.previous)*100)/100)+" "+r.unit;return `<li><button class="strength-highlight" data-act="progresslift" data-name="${esc(r.name)}"><span><strong>${esc(r.name)}</strong><small>${esc(fmtDate(r.date))} · best in range ${r.best} ${r.unit}</small></span><span class="lift-change"><b>${r.latest} ${r.unit}</b><small class="${r.previous!==null&&r.latest>r.previous+0.01?"up":r.previous!==null&&r.latest<r.previous-0.01?"down":""}">${delta}</small></span></button></li>`;}).join("")}</ul>`:'<p class="empty">Log working sets to see strength changes here.</p>'}<p class="muted">An estimate, not a tested maximum. Warm-ups and incomplete sets are excluded.</p></section>`;
}
function viewProgress(){
  const filter=S.analyticsFilter||{from:"",to:"",workout:"",exercise:""};
  const {filtered,summary}=cachedAnalytics(S.sessions,{...filter,unit:S.bodyUnit||"kg"});
  const weekPts=summary.weekly.map(w=>({x:Date.parse(w.week+"T12:00:00Z"),y:w.volume}));
  const hardPts=summary.weekly.map(w=>({x:Date.parse(w.week+"T12:00:00Z"),y:w.hardSets}));
  const recent=summary.weekly.slice(-12);
  let peak=1;for(const w of recent)if(w.volume>peak)peak=w.volume;
  const volumeBars=recent.length?`<div class="bar-chart" role="img" aria-label="Weekly volume for ${recent.length} week${recent.length===1?"":"s"}; latest week ${Math.round(recent.at(-1).volume)} ${esc(summary.unit)}·reps">${recent.map((w,i)=>`<span class="bar ${i===recent.length-1?"is-latest":""}" style="height:${Math.max(2,Math.round(w.volume/peak*100))}%" title="Week of ${esc(w.week)}: ${Math.round(w.volume)} ${esc(summary.unit)}·reps"></span>`).join("")}</div><div class="axis-row"><span>${esc(fmtDate(recent[0].week))}</span><span>${esc(fmtDate(recent.at(-1).week))} · <b>${compactNumber(recent.at(-1).volume)}</b></span></div>`:'<p class="empty">No training sessions match these filters.</p>';
  const table=summary.weekly.length?`<details class="analytics-table-details"><summary>Weekly data table (exact values)</summary><div class="responsive-table" tabindex="0" role="region" aria-label="Exact weekly training analytics"><table><thead><tr><th>Week of</th><th>Volume (${summary.unit}·reps)</th><th>Hard sets</th></tr></thead><tbody>${summary.weekly.map(w=>`<tr><td>${esc(w.week)}</td><td>${w.volume}</td><td>${w.hardSets}</td></tr>`).join("")}</tbody></table></div></details>`:"";
  const analyticsHTML=`<section id="progress-training" class="section analytics-dashboard" aria-labelledby="training-analytics-heading"><div class="section-heading"><h2 id="training-analytics-heading">Training analytics</h2><span class="muted">${filter.exercise?esc(filter.exercise):"All exercises"}</span></div><div class="stats"><div class="stat"><b>${summary.sessions}</b><small>Sessions</small></div><div class="stat"><b>${summary.hardSets}</b><small>Hard sets</small></div><div class="stat"><b>${Math.round(summary.volume)}</b><small>${filter.exercise?"Exercise volume":"Volume"} (${summary.unit}·reps)</small></div></div><h3 class="eyebrow">Weekly volume</h3>${volumeBars}
   <details class="analytics-detail" data-disclosure="analytics" ${openDisclosures.has("analytics")?"open":""}><summary>Hard sets &amp; volume trends</summary>${hardPts.length?`<h4>Weekly hard sets</h4>${chartSVG(hardPts,"var(--accent-line)","hard sets")}`:""}${weekPts.length?`<h4>Weekly volume trend</h4>${chartSVG(weekPts,"var(--push)",summary.unit+"·reps")}`:""}${table}</details></section>`;

  const muscle=muscleVolumeSummary(filtered,{unit:S.bodyUnit||"kg",exercise:filter.exercise||"",secondaryCredit:0.5});
  const mapData=muscleMapData(muscle,{metric:muscleMapMetric});
  // Aggregate only the already-filtered sessions. Reuse the canonical calculation
  // for each exercise; never infer muscle attribution from display strings.
  const grouped=new Map();
  for(const session of filtered)for(const item of session.exercises||[]){
    if(filter.exercise&&item.name!==filter.exercise)continue;
    const name=String(item.name||"");
    if(!grouped.has(name))grouped.set(name,[]);
    grouped.get(name).push({...session,exercises:[item]});
  }
  const contributors=[];
  for(const [name,entries] of grouped){
    const totals=muscleVolumeSummary(entries,{unit:S.bodyUnit||"kg",secondaryCredit:0.5});
    for(const [kind,values] of [["primary",totals.primary],["secondary",totals.secondary]]){
      for(const row of values)contributors.push({muscle:row.muscle,name,kind,hardSets:row.hardSets,volume:row.volume});
    }
  }
  const top=[...muscle.primary].filter(m=>m.hardSets>0).sort((a,b)=>b.hardSets-a.hardSets).slice(0,6);
  let most=1;for(const m of top)if(m.hardSets>most)most=m.hardSets;
  const muscleMapHTML=`<div class="muscle-map-controls"><label class="field-label">Muscle map metric <select data-muscle-map-metric><option value="hardSets" ${muscleMapMetric==="hardSets"?"selected":""}>Primary hard sets</option><option value="volume" ${muscleMapMetric==="volume"?"selected":""}>Primary volume</option></select></label></div>${renderMuscleMap(mapData,{selected:muscleMapSelected,contributors})}`;
  const muscleRows=(entries,kind)=>entries.map(entry=>`<tr><td>${esc(entry.muscle)}</td><td>${entry.hardSets}</td><td>${entry.volume}</td><td>${kind}</td></tr>`).join("");
  const muscleHTML=`<section id="progress-muscles" class="section muscle-analytics" aria-label="Muscle balance"><div class="section-heading"><h2>Muscle balance</h2><span class="muted">primary hard sets</span></div>
    ${top.length?`<ul class="meter-list">${top.map(m=>`<li><span>${esc(capitalize(m.muscle))}</span><span class="meter" aria-hidden="true"><span style="width:${Math.round(m.hardSets/most*100)}%"></span></span><b>${m.hardSets}</b></li>`).join("")}</ul>`:'<p class="empty">Log working sets to see which muscles you train.</p>'}
    <details class="analytics-detail" data-disclosure="muscles" ${openDisclosures.has("muscles")?"open":""}><summary>Body map &amp; details</summary>
    <details class="analytics-explanation"><summary>How muscle estimates work</summary><p class="muted">Primary sets count once; secondary credit is shown separately at 0.5 per hard set. Warm-ups are excluded; drop sets add volume but not hard sets. Unclassified exercises appear under Unknown.</p></details>
    ${muscleMapHTML}
    <div class="stats"><div class="stat"><b>${muscle.hardSets}</b><small>Total hard sets</small></div><div class="stat"><b>${muscle.unknown.hardSets}</b><small>Unclassified hard sets</small></div></div>
    <details class="analytics-breakdown"><summary>Detailed totals &amp; weekly trends</summary><div class="responsive-table"><table><caption>Muscle totals (${muscle.unit}·reps)</caption><thead><tr><th>Muscle</th><th>Hard sets</th><th>Volume</th><th>Credit</th></tr></thead><tbody>${muscleRows(muscle.primary,"Primary")}${muscleRows(muscle.secondary,"Secondary (0.5)")}${muscleRows([{...muscle.unknown,muscle:"Unknown"}],"Unclassified")}</tbody></table></div>
    <h4>Primary hard-set trend</h4>${muscle.weekly.length?chartSVG(muscle.weekly.map(w=>({x:Date.parse(w.week+"T12:00:00Z"),y:w.primary.reduce((sum,m)=>sum+m.hardSets,0)})),"var(--accent-line)","primary hard sets"):""}
    <h4>Weekly muscle training</h4>${muscle.weekly.length?muscle.weekly.map(w=>`<details><summary>Week of ${esc(w.week)}</summary><table><tbody>${muscleRows(w.primary,"Primary")}${muscleRows(w.secondary,"Secondary")}${muscleRows([{...w.unknown,muscle:"Unknown"}],"Unclassified")}</tbody></table></details>`).join(""):'<p class="empty">No muscle-volume data in this range.</p>'}</details></details>
  </section>`;
  return `${analyticsFilterBar(filter)}${analyticsHTML}${activityOverview()}${progressHighlights(filtered)}${muscleHTML}`;
}
function viewLifts(){
  const filter=S.analyticsFilter||{from:"",to:"",workout:"",exercise:""};
  const {filtered}=cachedAnalytics(S.sessions,{...filter,unit:S.bodyUnit||"kg"});
  const names = [...new Set(filtered.flatMap(s => (s.exercises||[]).map(e => e.name)).filter(n=>!filter.exercise||n===filter.exercise))].sort();
  if (!names.length) return `${analyticsFilterBar(filter)}<div class="empty">Your strength trends appear here once you've logged a session.</div>`;
  if (!names.includes(S.progressEx)) S.progressEx = names[0];
  const records=cachedRecords(filtered,S.progressEx,S.bodyUnit||"kg");
  const pts = [];
  let best=0, heaviest=0;
  const pu = S.bodyUnit || DEFAULT_UNIT;
  sortSessions(filtered).reverse().forEach(s => { const e=(s.exercises||[]).find(x=>x.name===S.progressEx); if(!e) return;
    const eu = exUnit(e, s);
    let top=0; e.sets.forEach(x=>{const w=num(x.w),r=num(x.r);if(x.type==="warmup"||x.completed===false||w==null||w<0||r==null||!Number.isInteger(r)||r<=0)return;const converted=conv(w,eu,pu)||0;top=Math.max(top,e1rm(converted,r));heaviest=Math.max(heaviest,converted);});
    if (top>0){ pts.push({x:new Date(s.date+"T12:00:00").getTime(), y:top}); best=Math.max(best,top);} });
  const first = pts[0] ? pts[0].y : 0, last = pts.length ? pts[pts.length-1].y : 0;
  const change = first ? Math.round(((last-first)/first)*100) : 0;
  const record=(label,value,note)=>`<div class="pr-card"><span class="eyebrow">${label}</span><strong>${value}</strong>${note?`<small class="muted">${note}</small>`:""}</div>`;
  return `${analyticsFilterBar(filter)}<label class="field-label lift-picker">Exercise<select aria-label="Exercise" data-act="progressEx">${names.map(n=>`<option ${n===S.progressEx?"selected":""}>${esc(n)}</option>`).join("")}</select></label>
   <section class="section lift-hero" aria-label="Estimated one-rep max trend"><p class="eyebrow">Best est. 1RM · ${esc(pu)}</p><div class="lift-value"><b>${round1(best)}</b><span>${esc(pu)}</span>${pts.length>1?`<span class="delta ${change>0?"up":change<0?"down":""}">${change>0?"▲ ":change<0?"▼ ":""}${Math.abs(change)}% since first log</span>`:""}</div>${chartSVG(pts, "var(--accent-line)", pu + " est. 1RM")}<p class="muted">Estimated 1RM uses the Epley formula on your best set each session, so heavier weights and extra reps both count as progress. Sessions logged in a different unit are converted.</p></section>
   <section class="pr-summary" aria-label="Personal records"><h3>Personal records</h3><div class="pr-grid">${record("Heaviest",records.heaviest?records.heaviest.value+" "+records.unit:"—",`Heaviest set in range: ${round1(heaviest)} ${esc(pu)}`)}${record("Most reps",records.mostReps?records.mostReps.value:"—","")}${record("Best estimated 1RM",records.estimated1RM?records.estimated1RM.value+" "+records.unit:"—","")}${record("Best exercise-session volume",records.sessionVolume?records.sessionVolume.value+" "+records.unit+"·reps":"—","")}</div><p class="muted">Calculated for the selected exercise in matching sessions. Warm-up sets are excluded; drop sets contribute to volume. Ties share the record; estimated 1RM is calculated, not measured.</p></section>`;
}
function viewBody(){
  const filter=S.analyticsFilter||{from:"",to:"",workout:"",exercise:""};
  const bu = S.body.length ? (S.body[S.body.length-1].unit || DEFAULT_UNIT) : (S.bodyUnit || "kg");
  const visibleBody=S.body.filter(b=>(!filter.from||b.date>=filter.from)&&(!filter.to||b.date<=filter.to));
  const bpts = visibleBody.filter(b=>num(b.weight)).map(b=>({x:new Date(b.date+"T12:00:00").getTime(), y:conv(b.weight, b.unit||DEFAULT_UNIT, bu)}));
  const wpts = visibleBody.filter(b=>num(b.waist)).map(b=>({x:new Date(b.date+"T12:00:00").getTime(), y:num(b.waist)}));
  const recent = visibleBody.slice().reverse().slice(0,8).map(b => `<li><span>${esc(fmtDate(b.date))}</span><span>${b.weight?esc(b.weight)+" "+(b.unit||DEFAULT_UNIT):""}${b.weight&&b.waist?" · ":""}${b.waist?esc(b.waist)+" cm waist":""}</span>
    <button class="btn small danger" data-act="delbody" data-id="${esc(b.id)}" aria-label="${S.armedDelete===b.id?"Confirm delete":"Delete"} body entry ${esc(fmtDate(b.date))}">${S.armedDelete===b.id?"Confirm delete entry":"Delete"}</button></li>`).join("");
  return `<section id="progress-body" class="section progress-body" aria-labelledby="body-heading"><h2 id="body-heading" class="section-title">Log a measurement</h2>
      <div class="form-row">
        <label class="field-label">Date<input type="date" id="bDate" value="${today()}"></label>
        <label class="field-label"><span>Weight <select id="bUnit" aria-label="Body weight unit" class="inline-select">${["kg","lb"].map(u=>`<option ${u===(S.bodyUnit||bu)?"selected":""}>${u}</option>`).join("")}</select></span><input type="text" inputmode="decimal" autocomplete="off" id="bWeight" placeholder="${(S.bodyUnit||bu)==="kg"?"87":"192"}"></label>
        <label class="field-label">Waist (cm)<input type="text" inputmode="decimal" autocomplete="off" id="bWaist" placeholder="optional"></label>
      </div>
      <div class="row-actions"><button class="btn primary" data-act="addbody">Add entry</button></div>
      <p class="muted">Weigh in a few mornings a week. The trend matters more than any single day.</p></section>
      ${bpts.length ? `<section class="section"><h2 class="section-title">Body weight</h2>${chartSVG(bpts,"var(--accent-line)",bu)}</section>` : ""}
      ${wpts.length ? `<section class="section"><h2 class="section-title">Waist</h2>${chartSVG(wpts,"var(--muted)","cm")}</section>` : ""}
      <section class="section"><h2 class="section-title">Recent entries</h2>${recent ? `<ul class="list">${recent}</ul>` : `<div class="empty">No body entries yet.</div>`}</section>`;
}

function viewData(){
  return `<div class="data-grid" role="region" aria-label="Backup and restore settings"><div class="section stack"><span class="panel-icon">${icon("download")}</span><h2 class="section-title">Back up this device</h2>${backupStatus()}<p class="muted">Your workouts stay on this device until you export a file. Save a backup before replacing data or clearing your browser.</p><p class="muted">${S.sessions.length} sessions · ${S.body.length} body entries · ${S.custom.length} custom workouts</p>
    <p class="muted">Export workouts, schedules, schedule progress, session drafts and preferences in one JSON backup.</p><button class="btn primary" data-act="export">Export app data (.json)</button>
    <textarea id="exportOut" readonly hidden aria-label="Exported JSON"></textarea><button class="btn" data-act="copyexport" id="copyBtn" hidden>Copy JSON instead</button></div>
    <div class="section stack"><span class="panel-icon">${icon("upload")}</span><h2 class="section-title">Restore a backup</h2><p class="muted">Supports Gym Tracker backup versions 1 through 4. Restoring never requires an account or network connection.</p><p class="muted">Choose a backup or paste its JSON. The complete file is validated before saving.</p><label class="file-label">Choose backup file<input type="file" id="importFile" accept="application/json,.json" aria-label="Choose JSON backup"></label>
    <label class="field-label">Import mode<select id="importMode" aria-describedby="import-mode-help"><option value="merge">Merge with existing data</option><option value="replace">Replace all local app data</option></select></label><p id="import-mode-help" class="muted">Merge combines records by ID. Replace deletes local records not included in the backup. Export your current data first.</p><p id="importResult" role="status" aria-live="polite" aria-atomic="true" hidden></p><textarea id="importText" placeholder='Paste your backup JSON here…' aria-label="Paste JSON backup"></textarea><button class="btn" data-act="import">Review and import backup</button></div></div>
    <div class="section program-details"><div><p class="eyebrow">Default program</p><h2 class="section-title">Your workouts, one simple file.</h2><p class="muted">Loaded from <code>ppl-default-workouts.json</code> · ${esc(programSource)}</p><p class="muted">These are starter workouts. Use Plan → Schedule to choose your own order, rest days and weekly or repeating split.</p><div class="rotation">${ORDER.map(id=>`<span class="chip type-${BASE_DAY[id].type}">${esc(BASE_DAY[id].name)}</span>`).join('<span aria-hidden="true">→</span>')}</div></div><div class="stack"><button class="btn" data-act="reloadprogram">Reload program</button><label class="file-label">Load program JSON<input type="file" id="programFile" accept="application/json,.json" aria-label="Load default workout program"></label></div></div>
    <p class="storage-footnote">Saved on this device and browser. Use a JSON backup to transfer data; clearing browser data removes your log.</p>`;
}
function updateSessionMeter(){
  if (S.tab !== "log" || S.editing || S.scheduleEditing || S.manageSchedules || !S.ready) return;
  // One progress measure everywhere: sets explicitly marked done.
  const {done,total} = draftProgress(getDraft(S.dayId));
  const caption = $("#loggedSets"), meter = $("[data-session-meter]");
  if (caption) caption.textContent = done;
  if (meter) { meter.max = total || 1; meter.value = done; }
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
// Browsing between views should behave like navigation without a network request.
const NAV_VIEWS=new Set(["home","log","progress","lifts","body","plan","exercises","more","history","data","calendar","library","review","summary"]);
function navigateView(tab,{record=true}={}){
 if((tab==="review"&&!sessionReview)||(tab==="summary"&&!savedSummary))tab="home";
 if(tab==="calendar"){historyMode="calendar";tab="history";}
 if(!NAV_VIEWS.has(tab)||tab===S.tab){if(sheet){sheet=null;render();}return;}
 if(S.tab==="review")sessionReview=null;
 exerciseQuery="";
 sheet=null;restOverlayOpen=false;
 if(S.tab==="log"&&S.ready&&saveStatus==="pending")void flushDrafts();
 if(record&&typeof history!=="undefined")history.pushState({...history.state,gtView:tab},"",location.href);
 S.tab=tab;S.armedDelete=null;render();window.scrollTo({top:0});
}
if(typeof history!=="undefined")history.replaceState({...history.state,gtView:S.tab},"",location.href);
window.addEventListener("popstate",event=>{
 const tab=event.state?.gtView;
 if(NAV_VIEWS.has(tab))navigateView(tab,{record:false});
});
document.querySelector(".settings-launch")?.addEventListener("click",()=>navigateView("more"));
document.querySelector("nav.tabs").addEventListener("click", e => {
  const b = e.target.closest("button[data-tab]"); if (!b) return;
  // Keep navigation intent even while IndexedDB is still hydrating.
  // render() shows a loading state until ready, then initStore renders the
  // selected tab. Dropping early clicks caused intermittent Firefox failures.
  navigateView(b.dataset.tab);
});

$("#app").addEventListener("click",e=>{
 const link=e.target.closest("button[data-destination]");if(!link)return;
 navigateView(link.dataset.destination);
});

document.addEventListener("toggle",e=>{
 const n=e.target;
 if(n?.dataset?.disclosure){if(n.open)openDisclosures.add(n.dataset.disclosure);else openDisclosures.delete(n.dataset.disclosure);}
 if(n?.matches?.("details.analytics-filters"))analyticsFiltersOpen=n.open;
 if(n?.matches?.("details[data-exercise-id]")){
   const id=n.dataset.exerciseId;
   if(n.open){workoutExpanded.add(id);}else{workoutExpanded.delete(id);}
 }
},true);

$("#app").addEventListener("change",e=>{
 if(e.target.matches("[data-calendar-mode]")){calendarMode=e.target.value;calendarWeekOffset=0;render();}
});
$("#app").addEventListener("click",e=>{
 const b=e.target.closest("button[data-act]");
 if(!b||!["calendarprev","calendarnext","calendartoday"].includes(b.dataset.act))return;
 if(b.dataset.act==="calendartoday"){calendarMonth=today().slice(0,7);calendarWeekOffset=0;}
 else if(calendarMode==="week"){calendarWeekOffset+=b.dataset.act==="calendarprev"?-1:1;if(calendarWeekOffset<0){calendarMonth=shiftCalendarMonth(calendarMonth||today().slice(0,7),-1);calendarWeekOffset=4;}if(calendarWeekOffset>4){calendarMonth=shiftCalendarMonth(calendarMonth||today().slice(0,7),1);calendarWeekOffset=0;}}
 else calendarMonth=shiftCalendarMonth(calendarMonth||today().slice(0,7),b.dataset.act==="calendarprev"?-1:1);
 render();
});
$("#app").addEventListener("input", e => {
  const t = e.target;
  if(t.matches("[data-exercise-search]")){exerciseQuery=t.value;applyExerciseFilter();return;}
  if(t.dataset.ef==="n" && S.editing){S.editing.ex[+t.dataset.i].n=t.value;const row=t.closest("[data-exercise-search-item]");if(row)row.dataset.exerciseSearchItem=t.value;return;}
  if(savedSessionEdit && t.dataset.historyField){savedSessionEdit[t.dataset.historyField]=t.value;return;}
  if(savedSessionEdit && t.dataset.historySet){savedSessionEdit.exercises[+t.dataset.i].sets[+t.dataset.j][t.dataset.historySet]=t.value;return;}
  if(t.hasAttribute?.("data-schedule-name") && S.scheduleEditing){S.scheduleEditing.name=t.value;return;}
  if (S.editing) {
    if (t.dataset.ed === "name") S.editing.name = t.value;
    else if (t.dataset.ed === "type") S.editing.type = t.value;
    else if (t.dataset.ed === "unit") S.editing.unit = t.value;
    else if (t.dataset.ef) S.editing.ex[+t.dataset.i][t.dataset.ef] = t.value;
    return;
  }
  const f = t.dataset.f; if (!f || S.tab !== "log") return;
  if(f==="increment"){const e=(t.dataset.g==="x"?getDraft(S.dayId).extra:getDraft(S.dayId).ex)[+t.dataset.i];e.loadIncrement=t.value;saveDrafts();return;}
  const d = getDraft(S.dayId);
  if(['betweenExercisesRest','supersetTransitionRest','supersetRoundRest','setrest'].includes(f)){
   if(f==='setrest'&&t.value===''){delete (t.dataset.g==='x'?d.extra:d.ex)[+t.dataset.i].sets[+t.dataset.j].restSeconds;saveDrafts();return;}
   const n=Number(t.value);if(t.value===''||!Number.isInteger(n)||n<0||n>600){toast("Rest must be 0–600 seconds.");return;}
   if(f==='setrest')(t.dataset.g==='x'?d.extra:d.ex)[+t.dataset.i].sets[+t.dataset.j].restSeconds=n;else d[f]=n;
  }
  else if (f === "exrest") { const n=Number(t.value);if(Number.isInteger(n)&&n>=15&&n<=600)(t.dataset.g==="x"?d.extra:d.ex)[+t.dataset.i].restSeconds=n;else toast("Rest interval must be 15–600 seconds."); }
   else if (f === "w" || f === "r" || f==="rir") {const set=(t.dataset.g === "x" ? d.extra : d.ex)[+t.dataset.i].sets[+t.dataset.j];set[f]=f==="rir"?cleanRir(t.value):t.value;
    // Correcting a ticked set keeps it ticked; it only unticks once it has no reps, as completeset requires them.
    if(set.completed===true && f==="r" && !(num(set.r)>0)){set.completed=false;delete set.completedAt;const row=t.closest?.(".setrow"),tick=row?.querySelector(".set-complete");row?.classList.remove("is-complete");if(tick){tick.setAttribute("aria-pressed","false");tick.setAttribute("aria-label",tick.getAttribute("aria-label").replace(/mark incomplete$/,"mark complete"));tick.title="Complete set and start rest timer";}}}
  else if (f === "xname") d.extra[+t.dataset.i].name = t.value;
  else if (f === "notes") d.notes = t.value;
  else if (f === "date") {if(!validDataDate(t.value))return;d.date = t.value;}
  saveDrafts(); updateSessionMeter();
});
// RIR is a whole number from 0 to 10; an empty field means not recorded.
function cleanRir(value){
  if(value==="")return null;
  const n=Number(value);
  return Number.isFinite(n)?Math.min(10,Math.max(0,Math.round(n))):null;
}
// When a field loses focus, show the value that was actually kept: the previous date for a cleared one, the rounded RIR.
$("#app").addEventListener("focusout", e => {
  const t=e.target,f=t.dataset?.f;
  if(S.tab!=="log" || f!=="date" && f!=="rir")return;
  const d=S.drafts[S.dayId];if(!d)return;
  if(f==="date"){if(!validDataDate(t.value) && validDataDate(d.date))t.value=d.date;return;}
  const set=(t.dataset.g==="x"?d.extra:d.ex)?.[+t.dataset.i]?.sets?.[+t.dataset.j];
  if(set && t.value!==String(set.rir??""))t.value=set.rir??"";
});

$("#app").addEventListener("change", async e => {
  if(e.target.dataset.act==="reviewinclude"&&sessionReview){
   // Rebuild the review with or without the unticked sets, keeping the date and notes typed so far.
   const date=document.querySelector("#review-workout-date")?.value,notes=document.querySelector("#review-notes")?.value;
   if(typeof notes==="string")getDraft(S.dayId).notes=notes;
   await saveSession(null,{reviewOnly:true,includeUnticked:e.target.checked});
   if(sessionReview&&typeof date==="string")sessionReview.date=date;
   render();document.querySelector("#review-include-unticked")?.focus?.();return;
  }
  if(e.target.dataset.setting){
   const field=e.target.dataset.setting==='unit'?'defaultUnit':'globalRestSeconds',old=S[field];
   S[field]=field==='defaultUnit'?(e.target.value==='lb'?'lb':'kg'):Number(e.target.value);
   if(!await writeLocal()){S[field]=old;toast("Could not save preference. Try again.");}else toast("Preference saved");render();return;
  }
  if(e.target.matches("[data-muscle-map-metric]")){muscleMapMetric=e.target.value==="volume"?"volume":"hardSets";render();return;}
  if(e.target.dataset.analytics){S.analyticsFilter={...(S.analyticsFilter||{}),[e.target.dataset.analytics]:e.target.value};render();return;}
  if(e.target.dataset.act==="progressiontoggle"){S.progressionEnabled=e.target.checked;saveDrafts();render();return;}
  if(e.target.dataset.act==="incrementunit"){const t=e.target;(t.dataset.g==="x"?getDraft(S.dayId).extra:getDraft(S.dayId).ex)[+t.dataset.i].incrementUnit=t.value;saveDrafts();return;}
  if(e.target.dataset.act==="setfailure"){const t=e.target,d=getDraft(S.dayId);(t.dataset.g==='x'?d.extra:d.ex)[+t.dataset.i].sets[+t.dataset.j].toFailure=t.checked;saveDrafts();return;}
  if(e.target.dataset.act==="supersetpair"){const t=e.target,d=getDraft(S.dayId),i=+t.dataset.i;if(t.checked&&(d.ex[i-1]?.supersetNext||d.ex[i+1]?.supersetNext)){t.checked=false;toast("An exercise can belong to one superset pair.");return;}d.ex[i].supersetNext=t.checked;saveDrafts();return;}
  if(e.target.dataset.act==="settype"){const t=e.target;const d=getDraft(S.dayId);(t.dataset.g==="x"?d.extra:d.ex)[+t.dataset.i].sets[+t.dataset.j].type=t.value;saveDrafts();return;}
  if(e.target.dataset.act==="restpreset"){timerContext().draft.restSeconds=Number(e.target.value);saveDrafts();return;}
  const t = e.target;
  if(t.dataset.act==="useschedule"){useSchedule(t.value).catch(err=>toast(err.message));return;}
  if(t.dataset.scheduleDay!=null && S.scheduleEditing){S.scheduleEditing.days[+t.dataset.scheduleDay]=t.value || null;render();return;}
  if(t.hasAttribute?.("data-schedule-cursor") && S.scheduleEditing){S.scheduleEditing.cursor=+t.value;return;}
  if (t.id === "programFile" && t.files?.[0]) { useProgramFile(t.files[0]); return; }
  if (t.dataset.ed === "type" && S.editing) { S.editing.type = t.value; return; }
  if (t.dataset.act === "variant") { const de = getDraft(S.dayId).ex[+t.dataset.i]; if(de.name!==t.value){de.name=t.value;de.exerciseId=resolveExerciseIdentity(t.value)||undefined;} de.unit = unitFor(t.value, getDay(S.dayId)); saveDrafts(); render(); }
  if (t.id === "bUnit") { S.bodyUnit = t.value; return; }
  if (t.dataset.act === "progressEx") { S.progressEx = t.value; render(); }
  if (t.id === "importFile" && t.files && t.files[0]) { t.files[0].text().then(txt => { $("#importText").value = txt; toast("File loaded. Tap Import JSON."); }); }
});

$("#app").addEventListener("keydown",e=>{if(S.tab!=="progress"||!["Enter"," "].includes(e.key))return;const region=e.target.closest?.("[data-muscle]");if(!region||!region.closest?.(".muscle-map"))return;e.preventDefault();muscleMapSelected=region.dataset.muscle;render();});
$("#app").addEventListener("click", async e => {
  const muscleRegion=e.target.closest?.("[data-muscle]");
  if(muscleRegion&&S.tab==="progress"){muscleMapSelected=muscleRegion.dataset.muscle;render();return;}
  const b = e.target.closest("[data-act]"); if (!b || b.tagName === "SELECT") return;
  const act = b.dataset.act;
  if(act==="opensheet"){openSheet({kind:b.dataset.sheet,g:b.dataset.g||"",i:b.dataset.i,j:b.dataset.j},b);return;}
  if(act==="closesheet"){closeSheet();return;}
  if(act==="minimize"){if(saveStatus==="pending")void flushDrafts();navigateView("home");return;}
  if(act==="historymode"){historyMode=b.dataset.mode==="calendar"?"calendar":"list";render();return;}
  if(act==="calendarday"){calendarSelected=calendarSelected===b.dataset.date?null:b.dataset.date;render();document.querySelector(`[data-act="calendarday"][data-date="${CSS.escape(b.dataset.date)}"]`)?.focus({preventScroll:true});return;}
  if(act==="analyticsrange"){const days=Number(b.dataset.range);S.analyticsFilter={...(S.analyticsFilter||{workout:"",exercise:""}),from:days?dateOffset(today(),-(days-1)):"",to:""};render();return;}
  if(act==="reviewstarter"){
   const preset=STARTER_WORKOUTS[b.dataset.preset];if(!preset)return;
   const definitions=allDays().flatMap(d=>d.ex),ex=preset.names.map(name=>definitions.find(e=>e.n===name));
   if(ex.some(e=>!e)){toast("Some starter exercises are unavailable in this program. Create your own workout instead.");return;}
   S.editing={id:uid("c"),name:preset.name,type:"other",unit:S.defaultUnit||DEFAULT_UNIT,ex:ex.map(e=>({...structuredClone(e),s:3}))};templateId=null;
   if(S.tab!=="library")navigateView("library");else{render();window.scrollTo({top:0});}return;
  }
  if(act==="snoozebackup"){try{localStorage.setItem("gt-backup-snooze",String(Date.now()+7*86400000));render();}catch{toast("Could not save reminder preference.");}return;}
  if(act==="progresslift"){S.progressEx=b.dataset.name;if(S.tab==="lifts")render();else navigateView("lifts");return;}
  if(act==="reviewtoday"){const field=document.getElementById("review-workout-date");if(field)field.value=today();return;}
  if(act==="homecreate"){S.editing={id:uid("c"),name:"",type:"other",unit:S.defaultUnit||DEFAULT_UNIT,ex:[{n:"",s:3,lo:8,hi:12}]};navigateView("library");return;}
  if(act==="noschedule"){try{await saveScheduleList(S.schedules,null);render();toast("No active schedule. Choose workouts freely.");}catch(err){toast(err.message);}return;}
  if(act==="homeweek"){homeWeekOffset+=Number(b.dataset.delta);render();return;}
  if(act==="homeweekreset"){homeWeekOffset=0;render();return;}
  if(act==="homebody"){openSheet({kind:"weight"},b);return;}

  if(act==="workoutsettings"){navigateView("more");return;}
  if(act==="opentemplate"){templateId=b.dataset.id;render();window.scrollTo({top:0});return;}
  if(act==="closetemplate"){templateId=null;S.editing=null;render();return;}
  if(act==="copytemplate"){const day=getDay(b.dataset.id);S.editing={...structuredClone(day),id:uid("c"),name:day.name+" copy"};render();return;}
  if(act==="starttemplate"){S.dayId=b.dataset.id;workoutExpanded.clear();startWorkoutFor(S.dayId);navigateView("log");return;}
  if(act==="opensession"){historyMode="list";if(S.tab==="history")render();else navigateView("history");const row=document.querySelector(`[data-session-id="${CSS.escape(b.dataset.id)}"]`);if(row){row.open=true;row.scrollIntoView({block:"start"});}return;}
  if(act==="jumpextra"){workoutExpanded.clear();workoutExpanded.add("extra-"+b.dataset.i);render();document.querySelector(`[data-exercise-id="extra-${b.dataset.i}"]`)?.scrollIntoView({block:"start",behavior:"smooth"});return;}
  if(act==="nextexercise"||act==="jumptoexercise"){workoutExpanded.clear();workoutExpanded.add("base-"+b.dataset.i);render();document.querySelector(`[data-exercise-id="base-${b.dataset.i}"]`)?.scrollIntoView({block:"start",behavior:"smooth"});return;}
  if(act==="reviewworkout")return saveSession(b,{reviewOnly:true});
  if(act==="backtosession"){startWorkoutFor(S.dayId);navigateView("log");return;}
  if(["clockstart","clockpause","clockstop","clockreset","reststart"].includes(act)){
   // Session controls always act on the workout on screen.
   if(S.tab==="log"&&getDay(S.dayId))timerWorkoutId=S.dayId;
   const {id,draft:d}=timerContext();
   if(act==="clockstart")startWorkoutFor(id);
   if(act==="clockpause"){d.workoutTimer=timerTools.pauseWorkout(d.workoutTimer);if(d.restTimer&&d.restTimer.pausedRemainingMs==null)d.restTimer=timerTools.pause(d.restTimer);}
   if(act==="clockstop"){d.workoutTimer=timerTools.stopWorkout(d.workoutTimer);d.restTimer=null;}
   if(act==="clockreset"){d.workoutTimer=timerTools.idleWorkout();d.restTimer=null;delete d.startedAt;}
   if(act==="reststart")d.restTimer=timerTools.start(d.restSeconds);
   saveDrafts();render();return;
  }
  if(act==="timeropen"){restOverlayOpen=true;sheet=null;render();document.querySelector("[data-act=timerclose]")?.focus({preventScroll:true});return;}
  if(act==="timerclose"){restOverlayOpen=false;render();document.querySelector("[data-act=timeropen]")?.focus({preventScroll:true});return;}
  if(act==="timeradjust"){const {draft:d}=timerContext(),t=d.restTimer,delta=Number(b.dataset.seconds);if(t&&Number.isFinite(delta)){const ms=Math.max(0,(t.pausedRemainingMs!=null?t.pausedRemainingMs:t.deadline-Date.now())+delta*1000);d.restTimer={...t,deadline:Date.now()+ms,pausedRemainingMs:t.pausedRemainingMs!=null?ms:null,durationSeconds:Math.max(0,(t.durationSeconds||0)+delta)};saveDrafts();render();}return;}

  if(["homestart","homecontinue","homechoose","homeschedule","homeprogress","homehistory"].includes(act)){
   if(act==="homechoose"){templateId=null;S.editing=null;navigateView("library");return;}
   if(act==="homeschedule"||act==="homeprogress"||act==="homehistory"){navigateView({homeschedule:"plan",homeprogress:"progress",homehistory:"history"}[act]);return;}
   S.dayId=getDay(b.dataset.id)?.id||activeWorkoutId()||nextDayId();workoutExpanded.clear();if(getDraft(S.dayId).workoutTimer.state!=="running")startWorkoutFor(S.dayId);navigateView("log");return;
  }
  if(act==="recoverbackup"){S.tab="data";render();await exportJSON();return;}
  if(act==="reloadconflict"){window.location.reload();return;}
  if(["manageschedules","closeschedules","newschedule","editschedule","cancelschedule","activateschedule","skipscheduled","movescheduleday","addscheduleday","removescheduleday","saveschedule","deleteschedule"].includes(act)){await scheduleAction(b);return;}
  if (act === "retryprogram") { await initApp(); return; }
  if (act === "reloadprogram") { if (await loadProgram()) { ensureSchedules(); S.dayId = nextDayId(); render(); toast(programSource === "JSON file" ? "Program refreshed" : "Using the saved program; file unavailable"); } else toast("Program file unavailable"); return; }
  if (act === "day") { if(saveStatus==="pending")void flushDrafts();S.dayId = b.dataset.id; render(); flushDrafts(); return; }
  const grp = () => { const d = getDraft(S.dayId); return (b.dataset.g === "x" ? d.extra : d.ex)[+b.dataset.i]; };
  if(act==="settype"&&b.dataset.type){const entry=grp()?.sets[+b.dataset.j];if(!entry)return;entry.type=b.dataset.type;saveDrafts();render();return;}
  if(act==="rmsetat"){const exercise=grp();if(!exercise||exercise.sets.length<2)return;exercise.sets.splice(+b.dataset.j,1);sheet=null;saveDrafts();render();toast("Set removed");return;}
  if(act==="applysuggestion"){
   const exercise=grp(),definition=b.dataset.g==="x"?null:getDay(S.dayId)?.ex[+b.dataset.i],result=exercise&&suggestionFor(exercise,definition);
   if(!result||result.weight==null)return;
   let filled=0;for(const set of exercise.sets)if(set.completed!==true&&String(set.w??"").trim()===""){set.w=String(result.weight);filled++;}
   saveDrafts();render();toast(filled?`${result.weight} ${result.unit} added to ${filled} set${filled===1?"":"s"}`:"No empty sets to fill");return;
  }
  if(act==="adjustweight"||act==="uselastset"){
   const exercise=grp(),entry=exercise.sets[+b.dataset.j];if(!entry||entry.completed)return;
   const previous=lastFor(exercise.name),last=previous?.sets[+b.dataset.j];
   if(act==="uselastset"){
    if(!last)return;
    if(String(entry.w??"").trim()!==""||String(entry.r??"").trim()!==""){toast("Clear this set before using the previous values.");return;}
    entry.w=String(tidy(conv(last.w??0,previous.unit,exercise.unit),exercise.unit));entry.r=String(last.r??"");
   }else{
    const saved=settingFor(exercise,+b.dataset.i,b.dataset.g),amount=Number(exercise.loadIncrement||saved.loadIncrement)|| (exercise.unit==="kg"?2.5:5);
    const increment=convertIncrement(amount,exercise.incrementUnit||saved.incrementUnit||exercise.unit,exercise.unit);
    const current=num(entry.w)??(last?conv(last.w??0,previous.unit,exercise.unit):0);
    entry.w=String(Math.round(Math.max(0,current+Number(b.dataset.direction)*increment)*1000)/1000);
   }
   saveDrafts();render();document.querySelector(`[data-act="${act}"][data-g="${b.dataset.g}"][data-i="${b.dataset.i}"][data-j="${b.dataset.j}"]`)?.focus({preventScroll:true});return;
  }
  if(act==="chainset"){
   const exercise=grp(),source=exercise.sets[+b.dataset.j],weight=num(source.w);
   if(weight==null||weight<=0){toast("Enter a positive weight before adding a drop sequence.");return;}
   const reverse=b.dataset.kind==="reverse-drop",next={w:String(Math.round(weight*(reverse?1.1:.8)*100)/100),r:"",type:reverse?'reverse-drop':'drop'};
   if(!reverse)source.restSeconds=0;
   exercise.sets.splice(+b.dataset.j+1,0,next);saveDrafts();render();toast("Suggested weight added. Adjust it and enter actual reps.");return;
  }
  if (act === "completeset") { const entry=grp().sets[+b.dataset.j]; if(entry.completed===true){entry.completed=false;delete entry.completedAt;}else{if(!(num(entry.r)>0)){toast("Enter reps before completing a set.");return;}entry.completed=true;entry.completedAt=new Date().toISOString();const d=getDraft(S.dayId);timerWorkoutId=S.dayId;const exercise=grp();let seconds=resolveRestSeconds({set:entry,exercise,draft:d,defaults:settingFor(exercise,+b.dataset.i,b.dataset.g),globalRestSeconds:S.globalRestSeconds});
const index=+b.dataset.i,round=+b.dataset.j,paired=b.dataset.g!=="x"&&(exercise.supersetNext||d.ex[index-1]?.supersetNext),partner=paired?(exercise.supersetNext?index+1:index-1):null;
if(entry.toFailure)entry.rir=0;
if(paired&&d.ex[partner]){
 const partnerSet=d.ex[partner].sets[round],roundDone=!partnerSet||partnerSet.completed;
 seconds=entry.restSeconds??(roundDone?(d.supersetRoundRest??90):(d.supersetTransitionRest??0));
 const target=roundDone?(exercise.supersetNext?index:partner):partner;
 workoutExpanded.clear();workoutExpanded.add("base-"+target);
}else if(exercise.sets.every(s=>s.completed))seconds=entry.restSeconds??d.betweenExercisesRest??120;
if([...d.ex,...d.extra].every(e=>e.sets.every(s=>s.completed)))seconds=0;
d.restTimer=seconds>0?timerTools.start(seconds):null;}saveDrafts();render();return; }
  if (["timerpause","timerresume","timerskip","timerreset"].includes(act)){const {draft:d}=timerContext();if(act==="timerpause"&&d.restTimer)d.restTimer=timerTools.pause(d.restTimer);if(act==="timerresume"&&d.restTimer)d.restTimer=timerTools.resume(d.restTimer);if(act==="timerskip"){d.restTimer=null;restOverlayOpen=false;}if(act==="timerreset"){d.restTimer=null;d.workoutTimer=timerTools.idleWorkout();}saveDrafts();render();return;}
   if(act==="resetdefault"){const e=grp(),key=settingKey(e,+b.dataset.i,b.dataset.g),prior=S.exerciseDefaults||{},before={restSeconds:e.restSeconds,loadIncrement:e.loadIncrement,incrementUnit:e.incrementUnit};const next={...prior};if(Object.hasOwn(next,exerciseKey(e.name)))next[key]={};else delete next[key];S.exerciseDefaults=next;delete e.restSeconds;delete e.loadIncrement;delete e.incrementUnit;if(!await writeLocal()){S.exerciseDefaults=prior;for(const field of ["restSeconds","loadIncrement","incrementUnit"]){if(before[field]===undefined)delete e[field];else e[field]=before[field];}toast("Could not reset defaults");}else{saveDrafts();render();toast("Exercise default reset");}return;}
  if(act==="savedefault"){const e=grp();const key=settingKey(e,+b.dataset.i,b.dataset.g);const rawIncrement=e.loadIncrement==null||e.loadIncrement===""?S.exerciseDefaults?.[key]?.loadIncrement:e.loadIncrement;
   if(rawIncrement!=null && rawIncrement!=="" && (!Number.isFinite(Number(rawIncrement))||Number(rawIncrement)<=0||Number(rawIncrement)>100)){e.loadIncrement=S.exerciseDefaults?.[key]?.loadIncrement??"";saveDrafts();if(!await flushDrafts()){toast("Could not restore saved increment; export a backup before reloading.");return;}toast("Load increment must be greater than 0 and no more than 100.");return;}
   const value=normalizeExerciseSetting({restSeconds:e.restSeconds,loadIncrement:rawIncrement==null||rawIncrement===""?undefined:Number(rawIncrement),incrementUnit:e.incrementUnit||S.exerciseDefaults?.[key]?.incrementUnit||e.unit||"kg"});
   if(e.restSeconds!=null&&!Object.hasOwn(value,"restSeconds")){toast("Rest interval must be 15–600 seconds.");return;}
   const prev=S.exerciseDefaults||{};S.exerciseDefaults={...prev,[key]:value};if(!await writeLocal()){S.exerciseDefaults=prev;toast("Could not save defaults");}else {render();toast("Exercise defaults saved");}return;}
  if(act==="copyforward"){const e=grp(),prev=lastFor(e.name);if(!prev){toast("No previous sets available");return;}
   // Fill only empty, unticked rows in place (keeping their id, type and rest); never overwrite what was typed or ticked.
   let copied=0;const blank=v=>String(v??"").trim()==="";
   prev.sets.forEach((x,j)=>{const w=String(tidy(conv(x.w||0,prev.unit,e.unit),e.unit)),r=String(x.r||""),type=x.type&&x.type!=="working"?x.type:null,target=e.sets[j];
    if(!target){e.sets.push({w,r,...(type?{type}:{})});copied++;return;}
    if(target.completed===true||!blank(target.w)||!blank(target.r))return;
    target.w=w;target.r=r;if(type&&(!target.type||target.type==="working"))target.type=type;copied++;});
   if(!copied){toast("No empty sets to fill");return;}saveDrafts();render();toast(`Copied ${copied} set${copied===1?"":"s"} from last time`);return;}
  if (act === "addset") { grp().sets.push({w:"",r:""}); saveDrafts(); render(); return; }
  if (act === "rmset") { const de = grp(); if (de.sets.length>1) de.sets.pop(); saveDrafts(); render(); return; }
  if (act === "unit") { const de = grp(); de.unit = b.dataset.u; saveDrafts(); render(); return; }
  if (act === "addextra") { workoutExpanded.add("extra-"+getDraft(S.dayId).extra.length);getDraft(S.dayId).extra.push({ name:"", unit:(S.defaultUnit||getDay(S.dayId).unit||DEFAULT_UNIT), sets:[{w:"",r:""},{w:"",r:""},{w:"",r:""}] }); saveDrafts(); render();
    const el = document.querySelector(`[data-key="xname-${getDraft(S.dayId).extra.length-1}"]`); if (el) el.focus(); return; }
  if (act === "rmextra") { getDraft(S.dayId).extra.splice(+b.dataset.i, 1); sheet=null; saveDrafts(); render(); return; }
  if (act === "newworkout") { S.editing = { id: uid("c"), name:"", type:"other", unit:DEFAULT_UNIT, ex:[{n:"",s:3,lo:8,hi:12}] }; S.armedDelete = null; render(); window.scrollTo({top:0}); return; }
  if (act === "editday") { const c = S.custom.find(x => x.id === b.dataset.id); if (c) { S.editing = JSON.parse(JSON.stringify(c));if(S.drafts[c.id]&&(draftHasData(S.drafts[c.id])||S.drafts[c.id].workoutTimer?.state!=="idle")){S.editing.id=uid("c");S.editing.name=c.name+" copy";toast("Editing a copy keeps your active session safe.");} S.armedDelete = null; render(); window.scrollTo({top:0}); } return; }
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
    if(!corrected.exercises.length||corrected.exercises.some(ex=>!ex.sets?.length||ex.sets.some(set=>!validWeightText(set.w)||!Number.isInteger(Number(set.r))||Number(set.r)<1))){
      toast("Each exercise needs a set with non-negative weight and positive whole-number reps.");return;
    }
    corrected.notes=(corrected.notes||"").trim();
    for(const ex of corrected.exercises)for(const set of ex.sets){set.w=num(set.w)??0;set.r=Number(set.r);}
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
    if (S.armedDelete !== id) { S.armedDelete = id; b.textContent = act==="delsession" ? "Confirm delete session" : "Confirm delete entry"; b.setAttribute?.("aria-label",b.textContent); toast("Press again to confirm deletion, or choose another action to cancel."); return; }
    S.armedDelete = null;
    try { act === "delsession" ? await removeSession(id) : await removeBody(id); toast("Deleted"); } catch { toast("Couldn't delete. Try again."); }
    render(); return;
  }
  if (act === "addbody") return addBody();
  if (act === "export") return exportJSON();
  if (act === "copyexport") { const ta = $("#exportOut"); ta.select(); try { await navigator.clipboard.writeText(ta.value); toast("Copied"); } catch { document.execCommand && document.execCommand("copy"); toast("Copied"); } return; }
  if (act === "import") { const mode=$("#importMode")?.value; if(mode==="replace"&&!window.confirm("Replace all local Gym Tracker data with this backup? Records missing from the file will be deleted. Export a backup first.")) { importFeedback("Import cancelled — existing data was not changed.",false); return; } return importJSON(); }
});

let sessionSavePending=false;
let savedSessionEdit=null;
let savedSessionEditPending=false;
function reportSessionValidation(message, field){
 const notice=document.querySelector('#session-validation');
 if(notice){notice.hidden=false;notice.textContent=message;}
 if(field){for(let el=field.parentElement;el;el=el.parentElement)if(el.tagName==="DETAILS")el.open=true;field.setAttribute('aria-invalid','true');field.setAttribute('aria-describedby','session-validation');field.focus();}
 toast(message);
}
// Records the saved session set, compared with history before it, for the summary only.
function newRecords(before,session){
 const found=[];
 try{
  for(const e of session.exercises){
   if(isAssisted(e.name))continue;
   const old=calculateRecords(before,e.name,e.unit),now=calculateRecords(S.sessions,e.name,e.unit);
   if(old.heaviest&&now.heaviest&&now.heaviest.value>old.heaviest.value+1e-9)found.push({name:e.name,value:now.heaviest.value,unit:e.unit,label:"heaviest"});
   else if(old.estimated1RM&&now.estimated1RM&&now.estimated1RM.value>old.estimated1RM.value+1e-9)found.push({name:e.name,value:now.estimated1RM.value,unit:e.unit,label:"est. 1RM"});
  }
 }catch{}
 return found.slice(0,4);
}
async function saveSession(btn,{reviewOnly=false,includeUnticked}={}){
  if(sessionSavePending)return;
 const notice=document.querySelector('#session-validation');if(notice){notice.hidden=true;notice.textContent='';}
 document.querySelectorAll('#app [aria-invalid="true"][data-f]').forEach(input=>{input.removeAttribute?.('aria-invalid');if(input.getAttribute?.('aria-describedby')==='session-validation')input.removeAttribute?.('aria-describedby');});
  const day = getDay(S.dayId), d = getDraft(S.dayId);
  const reviewDate=document.querySelector("#review-workout-date");
  if(!reviewOnly&&sessionReview&&reviewDate){if(!validDataDate(reviewDate.value)){reportSessionValidation("Pick a valid workout date.",reviewDate);return;}d.date=reviewDate.value;}
  const reviewNotes=document.querySelector("#review-notes");
  if(!reviewOnly&&sessionReview&&typeof reviewNotes?.value==="string")d.notes=reviewNotes.value;
  if([...d.ex,...d.extra].some(e=>e.sets.some(x=>!validWeightText(x.w) || (String(x.r).trim() && (num(x.r)==null || !Number.isInteger(num(x.r)) || num(x.r)<0))))){reportSessionValidation("Use non-negative weights and whole-number reps.",document.querySelector("#app [data-f=w],#app [data-f=r]"));return;}
  const named=[...d.ex, ...d.extra.filter(x => x.name.trim())];
  let include=includeUnticked ?? (!reviewOnly&&sessionReview?.includeUnticked===true),forcedInclude=false;
  const pending=named.reduce((n,e)=>n+e.sets.filter(s=>loggedSet(s,true)&&!loggedSet(s,false)).length,0);
  const build=include=>named.map(e => ({ name:e.name.trim(),...(e.supersetNext&&d.ex[d.ex.indexOf(e)+1]?.sets.some(s=>loggedSet(s,include))?{supersetNext:true}:{}), ...(resolveExerciseIdentity(e.name,e.exerciseId) ? {exerciseId:resolveExerciseIdentity(e.name,e.exerciseId)} : {}), unit: e.unit || DEFAULT_UNIT, sets: e.sets.filter(s => loggedSet(s,include)).map(s => ({ w: num(s.w) ?? 0, r: num(s.r), completed: true, type:s.type||"working",...(s.toFailure?{toFailure:true}:{}),...(s.restSeconds!=null?{restSeconds:s.restSeconds}:{}),...(s.toFailure?{rir:0}:s.rir===null||s.rir===""||s.rir===undefined?{}:{rir:Number(s.rir)}), ...(s.completedAt ? {completedAt:s.completedAt} : {}) })) })).filter(e => e.sets.length);
  let exercises=build(include);
  if([...d.ex,...d.extra].some(e=>e.sets.some(x=>x.rir!=null&&( !Number.isInteger(Number(x.rir))||Number(x.rir)<0||Number(x.rir)>10)))){reportSessionValidation("RIR must be a whole number from 0 to 10.",document.querySelector("#app [data-f=rir]"));return;}
  // Nothing ticked yet but some sets have reps: open the review with them included, or nothing could be saved.
  if(!exercises.length&&reviewOnly&&!include&&pending>0){include=forcedInclude=true;exercises=build(true);}
  if (!exercises.length) { if(named.some(e=>e.sets.some(s=>num(s.r)>0)))reportSessionValidation("Tick ✓ at least one set first.");else reportSessionValidation("Enter reps for at least one set first.",document.querySelector("#app [data-f=r]")); return; }
  if (!validDataDate(d.date)) { reportSessionValidation("Pick a valid date for this session.",document.querySelector("#app [data-f=date]")); return; }
  const s = { id: uid("s"), dayId: day.id, dayName: day.name, type: day.type, ...Object.fromEntries(["betweenExercisesRest","supersetTransitionRest","supersetRoundRest"].filter(k=>d[k]!=null).map(k=>[k,d[k]])), date: d.date, notes: (d.notes||"").trim(), exercises, createdAt: Date.now() };
  if(reviewOnly){
    d.workoutTimer=timerTools.pauseWorkout(d.workoutTimer);
    if(d.restTimer&&d.restTimer.pausedRemainingMs==null)d.restTimer=timerTools.pause(d.restTimer);
    sessionReview={...s,includeUnticked:include,forcedInclude,pending};saveDrafts();navigateView("review");return;
  }
  sessionSavePending=true;btn.disabled = true; btn.textContent = "Saving…";
  try {
    clearTimeout(draftTimer);
    const before=S.sessions,elapsed=timerTools.workoutElapsed(d.workoutTimer);
    await putSession(s,true);
    setSaveStatus("saved");
    savedSummaryMeta={elapsed,records:newRecords(before,s),next:activeSchedule()?{schedule:activeSchedule().name,label:nextScheduleLabel()}:null};
    savedSummary=s;sessionReview=null;timerWorkoutId=null;navigateView("summary");
    toast("Session saved");
    // Browsers are likelier to grant persistence once the site holds real data, so ask again after the first save.
    if(!persistAskedAfterSave&&storagePersisted!==true){persistAskedAfterSave=true;requestPersistentStorage();}
  } catch { btn.disabled = false; btn.textContent = "Save session"; toast("Couldn't save. Browser storage is full or unavailable. Download a backup."); } finally { sessionSavePending=false; }
}

async function saveWorkout(btn){
  const w = S.editing;
  const name = (w.name||"").trim();
  const previousDefinition=S.custom.find(c=>c.id===w.id);
  const ex = w.ex.map((e,i) => {
    const s = Math.min(10, Math.max(1, Math.round(num(e.s) || 3)));
    let lo = Math.min(50, Math.max(1, Math.round(num(e.lo) || 8))), hi = Math.min(50, Math.max(1, Math.round(num(e.hi) || lo)));
    if (lo > hi) [lo, hi] = [hi, lo];
    return { n: (e.n||"").trim().slice(0,80), s, lo, hi, alt: [], ...(e.exerciseId||(!previousDefinition||!previousDefinition.ex?.[i]||previousDefinition.ex[i].n!==e.n)?{exerciseId:resolveExerciseIdentity(e.n,e.exerciseId)||uid("ex")}:{}) };
  }).filter(e => e.n);
  if (!name) { toast("Give the workout a name."); return; }
  if (!ex.length) { toast("Add at least one exercise."); return; }
  const clean = { id: w.id, name: name.slice(0,30), type: TYPES.some(t => t[0]===w.type) ? w.type : "other", unit: w.unit === "kg" ? "kg" : "lb", ex };
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    const list = S.custom.some(c => c.id === clean.id) ? S.custom.map(c => c.id === clean.id ? clean : c) : [...S.custom, clean];
    await putCustom(list);
    if(S.drafts[clean.id]&&!draftHasData(S.drafts[clean.id])&&S.drafts[clean.id].workoutTimer?.state==="idle")delete S.drafts[clean.id];
    S.editing = null; templateId=clean.id; flushDrafts(); render(); window.scrollTo({top:0}); toast("Workout saved");
  } catch { btn.disabled = false; btn.textContent = "Save workout"; toast("Couldn't save. Try again."); }
}

async function addBody(){
  if (!validWeightText($("#bWeight").value) || !validWeightText($("#bWaist").value)) { toast("Enter numbers only, like 72.5 or 72,5."); return; }
  const date = $("#bDate").value, weight = num($("#bWeight").value), waist = num($("#bWaist").value), unit = $("#bUnit").value === "lb" ? "lb" : "kg"; S.bodyUnit = unit;
  if (!validDataDate(date) || (weight!=null && weight<=0) || (waist!=null && waist<=0) || (!weight && !waist)) { toast("Add a weight or waist measurement."); return; }
  const b = { id: "b" + date, date, weight: weight ?? null, waist: waist ?? null, unit, createdAt: Date.now() };
  try { await putBody(b); if(sheet?.kind==="weight")closeSheet(); else render(); toast("Entry added"); }
  catch { toast("Couldn't save. Try again."); }
}

const DATA_SCHEMA = {"$schema":"https://json-schema.org/draft/2020-12/schema","title":"Gym Tracker app data","description":"Version 4 backup with flexible schedules. Default workouts remain in ppl-default-workouts.json. IDs are unique per collection; schedules must reference available workouts, include a training day, and weekly plans have seven days.","type":"object","properties":{"app":{"const":"ppl-tracker"},"version":{"const":4},"exportedAt":{"anyOf":[{"type":"string","format":"date-time"},{"type":"null"}]},"sessions":{"type":"array","items":{"$ref":"#/$defs/session"}},"body":{"type":"array","items":{"$ref":"#/$defs/body"}},"custom":{"type":"array","items":{"$ref":"#/$defs/custom"}},"drafts":{"type":"object","propertyNames":{"$ref":"#/$defs/id"},"additionalProperties":{"$ref":"#/$defs/draft"}},"preferences":{"$ref":"#/$defs/preferences"},"schedules":{"type":"array","minItems":1,"items":{"$ref":"#/$defs/schedule"}},"calendarEvents":{"type":"array","items":{"$ref":"#/$defs/calendarEvent"}}},"required":["app","version","exportedAt","sessions","body","custom","drafts","preferences","schedules"],"additionalProperties":false,"$defs":{"id":{"type":"string","pattern":"^(?!(?:__proto__|constructor|prototype)$)[A-Za-z0-9_\\-.~:@+]{1,190}$"},"unit":{"type":"string","enum":["kg","lb"]},"date":{"type":"string","format":"date"},"set":{"type":"object","properties":{"w":{"type":"number","minimum":0},"r":{"type":"integer","minimum":1},"id":{"$ref":"#/$defs/id"},"type":{"type":"string","enum":["working","warmup","drop","reverse-drop"]},"completed":{"type":"boolean"},"completedAt":{"anyOf":[{"type":"string","format":"date-time"},{"type":"null"}]},"rir":{"anyOf":[{"type":"integer","minimum":0,"maximum":10},{"type":"null"}]},"restSeconds":{"type":"integer","minimum":0,"maximum":3600},"toFailure":{"type":"boolean"}},"required":["w","r"],"additionalProperties":false},"exercise":{"type":"object","properties":{"name":{"type":"string","minLength":1},"unit":{"type":"string","enum":["kg","lb"]},"sets":{"type":"array","items":{"$ref":"#/$defs/set"},"minItems":1},"exerciseId":{"$ref":"#/$defs/id"},"supersetNext":{"type":"boolean"}},"required":["name","unit","sets"],"additionalProperties":false},"session":{"type":"object","properties":{"id":{"$ref":"#/$defs/id"},"dayId":{"$ref":"#/$defs/id"},"dayName":{"type":"string"},"type":{"type":"string","enum":["pull","push","legs","other"]},"date":{"type":"string","format":"date"},"notes":{"type":"string"},"exercises":{"type":"array","items":{"$ref":"#/$defs/exercise"},"minItems":1},"createdAt":{"type":"integer","minimum":0},"betweenExercisesRest":{"type":"integer","minimum":0,"maximum":600},"supersetTransitionRest":{"type":"integer","minimum":0,"maximum":600},"supersetRoundRest":{"type":"integer","minimum":0,"maximum":600}},"required":["id","dayId","dayName","type","date","notes","exercises","createdAt"],"additionalProperties":false},"body":{"type":"object","properties":{"id":{"$ref":"#/$defs/id"},"date":{"type":"string","format":"date"},"weight":{"anyOf":[{"type":"number","exclusiveMinimum":0},{"type":"null"}]},"waist":{"anyOf":[{"type":"number","exclusiveMinimum":0},{"type":"null"}]},"unit":{"type":"string","enum":["kg","lb"]},"createdAt":{"type":"integer","minimum":0}},"required":["id","date","weight","waist","unit","createdAt"],"additionalProperties":false},"customExercise":{"type":"object","properties":{"n":{"type":"string","minLength":1},"s":{"type":"integer","minimum":1,"maximum":30},"lo":{"type":"integer","minimum":1,"maximum":100},"hi":{"type":"integer","minimum":1,"maximum":100},"alt":{"type":"array","items":{"type":"string"}},"exerciseId":{"$ref":"#/$defs/id"}},"required":["n","s","lo","hi","alt"],"additionalProperties":false},"custom":{"type":"object","properties":{"id":{"$ref":"#/$defs/id"},"name":{"type":"string","minLength":1},"type":{"type":"string","enum":["pull","push","legs","other"]},"unit":{"type":"string","enum":["kg","lb"]},"ex":{"type":"array","items":{"$ref":"#/$defs/customExercise"},"minItems":1}},"required":["id","name","type","unit","ex"],"additionalProperties":false},"draftValue":{"anyOf":[{"type":"string"},{"type":"number"}]},"draftSet":{"type":"object","properties":{"w":{"$ref":"#/$defs/draftValue"},"r":{"$ref":"#/$defs/draftValue"},"id":{"type":"string"},"type":{"type":"string","enum":["working","warmup","drop","reverse-drop"]},"completed":{"type":"boolean"},"completedAt":{"type":"string","format":"date-time"},"rir":{"anyOf":[{"type":"integer","minimum":0,"maximum":10},{"type":"null"}]},"restSeconds":{"type":"integer","minimum":0,"maximum":3600},"toFailure":{"type":"boolean"}},"required":["w","r"],"additionalProperties":false},"draftExercise":{"type":"object","properties":{"name":{"type":"string"},"unit":{"type":"string","enum":["kg","lb"]},"sets":{"type":"array","items":{"$ref":"#/$defs/draftSet"},"minItems":1},"exerciseId":{"type":"string"},"restSeconds":{"type":"integer","minimum":15,"maximum":600},"loadIncrement":{"anyOf":[{"type":"number","exclusiveMinimum":0,"maximum":100},{"type":"string"},{"type":"null"}]},"incrementUnit":{"type":"string","enum":["kg","lb"]},"supersetNext":{"type":"boolean"}},"required":["name","unit","sets"],"additionalProperties":false},"draft":{"type":"object","properties":{"sig":{"type":"string"},"date":{"type":"string","format":"date"},"notes":{"type":"string"},"ex":{"type":"array","items":{"$ref":"#/$defs/draftExercise"},"minItems":1},"extra":{"type":"array","items":{"$ref":"#/$defs/draftExercise"}},"startedAt":{"type":"number","minimum":0},"restSeconds":{"type":"integer","minimum":15,"maximum":600},"recoveryWarning":{"type":"boolean"},"restTimer":{"anyOf":[{"type":"null"},{"type":"object","properties":{"durationSeconds":{"type":"integer","minimum":0,"maximum":3600},"deadline":{"type":"number"},"pausedRemainingMs":{"anyOf":[{"type":"number","minimum":0},{"type":"null"}]}},"required":["durationSeconds","deadline","pausedRemainingMs"],"additionalProperties":false}]},"workoutTimer":{"type":"object","properties":{"state":{"type":"string","enum":["idle","running","paused","stopped"]},"elapsedMs":{"type":"number","minimum":0},"startedAt":{"anyOf":[{"type":"null"},{"type":"number","minimum":0}]}},"required":["state","elapsedMs","startedAt"],"additionalProperties":false},"betweenExercisesRest":{"type":"integer","minimum":0,"maximum":600},"supersetTransitionRest":{"type":"integer","minimum":0,"maximum":600},"supersetRoundRest":{"type":"integer","minimum":0,"maximum":600}},"required":["sig","date","notes","ex","extra"],"additionalProperties":false},"preferences":{"type":"object","properties":{"bodyUnit":{"type":"string","enum":["kg","lb"]},"selectedWorkoutId":{"anyOf":[{"$ref":"#/$defs/id"},{"type":"null"}]},"progressExercise":{"anyOf":[{"type":"string"},{"type":"null"}]},"activeScheduleId":{"anyOf":[{"$ref":"#/$defs/id"},{"type":"null"}]},"exerciseDefaults":{"type":"object","propertyNames":{"type":"string","minLength":1,"maxLength":300,"pattern":"^(?!(__proto__|constructor|prototype)$).+$"},"additionalProperties":{"type":"object","properties":{"restSeconds":{"type":"integer","minimum":15,"maximum":600},"loadIncrement":{"type":"number","exclusiveMinimum":0,"maximum":100},"incrementUnit":{"type":"string","enum":["kg","lb"]}},"additionalProperties":false}},"progressionEnabled":{"type":"boolean"},"globalRestSeconds":{"type":"integer","minimum":15,"maximum":600},"defaultUnit":{"$ref":"#/$defs/unit"}},"required":["bodyUnit","selectedWorkoutId","progressExercise","activeScheduleId"],"additionalProperties":false},"schedule":{"type":"object","properties":{"id":{"$ref":"#/$defs/id"},"name":{"type":"string","minLength":1,"maxLength":80},"mode":{"type":"string","enum":["cycle","weekly"]},"days":{"type":"array","minItems":1,"maxItems":28,"items":{"anyOf":[{"$ref":"#/$defs/id"},{"type":"null"}]}},"cursor":{"type":"integer","minimum":0}},"required":["id","name","mode","days","cursor"],"additionalProperties":false},"calendarEvent":{"type":"object","properties":{"id":{"$ref":"#/$defs/id"},"date":{"$ref":"#/$defs/date"},"type":{"type":"string","enum":["planned","rest","skipped","completed"]},"workoutId":{"anyOf":[{"$ref":"#/$defs/id"},{"type":"null"}]},"sessionId":{"anyOf":[{"$ref":"#/$defs/id"},{"type":"null"}]},"updatedAt":{"type":"string","format":"date-time"}},"required":["id","date","type","updatedAt"],"additionalProperties":false}}};
function validDataDate(date){
  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && !isNaN(Date.parse(date+"T12:00:00Z")) && new Date(date+"T12:00:00Z").toISOString().slice(0,10) === date;
}
function validDataDateTime(v){
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v) && validDataDate(v.slice(0,10)) && /(Z|[+-]\d{2}:\d{2})$/.test(v) && !isNaN(Date.parse(v));
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
      if (schema.format === "date-time" && !validDataDateTime(v)) fail("expected an ISO date and time with timezone");
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
  validateCalendarEvents(value.calendarEvents||[]);
  for(const draft of Object.values(value.drafts||{})){
    const clock=draft.workoutTimer;if(!clock)continue;
    if(clock.state==="running"?clock.startedAt===null:clock.startedAt!==null)throw new Error("data.drafts.workoutTimer: only running clocks may have a start timestamp");
  }
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
    calendarEvents:j.calendarEvents||[],sessions:(j.sessions || []).map(s=>({id:s.id,...Object.fromEntries(["betweenExercisesRest","supersetTransitionRest","supersetRoundRest"].filter(k=>s[k]!=null).map(k=>[k,s[k]])),dayId:s.dayId || "legacy",dayName:s.dayName || "Workout",type:s.type || "other",date:s.date,notes:s.notes || "",createdAt:s.createdAt ?? 0,exercises:(s.exercises || []).map(e=>({name:e.name,...(e.supersetNext?{supersetNext:true}:{}),...(e.exerciseId ? {exerciseId:e.exerciseId} : {}),unit:normalizeUnit(e.unit || s.unit),sets:Array.isArray(e.sets) ? e.sets.map(x=>({...Object.fromEntries(["id","type","completed","completedAt","rir","restSeconds","toFailure"].filter(k=>x[k]!==undefined).map(k=>[k,x[k]])),w:x.w == null ? 0 : Number(x.w),r:Number(x.r)})) : e.sets}))})),
    body:(j.body || []).map(b=>({id:b.id,date:b.date,weight:b.weight == null ? null : Number(b.weight),waist:b.waist == null ? null : Number(b.waist),unit:normalizeUnit(b.unit),createdAt:b.createdAt ?? 0})),
    custom:(j.custom || []).map(c=>({id:c.id,name:c.name,type:c.type || "other",unit:normalizeUnit(c.unit),ex:(c.ex || []).map(e=>({n:e.n,s:e.s,lo:e.lo,hi:e.hi,alt:e.alt || [],...(e.exerciseId ? {exerciseId:e.exerciseId} : {})}))})),
    drafts:normalizeDrafts(j.drafts),schedules:j.schedules || [starterSchedule(j.sessions || [])],preferences:{...preferences(),...(j.preferences || {}),activeScheduleId:Object.hasOwn(j.preferences||{},"activeScheduleId")?j.preferences.activeScheduleId:(j.schedules?.[0]?.id || "starter-ppl")}};
}
// Repairs the draft fields that a half-typed workout can leave invalid, so they don't block a backup.
function sanitizeDraftsForExport(drafts){
  const copy=JSON.parse(JSON.stringify(drafts||{}));
  for(const d of Object.values(copy)){
    if(!d || typeof d!=="object")continue;
    if(!validDataDate(d.date))d.date=today();
    for(const e of [...(Array.isArray(d.ex)?d.ex:[]),...(Array.isArray(d.extra)?d.extra:[])]){
      for(const s of Array.isArray(e?.sets)?e.sets:[]){
        if(!s || typeof s!=="object")continue;
        if(s.rir!==undefined && s.rir!==null && !(Number.isInteger(s.rir) && s.rir>=0 && s.rir<=10))delete s.rir;
        if(s.completedAt!==undefined && !validDataDateTime(s.completedAt))delete s.completedAt;
      }
    }
  }
  return copy;
}
// skippedDrafts collects the ids of in-progress workouts that still don't validate and were left out.
function buildAppData(skippedDrafts=[]){
  const normalized=migrateLegacy({exportedAt:new Date().toISOString(),sessions:S.sessions,body:S.body,custom:S.custom,drafts:{},schedules:S.schedules,preferences:preferences()});
  normalized.calendarEvents=JSON.parse(JSON.stringify(S.calendarEvents));
  const drafts=sanitizeDraftsForExport(S.drafts);
  normalized.drafts=drafts;
  try {return validateAppData(normalized);} catch {}
  // Something still fails: check the rest of the data alone, then keep only the drafts that pass on their own.
  normalized.drafts={};validateAppData(normalized);
  const shell={...normalized,sessions:[],body:[],calendarEvents:[]};
  for(const [id,d] of Object.entries(drafts)){
    try {validateAppData({...shell,drafts:{[id]:d}});normalized.drafts[id]=d;} catch {skippedDrafts.push(id);}
  }
  return validateAppData(normalized);
}
function importFeedback(message, failed=false){
  const el = $("#importResult"); if(el){el.hidden=false;el.textContent=message;el.style.color=failed ? "#aa413b" : "var(--ok)";}
  toast(message);
}
async function exportJSON(){
  let json;const skipped=[];
  try {json = JSON.stringify(buildAppData(skipped),null,2);} catch(err){toast("Cannot export: "+err.message);return;}
  const leftOut=skipped.length?`${skipped.length} in-progress workout${skipped.length===1?"":"s"} couldn't be included.`:"";
  const ta = $("#exportOut"); ta.hidden=false;ta.value=json;$("#copyBtn").hidden=false;
  try {
    const url = URL.createObjectURL(new Blob([json],{type:"application/json"}));
    const a = document.createElement("a");a.href=url;a.download=`ppl-tracker-data-${today()}.json`;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    try{localStorage.setItem("gt-last-export",String(Date.now()));localStorage.removeItem("gt-backup-snooze");}catch{}
    document.querySelectorAll(".backup-export-status").forEach(el=>{el.textContent="Last export started: "+new Date().toLocaleString()+". Check that the downloaded file is saved somewhere safe.";});
    toast(leftOut?"Exported. "+leftOut:"App data export started");
  } catch {toast("Download unavailable. Copy the JSON below."+(leftOut?" "+leftOut:""));}
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
  const previous={sessions:S.sessions,calendarEvents:S.calendarEvents,body:S.body,custom:S.custom,drafts:S.drafts,dayId:S.dayId,defaultUnit:S.defaultUnit,bodyUnit:S.bodyUnit,progressEx:S.progressEx,schedules:S.schedules,activeScheduleId:S.activeScheduleId,exerciseDefaults:S.exerciseDefaults,globalRestSeconds:S.globalRestSeconds,progressionEnabled:S.progressionEnabled};
  const merge=(current,added)=>[...new Map([...current,...added].map(x=>[x.id,x])).values()];
  try {
    S.sessions=sortSessions(replace ? incoming.sessions : merge(S.sessions,incoming.sessions));
    S.body=sortBody(replace ? incoming.body : merge(S.body,incoming.body));
    S.calendarEvents=validateCalendarEvents(replace ? (incoming.calendarEvents||[]) : merge(S.calendarEvents,incoming.calendarEvents||[]));
    S.custom=withCurrentIds(replace ? incoming.custom : merge(S.custom,incoming.custom));
    S.schedules=replace ? incoming.schedules : legacy ? S.schedules : merge(S.schedules,incoming.schedules);
    validateSchedules(S.schedules,S.custom);
    S.activeScheduleId=legacy && !replace ? S.activeScheduleId : incoming.preferences.activeScheduleId ?? null;
    S.drafts=replace ? incoming.drafts : {...S.drafts,...incoming.drafts};
    S.bodyUnit=incoming.preferences.bodyUnit;S.progressEx=incoming.preferences.progressExercise;
    // Replace takes backed-up settings (defaults for older backups); merge
    // preserves current keys absent from incoming and prefers incoming keys.
    const p=incoming.preferences;
    S.defaultUnit=replace?p.defaultUnit:(p.defaultUnit||S.defaultUnit);
    S.globalRestSeconds=replace?(importedPreferenceKeys.includes("globalRestSeconds")?p.globalRestSeconds:90):(importedPreferenceKeys.includes("globalRestSeconds")?p.globalRestSeconds:S.globalRestSeconds||90);
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
