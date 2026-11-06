const {test,expect}=require('@playwright/test');
const {enterSession,openSetOptions,closeSheet}=require('./flow-helpers.cjs');
test('weight adjustments preserve other sets and do not start rest',async({page})=>{
 await page.setViewportSize({width:320,height:800});await page.goto('/gym-tracker/');await enterSession(page);
 const weight=page.getByRole('spinbutton',{name:'Barbell row set 1 weight in pounds',exact:true});
 await weight.fill('20');
 await openSetOptions(page,'Barbell row',1);await page.getByRole('button',{name:'Increase Barbell row set 1 weight',exact:true}).click();await expect(page.locator('.sheet .sheet-meta')).toContainText('25 lb');await closeSheet(page);await expect(weight).toHaveValue('25');
 await openSetOptions(page,'Barbell row',1);await page.getByRole('button',{name:'Decrease Barbell row set 1 weight',exact:true}).click();await closeSheet(page);await expect(weight).toHaveValue('20');
 await expect(page.getByRole('spinbutton',{name:'Barbell row set 2 weight in pounds',exact:true})).toHaveValue('');
 await expect(page.locator('.rest-bar')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});
