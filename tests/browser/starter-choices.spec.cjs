const {test,expect}=require('@playwright/test');
const {library}=require('./flow-helpers.cjs');
test('starter workouts are editable and do not activate a plan or timer',async({page})=>{
 await page.setViewportSize({width:320,height:800});await page.goto('/gym-tracker/');await library(page);
 await page.locator('[data-act=reviewstarter][data-preset=full]').click();
 await expect(page.locator('[data-ed=name]')).toHaveValue('Full Body');
 await expect(page.getByLabel('Exercise 1 name')).toHaveValue('Back squat');
 await expect(page.locator('.edrow')).toHaveCount(5);
 await expect(page.locator('.timer-dock')).toHaveCount(0);
 await page.locator('[data-ed=name]').fill('My full body');await page.getByRole('button',{name:'Save workout',exact:true}).click();
 await expect(page.locator('.template-detail h2')).toHaveText('My full body');
 await page.locator('nav.tabs [data-tab=home]').click();
 await expect(page.locator('.today-workout h2')).toHaveText('Choose how you train');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});
