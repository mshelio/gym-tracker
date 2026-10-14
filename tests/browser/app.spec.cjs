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
