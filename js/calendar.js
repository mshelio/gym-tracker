// Calendar events use local YYYY-MM-DD dates; no UTC conversion or inferred missed days.
const EVENT_TYPES=new Set(["planned","rest","skipped","completed"]);
const ID=/^(?!(?:__proto__|constructor|prototype)$)[A-Za-z0-9_.~:@+-]{1,190}$/;
export function isLocalDate(date){
 if(typeof date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
 const stamp=new Date(date+"T12:00:00Z");
 return !Number.isNaN(stamp.getTime())&&stamp.toISOString().slice(0,10)===date;
}
export function validateCalendarEvents(events){
 if(!Array.isArray(events))throw Error("Calendar events must be an array");
 const ids=new Set();
 for(const e of events){
  if(!e||!ID.test(e.id)||ids.has(e.id))throw Error("Calendar event IDs must be unique and valid");
  ids.add(e.id);
  if(!isLocalDate(e.date)||!EVENT_TYPES.has(e.type))throw Error("Invalid calendar event date or type");
  if(e.workoutId!=null&&!ID.test(e.workoutId))throw Error("Invalid calendar workout ID");
  if(e.sessionId!=null&&!ID.test(e.sessionId))throw Error("Invalid calendar session ID");
  if(typeof e.updatedAt!=="string"||!Number.isFinite(Date.parse(e.updatedAt))||!/(Z|[+-]\d{2}:\d{2})$/.test(e.updatedAt))throw Error("Invalid calendar event timestamp");
  if(e.type==="completed"&&!e.sessionId)throw Error("Completed event must link to a session");
 }
 return events;
}
export function upsertCalendarEvent(events,event){
 validateCalendarEvents([event]);
 return validateCalendarEvents([...events.filter(e=>e.id!==event.id),event]);
}
export function removeCalendarEvent(events,id){
 return validateCalendarEvents(events.filter(e=>e.id!==id));
}
// Weekly schedules project weekdays; cycle schedules are sequence positions,
// not calendar dates. Do not invent a missed event on past empty days.
export function projectWeeklyCalendar(schedule,from,to,events=[]){
 if(!isLocalDate(from)||!isLocalDate(to)||to<from)throw Error("Invalid calendar range");
 validateCalendarEvents(events);
 const actual=new Map(events.map(e=>[e.date,e]));
 const projection=[];
 if(schedule?.mode!=="weekly"||schedule.days?.length!==7)return projection;
 const end=Date.parse(to+"T12:00:00Z"),start=Date.parse(from+"T12:00:00Z");
 if((end-start)/86400000>366)throw Error("Calendar range too large");
 for(let ms=start;ms<=end;ms+=86400000){
  const utc=new Date(ms),date=utc.toISOString().slice(0,10);
  if(actual.has(date))continue;
  const workoutId=schedule.days[(utc.getUTCDay()+6)%7];
  projection.push({date,type:workoutId?"planned":"rest",workoutId:workoutId||null,projected:true});
 }
 return projection;
}

export function shiftCalendarMonth(month,delta){
 if(typeof month!=="string"||!/^\d{4}-\d{2}$/.test(month)||!Number.isInteger(delta))throw Error("Invalid month");
 const [year,number]=month.split("-").map(Number);
 if(number<1||number>12)throw Error("Invalid month");
 const d=new Date(Date.UTC(year,number-1+delta,1,12));
 return d.toISOString().slice(0,7);
}
export function calendarPeriod(month,mode="month"){
 if(!/^[0-9]{4}-[0-9]{2}$/.test(month)||!isLocalDate(month+"-01"))throw Error("Invalid month");
 if(mode!=="month"&&mode!=="week")throw Error("Invalid calendar view");
 const start=new Date(month+"-01T12:00:00Z");
 const end=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0,12));
 return {from:start.toISOString().slice(0,10),to:end.toISOString().slice(0,10)};
}
export function calendarDays(from,to,sessions=[],events=[],schedule=null){
 if(!isLocalDate(from)||!isLocalDate(to)||from>to)throw Error("Invalid date range");
 validateCalendarEvents(events);
 const start=Date.parse(from+"T12:00:00Z"),end=Date.parse(to+"T12:00:00Z");
 if((end-start)/86400000>366)throw Error("Calendar range too large");
 const byDate=new Map(),explicit=new Map(), projected=new Map();
 for(const s of sessions)if(isLocalDate(s.date)&&s.date>=from&&s.date<=to){
  const a=byDate.get(s.date)||[];a.push(s);byDate.set(s.date,a);
 }
 for(const e of events)if(e.date>=from&&e.date<=to){
  const a=explicit.get(e.date)||[];a.push(e);explicit.set(e.date,a);
 }
 for(const p of projectWeeklyCalendar(schedule,from,to,events))projected.set(p.date,p);
 const out=[];
 for(let ms=start;ms<=end;ms+=86400000){
  const date=new Date(ms).toISOString().slice(0,10);
  const logged=byDate.get(date)||[],declared=explicit.get(date)||[],planned=projected.get(date);
  const hasCompleted=logged.length>0||declared.some(e=>e.type==="completed");
  const type=hasCompleted?"completed":declared.some(e=>e.type==="skipped")?"skipped":declared.find(e=>e.type==="rest"||e.type==="planned")?.type||planned?.type||"none";
  out.push({date,type,sessions:logged,events:declared,workoutId:declared.find(e=>e.workoutId)?.workoutId||planned?.workoutId||null});
 }
 return out;
}
// Only explicit skipped events and actual completed sessions count towards
// adherence; projected historical days are not retroactive missed workouts.
export function calendarAdherence(days){
 let completed=0,skipped=0;
 for(const d of days){
  if(d.type==="completed")completed++;
  else if(d.type==="skipped")skipped++;
 }
 const total=completed+skipped;
 return {completed,skipped,scheduled:total,percent:total?Math.round(completed*100/total):null};
}
