const {test,expect}=require('@playwright/test');
const {enterSession,library,startTemplate,openNested,openDetails}=require('./flow-helpers.cjs');
const dock=page=>page.getByRole('button',{name:'Workout timer controls',exact:true});
const openClock=async page=>{await dock(page).click();return page.getByRole('dialog',{name:'Workout timer controls'});};
const elapsed=page=>page.locator('[data-timer="workout"]');
const rest=page=>page.locator('[data-timer="rest"]');

test('browsing does not start a timer; explicit pause, resume, stop and reset survive reload',async({page})=>{
 // Only control wall time: workout clocks use Date.now(), while real browser
 // timers keep reload/service-worker lifecycle independent of fake animation frames.
 let now=Date.now();await page.clock.setFixedTime(now);
 const advance=async ms=>{now+=ms;await page.clock.setFixedTime(now);};
 await page.goto('/gym-tracker/');
 await expect(page.getByRole('heading',{name:'Today',exact:true})).toBeVisible();
 await expect(dock(page)).toHaveCount(0);await expect(page.locator('[data-f="r"]')).toHaveCount(0);
 await advance(60000);await library(page);await expect(dock(page)).toHaveCount(0);
 await startTemplate(page,'Pull A');await advance(12000);
 await expect(elapsed(page)).toHaveText('00:12');
 await page.getByRole('spinbutton',{name:'Lat pulldown set 1 reps',exact:true}).fill('8');
 let panel=await openClock(page);await panel.getByRole('button',{name:'Pause workout',exact:true}).click();
 await page.waitForTimeout(500);const paused=await elapsed(page).textContent();
 await advance(60000);await expect(elapsed(page)).toHaveText(paused);
 await page.reload();await expect(elapsed(page)).toHaveText(paused);
 panel=await openClock(page);await panel.getByRole('button',{name:'Resume workout',exact:true}).click();
 await advance(5000);await expect(elapsed(page)).not.toHaveText(paused);
 await panel.getByRole('button',{name:'Stop timer',exact:true}).click();await page.waitForTimeout(500);
 const stopped=await elapsed(page).textContent();await advance(60000);await expect(elapsed(page)).toHaveText(stopped);
 await page.reload();await expect(elapsed(page)).toHaveText(stopped);
 panel=await openClock(page);await panel.getByRole('button',{name:'Reset timer',exact:true}).click();await page.waitForTimeout(500);
 await expect(elapsed(page)).toHaveText('00:00');await page.locator('[data-act="clockreturn"]').click();
 await expect(page.getByRole('spinbutton',{name:'Lat pulldown set 1 reps',exact:true})).toHaveValue('8');
});

test('floating timer stays visible across screens and controls the active workout and rest',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.clock.install();await page.goto('/gym-tracker/');await enterSession(page);
 await page.getByRole('spinbutton',{name:'Lat pulldown set 1 reps',exact:true}).fill('8');
 await page.getByRole('button',{name:'Lat pulldown set 1 mark complete',exact:true}).click();
 await expect(page.locator('[data-timer="inline-rest"]').first()).toHaveText('01:30');
 for(const tab of ['home','plan','progress']){
  await page.locator(`nav.tabs [data-tab="${tab}"]`).click();await expect(dock(page)).toBeInViewport();
  const box=await dock(page).boundingBox(),nav=await page.locator('nav.tabs').boundingBox();
  expect(390-box.x-box.width).toBe(16);expect(box.y+box.height).toBeLessThan(nav.y);
  const padding=await page.locator('#app').evaluate(el=>({left:getComputedStyle(el).paddingLeft,right:getComputedStyle(el).paddingRight}));expect(padding.left).toBe(padding.right);
 }
 await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(dock(page)).toBeInViewport();
 const panel=await openClock(page);await panel.getByRole('button',{name:'Pause rest',exact:true}).click();
 const paused=await rest(page).textContent();await page.clock.fastForward(15000);await expect(rest(page)).toHaveText(paused);
 await panel.getByRole('button',{name:'Skip rest',exact:true}).click();await expect(rest(page)).toHaveText('—');
 await page.keyboard.press('Escape');await expect(panel).toHaveCount(0);await expect(dock(page)).toBeFocused();
});

test('a single workout can run at a time and finishing clears its timer after review',async({page})=>{
 await page.goto('/gym-tracker/');await enterSession(page);
 await page.getByRole('spinbutton',{name:'Lat pulldown set 1 reps',exact:true}).fill('8');
 await startTemplate(page,'Push A');
 await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state','saved');
 const data=await page.evaluate(async()=>{const db=await new Promise(ok=>{const r=indexedDB.open('gym-tracker');r.onsuccess=()=>ok(r.result)});return new Promise(ok=>{const r=db.transaction('snapshots').objectStore('snapshots').get('primary');r.onsuccess=()=>ok(r.result)})});
 await expect.poll(async()=>page.locator('[data-save-status]').getAttribute('data-state')).toBe('saved');
 // Switching keeps the first draft rather than overwriting it.
 await startTemplate(page,'Pull A');await expect(page.getByRole('spinbutton',{name:'Lat pulldown set 1 reps',exact:true})).toHaveValue('8');
 await page.getByRole('button',{name:'Finish workout',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Review session',exact:true})).toBeVisible();
 await expect(page.locator('.session-review')).toContainText('14 unlogged');
 await page.getByRole('button',{name:'Keep training'}).click();await expect(page.getByRole('spinbutton',{name:'Lat pulldown set 1 reps',exact:true})).toHaveValue('8');
 await page.getByRole('button',{name:'Finish workout',exact:true}).click();await page.getByRole('button',{name:'Save session',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Workout complete'})).toBeVisible();
 await page.getByRole('button',{name:'Back to Today'}).click();await expect(page.locator('.today-last')).toContainText('Pull A');
 await openNested(page,'history');await expect(page.locator('details.hist')).toHaveCount(1);
 expect(data.drafts.pullA.ex[0].sets[0].r).toBe('8');expect(data.drafts.pullA.workoutTimer.state).toBe('paused');expect(data.drafts.pushA.workoutTimer.state).toBe('running');expect(Object.values(data.drafts).filter(d=>d.workoutTimer?.state==='running')).toHaveLength(1);
});

test('legacy auto-started drafts reopen paused and their backup retains the new clock state',async({page})=>{
 // Use a complete old-format draft matching the default program.
 const program=await (await page.request.get('/gym-tracker/ppl-default-workouts.json')).json();
 await page.addInitScript(program=>localStorage.setItem('ppl-tracker-v1',JSON.stringify({sessions:[],body:[],custom:[],preferences:{},schedules:[],drafts:{pullA:{sig:program.workouts[0].exercises.map(e=>e.name).join('|'),date:'2026-10-14',notes:'Legacy',startedAt:Date.now()-90000,ex:program.workouts[0].exercises.map((e,i)=>({name:e.name,unit:'lb',sets:[{w:i?'':'50',r:i?'':'8'}]})),extra:[]}}})),program);
 await page.goto('/gym-tracker/');await expect(page.locator('[data-clock-state]')).toHaveText('Paused');const time=await elapsed(page).textContent();await page.reload();await expect(elapsed(page)).toHaveText(time);
 await openNested(page,'data');await page.locator('[data-act="export"]').click();const backup=JSON.parse(await page.locator('#exportOut').inputValue());expect(backup.drafts.pullA.workoutTimer.state).toBe('paused');
});

test('setup stays optional and schedule management belongs to Plan',async({page})=>{
 await page.goto('/gym-tracker/');await expect(page.locator('nav.tabs button')).toHaveText(['Today','Plan','Progress']);
 await expect(page.locator('.schedule-panel')).toHaveCount(0);await expect(page.locator('.focused-exercise')).toHaveCount(0);
 await page.locator('nav.tabs [data-tab="plan"]').click();await page.getByRole('button',{name:/Manage schedules/}).first().click();
 await expect(page.getByRole('heading',{name:'Your schedules'})).toBeVisible();await page.getByRole('button',{name:'← Back to plan'}).click();
 await library(page);await page.locator('.template-card').filter({hasText:'Pull A'}).click();await expect(page.locator('.template-detail')).toContainText('Lat pulldown');await expect(dock(page)).toHaveCount(0);
 await page.getByRole('button',{name:'Customize a copy'}).click();await page.locator('[data-ed="name"]').fill('My pull');await page.getByRole('button',{name:'Save workout',exact:true}).click();
 await expect(page.locator('.template-detail h2')).toHaveText('My pull');await expect(dock(page)).toHaveCount(0);
 await page.getByRole('button',{name:'Start this workout'}).click();await expect(page.locator('.page-intro h1')).toHaveText('My pull');
});

test('choosing another workout from Today opens the library without starting a draft',async({page})=>{
 await page.goto('/gym-tracker/');await page.getByRole('button',{name:'Choose a workout'}).click();
 await expect(page.locator('.template-card')).toHaveCount(6);await expect(dock(page)).toHaveCount(0);
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Default weight unit').selectOption('kg');await expect(page.locator('#toast')).toHaveText('Preference saved');
 await page.getByLabel('Default rest time').selectOption('120');await expect(page.locator('#toast')).toHaveText('Preference saved');
 await page.reload();await enterSession(page);await expect(page.getByRole('spinbutton',{name:'Lat pulldown set 1 weight in kilograms',exact:true})).toBeVisible();
 await page.getByRole('spinbutton',{name:'Lat pulldown set 1 reps',exact:true}).fill('8');await page.getByRole('button',{name:'Lat pulldown set 1 mark complete',exact:true}).click();await expect(rest(page)).toHaveText('02:00');
});

test('finish from the floating timer reviews the active workout and invalidates abandoned reviews',async({page})=>{
 await page.goto('/gym-tracker/');await enterSession(page);await page.getByRole('spinbutton',{name:'Lat pulldown set 1 reps',exact:true}).fill('9');
 await page.locator('nav.tabs [data-tab=progress]').click();const panel=await openClock(page);await panel.getByRole('button',{name:'Finish workout',exact:true}).click();await expect(page.locator('.session-review')).toContainText('Pull A');
 await page.locator('nav.tabs [data-tab=home]').click();await page.goBack();await expect(page.getByRole('button',{name:'Save session',exact:true})).toHaveCount(0);await expect(page.getByRole('heading',{name:'Today',exact:true})).toBeVisible();
});

test('editing a template with an active session protects its draft by making a copy',async({page})=>{
 await page.goto('/gym-tracker/');await library(page);await page.locator('.template-card').filter({hasText:'Pull A'}).click();await page.getByRole('button',{name:'Customize a copy'}).click();await page.locator('[data-ed=name]').fill('My session');await page.getByRole('button',{name:'Save workout',exact:true}).click();await page.getByRole('button',{name:'Start this workout'}).click();await page.getByRole('spinbutton',{name:'Lat pulldown set 1 reps',exact:true}).fill('9');await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state','saved');
 await library(page);await page.locator('.template-card').filter({has:page.getByText('My session',{exact:true})}).click();await page.getByRole('button',{name:'Edit template',exact:true}).click();await expect(page.locator('[data-ed=name]')).toHaveValue('My session copy');await page.getByLabel('Exercise 1 name').fill('Different exercise');await page.getByRole('button',{name:'Save workout',exact:true}).click();await enterSession(page);await expect(page.getByRole('spinbutton',{name:'Lat pulldown set 1 reps',exact:true})).toHaveValue('9');
});
