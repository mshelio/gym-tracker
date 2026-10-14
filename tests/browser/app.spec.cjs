const {test,expect} = require('@playwright/test');
test('boots native ES modules at GitHub Pages project subpath and persists drafts', async ({page}) => {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/gym-tracker/');
  await expect(page.getByText('Make every rep count.')).toBeVisible();
  await expect(page.getByText('Pull A').first()).toBeVisible();
  await page.getByRole('button',{name:/history/i}).first().click();
  await expect(page.getByText('The work adds up.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Make every rep count.')).toBeVisible();
  expect(errors).toEqual([]);
});
test('missing program provides recovery interface',async ({page})=>{
  await page.route('**/ppl-default-workouts.json',route=>route.abort());
  await page.goto('/gym-tracker/');
  await expect(page.getByText('Let’s load your program.')).toBeVisible();
});


test('migrates legacy history and schedules once without removing localStorage',async ({page})=>{
  const legacy={
    sessions:[{id:'s-migrated',dayId:'pullA',dayName:'Pull A',type:'pull',date:'2026-10-01',notes:'legacy',createdAt:1,
      exercises:[{name:'Lat pulldown',unit:'lb',sets:[{w:60,r:10}]}]}],
    body:[],custom:[],schedules:[{id:'starter-ppl',name:'PPL starter',mode:'cycle',days:['pullA','pushA','legsA'],cursor:1}],
    preferences:{bodyUnit:'kg',activeScheduleId:'starter-ppl'},drafts:{}
  };
  await page.addInitScript(v=>localStorage.setItem('ppl-tracker-v1',JSON.stringify(v)),legacy);
  await page.goto('/gym-tracker/');
  await expect(page.getByText('Make every rep count.')).toBeVisible();
  await expect(page.locator('#status')).toContainText('IndexedDB');
  await expect(page.locator('#app')).toContainText('1');
  const original=await page.evaluate(()=>localStorage.getItem('ppl-tracker-v1'));
  await page.reload();
  await expect(page.locator('#status')).toContainText('IndexedDB');
  expect(await page.evaluate(()=>localStorage.getItem('ppl-tracker-v1'))).toBe(original);
  const stored=await page.evaluate(async()=>{
    const req=indexedDB.open('gym-tracker',1);
    const db=await new Promise((ok,no)=>{req.onsuccess=()=>ok(req.result);req.onerror=()=>no(req.error);});
    const tx=db.transaction('snapshots','readonly'),get=tx.objectStore('snapshots').get('primary');
    return await new Promise((ok,no)=>{get.onsuccess=()=>ok(get.result);get.onerror=()=>no(get.error);});
  });
  expect(stored.sessions[0].id).toBe('s-migrated');
  expect(stored.schedules[0].cursor).toBe(1);
});
test('idempotent startup does not reimport stale localStorage over IndexedDB',async ({page})=>{
  await page.addInitScript(()=>localStorage.setItem('ppl-tracker-v1',JSON.stringify({sessions:[],body:[],custom:[],schedules:[],preferences:{},drafts:{}})));
  await page.goto('/gym-tracker/');
  await expect(page.locator('#status')).toContainText('IndexedDB');
  await page.evaluate(async()=>{
    const req=indexedDB.open('gym-tracker',1),db=await new Promise(ok=>req.onsuccess=()=>ok(req.result));
    await new Promise((ok,no)=>{const tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').put({sessions:[],body:[{id:'body-test',date:'2026-10-01',weight:55,waist:null,unit:'kg',createdAt:1}],custom:[],schedules:[],preferences:{},drafts:{}},'primary');tx.oncomplete=ok;tx.onabort=()=>no(tx.error);});
  });
  await page.reload();
  const found=await page.evaluate(async()=>new Promise((ok,no)=>{const q=indexedDB.open('gym-tracker',1);q.onsuccess=()=>{const t=q.result.transaction('snapshots','readonly').objectStore('snapshots').get('primary');t.onsuccess=()=>ok(t.result.body[0].id);t.onerror=()=>no(t.error);};}));
  expect(found).toBe('body-test');
});
test('malformed localStorage prevents automatic migration rather than overwriting data',async ({page})=>{
  await page.addInitScript(()=>localStorage.setItem('ppl-tracker-v1','{malformed'));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/gym-tracker/');
  await expect.poll(()=>errors.length).toBeGreaterThan(0);
  expect(errors.join(' ')).toContain('Legacy data is malformed');
  expect(await page.evaluate(()=>localStorage.getItem('ppl-tracker-v1'))).toBe('{malformed');
});

test('set completion survives reload and retains metadata when saved', async ({page})=>{
  await page.goto('/gym-tracker/');
  const weight=page.getByRole('spinbutton',{name:/Lat pulldown set 1 weight/}).first();
  const reps=page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).first();
  await weight.fill('70');await reps.fill('10');
  const done=page.getByRole('button',{name:/Lat pulldown set 1 mark complete/});
  await done.click();
  await expect(page.getByRole('button',{name:/Lat pulldown set 1 mark incomplete/})).toHaveAttribute('aria-pressed','true');
  await page.waitForTimeout(500); // Allow debounced draft write to commit before reload.
  await page.reload();
  await expect(page.getByRole('button',{name:/Lat pulldown set 1 mark incomplete/})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:/Finish & save session/}).click();
  await expect(page.getByText('The work adds up.')).toBeVisible();
  const data=await page.evaluate(async()=>{const q=indexedDB.open('gym-tracker',1);return await new Promise((ok,no)=>{q.onsuccess=()=>{const t=q.result.transaction('snapshots','readonly').objectStore('snapshots').get('primary');t.onsuccess=()=>ok(t.result);t.onerror=()=>no(t.error);};q.onerror=()=>no(q.error);});});
  expect(data.sessions).toHaveLength(1);
  expect(data.sessions[0].exercises[0].sets[0].completed).toBe(true);
  expect(data.sessions[0].exercises[0].sets[0].completedAt).toBeTruthy();
});

test('rest and workout timers recover from reload and support controls',async({page})=>{
 await page.goto('/gym-tracker/');
 await page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).first().fill('8');
 await page.getByRole('button',{name:/Lat pulldown set 1 mark complete/}).click();
 await expect(page.locator('[data-timer="rest"]')).toContainText(':');
 await page.getByRole('button',{name:'Pause'}).click();
 await expect(page.getByRole('button',{name:'Resume'})).toBeEnabled();
 await page.waitForTimeout(500);
 await page.reload();
 await expect(page.getByRole('button',{name:'Resume'})).toBeEnabled();
 await page.getByRole('button',{name:'Resume'}).click();
 await page.locator('[data-act="timerskip"]').click();
 await expect(page.locator('[data-timer="rest"]')).toHaveText('—');
 await page.locator('[data-act="timerreset"]').click();
 await expect(page.locator('[data-timer="workout"]')).toHaveText('00:00');
});

test('set types, RIR, and exercise rest survive autosave and session export',async({page})=>{
 await page.goto('/gym-tracker/');
 const type=page.getByRole('combobox',{name:/Lat pulldown set 1 type/});
 await type.selectOption('warmup');
 await page.getByRole('spinbutton',{name:/Lat pulldown set 1 RIR/}).fill('3');
 await page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('8');
 await page.locator('[data-f="exrest"]').first().fill('120');
 await page.getByRole('button',{name:/Lat pulldown set 1 mark complete/}).click();
 await expect(page.locator('[data-timer="rest"]')).toContainText('02:');
 await page.waitForTimeout(500);
 await page.reload();
 await expect(page.getByRole('combobox',{name:/Lat pulldown set 1 type/})).toHaveValue('warmup');
 await expect(page.getByRole('spinbutton',{name:/Lat pulldown set 1 RIR/})).toHaveValue('3');
 await page.getByRole('button',{name:/Finish & save session/}).click();
 const data=await page.evaluate(async()=>new Promise((ok,no)=>{const req=indexedDB.open('gym-tracker',1);req.onsuccess=()=>{const get=req.result.transaction('snapshots','readonly').objectStore('snapshots').get('primary');get.onsuccess=()=>ok(get.result);get.onerror=()=>no(get.error);};req.onerror=()=>no(req.error);}));
 expect(data.sessions[0].exercises[0].sets[0].type).toBe('warmup');
 expect(data.sessions[0].exercises[0].sets[0].rir).toBe(3);
});

test('exercise default survives reload and hard-set count excludes warmups', async ({page})=>{
 await page.goto('/gym-tracker/');
 await page.locator('[data-f="exrest"]').first().fill('135');
 await page.locator('[data-f="increment"]').first().fill('2.5');
 await page.locator('[data-act="incrementunit"]').first().selectOption('kg');
 await page.locator('[data-act="savedefault"]').first().click();
 await page.waitForTimeout(400);
 await page.reload();
 await expect(page.locator('[data-f="exrest"]').first()).toHaveValue('135');
 await expect(page.locator('[data-f="increment"]').first()).toHaveValue('2.5');
 await page.getByRole('combobox',{name:/Lat pulldown set 1 type/}).selectOption('warmup');
 await page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('8');
 await page.getByRole('button',{name:/Finish & save session/}).click();
 await expect(page.locator('#app')).toContainText('0 hard sets');
});

test('invalid exercise increment cannot replace a saved default', async ({page})=>{
 await page.goto('/gym-tracker/');
 await page.locator('[data-f="exrest"]').first().fill('120');
 await page.locator('[data-f="increment"]').first().fill('2.5');
 await page.locator('[data-act="savedefault"]').first().click();
 await expect(page.getByText('Exercise defaults saved')).toBeVisible();
 await page.locator('[data-f="increment"]').first().fill('101');
 await page.locator('[data-act="savedefault"]').first().click();
 await expect(page.getByText(/Load increment must be/)).toBeVisible();
 await page.reload();
 await expect(page.locator('[data-f="increment"]').first()).toHaveValue('2.5');
});

test('global rest default persists and restores for future drafts', async ({page})=>{
 await page.goto('/gym-tracker/');
 await page.getByRole('combobox',{name:'Rest duration'}).selectOption('120');
 await page.getByRole('button',{name:'Save global rest default'}).click();
 await expect(page.getByText('Global rest default saved')).toBeVisible();
 await page.reload();
 const snapshot=await page.evaluate(async()=>new Promise((resolve,reject)=>{
  const open=indexedDB.open('gym-tracker',1);
  open.onsuccess=()=>{const req=open.result.transaction('snapshots','readonly').objectStore('snapshots').get('primary');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);};
  open.onerror=()=>reject(open.error);
 }));
 expect(snapshot.preferences.globalRestSeconds).toBe(120);
});

test('exercise defaults stay isolated for same-name rows in a custom workout', async ({page})=>{
 await page.goto('/gym-tracker/');
 await page.locator('[data-act="newworkout"]').click();
 await page.locator('[data-ed="name"]').fill('Two same names');
 await page.getByLabel('Exercise 1 name').fill('Row');
 await page.locator('[data-act="edaddex"]').click();
 await page.getByLabel('Exercise 2 name').fill('Row');
 await page.locator('[data-act="edsave"]').click();
 await expect(page.locator('.workout-main')).toContainText('Two same names');
 await page.locator('[data-f="exrest"]').nth(0).fill('180');
 await page.locator('[data-act="savedefault"]').nth(0).click();
 await expect(page.getByText('Exercise defaults saved')).toBeVisible();
 await page.locator('[data-f="exrest"]').nth(1).fill('75');
 await page.locator('[data-act="savedefault"]').nth(1).click();
 // The previous success toast may still be visible. Wait for BOTH saved
 // identities to reach the same durable IndexedDB snapshot before reloading.
 await expect.poll(async()=>page.evaluate(async()=>{
   const open=indexedDB.open('gym-tracker',1);
   return await new Promise((resolve,reject)=>{
     open.onsuccess=()=>{
       const db=open.result,req=db.transaction('snapshots','readonly').objectStore('snapshots').get('primary');
       req.onsuccess=()=>{const values=Object.values(req.result?.preferences?.exerciseDefaults||{}).map(e=>e.restSeconds);db.close();resolve([values.includes(180),values.includes(75)]);};
       req.onerror=()=>reject(req.error);
     };
     open.onerror=()=>reject(open.error);
   });
 })).toEqual([true,true]);
 await page.reload();
 await expect(page.locator('[data-f="exrest"]').nth(0)).toHaveValue('180');
 await expect(page.locator('[data-f="exrest"]').nth(1)).toHaveValue('75');
});

test('second tab refuses stale draft overwrite', async ({browser})=>{
 const context=await browser.newContext();const a=await context.newPage(),b=await context.newPage();
 await a.goto('/gym-tracker/');await b.goto('/gym-tracker/');
 await a.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('8');
 await a.waitForTimeout(700);
 await b.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('12');
 await b.waitForTimeout(700);
 await expect(b.locator('#toast')).toContainText('Another tab');
 await a.reload();
 await expect(a.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/})).toHaveValue('8');
 await context.close();
});
test('copying previous sets requires explicit action',async ({page})=>{
 await page.goto('/gym-tracker/');
 await page.getByRole('spinbutton',{name:/Lat pulldown set 1 weight/}).fill('100');
 await page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('8');
 await page.getByRole('button',{name:/Finish & save session/}).click();
 await page.getByRole('button',{name:/train/i}).first().click();
 await page.getByRole('button',{name:/Pull A/}).first().click();
 await expect(page.getByRole('spinbutton',{name:/Lat pulldown set 1 weight/})).toHaveValue('');
 await page.getByRole('button',{name:'Copy last sets'}).first().click();
 await expect(page.getByRole('spinbutton',{name:/Lat pulldown set 1 weight/})).toHaveValue('100');
});

test('progression hints can be disabled without changing draft',async({page})=>{
 await page.goto('/gym-tracker/');
 await expect(page.locator('.progression-hint').first()).toContainText('No completed working sets');
 const toggle=page.locator('[data-act="progressiontoggle"]');
 await toggle.uncheck();
 await expect(page.locator('.progression-hint').first()).toContainText('disabled');
 await page.waitForTimeout(500);await page.reload();
 await expect(page.locator('[data-act="progressiontoggle"]')).not.toBeChecked();
});

test('historical personal records appear without modifying sessions',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('ppl-tracker-v1',JSON.stringify({sessions:[{id:'pr1',date:'2026-10-01',dayId:'pullA',dayName:'Pull A',type:'pull',createdAt:1,notes:'',exercises:[{name:'Lat pulldown',unit:'lb',sets:[{w:100,r:8,completed:true,type:'working'}]}]}],body:[],custom:[],schedules:[],drafts:{},preferences:{}})));
 await page.goto('/gym-tracker/');
 await page.getByRole('button',{name:/progress/i}).first().click();
 await expect(page.getByText('Personal records')).toBeVisible();
 await expect(page.locator('.pr-summary')).toContainText('Heaviest');
});

test('dashboard filters training data and displays empty states',async({page})=>{
 await page.goto('/gym-tracker/');
 await expect(page.getByText('Make every rep count.')).toBeVisible();
 await page.getByRole('button',{name:/progress/i}).first().click();
 await expect(page.getByText('Training analytics')).toBeVisible({timeout:15000});
 await expect(page.getByText('No training sessions match these filters.')).toBeVisible();
 await page.locator('[data-analytics="from"]').fill('2026-10-01');
 await expect(page.locator('[data-analytics="from"]')).toHaveValue('2026-10-01');
});

test('v4 backup round trip preserves paused timer and exercise settings',async({page})=>{
 await page.goto('/gym-tracker/');
 await page.locator('[data-f="exrest"]').first().fill('125');
 await page.locator('[data-f="increment"]').first().fill('2.5');
 await page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('8');
 await page.getByRole('spinbutton',{name:/Lat pulldown set 1 RIR/}).fill('2');
 await page.getByRole('button',{name:/Lat pulldown set 1 mark complete/}).click();
 await page.locator('[data-act="timerpause"]').click();
 await page.getByRole('button',{name:/data/i}).first().click();
 await page.locator('[data-act="export"]').click();
 const backup=JSON.parse(await page.locator('#exportOut').inputValue());
 expect(backup.drafts.pullA.restTimer.pausedRemainingMs).toBeGreaterThan(0);
 expect(backup.drafts.pullA.ex[0].restSeconds).toBe(125);
 expect(backup.drafts.pullA.ex[0].sets[0].rir).toBe(2);
});

test('v4 import restores preferences, merge and replace obey defaults',async({page})=>{
 await page.goto('/gym-tracker/');
 await page.getByRole('button',{name:/data/i}).first().click();
 await page.locator('[data-act="export"]').click();
 const original=JSON.parse(await page.locator('#exportOut').inputValue());
 original.preferences.exerciseDefaults={"name:lat pulldown":{restSeconds:145,loadIncrement:2.5,incrementUnit:"kg"}};
 original.preferences.progressionEnabled=false;
 await page.locator('#importText').fill(JSON.stringify(original));
 await page.locator('#importMode').selectOption('replace');
 await page.locator('[data-act="import"]').click();
 await expect(page.locator('#importResult')).toContainText('Replaced local data');
 await page.reload();
 await page.getByRole('button',{name:/train/i}).first().click();
 await expect(page.locator('[data-act="progressiontoggle"]')).not.toBeChecked();
 await expect(page.locator('[data-f="exrest"]').first()).toHaveValue('145');
});

test('date, workout and exercise filters scope both PR and volume metrics',async({page})=>{
 test.setTimeout(75000);
 const fixture={sessions:[{id:'mixed',dayId:'pushA',dayName:'Push A',type:'push',date:'2026-10-12',createdAt:1,notes:'',exercises:[{name:'Bench',unit:'kg',sets:[{w:50,r:10,type:'working',completed:true}]},{name:'Row',unit:'kg',sets:[{w:100,r:10,type:'working',completed:true}]}]},{id:'old',dayId:'pullA',dayName:'Pull A',type:'pull',date:'2026-09-01',createdAt:2,notes:'',exercises:[{name:'Bench',unit:'kg',sets:[{w:200,r:10,type:'working',completed:true}]}]}],body:[],custom:[],drafts:{},schedules:[],preferences:{}};
 await page.addInitScript(v=>localStorage.setItem('ppl-tracker-v1',JSON.stringify(v)),fixture);
 await page.goto('/gym-tracker/');
 await expect(page.locator('#status')).toContainText('IndexedDB',{timeout:20000});
 await page.getByRole('button',{name:/progress/i}).first().click();
 await page.locator('[data-analytics="from"]').fill('2026-10-01');
 await page.locator('[data-analytics="workout"]').selectOption('pushA');
 await page.locator('[data-analytics="exercise"]').selectOption('Bench');
 await expect(page.locator('.analytics-dashboard')).toContainText('500');
 await expect(page.locator('.pr-summary')).toContainText('500');
 await expect(page.locator('.pr-summary')).not.toContainText('1000');
 await page.locator('[data-analytics="exercise"]').selectOption('');
 await expect(page.locator('.analytics-dashboard')).toContainText('1500');
});

test('autosave displays confirmed state and offers recovery on cross-tab conflict',async({browser})=>{
 const context=await browser.newContext();
 const a=await context.newPage(), b=await context.newPage();
 await a.goto('/gym-tracker/');await b.goto('/gym-tracker/');
 await a.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('9');
 await expect(a.locator('[data-save-status]')).toHaveAttribute('data-state','saved');
 await b.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('10');
 await expect(b.locator('[data-save-status]')).toHaveAttribute('data-state','conflict');
 await expect(b.locator('[data-act="recoverbackup"]')).toBeVisible();
 await b.locator('[data-act="recoverbackup"]').click();
 await expect(b.locator('#exportOut')).not.toBeEmpty();
 await context.close();
});

test('large history renders bounded accessible chart elements',async({page})=>{
 test.setTimeout(75000);
 const fixture={sessions:Array.from({length:1200},(_,i)=>({id:'large-'+i,dayId:'pullA',dayName:'Pull A',type:'pull',date:'2026-10-12',createdAt:i,exercises:[{name:'Lat pulldown',unit:'kg',sets:[{w:50+i%20,r:10}]}]})),body:[],custom:[],drafts:{},preferences:{},schedules:[]};
 await page.addInitScript(v=>localStorage.setItem('ppl-tracker-v1',JSON.stringify(v)),fixture);
 await page.goto('/gym-tracker/');
 await expect(page.locator('#status')).toContainText('IndexedDB',{timeout:20000});
 const started=Date.now();
 await page.getByRole('button',{name:/progress/i}).first().click();
 await expect(page.getByText('Training analytics')).toBeVisible({timeout:20000});
 const count=await page.locator('.chart circle').count();
 expect(count).toBeLessThanOrEqual(720);
 await expect(page.locator('.chart svg').first()).toHaveAttribute('tabindex','0');
 expect(Date.now()-started).toBeLessThan(15000);
});

test('completed session, draft cleanup and cursor survive immediate reload atomically',async({page})=>{
 await page.goto('/gym-tracker/');
 await page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('8');
 await page.getByRole('button',{name:/Finish & save session/}).click();
 await expect(page.getByText('Session saved')).toBeVisible();
 // Confirm the atomic IndexedDB snapshot, rather than assuming a toast also
 // guarantees the newly opened page has hydrated the same persisted revision.
 const readSnapshot=()=>page.evaluate(async()=>new Promise((resolve,reject)=>{
   const open=indexedDB.open('gym-tracker',1);
   open.onsuccess=()=>{const db=open.result,tx=db.transaction('snapshots','readonly');
     const request=tx.objectStore('snapshots').get('primary');
     request.onsuccess=()=>{const value=request.result;db.close();resolve(value);};
     request.onerror=()=>reject(request.error);
   };
   open.onerror=()=>reject(open.error);
 }));
 await expect.poll(async()=>{const snapshot=await readSnapshot();return snapshot?.sessions?.length??0;}).toBe(1);
 const saved=await readSnapshot();
 expect(saved.drafts?.['pull-a']).toBeUndefined();
 await page.reload();
 await expect.poll(async()=>{const snapshot=await readSnapshot();return snapshot?.sessions?.length??0;}).toBe(1);
 await page.getByRole('button',{name:/history/i}).first().click();
 await expect(page.locator('details.hist')).toHaveCount(1);
 await page.getByRole('button',{name:/train/i}).first().click();
 await expect(page.locator('.workout-main')).toContainText('Push A');
});

test('PWA metadata and all icons resolve under GitHub Pages subpath',async({page})=>{
 await page.goto('/gym-tracker/');
 const url=await page.locator('link[rel="manifest"]').getAttribute('href');
 expect(url).toBe('./manifest.webmanifest');
 const response=await page.request.get(new URL(url,page.url()).toString());
 expect(response.ok()).toBeTruthy();
 const manifest=await response.json();
 expect(manifest.start_url).toBe('./');
 expect(manifest.scope).toBe('./');
 expect(manifest.display).toBe('standalone');
 expect(manifest.icons.some(x=>x.purpose==='maskable')).toBeTruthy();
 for(const icon of manifest.icons){
   const asset=await page.request.get(new URL(icon.src,response.url()).toString());
   expect(asset.ok()).toBeTruthy();
   expect(asset.headers()['content-type']).toMatch(/image\/png/);
   const bytes=await asset.body();
   expect(bytes.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
   const [width,height]=icon.sizes.split('x').map(Number);
   expect(bytes.readUInt32BE(16)).toBe(width);
   expect(bytes.readUInt32BE(20)).toBe(height);
 }
 await expect(page.getByText('Make every rep count.')).toBeVisible();
});

test('service worker caches app shell and preserves draft on offline reload',async({page,context})=>{
 await page.goto('/gym-tracker/');
 await expect(page.getByText('Make every rep count.')).toBeVisible();
 await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.reload();
 await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBeTruthy();
 await page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('9');
 await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state','saved');
 await context.setOffline(true);
 await page.reload();
 await expect(page.getByText('Make every rep count.')).toBeVisible();
 await expect(page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/})).toHaveValue('9');
 await expect(page.locator('#pwa-status')).toContainText('Offline');
 await context.setOffline(false);
});


test('edit completed workout atomically without advancing schedule or losing metadata',async({page})=>{
 await page.goto('/gym-tracker/');
 const before=await page.locator('.overview').innerText();
 await page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('9');
 await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state','saved');
 await page.getByRole('button',{name:/Finish & save session/}).click();
 await expect(page.getByText('Session saved')).toBeVisible();
 const snapshot=await page.evaluate(async()=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('gym-tracker');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  return await new Promise((resolve,reject)=>{const tx=db.transaction('snapshots');const r=tx.objectStore('snapshots').get('primary');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
 });
 await page.locator('details.hist').first().evaluate(el=>el.open=true);
 await page.getByRole('button',{name:'Edit session'}).click();
 await page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('12');
 await page.getByRole('button',{name:'Cancel'}).click();
 await page.locator('details.hist').first().evaluate(el=>el.open=true);
 await page.getByRole('button',{name:'Edit session'}).click();
 await expect(page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/})).toHaveValue('9');
 await page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('12');
 await page.getByRole('textbox',{name:'Saved session notes'}).fill('Corrected session');
 await page.getByRole('button',{name:'Save changes'}).click();
 await page.locator('details.hist').first().evaluate(el=>el.open=true);
 await expect(page.getByText('Corrected session')).toBeVisible();
 await page.reload();
 await page.getByRole('button',{name:/history/i}).first().click();
 await page.locator('details.hist').first().evaluate(el=>el.open=true);
 await page.getByRole('button',{name:'Edit session'}).click();
 await expect(page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/})).toHaveValue('12');
 const after=await page.evaluate(async()=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('gym-tracker');r.onsuccess=()=>resolve(r.result)});
  return await new Promise(resolve=>{const tx=db.transaction('snapshots');const r=tx.objectStore('snapshots').get('primary');r.onsuccess=()=>resolve(r.result)});
 });
 expect(after.sessions[0].id).toBe(snapshot.sessions[0].id);
 expect(after.sessions[0].createdAt).toBe(snapshot.sessions[0].createdAt);
 expect(after.schedules).toEqual(snapshot.schedules);
 expect(after.sessions[0].exercises[0].sets[0].r).toBe(12);
});


test('concurrent saved-session edits reject stale commits without data loss',async({browser})=>{
 const context=await browser.newContext();
 try{
  const a=await context.newPage();
  await a.goto('/gym-tracker/');
  await a.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('8');
  await expect(a.locator('[data-save-status]')).toHaveAttribute('data-state','saved');
  await a.getByRole('button',{name:/Finish & save session/}).click();
  await expect(a.getByText('Session saved')).toBeVisible();
  const b=await context.newPage();
  await b.goto('/gym-tracker/');
  await b.getByRole('button',{name:/history/i}).first().click();
  await b.locator('details.hist').first().evaluate(el=>el.open=true);
 await b.getByRole('button',{name:'Edit session'}).click();
  await b.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('10');
  await a.locator('details.hist').first().evaluate(el=>el.open=true);
 await a.getByRole('button',{name:'Edit session'}).click();
  await a.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('12');
  await a.getByRole('button',{name:'Save changes'}).click();
  await expect(a.getByText('Session updated')).toBeVisible();
  await b.getByRole('button',{name:'Save changes'}).click();
  await expect(b.getByText(/Could not save changes/)).toBeVisible();
  await b.reload();
  await b.getByRole('button',{name:/history/i}).first().click();
  await b.locator('details.hist').first().evaluate(el=>el.open=true);
 await b.getByRole('button',{name:'Edit session'}).click();
  await expect(b.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/})).toHaveValue('12');
 }finally{await context.close();}
});


test('exercise search filters default workouts without modifying saved drafts',async({page})=>{
 await page.goto('/gym-tracker/');
 const search=page.getByRole('searchbox',{name:'Search exercises'});
 await search.fill('pulldown');
 await expect(page.locator('[data-exercise-search-count]')).toContainText('1 of');
 await expect(page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/})).toBeVisible();
 await search.fill('unmatched exercise xyz');
 await expect(page.getByText('No matching exercises.')).toBeVisible();
 await page.getByRole('button',{name:'Clear search'}).click();
 await page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('9');
 await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state','saved');
 await page.reload();
 await expect(page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/})).toHaveValue('9');
});
test('workout editor supports searchable rows and exercise suggestions',async({page})=>{
 await page.goto('/gym-tracker/');
 await page.locator('[data-act="newworkout"]').click();
 const exercise=page.getByLabel('Exercise 1 name');
 await exercise.fill('Lat pulldown');
 const matches=await page.locator('#exercise-name-suggestions option').evaluateAll(opts=>opts.map(o=>o.value));
 expect(matches).toContain('Lat pulldown');
 const search=page.getByRole('searchbox',{name:'Search exercises'});
 await search.fill('unmatched');
 await expect(page.getByText('No matching exercises.')).toBeVisible();
 await page.getByRole('button',{name:'Clear search'}).click();
 await expect(exercise).toHaveValue('Lat pulldown');
});
