const {test,expect}=require('@playwright/test');
async function schedules(page){await page.locator('nav.tabs [data-tab=plan]').click();await page.locator('[data-act=manageschedules]').first().click();}
test('fresh start offers an unselected custom workout and never selects PPL',async({page})=>{
 await page.goto('/gym-tracker/');
 await expect(page.getByRole('heading',{name:'Choose how you train'})).toBeVisible();
 await expect(page.locator('[data-act=homestart]')).toHaveCount(0);
 await expect(page.locator('.timer-dock')).toHaveCount(0);
 await page.reload();
 await expect(page.getByRole('heading',{name:'Choose how you train'})).toBeVisible();
 await page.getByRole('button',{name:'Create my own workout'}).click();
 await expect(page.getByRole('heading',{name:'New workout'})).toBeVisible();
 await expect(page.locator('[data-ed=name]')).toHaveValue('');
 await expect(page.getByLabel('Exercise 1 name')).toHaveValue('');
});
test('PPL is opt-in and turning off a plan survives a reload',async({page})=>{
 await page.goto('/gym-tracker/');await schedules(page);
 await expect(page.getByText('No active schedule. Choose a saved plan or create your own.')).toBeVisible();
 await page.locator('[data-act=activateschedule][data-id=starter-ppl]').click();
 await page.locator('nav.tabs [data-tab=home]').click();
 await expect(page.locator('.today-workout h2')).toHaveText('Pull A');
 await page.reload();
 await expect(page.locator('.today-workout h2')).toHaveText('Pull A');
 await schedules(page);await page.getByRole('button',{name:'Train without a schedule'}).click();
 await expect(page.locator('#toast')).toHaveText('No active schedule. Choose workouts freely.');
 await page.reload();
 await expect(page.locator('.today-workout h2')).toHaveText('Choose how you train');
 await expect(page.locator('.timer-dock')).toHaveCount(0);
});
test('new repeating plans do not prefill a PPL workout',async({page})=>{
 await page.goto('/gym-tracker/');await schedules(page);
 await page.locator('[data-act=newschedule][data-mode=cycle]').click();
 await expect(page.getByLabel('Step 1 workout',{exact:true})).toHaveValue('');
});
