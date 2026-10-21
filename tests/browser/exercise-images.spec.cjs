const {test,expect}=require('@playwright/test');
const {enterSession,library}=require('./flow-helpers.cjs');
test('exercise photos follow substitutions and remain available offline',async({page,context})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/gym-tracker/');
 const thumb=page.locator('.today-preview .exercise-thumbnail').first();
 await expect(thumb).toBeVisible();
 await expect.poll(()=>thumb.evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
 await enterSession(page);
 const first=page.locator('[data-exercise-id="base-0"]');
 await expect(first.locator('.exercise-thumbnail')).toHaveAttribute('src',/Wide-Grip_Lat_Pulldown/);
 await first.locator('.exercise-options>summary').click();
 await first.getByLabel('Exercise or alternative').selectOption({label:'Neutral-grip pulldown'});
 await expect(first.locator('.exercise-thumbnail')).toHaveAttribute('src',/V-Bar_Pulldown/);
 const video=first.locator('.exercise-video-link');
 await expect(video).toHaveAttribute('href',/search_query=Neutral-grip%20pulldown/);
 await expect(video).toHaveAttribute('target','_blank');
 await expect(video).toHaveAttribute('rel','noopener noreferrer');
 await expect(first.locator('.exercise-photo-detail')).toHaveAttribute('open','');
 const photo=first.locator('.exercise-photo-detail>img');
 await expect(photo).toBeVisible();
 expect((await photo.boundingBox()).width).toBeGreaterThan(250);
 await expect.poll(()=>photo.evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
 await page.evaluate(()=>navigator.serviceWorker.ready);
 await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
 await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state','saved');
 await context.setOffline(true);
 await page.reload();
 await enterSession(page);
 await expect(first.locator('.exercise-thumbnail')).toHaveAttribute('src',/V-Bar_Pulldown/);
 await expect.poll(()=>first.locator('.exercise-thumbnail').evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});
test('template preview photographs load for every default exercise',async({page})=>{
 await page.goto('/gym-tracker/');await library(page);
 for(const name of ['Pull A','Push A','Legs A','Pull B','Push B','Legs B']){
  await page.locator('.template-card').filter({has:page.getByText(name,{exact:true})}).click();
  const images=page.locator('.template-exercises .exercise-thumbnail');
  expect(await images.count()).toBeGreaterThan(0);
  await expect(page.locator('.template-exercises .exercise-photo-unavailable')).toHaveCount(0);
  for(const img of await images.all()){
   await img.scrollIntoViewIfNeeded();
   await expect.poll(()=>img.evaluate(el=>el.naturalWidth)).toBeGreaterThan(0);
  }
  await page.locator('[data-act="closetemplate"]').click();
 }
});
