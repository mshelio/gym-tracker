// Versioned app shell only. Never cache IndexedDB, API mutations or user backups.
const VERSION='gt-shell-2e3991fa';
const SHELL=['./','./index.html','./manifest.webmanifest','./css/styles.css','./ppl-default-workouts.json',
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
