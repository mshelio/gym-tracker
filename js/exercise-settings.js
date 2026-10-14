// Persistent exercise defaults and warm-up-aware volume semantics.
export function exerciseKey(name, exerciseId) {
  return exerciseId ? "id:" + exerciseId : "name:" + String(name || "").trim().toLocaleLowerCase();
}
export function hardSetCount(sessions) {
  return sessions.reduce((total,session)=>total+(session.exercises||[]).reduce((count,exercise)=>count+(exercise.sets||[]).filter(set=>set.type!=="warmup" && set.type!=="drop" && set.completed!==false && Number(set.r)>0).length,0),0);
}
export function normalizeExerciseSetting(raw) {
  if(!raw || typeof raw!=="object")return {};
  const result={};
  if(Number.isInteger(raw.restSeconds)&&raw.restSeconds>=15&&raw.restSeconds<=600)result.restSeconds=raw.restSeconds;
  if(Number.isFinite(raw.loadIncrement)&&raw.loadIncrement>0&&raw.loadIncrement<=100&&["kg","lb"].includes(raw.incrementUnit)) {
    result.loadIncrement=raw.loadIncrement;result.incrementUnit=raw.incrementUnit;
  }
  return result;
}

export function convertIncrement(value,from,to){
 if(!Number.isFinite(value)||value<=0||!["kg","lb"].includes(from)||!["kg","lb"].includes(to))return null;
 return Math.round((from===to?value:(to==="kg"?value*0.45359237:value/0.45359237))*100)/100;
}

/** A set may override rest without changing the exercise's saved preference. */
export function resolveRestSeconds({set,exercise,draft,defaults,globalRestSeconds=90}={}){
 const valid=n=>Number.isInteger(n)&&n>=15&&n<=600;
 for(const n of [set?.restSeconds,exercise?.restSeconds,defaults?.restSeconds,draft?.restSeconds,globalRestSeconds,90]){
  if(valid(n))return n;
 }
 return 90;
}
