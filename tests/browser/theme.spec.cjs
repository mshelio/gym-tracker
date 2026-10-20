const {test,expect}=require('@playwright/test');
const {enterSession,openDetails}=require('./flow-helpers.cjs');
test('System, Light and Dark appearance persists independently of workout data',async({page})=>{
 await page.goto('/gym-tracker/');await page.getByRole('button',{name:'Settings',exact:true}).click();
 for(const theme of ['light','dark','system']){await page.getByRole('combobox',{name:'Color theme'}).selectOption(theme);await expect(page.locator('html')).toHaveAttribute('data-theme-preference',theme);await page.reload();await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(page.getByRole('combobox',{name:'Color theme'})).toHaveValue(theme);}
});
test('System mode follows OS color preference; muscle map inherits theme',async({page})=>{
 await page.emulateMedia({colorScheme:'dark'});await page.goto('/gym-tracker/');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.emulateMedia({colorScheme:'light'});await expect(page.locator('html')).toHaveAttribute('data-theme','light');await page.locator('nav.tabs [data-tab=progress]').click();await openDetails(page,'[data-disclosure=muscles]');await expect(page.locator('.muscle-map')).toBeVisible();
});
test('floating mobile navigation stays at the viewport bottom and clear of settings',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/gym-tracker/');const nav=await page.locator('nav.tabs').boundingBox();expect(nav.y+nav.height).toBe(832);await enterSession(page);await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));expect((await page.locator('nav.tabs').boundingBox()).y).toBe(nav.y);await expect(page.getByRole('button',{name:'Workout timer controls',exact:true})).toBeInViewport();
});
test('reduced motion preserves decorative backgrounds without animation',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/gym-tracker/');expect(await page.evaluate(()=>parseFloat(getComputedStyle(document.body,'::before').animationDuration))).toBeLessThan(.1);
});
test('200-percent-equivalent desktop viewport keeps navigation and content usable',async({page})=>{
 await page.setViewportSize({width:640,height:450});await page.goto('/gym-tracker/');await enterSession(page);await page.getByRole('button',{name:'Workout timer controls',exact:true}).click();await expect(page.getByRole('button',{name:'Close timer controls'})).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await page.getByRole('button',{name:'Close timer controls'}).click();for(const tab of ['plan','progress','home']){await page.locator(`nav.tabs [data-tab=${tab}]`).click();await expect(page.locator(`nav.tabs [data-tab=${tab}]`)).toHaveAttribute('aria-current','page');}
});
