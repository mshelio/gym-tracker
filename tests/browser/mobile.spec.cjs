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
  await page.getByRole('button',{name:/data/i}).first().tap();
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
  await page.getByRole('button',{name:/history/i}).first().tap();
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
 for(const tab of ['history','calendar','progress','data','log']){
  await page.locator('nav.tabs button[data-tab="'+tab+'"]').click();
  await expect(page.locator('nav.tabs button[data-tab="'+tab+'"]')).toHaveAttribute('aria-current','page');
 }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
});
