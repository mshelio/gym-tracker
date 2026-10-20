const {test,expect}=require('@playwright/test');
const {enterSession}=require('./flow-helpers.cjs');
for(const width of [320,390,768,1440])for(const theme of ['light','dark']){
 test(`three-tab screens and session reflow at ${width}px in ${theme}`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:900});await page.emulateMedia({colorScheme:theme,reducedMotion:'reduce'});await page.goto('/gym-tracker/');
  for(const tab of ['home','plan','progress']){
   await page.locator(`nav.tabs [data-tab=${tab}]`).click();await expect(page.locator('.page-intro')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
   if(width===390||width===1440)await page.screenshot({path:testInfo.outputPath(`${tab}-${theme}-${width}.png`)});
  }
  await enterSession(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);const dock=await page.locator('.timer-dock').boundingBox();expect(Math.round(width-dock.x-dock.width)).toBe(16);await page.getByRole('button',{name:'Workout timer controls',exact:true}).click();const panel=await page.locator('.timer-popover').boundingBox();expect(panel.x).toBeGreaterThanOrEqual(0);expect(panel.y).toBeGreaterThanOrEqual(0);expect(panel.y+panel.height).toBeLessThan(dock.y);await page.keyboard.press('Escape');
 });
}
