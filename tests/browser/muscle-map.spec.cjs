const {test,expect}=require('@playwright/test');

// Regression coverage for the newly integrated read-only muscle map.
test('Progress muscle map renders and changes metric without changing logs',async({page})=>{
 await page.goto('/gym-tracker/');
 await page.getByRole('button',{name:/Progress/}).first().click();
 const map=page.locator('.muscle-map');
 await expect(map).toBeVisible();
 await expect(map.locator('.muscle-map__view')).toHaveCount(2);
 await expect(map.locator('#front-chest-left')).toBeVisible();
 await expect(map.locator('#back-glutes-left')).toBeVisible();
 await expect(map.locator('.muscle-map__details')).toContainText('Chest');
 await page.locator('[data-muscle-map-metric]').selectOption('volume');
 await expect(map.locator('.muscle-map__notice')).toContainText('primary volume');
 await page.locator('.muscle-map__region[data-muscle="biceps"]').first().click();
 await expect(map.locator('.muscle-map__details')).toContainText('Biceps');
 await expect(map.locator('.muscle-map__table')).toContainText('Unknown exercises');
});

test('Muscle map regions support keyboard selection',async({page})=>{
 await page.goto('/gym-tracker/');
 await page.getByRole('button',{name:/Progress/}).first().click();
 const triceps=page.locator('#back-triceps-left');
 await triceps.focus();
 await triceps.press('Enter');
 await expect(page.locator('.muscle-map__details')).toContainText('Triceps');
 await expect(page.locator('#back-triceps-left')).toHaveAttribute('aria-pressed','true');
});
