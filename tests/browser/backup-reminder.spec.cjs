const {test,expect}=require('@playwright/test');
test('backup reminders snooze and exports record a local timestamp',async({page})=>{
 await page.goto('/gym-tracker/');await expect(page.locator('.backup-reminder')).toHaveCount(0);
 await page.getByRole('button',{name:'Log weight'}).click();await page.locator('#bWeight').fill('80');await page.getByRole('button',{name:'Add entry',exact:true}).click();await page.locator('nav.tabs [data-tab=home]').click();
 await expect(page.locator('.backup-reminder')).toBeVisible();await page.getByRole('button',{name:'Remind me in a week'}).click();await page.reload();await expect(page.locator('.backup-reminder')).toHaveCount(0);
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.locator('[data-destination=data]').click();
 const download=page.waitForEvent('download');await page.locator('[data-act=export]').click();await download;
 await expect(page.locator('.backup-export-status')).toContainText('Last export started:');
 expect(await page.evaluate(()=>Number(localStorage.getItem('gt-last-export')))).toBeGreaterThan(0);
 await page.reload();await expect(page.locator('.backup-reminder')).toHaveCount(0);
});
