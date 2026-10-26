// Versioned app shell only. Never cache IndexedDB, API mutations or user backups.
const VERSION='gt-shell-659d62a0';
const SHELL=['./css/training-design.css','./js/exercise-images.js','./assets/exercises/Ab_Crunch_Machine.jpg','./assets/exercises/Ball_Leg_Curl.jpg','./assets/exercises/Band_Pull_Apart.jpg','./assets/exercises/Barbell_Bench_Press_-_Medium_Grip.jpg','./assets/exercises/Barbell_Hip_Thrust.jpg','./assets/exercises/Barbell_Incline_Bench_Press_-_Medium_Grip.jpg','./assets/exercises/Barbell_Shoulder_Press.jpg','./assets/exercises/Barbell_Squat.jpg','./assets/exercises/Barbell_Walking_Lunge.jpg','./assets/exercises/Bent-Arm_Dumbbell_Pullover.jpg','./assets/exercises/Bent_Over_Barbell_Row.jpg','./assets/exercises/Butt_Lift_Bridge.jpg','./assets/exercises/Butterfly.jpg','./assets/exercises/Cable_Crossover.jpg','./assets/exercises/Cable_Crunch.jpg','./assets/exercises/Cable_Hammer_Curls_-_Rope_Attachment.jpg','./assets/exercises/Calf_Press_On_The_Leg_Press_Machine.jpg','./assets/exercises/Close-Grip_Front_Lat_Pulldown.jpg','./assets/exercises/Cross_Body_Hammer_Curl.jpg','./assets/exercises/Decline_Crunch.jpg','./assets/exercises/Dips_-_Chest_Version.jpg','./assets/exercises/Dumbbell_Bench_Press.jpg','./assets/exercises/Dumbbell_Bicep_Curl.jpg','./assets/exercises/Dumbbell_Flyes.jpg','./assets/exercises/Dumbbell_Incline_Row.jpg','./assets/exercises/Dumbbell_Rear_Lunge.jpg','./assets/exercises/Dumbbell_Shoulder_Press.jpg','./assets/exercises/Dumbbell_Step_Ups.jpg','./assets/exercises/EZ-Bar_Curl.jpg','./assets/exercises/EZ-Bar_Skullcrusher.jpg','./assets/exercises/Face_Pull.jpg','./assets/exercises/Goblet_Squat.jpg','./assets/exercises/Hack_Squat.jpg','./assets/exercises/Hammer_Curls.jpg','./assets/exercises/Hanging_Leg_Raise.jpg','./assets/exercises/Hyperextensions_Back_Extensions.jpg','./assets/exercises/Incline_Dumbbell_Curl.jpg','./assets/exercises/Incline_Dumbbell_Press.jpg','./assets/exercises/Knee_Hip_Raise_On_Parallel_Bars.jpg','./assets/exercises/Leg_Extensions.jpg','./assets/exercises/Leg_Press.jpg','./assets/exercises/Leverage_Iso_Row.jpg','./assets/exercises/Leverage_Shoulder_Press.jpg','./assets/exercises/Lying_Leg_Curls.jpg','./assets/exercises/Machine_Bench_Press.jpg','./assets/exercises/One-Arm_Dumbbell_Row.jpg','./assets/exercises/One_Arm_Lat_Pulldown.jpg','./assets/exercises/Preacher_Curl.jpg','./assets/exercises/Pullups.jpg','./assets/exercises/Reverse_Crunch.jpg','./assets/exercises/Reverse_Machine_Flyes.jpg','./assets/exercises/Romanian_Deadlift.jpg','./assets/exercises/Seated_Bent-Over_Rear_Delt_Raise.jpg','./assets/exercises/Seated_Cable_Rows.jpg','./assets/exercises/Seated_Calf_Raise.jpg','./assets/exercises/Seated_Leg_Curl.jpg','./assets/exercises/Seated_Triceps_Press.jpg','./assets/exercises/Side_Lateral_Raise.jpg','./assets/exercises/Single-Leg_Leg_Extension.jpg','./assets/exercises/Smith_Machine_Calf_Raise.jpg','./assets/exercises/Smith_Machine_Incline_Bench_Press.jpg','./assets/exercises/Smith_Machine_Squat.jpg','./assets/exercises/Split_Squat_with_Dumbbells.jpg','./assets/exercises/Standing_Biceps_Cable_Curl.jpg','./assets/exercises/Standing_Calf_Raises.jpg','./assets/exercises/Standing_Low-Pulley_Deltoid_Raise.jpg','./assets/exercises/Standing_Low-Pulley_One-Arm_Triceps_Extension.jpg','./assets/exercises/Stiff-Legged_Dumbbell_Deadlift.jpg','./assets/exercises/Straight-Arm_Pulldown.jpg','./assets/exercises/T-Bar_Row_with_Handle.jpg','./assets/exercises/Triceps_Pushdown.jpg','./assets/exercises/Triceps_Pushdown_-_Rope_Attachment.jpg','./assets/exercises/V-Bar_Pulldown.jpg','./assets/exercises/Wide-Grip_Lat_Pulldown.jpg','./','./index.html','./manifest.webmanifest','./css/styles.css','./ppl-default-workouts.json',
 './js/app.js','./js/theme.js','./js/pwa.js','./js/config.js','./js/state.js','./js/workouts.js','./js/render.js',
 './js/schedules.js','./js/storage.js','./js/timers.js','./js/exercise-settings.js',
 './js/muscle-map-data.js','./js/anatomy-paths.js','./js/muscle-map-view.js','./css/muscle-map.css',
 './js/progression.js','./js/exercise-catalog.js','./js/records.js','./js/analytics.js','./js/muscle-analytics.js','./js/calendar.js',
 './assets/icons/icon-192.png','./assets/icons/icon-512.png','./assets/icons/icon-maskable-512.png'];
const scope=new URL(self.registration.scope);
const urls=SHELL.map(p=>new URL(p,scope).href);
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(VERSION);
 // Atomic precache: incomplete deployments should not activate.
 try{await cache.addAll(urls);}catch(error){await caches.delete(VERSION);throw error;}
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();
 await Promise.all(keys.filter(k=>k.startsWith('gt-shell-')&&k!==VERSION).map(k=>caches.delete(k)));
 await self.clients.claim();
})()));
self.addEventListener('message',event=>{
 if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 const url=new URL(request.url);
 if(url.origin!==scope.origin||!url.href.startsWith(scope.href))return;
 if(!urls.includes(url.href))return;
 event.respondWith((async()=>{
  const cache=await caches.open(VERSION);
  // Use complete, version-matched shell even during transient network failures.
  const cached=await cache.match(request,{ignoreSearch:true});
  if(cached)return cached;
  try{return await fetch(request);}catch(error){
   if(request.mode==='navigate'){
    const home=await cache.match(new URL('./',scope).href);
    if(home)return home;
   }
   throw error;
  }
 })());
});
