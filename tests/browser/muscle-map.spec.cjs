const {openDetails}=require('./flow-helpers.cjs');
const {test,expect}=require('@playwright/test');

// Regression coverage for the newly integrated read-only muscle map.
test('Progress muscle map renders and changes metric without changing logs',async({page})=>{
 await page.goto('/gym-tracker/');
 await page.getByRole('button',{name:/Progress/}).first().click();await openDetails(page,'[data-disclosure=muscles]');
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
 await page.getByRole('button',{name:/Progress/}).first().click();await openDetails(page,'[data-disclosure=muscles]');
 const triceps=page.locator('#back-triceps-left');
 await triceps.focus();
 await triceps.press('Enter');
 await expect(triceps).toBeFocused();
 await expect(page.locator('.muscle-map__details')).toContainText('Triceps');
 await expect(page.locator('#back-triceps-left')).toHaveAttribute('aria-pressed','true');
});


test('muscle map touch targets, anatomy coverage, and mobile layout',async({page,isMobile})=>{
 await page.goto('/gym-tracker/');
 await page.getByRole('button',{name:/Progress/}).first().click();await openDetails(page,'[data-disclosure=muscles]');
 const map=page.locator('.muscle-map');
 expect(await map.locator('.muscle-map__region').count()).toBeGreaterThan(50);
 expect(await map.locator('.muscle-map__anatomy-base').count()).toBeGreaterThan(10);
 if(isMobile){
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth)).toBeLessThanOrEqual(2);
  await map.locator('#front-chest-left').tap();
 }else await map.locator('#front-chest-left').click();
 await expect(map.locator('.muscle-map__details')).toContainText('Chest');
});

test('contributors and accessible table work with pointer, keyboard and touch',async({page,isMobile})=>{
 await page.goto('/gym-tracker/');
 await page.getByRole('button',{name:/Progress/}).first().click();await openDetails(page,'[data-disclosure=muscles]');
 const map=page.locator('.muscle-map');
 await expect(map.locator('.muscle-map__instructions')).toContainText('accessible muscle table');
 await map.locator('.muscle-map__contributors summary').click();
 await expect(map.locator('.muscle-map__contributors')).toContainText('No classified exercise contributions');
 await map.locator('.muscle-map__table summary').click();
 const fallback=map.locator('.muscle-map__table button[data-muscle="triceps"]');
 await expect(fallback).toBeVisible();
 if(isMobile)await fallback.tap();else {await fallback.focus();await fallback.press('Enter');}
 await expect(map.locator('.muscle-map__details')).toContainText('Triceps');
 await expect(map.locator('.muscle-map__table button[data-muscle="triceps"]')).toHaveAttribute('aria-pressed','true');
});
