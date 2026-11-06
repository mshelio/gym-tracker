const {test,expect}=require('@playwright/test');
const {enterSession,library,startTemplate,openNested,closeSheet,logSet}=require('./flow-helpers.cjs');
const elapsed=page=>page.locator('[data-timer="workout"]');
const rest=page=>page.locator('[data-timer="rest"]');
const sessionOptions=async page=>{await page.getByRole('button',{name:'Session options',exact:true}).click();return page.getByRole('dialog');};

test('browsing does not start a timer; explicit pause, resume, stop and reset survive reload', { tag: ['@mobile-webkit','@cross-engine'] },async({page})=>{
 // Only control wall time: workout clocks use Date.now(), while real browser
 // timers keep reload/service-worker lifecycle independent of fake animation frames.
 let now=Date.now();await page.clock.setFixedTime(now);
 const advance=async ms=>{now+=ms;await page.clock.setFixedTime(now);};
 await page.goto('/gym-tracker/');
 await expect(page.getByRole('heading',{name:'Today',exact:true})).toBeVisible();
 await expect(elapsed(page)).toHaveCount(0);await expect(page.locator('[data-f="r"]')).toHaveCount(0);
 await advance(60000);await library(page);await expect(page.locator('.resume-bar')).toHaveCount(0);
 await startTemplate(page,'Pull A');await advance(12000);
 await expect(elapsed(page)).toHaveText('00:12');
 await page.getByRole('spinbutton',{name:'Barbell row set 1 reps',exact:true}).fill('8');
 await page.getByRole('button',{name:'Pause workout',exact:true}).click();
 await page.waitForTimeout(500);const paused=await elapsed(page).textContent();
 await advance(60000);await expect(elapsed(page)).toHaveText(paused);
 await page.reload();await expect(page.locator('.today-workout [data-clock-state]')).toHaveText('Paused');await expect(elapsed(page)).toHaveText(paused);
 await enterSession(page);await advance(5000);await expect(elapsed(page)).not.toHaveText(paused);
 let options=await sessionOptions(page);await options.getByRole('button',{name:'Stop timer',exact:true}).click();await closeSheet(page);await page.waitForTimeout(500);
 const stopped=await elapsed(page).textContent();await advance(60000);await expect(elapsed(page)).toHaveText(stopped);
 await page.reload();await expect(page.locator('.today-workout [data-clock-state]')).toHaveText('Stopped');await expect(elapsed(page)).toHaveText(stopped);
 await enterSession(page);options=await sessionOptions(page);await options.getByRole('button',{name:'Reset timer',exact:true}).click();await closeSheet(page);await page.waitForTimeout(500);
 await expect(elapsed(page)).toHaveText('00:00');
 await expect(page.getByRole('spinbutton',{name:'Barbell row set 1 reps',exact:true})).toHaveValue('8');
});

test('rest runs in the session bar and a minimized workout resumes from every tab', { tag: ['@mobile-webkit','@cross-engine'] },async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.clock.install();await page.goto('/gym-tracker/');await enterSession(page);
 await page.getByRole('spinbutton',{name:'Barbell row set 1 reps',exact:true}).fill('8');
 await page.getByRole('button',{name:'Barbell row set 1 mark complete',exact:true}).click();
 await expect(rest(page)).toHaveText('01:30');await expect(page.locator('nav.tabs')).toBeHidden();
 await page.getByRole('button',{name:'Minimize workout',exact:true}).click();
 await expect(page.locator('.today-workout.is-active')).toContainText('Pull A');
 for(const tab of ['plan','progress']){
  await page.locator(`nav.tabs [data-tab="${tab}"]`).click();const bar=page.locator('.resume-bar');await expect(bar).toBeInViewport();
  const box=await bar.boundingBox(),nav=await page.locator('nav.tabs').boundingBox();expect(box.y+box.height).toBeLessThanOrEqual(nav.y);
 }
 await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(page.locator('.resume-bar')).toBeInViewport();
 await page.locator('.resume-bar').click();await expect(page.locator('.session-toolbar')).toBeVisible();
 await page.getByRole('button',{name:'Open rest timer',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Rest timer'});
 await dialog.getByRole('button',{name:'Pause rest',exact:true}).click();
 const paused=await page.locator('[data-timer="overlay-rest"]').textContent();await page.clock.fastForward(15000);await expect(page.locator('[data-timer="overlay-rest"]')).toHaveText(paused);
 await dialog.getByRole('button',{name:'Skip rest',exact:true}).click();
 await expect(dialog).toHaveCount(0);await expect(page.locator('.rest-bar')).toHaveCount(0);
});

test('a single workout can run at a time and finishing clears its timer after review', { tag: ['@mobile-webkit','@cross-engine'] },async({page})=>{
 await page.goto('/gym-tracker/');await enterSession(page);
 await logSet(page,'Barbell row',1,{r:8});
 await startTemplate(page,'Push A');
 await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state','saved');
 const data=await page.evaluate(async()=>{const db=await new Promise(ok=>{const r=indexedDB.open('gym-tracker');r.onsuccess=()=>ok(r.result)});return new Promise(ok=>{const r=db.transaction('snapshots').objectStore('snapshots').get('primary');r.onsuccess=()=>ok(r.result)})});
 await expect.poll(async()=>page.locator('[data-save-status]').getAttribute('data-state')).toBe('saved');
 // Switching keeps the first draft rather than overwriting it.
 await startTemplate(page,'Pull A');await expect(page.getByRole('spinbutton',{name:'Barbell row set 1 reps',exact:true})).toHaveValue('8');
 await page.getByRole('button',{name:'Finish workout',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Review session',exact:true})).toBeVisible();
 await expect(page.locator('.session-review')).toContainText('14 empty sets will be left out.');await expect(page.getByRole('checkbox',{name:'Include them'})).toHaveCount(0);
 await page.getByRole('button',{name:'Keep training'}).click();await expect(page.getByRole('spinbutton',{name:'Barbell row set 1 reps',exact:true})).toHaveValue('8');
 await page.getByRole('button',{name:'Finish workout',exact:true}).click();await page.getByRole('button',{name:'Save session',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Workout complete'})).toBeVisible();
 await page.getByRole('button',{name:'Back to Today'}).click();await expect(page.locator('.today-last')).toContainText('Pull A');
 await openNested(page,'history');await expect(page.locator('details.hist')).toHaveCount(1);
 expect(data.drafts.pullA.ex[0].sets[0].r).toBe('8');expect(data.drafts.pullA.workoutTimer.state).toBe('paused');expect(data.drafts.pushA.workoutTimer.state).toBe('running');expect(Object.values(data.drafts).filter(d=>d.workoutTimer?.state==='running')).toHaveLength(1);
});

test('legacy auto-started drafts reopen paused and their backup retains the new clock state', { tag: ['@mobile-webkit'] },async({page})=>{
 // Use a complete old-format draft matching the default program.
 const program=await (await page.request.get('/gym-tracker/ppl-default-workouts.json')).json();
 await page.addInitScript(program=>localStorage.setItem('ppl-tracker-v1',JSON.stringify({sessions:[],body:[],custom:[],preferences:{},schedules:[],drafts:{pullA:{sig:program.workouts[0].exercises.map(e=>e.name).join('|'),date:'2026-10-14',notes:'Legacy',startedAt:Date.now()-90000,ex:program.workouts[0].exercises.map((e,i)=>({name:e.name,unit:'lb',sets:[{w:i?'':'50',r:i?'':'8'}]})),extra:[]}}})),program);
 await page.goto('/gym-tracker/');await expect(page.locator('[data-clock-state]')).toHaveText('Paused');const time=await elapsed(page).textContent();await page.reload();await expect(elapsed(page)).toHaveText(time);
 await openNested(page,'data');await page.locator('[data-act="export"]').click();const backup=JSON.parse(await page.locator('#exportOut').inputValue());expect(backup.drafts.pullA.workoutTimer.state).toBe('paused');
});

test('setup stays optional and schedule management belongs to Plan', { tag: ['@mobile-webkit'] },async({page})=>{
 await page.goto('/gym-tracker/');await expect(page.locator('nav.tabs button')).toHaveText(['Today','Plan','Progress']);
 await expect(page.locator('.plan-overview')).toHaveCount(0);await expect(page.locator('.focused-exercise')).toHaveCount(0);
 await page.locator('nav.tabs [data-tab="plan"]').click();await page.getByRole('button',{name:/Manage schedules/}).first().click();
 await expect(page.getByRole('heading',{name:'Your schedules'})).toBeVisible();await page.getByRole('button',{name:'← Back to plan'}).click();
 await library(page);await page.locator('.template-card').filter({hasText:'Pull A'}).click();await expect(page.locator('.template-detail')).toContainText('Lat pulldown');await expect(page.locator('.resume-bar')).toHaveCount(0);
 await page.getByRole('button',{name:'Customize a copy'}).click();await page.locator('[data-ed="name"]').fill('My pull');await page.getByRole('button',{name:'Save workout',exact:true}).click();
 await expect(page.locator('.template-detail h2')).toHaveText('My pull');await expect(page.locator('.resume-bar')).toHaveCount(0);
 await page.getByRole('button',{name:'Start this workout'}).click();await expect(page.locator('.page-intro h1')).toHaveText('My pull');
});

test('swapping from Today lists every workout without starting a draft', { tag: ['@mobile-webkit'] },async({page})=>{
 await page.goto('/gym-tracker/');await page.getByRole('button',{name:'Choose a workout',exact:true}).click();
 const sheet=page.getByRole('dialog');await expect(sheet.locator('.pick-list li')).toHaveCount(6);await expect(page.locator('.resume-bar,.session-toolbar')).toHaveCount(0);
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByRole('button',{name:'Choose a workout',exact:true})).toBeFocused();
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Default weight unit').selectOption('kg');await expect(page.locator('#toast')).toHaveText('Preference saved');
 await page.getByLabel('Default rest time').selectOption('120');await expect(page.locator('#toast')).toHaveText('Preference saved');
 await page.reload();await enterSession(page);await expect(page.getByRole('textbox',{name:'Barbell row set 1 weight in kilograms',exact:true})).toBeVisible();
 await page.getByRole('spinbutton',{name:'Barbell row set 1 reps',exact:true}).fill('8');await page.getByRole('button',{name:'Barbell row set 1 mark complete',exact:true}).click();await expect(rest(page)).toHaveText('02:00');
});

test('a minimized workout resumes from Progress and abandoned reviews cannot be saved', { tag: ['@mobile-webkit'] },async({page})=>{
 await page.goto('/gym-tracker/');await enterSession(page);await page.getByRole('spinbutton',{name:'Barbell row set 1 reps',exact:true}).fill('9');
 await page.getByRole('button',{name:'Minimize workout',exact:true}).click();await page.locator('nav.tabs [data-tab=progress]').click();
 await page.locator('.resume-bar').click();await page.getByRole('button',{name:'Finish workout',exact:true}).click();await expect(page.locator('.session-review')).toContainText('Pull A');
 await page.goBack();await expect(page.locator('.session-toolbar')).toBeVisible();
 await page.goForward();await expect(page.getByRole('button',{name:'Save session',exact:true})).toHaveCount(0);await expect(page.getByRole('heading',{name:'Today',exact:true})).toBeVisible();
});

test('editing a template with an active session protects its draft by making a copy', { tag: ['@mobile-webkit'] },async({page})=>{
 await page.goto('/gym-tracker/');await library(page);await page.locator('.template-card').filter({hasText:'Pull A'}).click();await page.getByRole('button',{name:'Customize a copy'}).click();await page.locator('[data-ed=name]').fill('My session');await page.getByRole('button',{name:'Save workout',exact:true}).click();await page.getByRole('button',{name:'Start this workout'}).click();await page.getByRole('spinbutton',{name:'Barbell row set 1 reps',exact:true}).fill('9');await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state','saved');
 await library(page);await page.locator('.template-card').filter({has:page.getByText('My session',{exact:true})}).click();await page.getByRole('button',{name:'Edit template',exact:true}).click();await expect(page.locator('[data-ed=name]')).toHaveValue('My session copy');await page.getByLabel('Exercise 1 name').fill('Different exercise');await page.getByRole('button',{name:'Save workout',exact:true}).click();await enterSession(page);await expect(page.getByRole('spinbutton',{name:'Barbell row set 1 reps',exact:true})).toHaveValue('9');
});
