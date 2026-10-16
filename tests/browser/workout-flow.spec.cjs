const {test,expect}=require('@playwright/test');
const dock=page=>page.getByRole('button',{name:'Workout timer controls',exact:true});
const openClock=async page=>{await dock(page).click();return page.getByRole('dialog',{name:'Workout timer controls'});};
const elapsed=page=>page.locator('[data-timer="workout"]');
const rest=page=>page.locator('[data-timer="rest"]');
async function settled(page){await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state','saved');}

test('browsing does not start a timer; explicit pause, resume, stop and reset survive reload',async({page})=>{
 await page.clock.install();
 await page.goto('/gym-tracker/');
 await expect(elapsed(page)).toHaveText('00:00');
 await page.clock.fastForward(60000);
 await page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('8');
 await page.clock.runFor(500);
 await expect(elapsed(page)).toHaveText('00:00');
 let panel=await openClock(page);
 await panel.getByRole('button',{name:'Start workout timer',exact:true}).click();
 await page.clock.fastForward(12000);
 await expect(elapsed(page)).toHaveText('00:12');
 await panel.getByRole('button',{name:'Pause workout',exact:true}).click();
 await page.clock.runFor(500);await settled(page);
 const paused=await elapsed(page).textContent();
 await page.clock.fastForward(60000);
 await expect(elapsed(page)).toHaveText(paused);
 await page.reload();
 await expect(elapsed(page)).toHaveText(paused);
 panel=await openClock(page);
 await panel.getByRole('button',{name:'Resume workout',exact:true}).click();
 await page.clock.fastForward(5000);
 await expect(elapsed(page)).not.toHaveText(paused);
 await panel.getByRole('button',{name:'Stop timer',exact:true}).click();
 await page.clock.runFor(500);await settled(page);
 const stopped=await elapsed(page).textContent();
 await page.clock.fastForward(60000);
 await expect(elapsed(page)).toHaveText(stopped);
 await page.reload();await expect(elapsed(page)).toHaveText(stopped);
 await openClock(page);
 await panel.getByRole('button',{name:'Reset timer',exact:true}).click();
 await page.clock.runFor(500);await settled(page);
 await expect(elapsed(page)).toHaveText('00:00');
 await expect(page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/})).toHaveValue('8');
});

test('left timer stays visible across screens and controls the active workout and rest',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.clock.install();
 await page.goto('/gym-tracker/');
 await page.getByRole('button',{name:'Start Workout',exact:false}).click();
 await page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('8');
 await page.getByRole('button',{name:/Lat pulldown set 1 mark complete/}).click();
 await expect(rest(page)).toContainText('01:');
 for(const tab of ['home','plan','progress','more']){
  await page.locator(`nav.tabs button[data-tab="${tab}"]`).click();
  await expect(dock(page)).toBeInViewport();
  const box=await dock(page).boundingBox();
  expect(box.x).toBeLessThan(20);
  expect(box.y).toBeLessThan(500);
 }
 const panel=await openClock(page);
 await expect(panel.getByRole('heading',{name:'Pull A',exact:true})).toBeVisible();
 await panel.getByRole('button',{name:'Pause rest',exact:true}).click();
 const paused=await rest(page).textContent();
 await page.clock.fastForward(15000);await expect(rest(page)).toHaveText(paused);
 await panel.getByRole('button',{name:'Skip rest',exact:true}).click();
 await expect(rest(page)).toHaveText('—');
 await page.keyboard.press('Escape');
 await expect(panel).toHaveCount(0);
 await expect(dock(page)).toBeFocused();
});

test('a single workout can run at a time and finishing clears its timer',async({page})=>{
 await page.goto('/gym-tracker/');
 await page.locator('.workout-hero__action').click();
 await page.locator('.workout-options > summary').click();
 await page.locator('.plate[data-id="pushA"]').click();
 await page.locator('.workout-hero__action').click();
 await settled(page);
 const states=await page.evaluate(async()=>{
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('gym-tracker');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  return new Promise(resolve=>{const req=db.transaction('snapshots').objectStore('snapshots').get('primary');req.onsuccess=()=>resolve(Object.fromEntries(Object.entries(req.result.drafts).map(([id,d])=>[id,d.workoutTimer.state])))});
 });
 expect(states.pullA).toBe('paused');expect(states.pushA).toBe('running');
 await page.getByRole('spinbutton',{name:/set 1 reps/}).first().fill('8');
 await page.getByRole('button',{name:/Finish & save session/}).click();
 await expect(page.getByText('Session saved')).toBeVisible();
 // A different paused draft remains available; the finished workout must no longer be active.
 await openClock(page);
 await expect(page.getByRole('dialog',{name:'Workout timer controls'}).getByRole('heading',{name:'Push A',exact:true})).toHaveCount(0);
});

test('legacy auto-started drafts reopen paused and their backup retains the new clock state',async({page})=>{
 await page.goto('/gym-tracker/');
 await page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('8');
 await settled(page);
 await page.evaluate(async()=>{
  const db=await new Promise(resolve=>{const r=indexedDB.open('gym-tracker');r.onsuccess=()=>resolve(r.result)});
  await new Promise((resolve,reject)=>{const tx=db.transaction('snapshots','readwrite'),store=tx.objectStore('snapshots'),r=store.get('primary');r.onsuccess=()=>{const value=r.result;delete value.drafts.pullA.workoutTimer;value.drafts.pullA.startedAt=Date.now()-30000;store.put(value,'primary')};tx.oncomplete=resolve;tx.onabort=reject});
 });
 await page.reload();
 await expect(page.locator('[data-clock-state]')).toHaveText('Paused');
 await page.locator('nav.tabs button[data-tab="more"]').click();
 await page.locator('button[data-destination="data"]').first().click();
 await page.locator('[data-act="export"]').click();
 const backup=JSON.parse(await page.locator('#exportOut').inputValue());
 expect(backup.drafts.pullA.workoutTimer.state).toBe('paused');
 expect(backup.drafts.pullA.ex[0].sets[0].r).toBe('8');
});

test('setup stays optional and schedule management belongs to Plan',async({page})=>{
 await page.goto('/gym-tracker/');
 await expect(page.locator('.workout-options')).not.toHaveAttribute('open','');
 await expect(page.locator('.notes-card')).not.toHaveAttribute('open','');
 await expect(page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/})).toBeVisible();
 await page.locator('[data-tab="plan"]').click();
 await page.getByRole('button',{name:'Manage schedules'}).click();
 await expect(page.getByRole('heading',{name:'Your schedules'})).toBeVisible();
 await expect(page.locator('nav.tabs [data-tab="plan"]')).toHaveAttribute('aria-current','page');
 await page.getByRole('button',{name:'Back to plan'}).click();
 await expect(page.getByRole('region',{name:'Training calendar'})).toBeVisible();
 await page.locator('[data-tab="more"]').click();
 await page.getByRole('button',{name:'Workout preferences'}).click();
 await expect(page.locator('.workout-options')).toHaveAttribute('open','');
 await expect(elapsed(page)).toHaveText('00:00');
});
