// Calendar events use local YYYY-MM-DD dates; no UTC conversion or inferred missed days.
const EVENT_TYPES=new Set(["planned","rest","skipped","completed"]);
const ID=/^(?!(?:__proto__|constructor|prototype)$)[A-Za-z0-9_\\-.~:@+]{1,190}$/;
export function isLocalDate(date){
 if(typeof date!=="string"||!/^\\d{4}-\\d{2}-\\d{2}$/.test(date))return false;
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
  if(typeof e.updatedAt!=="string"||!Number.isFinite(Date.parse(e.updatedAt))||!/(Z|[+-]\\d{2}:\\d{2})$/.test(e.updatedAt))throw Error("Invalid calendar event timestamp");
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
