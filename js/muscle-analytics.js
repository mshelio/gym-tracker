import { resolveExerciseMetadata } from "./exercise-catalog.js";

const MUSCLE_KG=0.45359237;
const muscleRounded=n=>Math.round(n*100)/100;
const muscleWeekOf=date=>{
 if(typeof date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;
 const day=new Date(date+"T12:00:00Z");
 if(!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==date)return null;
 day.setUTCDate(day.getUTCDate()-(day.getUTCDay()+6)%7);
 return day.toISOString().slice(0,10);
};
// Primary hard sets are exclusive. Secondary credits are a separately reported
// dimension; they must never be added to primary totals as if they were sets.
export function muscleVolumeSummary(sessions=[],{from="",to="",workout="",exercise="",unit="kg",secondaryCredit=0.5}={}){
 if(!Number.isFinite(secondaryCredit)||secondaryCredit<0||secondaryCredit>1)throw Error("Invalid secondary credit");
 const weeks=new Map(),primary=new Map(),secondary=new Map(),unknown=new Map();
 const add=(map,key,sets,volume)=>{const x=map.get(key)||{hardSets:0,volume:0};x.hardSets+=sets;x.volume+=volume;map.set(key,x);};
 let hardSets=0,volume=0;
 for(const session of sessions){
  const date=session.date,week=muscleWeekOf(date);
  if(!week||(from&&date<from)||(to&&date>to)||(workout&&session.dayId!==workout))continue;
  let row=weeks.get(week);if(!row){row={week,primary:new Map(),secondary:new Map(),unknown:{hardSets:0,volume:0}};weeks.set(week,row);}
  for(const item of session.exercises||[]){
   if(exercise&&item.name!==exercise)continue;
   const meta=resolveExerciseMetadata(item.name);
   const source=item.unit||session.unit||"lb";
   if(source!=="kg"&&source!=="lb")continue;
   for(const set of item.sets||[]){
    const weight=Number(set.w),reps=Number(set.r);
    if(set.completed===false||set.type==="warmup"||!Number.isFinite(weight)||weight<0||!Number.isInteger(reps)||reps<=0)continue;
    const load=weight*(source===unit?1:source==="lb"?MUSCLE_KG:1/MUSCLE_KG)*reps;
    const hard=set.type==="drop"?0:1;
    hardSets+=hard;volume+=load;
    if(!meta){add(unknown,"unknown",hard,load);row.unknown.hardSets+=hard;row.unknown.volume+=load;continue;}
    add(primary,meta.primaryMuscle,hard,load);add(row.primary,meta.primaryMuscle,hard,load);
    for(const muscle of new Set(meta.secondaryMuscles||[])){
     if(muscle===meta.primaryMuscle)continue;
     add(secondary,muscle,hard*secondaryCredit,load*secondaryCredit);
     add(row.secondary,muscle,hard*secondaryCredit,load*secondaryCredit);
    }
   }
  }
 }
 const records=map=>[...map].sort(([a],[b])=>a.localeCompare(b)).map(([muscle,x])=>({muscle,hardSets:muscleRounded(x.hardSets),volume:muscleRounded(x.volume)}));
 return {unit,secondaryCredit,hardSets,volume:muscleRounded(volume),primary:records(primary),secondary:records(secondary),unknown:records(unknown)[0]||{muscle:"unknown",hardSets:0,volume:0},
  weekly:[...weeks.values()].sort((a,b)=>a.week.localeCompare(b.week)).map(w=>({week:w.week,primary:records(w.primary),secondary:records(w.secondary),unknown:{hardSets:muscleRounded(w.unknown.hardSets),volume:muscleRounded(w.unknown.volume)}}))};
}
