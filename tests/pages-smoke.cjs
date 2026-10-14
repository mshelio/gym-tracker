// Production smoke: isolated browser context, never uses a real user's profile.
const {chromium}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const expectedRevision=(fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8').match(/const VERSION='(gt-shell-[a-f0-9]+)'/)||[])[1];
if(!expectedRevision)throw Error('Invalid release worker revision');
const base=process.env.PAGES_URL||'https://mshelio.github.io/gym-tracker/';
const expected={
 '':'text/html',
 'css/styles.css':'text/css',
 'js/app.js':'javascript',
 'ppl-default-workouts.json':'json',
 'js/storage.js':'javascript',
 'js/config.js':'javascript',
 'sw.js':'javascript',
 'manifest.webmanifest':'json',
 'js/pwa.js':'javascript'
};
async function verify(){
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext();
  const page=await context.newPage();
  const failures=[];page.on('pageerror',e=>failures.push(e.message));
  for(const [path,type] of Object.entries(expected)){
   const url=new URL(path,base).toString();
   const response=await page.request.get(url,{timeout:15000});
   if(response.status()!==200)throw Error(url+' returned '+response.status());
   const mime=response.headers()['content-type']||'';
   if(!mime.includes(type))throw Error(url+' invalid Content-Type '+mime);
   const body=await response.text();
   if(!body.trim())throw Error(url+' returned empty content');
   if(path==='') {
    if(!body.includes('./js/app.js')||!body.includes('./css/styles.css'))throw Error('HTML references missing relative assets');
   }
   if(path==='ppl-default-workouts.json'){
    const json=JSON.parse(body);
    if(!Array.isArray(json.workouts)||!json.workouts.length)throw Error('Program JSON has no workouts');
   }
   console.log('OK',response.status(),mime,url);
  }
  const navigation=await page.goto(base,{waitUntil:'domcontentloaded',timeout:20000});
  if(navigation.status()!==200)throw Error('Document navigation failed');
  await page.getByText('Make every rep count.').waitFor({timeout:15000});
  await page.getByText('Pull A').first().waitFor({timeout:15000});

  // Only compare deployment with checkout on push/deployment events; PR and
  // scheduled runs can legitimately point to different source revisions.
  const deployedWorker=await (await page.request.get(new URL('sw.js',base).href,{headers:{'Cache-Control':'no-cache'}})).text();
  const actualRevision=(deployedWorker.match(/const VERSION='(gt-shell-[a-f0-9]+)'/)||[])[1];
  if(!actualRevision)throw Error('Deployed service worker has no valid cache revision');
  console.log('Deployed service-worker revision:',actualRevision,'repository revision:',expectedRevision);
  if(process.env.REQUIRE_RELEASE_MATCH==='true'&&actualRevision!==expectedRevision)
   throw Error('Deployed service worker is stale: '+actualRevision+' (expected '+expectedRevision+')');
  const manifest=await (await page.request.get(new URL('manifest.webmanifest',base).href)).json();
  const root=new URL('./',base).href;
  if(new URL(manifest.start_url,root).href!==root||new URL(manifest.scope,root).href!==root)
   throw Error('PWA install start URL or scope does not match Pages project path');
  const worker=await page.evaluate(async()=>{const r=await navigator.serviceWorker.ready;return {scope:r.scope,active:r.active?.scriptURL};});
  if(worker.scope!==root||worker.active!==new URL('sw.js',root).href)throw Error('Service worker scope/activation invalid');
  await page.reload();
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller,{timeout:15000});
  const cache=await page.evaluate(async()=>{
   const names=await caches.keys(),name=names.find(n=>n.startsWith('gt-shell-'));
   const keys=name?(await (await caches.open(name)).keys()).map(req=>req.url):[];
   return {name,names,keys};
  });
  if(cache.name!==actualRevision||!cache.keys.includes(new URL('js/app.js',root).href))
   throw Error('Active cache does not contain expected release app shell');
  await page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('9');
  await page.locator('[data-save-status][data-state="saved"]').waitFor({timeout:12000});
  // Offline browser profile is disposable: this never touches a user's data.
  await context.setOffline(true);
  await page.reload();
  await page.getByText('Make every rep count.').waitFor({timeout:15000});
  if(await page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).inputValue()!=='9')
   throw Error('Draft lost during production offline reload');
  await page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('10');
  await page.locator('[data-save-status][data-state="saved"]').waitFor({timeout:12000});
  await page.reload();
  if(await page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).inputValue()!=='10')
   throw Error('Edited offline draft was not durable');
  await context.setOffline(false);
  // Normal update() must never discard a saved draft or force a reload.
  await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update();});
  if(await page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).inputValue()!=='10')
   throw Error('Service-worker update check discarded an active draft');
  console.log('PASS deployed PWA: scope, cache revision, offline startup, IndexedDB draft and update check');
  await page.getByRole('button',{name:/history/i}).first().click();
  await page.getByText('The work adds up.').waitFor({timeout:10000});
  if(failures.length)throw Error('Browser errors: '+failures.join('; '));
  console.log('PASS production startup, navigation and native modules on isolated profile');
  await context.close();
 }finally{await browser.close();}
}
(async()=>{
 for(let attempt=1;attempt<=6;attempt++){
  try{await verify();process.exitCode=0;return;}
  catch(e){console.error('Attempt '+attempt+'/6: '+e.message);if(attempt===6){process.exitCode=1;return;}await new Promise(r=>setTimeout(r,10000));}
 }
})();
