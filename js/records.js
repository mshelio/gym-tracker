// Deterministic historical personal records, recomputed from immutable session history.
const factor=0.45359237;
const weight=(w,from,to)=>from===to?w:to==="kg"?w*factor:w/factor;
const rounded=n=>Math.round(n*100)/100;
export function calculateRecords(sessions,exerciseName,unit="kg"){
 if(!["kg","lb"].includes(unit))throw Error("Invalid display unit");
 const entries=[];
 let topWeight=null,topReps=null,topEstimated=null,topVolume=null,volumeTies=0;
 for(const session of sessions||[])for(const ex of session.exercises||[]){
  if(ex.name!==exerciseName)continue;
  const from=ex.unit||session.unit||"lb";if(!["kg","lb"].includes(from))continue;
  for(const set of ex.sets||[]){
   const w=Number(set.w),r=Number(set.r);
   if(set.type==="warmup"||set.completed===false||!Number.isFinite(w)||w<0||!Number.isInteger(r)||r<1)continue;
   entries.push({id:session.id,date:session.date||"",createdAt:session.createdAt||0,weight:weight(w,from,unit),reps:r,estimated1RM:weight(w,from,unit)*(1+r/30)});
  }
 }
 entries.sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt-b.createdAt||String(a.id).localeCompare(String(b.id)));
 const best=(key)=>{let leader=null,count=0;for(const e of entries){if(!leader||e[key]>leader[key]+1e-7){leader=e;count=1;}else if(Math.abs(e[key]-leader[key])<1e-7)count++;}return leader?{...leader,value:rounded(leader[key]),tieCount:count}:null;};
 const atLoad=new Map();for(const e of entries){const k=rounded(e.weight);const current=atLoad.get(k);if(!current||e.reps>current.reps)atLoad.set(k,e);}
 const volumes=(sessions||[]).map(s=>{let total=0;for(const e of s.exercises||[]){if(exerciseName&&e.name!==exerciseName)continue;const from=e.unit||s.unit||"lb";if(!["kg","lb"].includes(from))continue;for(const set of e.sets||[]){const w=Number(set.w),r=Number(set.r);if(set.type==="warmup"||set.completed===false||!Number.isFinite(w)||w<0||!Number.isInteger(r)||r<1)continue;total+=weight(w,from,unit)*r;}}return {id:s.id,date:s.date||"",createdAt:s.createdAt||0,value:rounded(total)};}).filter(x=>x.value>0).sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt-b.createdAt);
 let maxVolume=null,volumeWinner=null;for(const v of volumes){if(maxVolume===null||v.value>maxVolume){maxVolume=v.value;volumeWinner=v;volumeTies=1;}else if(v.value===maxVolume)volumeTies++;}
 return {unit,heaviest:best("weight"),mostReps:best("reps"),estimated1RM:best("estimated1RM"),repAtLoad:[...atLoad].sort((a,b)=>b[0]-a[0]).map(([load,e])=>({load,reps:e.reps})),sessionVolume:maxVolume==null?null:{...volumeWinner,tieCount:volumeTies},sampleCount:entries.length};
}
