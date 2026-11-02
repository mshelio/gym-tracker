const {test,expect}=require('@playwright/test');
const {enterSession}=require('./flow-helpers.cjs');
for(const width of [320,390,768,1440])for(const theme of ['light','dark']){
 test(`three-tab screens and session reflow at ${width}px in ${theme}`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});await page.goto('/gym-tracker/');
  for(const tab of ['home','plan','progress']){
   await page.locator(`nav.tabs [data-tab=${tab}]`).click();await expect(page.locator('.page-intro')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
   if(width===390||width===1440)await page.screenshot({path:testInfo.outputPath(`${tab}-${theme}-${width}.png`)});
  }
  await enterSession(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  const bar=await page.locator('.session-toolbar').boundingBox();expect(bar.x).toBeGreaterThanOrEqual(-1);expect(bar.x+bar.width).toBeLessThanOrEqual(width+1);
  if(width===390||width===1440)await page.screenshot({path:testInfo.outputPath(`session-${theme}-${width}.png`)});
  await page.getByRole('button',{name:'Session options',exact:true}).click();const sheet=await page.locator('.sheet').boundingBox();
  expect(sheet.x).toBeGreaterThanOrEqual(0);expect(sheet.y).toBeGreaterThanOrEqual(0);expect(sheet.x+sheet.width).toBeLessThanOrEqual(width);await page.keyboard.press('Escape');
 });
}
