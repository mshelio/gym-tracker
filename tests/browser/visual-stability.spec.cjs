const {test,expect}=require('@playwright/test');

// Structural visual guardrails run without environment-specific golden PNGs.
// Screenshot artifacts are attached for reviewing unexpected visual changes.
for(const theme of ['light','dark']){
 test('visual stability '+theme+' — shell and Progress at narrow desktop width',async({page},testInfo)=>{
  await page.setViewportSize({width:640,height:800});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/gym-tracker/');
  await page.locator('#theme-preference').selectOption(theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
  const nav=page.locator('nav.tabs');
  const app=page.locator('#app');
  await expect(nav).toBeVisible();
  await expect(app).toBeVisible();
  const first=await nav.boundingBox();
  expect(first.width).toBeGreaterThan(250);
  expect(first.x).toBeGreaterThanOrEqual(0);
  expect(first.x+first.width).toBeLessThanOrEqual(642);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
  await testInfo.attach('train-'+theme,{body:await page.screenshot({animations:'disabled'}),contentType:'image/png'});
  await nav.locator('[data-tab="progress"]').click();
  await expect(page.locator('#progress-muscles')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
  await testInfo.attach('progress-'+theme,{body:await page.screenshot({animations:'disabled'}),contentType:'image/png'});
  await page.goBack();
  await expect(page.locator('nav.tabs button[data-tab="log"]')).toHaveAttribute('aria-current','page');
  await expect(nav).toBeVisible();
 });
}
