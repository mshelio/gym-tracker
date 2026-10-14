// Timestamp-based timers: accurate after tab suspension and page reload.
export function createTimers({now=()=>Date.now()}={}){
 const remaining=t=>!t?0:Math.max(0,Math.ceil(((t.pausedRemainingMs!=null?t.pausedRemainingMs:t.deadline-now()))/1000));
 const start=(seconds)=>({durationSeconds:seconds,deadline:now()+seconds*1000,pausedRemainingMs:null});
 const pause=t=>({...t,pausedRemainingMs:Math.max(0,t.deadline-now())});
 const resume=t=>t.pausedRemainingMs==null?t:{...t,deadline:now()+t.pausedRemainingMs,pausedRemainingMs:null};
 const elapsed=startedAt=>startedAt?Math.max(0,Math.floor((now()-startedAt)/1000)):0;
 return {remaining,start,pause,resume,elapsed};
}
