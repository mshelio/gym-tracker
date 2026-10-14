const {test,expect} = require('@playwright/test');
test('boots native ES modules at GitHub Pages project subpath and persists drafts', async ({page}) => {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/gym-tracker/');
  await expect(page.getByText('Make every rep count.')).toBeVisible();
  await expect(page.getByText('Pull A').first()).toBeVisible();
  await page.getByRole('button',{name:/history/i}).first().click();
  await expect(page.getByText('The work adds up.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Make every rep count.')).toBeVisible();
  expect(errors).toEqual([]);
});
test('missing program provides recovery interface',async ({page})=>{
  await page.route('**/ppl-default-workouts.json',route=>route.abort());
  await page.goto('/gym-tracker/');
  await expect(page.getByText('Let’s load your program.')).toBeVisible();
});
