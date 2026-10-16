async function openNested(page,destination){
 const parent=destination==='history'?'progress':'more';
 await page.locator('nav.tabs button[data-tab="'+parent+'"]').click();
 if(destination==='history')await page.locator('#app .subnav button[data-destination="history"]').click();
 else await page.locator('#app button[data-destination="data"]').first().click();
}
const {test,expect}=require('@playwright/test');
test('mobile viewport, touch navigation, draft recovery and backup',async({page,isMobile})=>{
  expect(isMobile).toBeTruthy();
  await page.goto('/gym-tracker/');
  await expect(page.getByText('Make every rep count.')).toBeVisible();
  const width=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  expect(width).toBeLessThanOrEqual(2);
  await page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('8');
  await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state','saved');
  await page.reload();
  await expect(page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/})).toHaveValue('8');
  await openNested(page,'data');
  await page.locator('[data-act="export"]').tap();
  const snapshot=JSON.parse(await page.locator('#exportOut').inputValue());
  expect(snapshot.drafts.pullA.ex[0].sets[0].r).toBe('8');
  await expect(page.locator('[data-act="import"]')).toBeVisible();
  await page.getByRole('button',{name:/train/i}).first().tap();
  await expect(page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/})).toHaveValue('8');
});

test('mobile session completion and IndexedDB cleanup survive reload',async({page})=>{
  await page.goto('/gym-tracker/');
  await page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('10');
  await page.getByRole('button',{name:/Finish & save session/}).tap();
  await expect(page.getByText('Session saved')).toBeVisible();
  await page.reload();
  await openNested(page,'history');
  await expect(page.locator('details.hist')).toHaveCount(1);
  const record=await page.evaluate(async()=>{
    const req=indexedDB.open('gym-tracker',1);
    const db=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
    const get=db.transaction('snapshots','readonly').objectStore('snapshots').get('primary');
    return new Promise((resolve,reject)=>{get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(get.error);});
  });
  expect(record.sessions).toHaveLength(1);
  expect(record.drafts.pullA).toBeUndefined();
});

test('mobile exercise search keeps filtering accessible and non-destructive',async({page})=>{
 await page.goto('/gym-tracker/');
 const search=page.getByRole('searchbox',{name:'Search exercises'});
 await search.fill('pulldown');
 await expect(page.locator('[data-exercise-search-count]')).toContainText('of');
 await search.fill('impossible exercise name');
 await expect(page.locator('[data-exercise-search-empty]')).toBeVisible();
 await page.getByRole('button',{name:'Clear search'}).click();
 await expect(page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/})).toBeVisible();
});

test('mobile appearance control remains operable and saved after reload',async({page})=>{
 await page.goto('/gym-tracker/');
 const selector=page.locator('#theme-preference');
 await expect(selector).toBeVisible();
 await selector.selectOption('dark');
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await page.reload();
 await expect(selector).toHaveValue('dark');
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(2);
});

test('training dashboard action and five-tab navigation remain usable on mobile',async({page,isMobile})=>{
 expect(isMobile).toBeTruthy();
 await page.goto('/gym-tracker/');
 const action=page.locator('.workout-hero__action');
 await expect(action).toContainText(/Start Workout|Continue Workout/);
 await action.click();
 await expect(page.locator('#workout-editor')).toBeInViewport();
 const tabs=page.locator('nav.tabs button[data-tab]');
 await expect(tabs).toHaveCount(5);
 for(const tab of ['home','log','progress','plan','more']){
  await page.locator('nav.tabs button[data-tab="'+tab+'"]').click();
  await expect(page.locator('nav.tabs button[data-tab="'+tab+'"]')).toHaveAttribute('aria-current','page');
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
});

test('workout set entry, search and timer controls retain accessible mobile presentation',async({page,isMobile})=>{
 expect(isMobile).toBeTruthy();
 await page.goto('/gym-tracker/');
 const search=page.getByRole('search',{name:'Find an exercise'});
 await expect(search).toBeVisible();
 await expect(search.getByRole('searchbox')).toHaveAttribute('aria-describedby','exercise-search-count');
 const set=page.locator('.setrow').first();
 await expect(set).toHaveAttribute('role','group');
 await expect(set.locator('.set-complete')).toHaveAttribute('aria-pressed',/true|false/);
 await expect(page.getByRole('group',{name:'Workout and rest timers'})).toBeVisible();
 await expect(page.locator('.finish-session-action')).toHaveAttribute('aria-describedby','session-save-help');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
});

test('mobile analytics filters, history and calendar remain navigable',async({page,isMobile})=>{
 expect(isMobile).toBeTruthy();
 await page.goto('/gym-tracker/');
 await page.locator('nav.tabs button[data-tab="progress"]').click();
 await expect(page.getByRole('group',{name:'Analytics filters'})).toBeVisible();
 await expect(page.locator('#training-analytics-heading')).toBeVisible();
 await page.locator('nav.tabs button[data-tab="plan"]').click();
 await expect(page.getByRole('region',{name:'Training calendar'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Previous month'})).toBeVisible();
 await openNested(page,'history');
 await expect(page.getByText(/No sessions yet|The work adds up/).first()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
});

test('backup preferences explain destructive replacement and preserve cancellation',async({page,isMobile})=>{
 expect(isMobile).toBeTruthy();
 await page.goto('/gym-tracker/');
 await openNested(page,'data');
 await expect(page.getByText('Supports Gym Tracker backup versions 1 through 4.')).toBeVisible();
 await page.locator('#importMode').selectOption('replace');
 await page.locator('#importText').fill('{}');
 page.once('dialog',dialog=>dialog.dismiss());
 await page.locator('[data-act="import"]').click();
 await expect(page.locator('#importResult')).toContainText('cancelled');
 await expect(page.locator('#importMode')).toHaveValue('replace');
});

test('Home dashboard shows training overview and routes into existing workout flows',async({page,isMobile})=>{
 expect(isMobile).toBeTruthy();
 await page.goto('/gym-tracker/');
 await page.locator('nav.tabs button[data-tab="home"]').click();
 await expect(page.getByRole('region',{name:'Home dashboard'})).toBeVisible();
 await expect(page.getByRole('progressbar',{name:'Weekly workout progress'})).toBeVisible();
 await page.getByRole('button',{name:/Start New Workout/}).click();
 await expect(page.locator('.workout-layout')).toBeVisible();
 await page.locator('nav.tabs button[data-tab="home"]').click();
 await page.getByRole('button',{name:/View schedule/}).click();
 await expect(page.locator('nav.tabs button[data-tab="log"]')).toHaveAttribute('aria-current','page');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
});

test('blue active workout provides accessible editable set cards and previous performance',async({page,isMobile})=>{
 expect(isMobile).toBeTruthy();
 await page.goto('/gym-tracker/');
 const exercise=page.locator('.active-exercise').first();
 await expect(exercise).toBeVisible();
 const set=exercise.locator('.workout-set-row').first();
 await expect(set).toHaveAttribute('role','group');
 await expect(set.getByRole('spinbutton',{name:/weight in/i})).toBeVisible();
 await expect(set.getByRole('spinbutton',{name:/reps/i})).toBeVisible();
 await expect(set.locator('.set-complete')).toHaveAttribute('aria-pressed',/true|false/);
 await expect(page.locator('.redesigned-workout')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
});

test('full-screen rest timer supports open, adjusted countdown and close',async({page,isMobile})=>{
 expect(isMobile).toBeTruthy();
 await page.goto('/gym-tracker/');
 await page.getByRole('button',{name:'Open rest timer'}).click();
 const dialog=page.getByRole('dialog',{name:'Rest timer'});
 await expect(dialog).toBeVisible();
 await expect(dialog.locator('[data-timer="overlay-rest"]')).toBeVisible();
 await expect(dialog.getByRole('button',{name:'Close rest timer'})).toBeVisible();
 await dialog.getByRole('button',{name:'Close rest timer'}).click();
 await expect(dialog).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Open rest timer'})).toBeFocused();
});

test('glass prototype theming and reduced-motion animations remain accessible',async({page,isMobile})=>{
 expect(isMobile).toBeTruthy();
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/gym-tracker/');
 await page.locator('nav.tabs button[data-tab="home"]').click();
 await expect(page.getByRole('region',{name:'Home dashboard'})).toBeVisible();
 const glass=await page.locator('.home-week').evaluate(el=>({blur:getComputedStyle(el).backdropFilter,animation:getComputedStyle(el).animationDuration}));
 expect(glass.blur).toContain('blur');
 const reduced=await page.evaluate(()=>getComputedStyle(document.body,'::before').animationDuration);
 expect(parseFloat(reduced)).toBeLessThanOrEqual(0.001);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
});

test('Phase 1 nested history and backups use parent navigation and preserve accessible labels',async({page,isMobile})=>{
 expect(isMobile).toBeTruthy();
 await page.goto('/gym-tracker/');
 await expect(page.locator('nav.tabs button[data-tab]')).toHaveCount(5);
 await openNested(page,'history');
 await expect(page.locator('nav.tabs button[data-tab="progress"]')).toHaveAttribute('aria-current','page');
 await expect(page.getByRole('navigation',{name:'Progress views'})).toBeVisible();
 await openNested(page,'data');
 await expect(page.locator('nav.tabs button[data-tab="more"]')).toHaveAttribute('aria-current','page');
 await expect(page.getByRole('navigation',{name:'More views'})).toBeVisible();
 await expect(page.locator('[data-act="export"]')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth-window.innerWidth)).toBeLessThanOrEqual(2);
});

test('focused workout cards expose sets and advanced settings by disclosure',async({page,isMobile})=>{
 expect(isMobile).toBeTruthy();
 await page.goto('/gym-tracker/');
 const cards=page.locator('details.focused-exercise');
 await expect(cards.first()).toHaveAttribute('open','');
 await expect(cards.nth(1)).not.toHaveAttribute('open','');
 await expect(cards.first().locator('.exercise-options')).not.toHaveAttribute('open','');
 await cards.first().locator('.exercise-options > summary').click();
 await expect(cards.first().locator('.exercise-options')).toHaveAttribute('open','');
 await expect(page.getByRole('spinbutton',{name:/Lat pulldown set 1 RIR/})).toBeVisible();
 await cards.nth(1).locator('summary').first().click();
 await expect(cards.nth(1)).toHaveAttribute('open','');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(2);
});

test('mobile rest countdown stays accessible outside fullscreen dialog',async({page,isMobile})=>{
 expect(isMobile).toBeTruthy();
 await page.goto('/gym-tracker/');
 const complete=page.getByRole('button',{name:/Lat pulldown set 1 mark complete/});
 const timer=page.locator('.rest-mini');
 await complete.click();
 await expect(timer).toHaveCount(0);
 await expect(page.getByText('Enter reps before completing a set.')).toBeVisible();
 await page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('8');
 await complete.click();
 await expect(page.getByRole('button',{name:/Lat pulldown set 1 mark incomplete/})).toHaveAttribute('aria-pressed','true');
 await expect(timer).toBeVisible();
 await expect(timer.locator('[data-timer="mini-rest"]')).toContainText(/\d\d:\d\d/);
 await timer.click();
 await expect(page.getByRole('dialog',{name:'Rest timer'})).toBeVisible();
});

test('Phase 3 Home disclosure and Progress anchors keep mobile actions accessible',async({page,isMobile})=>{
 expect(isMobile).toBeTruthy();
 await page.goto('/gym-tracker/');
 await page.locator('nav.tabs button[data-tab="home"]').click();
 await expect(page.getByRole('region',{name:'Home dashboard'})).toBeVisible();
 const schedule=page.locator('details.home-secondary');
 await expect(schedule).not.toHaveAttribute('open','');
 await schedule.locator('summary').click();
 await expect(schedule).toHaveAttribute('open','');
 await expect(schedule.getByRole('button',{name:/Manage schedule/})).toBeVisible();
 await page.locator('nav.tabs button[data-tab="progress"]').click();
 const navigation=page.getByRole('navigation',{name:'Progress sections'});
 await expect(navigation.getByRole('link')).toHaveCount(4);
 for(const section of ['training','lifts','muscles','body']){
  await expect(page.locator('#progress-'+section)).toHaveCount(1);
  await expect(navigation.getByRole('link',{name:new RegExp(section,'i')})).toHaveAttribute('href','#progress-'+section);
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
});
