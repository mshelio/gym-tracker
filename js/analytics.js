// Pure analytics selectors. No persistence mutations.
const KG=0.45359237;
export function analyticsRange(sessions=[],{from="",to="",workout="",exercise=""}={}){
 return sessions.filter(s=>(!from||s.date>=from)&&(!to||s.date<=to)&&(!workout||s.dayId===workout)&&(!exercise||(s.exercises||[]).some(e=>e.name===exercise)));
}
export function analyticsSummary(sessions=[],options={}){
 const filtered=analyticsRange(sessions,options),unit=options.unit==="lb"?"lb":"kg",weeks=new Map(),exercisePoints=[];
 let hardSets=0,totalVolume=0;
 const display=(v,u)=>u===unit?v:u==="lb"?v*KG:v/KG;
 for(const session of filtered){
  const date=session.date||"";
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
  const stamp=new Date(date+"T12:00:00Z");
  if(Number.isNaN(stamp.getTime()))continue;
  const dow=(stamp.getUTCDay()+6)%7;stamp.setUTCDate(stamp.getUTCDate()-dow);
  const week=stamp.toISOString().slice(0,10);
  let row=weeks.get(week);if(!row){row={week,volume:0,hardSets:0,sessions:0};weeks.set(week,row);}row.sessions++;
  for(const ex of session.exercises||[]){
   const from=ex.unit||session.unit||"lb";
   if(!["kg","lb"].includes(from))continue;
   for(const set of ex.sets||[]){
    const w=Number(set.w),r=Number(set.r);
    if(set.completed===false||!Number.isFinite(w)||w<0||!Number.isInteger(r)||r<=0)continue;
    // Volume includes legitimate drop sets, but excludes warm-up.
    if(set.type==="warmup")continue;
    if(options.exercise&&ex.name!==options.exercise)continue;
    const converted=display(w,from),volume=converted*r;
    row.volume+=volume;totalVolume+=volume;
    if(set.type!=="drop"){row.hardSets++;hardSets++;}
    if(ex.name===options.exercise||!options.exercise){
      exercisePoints.push({date,exercise:ex.name,weight:converted,estimated1RM:converted*(1+r/30),reps:r,createdAt:session.createdAt||0});
    }
   }
  }
 }
 const weekly=[...weeks.values()].sort((a,b)=>a.week.localeCompare(b.week)).map(w=>({...w,volume:Math.round(w.volume*100)/100}));
 exercisePoints.sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt-b.createdAt);
 return {unit,sessions:filtered.length,hardSets,volume:Math.round(totalVolume*100)/100,weekly,exercisePoints};
}
