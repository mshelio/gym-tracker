// Pure, explainable double-progression: history is never modified.
const eligible = s => s && s.type !== "warmup" && s.type !== "drop" && s.completed !== false && Number.isInteger(Number(s.r)) && Number(s.r)>0 && Number.isFinite(Number(s.w)) && Number(s.w)>=0;
export function recommendProgression({sessions=[],exerciseName,exerciseId,minimum=6,maximum=12,unit="kg",increment=2.5,incrementUnit=unit,enabled=true}={}){
 if(!enabled)return {kind:"disabled",reason:"Progression suggestions are disabled."};
 if(!exerciseName || !Number.isInteger(minimum)||!Number.isInteger(maximum)||minimum<1||maximum<minimum||!Number.isFinite(increment)||increment<=0)return {kind:"unavailable",reason:"Valid exercise, rep range and load increment are required."};
 const convert=(n,from,to)=>from===to?n:to==="kg"?n*0.45359237:n/0.45359237;
 const history=sessions.slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(b.createdAt||0)-(a.createdAt||0));
 for(const session of history){
  const exercise=(session.exercises||[]).find(e=>exerciseId&&e.exerciseId?e.exerciseId===exerciseId:e.name===exerciseName);
  if(!exercise)continue;
  const sets=(exercise.sets||[]).filter(eligible);
  if(!sets.length)continue;
  const from=exercise.unit||session.unit||"lb";
  if(!["kg","lb"].includes(from)||!["kg","lb"].includes(unit)||!["kg","lb"].includes(incrementUnit))return {kind:"unavailable",reason:"Weight units are unknown."};
  const weights=sets.map(s=>convert(Number(s.w),from,unit));
  const reference=weights[0],consistent=weights.every(w=>Math.abs(w-reference)<0.011);
  if(!consistent)return {kind:"hold",weight:Math.round(reference*100)/100,unit,reason:"Working sets used mixed weights; repeat a consistent load before increasing."};
  const high=sets.every(s=>Number(s.r)>=maximum);
  const low=sets.some(s=>Number(s.r)<minimum);
  const effortKnown=sets.every(s=>s.rir!=null&&Number.isFinite(Number(s.rir)));
  const effortAllows=!effortKnown||sets.every(s=>Number(s.rir)>=1);
  if(high&&effortAllows){const jump=convert(increment,incrementUnit,unit);return {kind:"increase",weight:Math.round((reference+jump)*100)/100,unit,reason:`All ${sets.length} working sets reached ${maximum} reps${effortKnown?" with at least 1 RIR":""}; add ${increment} ${incrementUnit}.`};}
  return {kind:"hold",weight:Math.round(reference*100)/100,unit,reason:low?`At least one working set was below ${minimum} reps; keep the load.`:high?"Recent working sets reached the rep target but RIR was 0; maintain the load.":`Build every working set toward ${maximum} reps before increasing weight.`};
 }
 return {kind:"unavailable",reason:"No completed working sets in workout history yet."};
}
