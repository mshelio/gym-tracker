const assert=require('node:assert/strict');
(async()=>{
 const {createTimers}=await import('data:text/javascript;base64,'+Buffer.from(require('node:fs').readFileSync(require('node:path').join(__dirname,'../js/timers.js'),'utf8')).toString('base64'));
 let now=100000;
 const timer=createTimers({now:()=>now});
 let clock=timer.idleWorkout();
 now+=60000;
 assert.equal(timer.workoutElapsed(clock),0,'Opening an idle workout must not count time');
 clock=timer.startWorkout(clock);now+=15450;
 assert.equal(timer.workoutElapsed(clock),15);
 clock=timer.pauseWorkout(clock);now+=120000;
 assert.equal(timer.workoutElapsed(clock),15,'Paused time must not accumulate');
 // Persisted clock state must survive a reload without restarting or losing fractions.
 clock=JSON.parse(JSON.stringify(clock));clock=timer.startWorkout(clock);now+=550;
 assert.equal(timer.workoutElapsed(clock),16);
 const running=JSON.parse(JSON.stringify(clock));now+=3000;
 assert.equal(timer.workoutElapsed(running),19,'A running clock must recover wall time after suspension');
 clock=timer.stopWorkout(running);now+=60000;
 assert.equal(timer.workoutElapsed(clock),19,'Stopping preserves elapsed time without continuing');
 clock=timer.startWorkout(clock);
 assert.equal(timer.workoutElapsed(clock),0,'Restart after Stop begins a fresh timer');
 let rest=timer.start(90);now+=10000;rest=timer.pause(rest);now+=50000;
 assert.equal(timer.remaining(rest),80);
 rest=timer.pause(rest);
 assert.equal(timer.remaining(rest),80,'Repeated pause must preserve the remaining rest');
 rest=timer.resume(JSON.parse(JSON.stringify(rest)));now+=81000;
 assert.equal(timer.remaining(rest),0,'Rest expires cleanly after reload');
 console.log('PASS: explicit workout start, pause/resume/stop/restart, suspended-tab recovery, persistent rest pause');
})().catch(error=>{console.error(error);process.exitCode=1});
