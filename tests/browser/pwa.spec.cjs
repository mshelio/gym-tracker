const {test,expect}=require('@playwright/test');
test.skip(({browserName})=>browserName!=='chromium','Service-worker lifecycle checks run in Chromium; browser matrix covers remaining engines.');

async function controlled(page){
 await page.goto('/gym-tracker/');
 await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.reload();
 await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
}
test('installability metadata and shell cache are repository scoped',async({page})=>{
 await controlled(page);
 const info=await page.evaluate(async()=>{
  const manifest=await (await fetch('./manifest.webmanifest')).json();
  const cache=await caches.open('gt-shell-45d33d3f');
  return {manifest,keys:(await cache.keys()).map(x=>x.url),scope:(await navigator.serviceWorker.ready).scope};
 });
 expect(info.manifest.start_url).toBe('./');
 expect(info.manifest.scope).toBe('./');
 expect(info.manifest.icons.some(x=>x.purpose==='maskable')).toBe(true);
 expect(info.keys.some(x=>x.endsWith('/gym-tracker/ppl-default-workouts.json'))).toBe(true);
 expect(info.scope).toMatch(/\/gym-tracker\/$/);
});
test('offline logging, draft persistence and session completion survive reload',async({page,context,isMobile})=>{
 test.skip(isMobile,'Full offline workout session is covered on desktop Chromium; mobile offline startup is tested separately.');
 await controlled(page);
 await context.setOffline(true);
 await page.reload();
 await expect(page.getByText('Make every rep count.')).toBeVisible();
 await page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('9');
 await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state','saved');
 await page.reload();
 await expect(page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/})).toHaveValue('9');
 await page.getByRole('button',{name:/Finish & save session/}).click();
 await expect(page.getByText('Session saved')).toBeVisible();
 await page.reload();
 await page.getByRole('button',{name:/history/i}).first().click();
 await expect(page.locator('details.hist')).toHaveCount(1);
 await context.setOffline(false);
});
test('program fetch failure does not discard cached workout configuration',async({page})=>{
 await controlled(page);
 await page.route('**/ppl-default-workouts.json',route=>route.abort());
 await page.reload();
 await expect(page.getByText('Make every rep count.')).toBeVisible();
 await expect(page.getByText('Pull A').first()).toBeVisible();
});
test('old worker remains active until an explicit update and drafts survive',async({page})=>{
 await controlled(page);
 await page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('7');
 await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state','saved');
 const before=await page.evaluate(()=>navigator.serviceWorker.controller.scriptURL);
 const reg=await page.evaluate(()=>navigator.serviceWorker.getRegistration());
 expect(reg).toBeTruthy();
 expect(before).toMatch(/\/gym-tracker\/sw\.js$/);
 const preserved=await page.evaluate(async()=>{const cache=await caches.open('gt-shell-45d33d3f');return !!(await cache.match(new URL('./js/app.js',location.href).href))});
 expect(preserved).toBe(true);
 await page.reload();
 await expect(page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/})).toHaveValue('7');
});
test('mobile PWA viewport and offline startup',async({page,context,isMobile})=>{
 test.skip(!isMobile,'Mobile profile only');
 await controlled(page);
 await context.setOffline(true);
 await page.reload();
 await expect(page.getByText('Make every rep count.')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(2);
 await context.setOffline(false);
});

test('service-worker upgrade waits for approval and removes stale shell caches',async({page})=>{
 await controlled(page);
 await page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('11');
 await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state','saved');
 await page.evaluate(async()=>{
  const stale=await caches.open('gt-shell-stale');
  await stale.put(new URL('./old-script.js',location.href).href,new Response('outdated'));
  await navigator.serviceWorker.register('./sw-update-fixture.js',{scope:'./',updateViaCache:'none'});
 });
 await expect(page.locator('#pwa-status')).toContainText('Update available.');
 const before=await page.evaluate(async()=>({
  waiting:!!(await navigator.serviceWorker.getRegistration()).waiting,
  controller:navigator.serviceWorker.controller.scriptURL,
  oldCache:await caches.has('gt-shell-stale')
 }));
 expect(before.waiting).toBe(true);
 expect(before.controller.endsWith('/sw.js')).toBe(true);
 expect(before.oldCache).toBe(true);
 await page.locator('#pwa-status button').click();
 await expect.poll(async()=>{try{return await page.evaluate(async()=>!(await caches.has('gt-shell-stale')))}catch{return false}},{timeout:15000}).toBe(true);
 await expect(page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/})).toHaveValue('11');
});
