// Timestamp-based timers: accurate after tab suspension and page reload.
export function createTimers({now=()=>Date.now()}={}){
 const remaining=t=>!t?0:Math.max(0,Math.ceil(((t.pausedRemainingMs!=null?t.pausedRemainingMs:t.deadline-now()))/1000));
 const start=(seconds)=>({durationSeconds:seconds,deadline:now()+seconds*1000,pausedRemainingMs:null});
 const pause=t=>t.pausedRemainingMs!=null?t:({...t,pausedRemainingMs:Math.max(0,t.deadline-now())});
 const resume=t=>t.pausedRemainingMs==null?t:{...t,deadline:now()+t.pausedRemainingMs,pausedRemainingMs:null};
 const elapsed=startedAt=>startedAt?Math.max(0,Math.floor((now()-startedAt)/1000)):0;
 const idleWorkout=()=>({state:"idle",elapsedMs:0,startedAt:null});
 const workoutMs=t=>Math.max(0,t?.elapsedMs||0)+(t?.state==="running"&&Number.isFinite(t.startedAt)?Math.max(0,now()-t.startedAt):0);
 const workoutElapsed=t=>Math.floor(workoutMs(t)/1000);
 const startWorkout=t=>t?.state==="running"?t:{state:"running",elapsedMs:t?.state==="paused"?workoutMs(t):0,startedAt:now()};
 const pauseWorkout=t=>t?.state==="running"?{state:"paused",elapsedMs:workoutMs(t),startedAt:null}:t;
 const stopWorkout=t=>({state:"stopped",elapsedMs:workoutMs(t),startedAt:null});
 return {remaining,start,pause,resume,elapsed,idleWorkout,workoutElapsed,startWorkout,pauseWorkout,stopWorkout};
}
