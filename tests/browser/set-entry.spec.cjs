const {test,expect}=require('@playwright/test');
const {enterSession}=require('./flow-helpers.cjs');
test('weight adjustments preserve other sets and do not start rest',async({page})=>{
 await page.setViewportSize({width:320,height:800});await page.goto('/gym-tracker/');await enterSession(page);
 const weight=page.getByRole('spinbutton',{name:'Lat pulldown set 1 weight in pounds',exact:true});
 await weight.fill('20');await page.getByRole('button',{name:'Increase Lat pulldown set 1 weight',exact:true}).click();await expect(weight).toHaveValue('25');
 await page.getByRole('button',{name:'Decrease Lat pulldown set 1 weight',exact:true}).click();await expect(weight).toHaveValue('20');
 await expect(page.getByRole('spinbutton',{name:'Lat pulldown set 2 weight in pounds',exact:true})).toHaveValue('');
 await expect(page.locator('[data-timer=inline-rest]')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});
