const {test,expect}=require('@playwright/test');
const {enterSession,saveSession,openNested,library,openDetails}=require('./flow-helpers.cjs');

test('mobile viewport, touch navigation, draft recovery and backup',async({page})=>{
 await page.goto('/gym-tracker/');await enterSession(page);
 await page.getByRole('spinbutton',{name:'Lat pulldown set 1 reps',exact:true}).fill('10');await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state','saved');
 await page.reload();await enterSession(page);await expect(page.getByRole('spinbutton',{name:'Lat pulldown set 1 reps',exact:true})).toHaveValue('10');
 await openNested(page,'data');await page.locator('[data-act=export]').click();const backup=JSON.parse(await page.locator('#exportOut').inputValue());expect(backup.drafts.pullA.ex[0].sets[0].r).toBe('10');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});
test('mobile session completion and IndexedDB cleanup survive reload',async({page})=>{
 await page.goto('/gym-tracker/');await enterSession(page);await page.getByRole('spinbutton',{name:'Lat pulldown set 1 reps',exact:true}).fill('10');await saveSession(page);await page.reload();await openNested(page,'history');await expect(page.locator('details.hist')).toHaveCount(1);
 const draft=await page.evaluate(async()=>{const db=await new Promise(ok=>{const r=indexedDB.open('gym-tracker');r.onsuccess=()=>ok(r.result)});return new Promise(ok=>{const r=db.transaction('snapshots').objectStore('snapshots').get('primary');r.onsuccess=()=>ok(r.result.drafts.pullA)})});expect(draft).toBeUndefined();
});
test('training dashboard action and three-tab navigation remain usable on mobile',async({page})=>{
 await page.goto('/gym-tracker/');await expect(page.locator('nav.tabs button')).toHaveText(['Today','Plan','Progress']);
 for(const tab of ['plan','progress','home']){await page.locator(`nav.tabs [data-tab=${tab}]`).tap();await expect(page.locator(`nav.tabs [data-tab=${tab}]`)).toHaveAttribute('aria-current','page');}
 await enterSession(page);await expect(page.locator('.focused-exercise[open]')).toHaveCount(1);
 await page.locator('[data-act=nextexercise]').first().click();await expect(page.locator('[data-exercise-id=base-1]')).toHaveAttribute('open','');
 await page.locator('[data-exercise-id=base-0] > summary').click();await expect(page.getByRole('spinbutton',{name:'Lat pulldown set 1 reps',exact:true})).toBeVisible();
});
test('focused workout cards expose sets and advanced settings by disclosure',async({page})=>{
 await page.goto('/gym-tracker/');await enterSession(page);
 await expect(page.getByRole('combobox',{name:'Lat pulldown set 1 type',exact:true})).not.toBeVisible();
 await openDetails(page,'.focused-exercise:first-of-type .exercise-options');
 await page.getByRole('combobox',{name:'Lat pulldown set 1 type',exact:true}).selectOption('warmup');
 await page.getByRole('spinbutton',{name:'Lat pulldown set 1 RIR',exact:true}).fill('2');
 await page.getByRole('spinbutton',{name:'Lat pulldown set 1 reps',exact:true}).fill('8');await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state','saved');
 await page.reload();await enterSession(page);await openDetails(page,'.focused-exercise:first-of-type .exercise-options');await expect(page.getByRole('combobox',{name:'Lat pulldown set 1 type',exact:true})).toHaveValue('warmup');
});
test('mobile rest countdown stays accessible outside fullscreen dialog',async({page})=>{
 await page.goto('/gym-tracker/');await enterSession(page);
 await page.getByRole('button',{name:'Lat pulldown set 1 mark complete',exact:true}).click();await expect(page.locator('#toast')).toHaveText('Enter reps before completing a set.');
 await page.getByRole('spinbutton',{name:'Lat pulldown set 1 reps',exact:true}).fill('8');await page.getByRole('button',{name:'Lat pulldown set 1 mark complete',exact:true}).click();
 await expect(page.locator('[data-timer=inline-rest]').first()).toHaveText(/01:/);
 await page.getByRole('button',{name:'Workout timer controls',exact:true}).click();await page.getByRole('button',{name:'Open rest timer',exact:true}).click();
 await page.getByRole('button',{name:'+15 sec',exact:true}).click();await expect(page.locator('[data-timer=overlay-rest]')).toHaveText(/01:/);await page.getByRole('button',{name:'Close rest timer'}).click();await expect(page.getByRole('dialog',{name:'Workout timer controls'})).toBeVisible();
});
test('rest timer dialog traps keyboard focus and Escape restores trigger focus',async({page})=>{
 await page.goto('/gym-tracker/');await enterSession(page);await page.getByRole('button',{name:'Workout timer controls',exact:true}).click();await page.getByRole('button',{name:'Start rest',exact:true}).click();await page.getByRole('button',{name:'Open rest timer'}).click();
 await expect(page.getByRole('button',{name:'Close rest timer'})).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(page.getByRole('dialog',{name:'Rest timer',exact:true}).getByRole('button',{name:'Skip rest'})).toBeFocused();await page.keyboard.press('Tab');await expect(page.getByRole('button',{name:'Close rest timer'})).toBeFocused();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Open rest timer'})).toBeFocused();
});
test('workout save validation announces the error and moves focus to reps',async({page})=>{
 await page.goto('/gym-tracker/');await enterSession(page);await page.getByRole('button',{name:'Finish workout',exact:true}).click();await expect(page.locator('#session-validation')).toHaveText('Enter reps for at least one set first.');await expect(page.getByRole('spinbutton',{name:'Lat pulldown set 1 reps',exact:true})).toBeFocused();
});
test('keyboard skip link bypasses navigation and mobile controls retain accessible targets',async({page})=>{
 await page.goto('/gym-tracker/');await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:'Skip to main content'})).toBeFocused();await page.keyboard.press('Enter');
 for(const control of await page.locator('nav.tabs button,.settings-launch').all()){const box=await control.boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);expect(box.width).toBeGreaterThanOrEqual(44);}
});
test('nested history and backups use parent navigation and preserve cancellation',async({page})=>{
 await page.goto('/gym-tracker/');await openNested(page,'history');await expect(page.locator('nav.tabs [data-tab=progress]')).toHaveAttribute('aria-current','page');await openNested(page,'data');await page.locator('[data-act=export]').click();const before=await page.locator('#exportOut').inputValue();await page.locator('#importText').fill(before);await page.locator('#importMode').selectOption('replace');page.once('dialog',d=>d.dismiss());await page.locator('[data-act=import]').click();await expect(page.locator('#importResult')).toContainText('cancelled');
});
test('browser Back and Forward restore Today, session, Plan and Settings',async({page})=>{
 await page.goto('/gym-tracker/');await enterSession(page);await page.locator('nav.tabs [data-tab=plan]').click();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.goBack();await expect(page.locator('.page-intro h1')).toHaveText('Plan');await page.goBack();await expect(page.locator('.session-toolbar')).toBeVisible();await page.goForward();await expect(page.locator('.page-intro h1')).toHaveText('Plan');
});
test('schedule deletion has contextual accessible confirmation before mutation',async({page})=>{
 await page.goto('/gym-tracker/');await page.locator('nav.tabs [data-tab=plan]').click();await page.getByRole('button',{name:/Manage schedules/}).first().click();await page.getByRole('button',{name:'+ Repeating sequence'}).click();await page.locator('[data-schedule-name]').fill('My routine');await page.getByLabel('Step 1 workout',{exact:true}).selectOption('pullA');await page.getByRole('button',{name:'Save & use schedule'}).click();await page.getByRole('button',{name:/Manage schedules/}).first().click();await page.getByRole('button',{name:'Delete schedule My routine',exact:true}).click();await expect(page.getByRole('button',{name:'Confirm delete schedule My routine'})).toBeFocused();await page.getByRole('button',{name:'Confirm delete schedule My routine'}).click();await expect(page.getByRole('heading',{name:'My routine',exact:true})).toHaveCount(0);await expect(page.getByText('No active schedule. Choose a saved plan or create your own.')).toBeVisible();
});
test('reload starts on Today and Back restores the screen actually shown after reload',async({page})=>{
 await page.goto('/gym-tracker/');await page.locator('nav.tabs [data-tab=plan]').click();await page.reload();await expect(page.locator('.page-intro h1')).toHaveText('Today');await page.locator('nav.tabs [data-tab=progress]').click();await page.goBack();await expect(page.locator('.page-intro h1')).toHaveText('Today');await page.goForward();await expect(page.locator('.page-intro h1')).toHaveText('Progress');
});
