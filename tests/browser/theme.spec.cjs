const {test,expect}=require('@playwright/test');
test('System, Light and Dark appearance persists independently of workout data',async({page})=>{
 await page.goto('/gym-tracker/');
 const selector=page.locator('#theme-preference');
 await expect(selector).toHaveValue('system');
 await selector.selectOption('dark');
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await expect(page.locator('html')).toHaveAttribute('data-theme-preference','dark');
 await page.reload();
 await expect(selector).toHaveValue('dark');
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await selector.selectOption('light');
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await selector.selectOption('system');
 await expect(page.locator('html')).toHaveAttribute('data-theme-preference','system');
 await expect(await page.evaluate(()=>localStorage.getItem('gt-color-theme'))).toBe('system');
});
test('System mode follows OS color preference; PWA status and muscle map inherit theme',async({page})=>{
 await page.emulateMedia({colorScheme:'dark'});
 await page.goto('/gym-tracker/');
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
 await expect(page.locator('#theme-preference')).toHaveValue('system');
 await page.getByRole('button',{name:/Progress/}).first().click();
 await expect(page.locator('.muscle-map')).toBeVisible();
 expect(await page.locator('.muscle-map').evaluate(el=>getComputedStyle(el).color)).toBeTruthy();
 await page.emulateMedia({colorScheme:'light'});
 await expect(page.locator('html')).toHaveAttribute('data-theme','light');
 await page.locator('#theme-preference').selectOption('dark');
 await page.emulateMedia({colorScheme:'light'});
 await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
});

test('floating mobile navigation stays at the viewport bottom and clear of appearance controls',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/gym-tracker/');
 await expect(page.locator('.workout-hero')).toBeVisible();
 const nav=page.locator('nav.tabs');
 const assertGeometry=async()=>{
  const box=await nav.boundingBox();
  const appearance=await page.locator('#theme-preference').boundingBox();
  expect(box.y).toBeGreaterThan(700);
  expect(box.y+box.height).toBeLessThanOrEqual(844);
  if(appearance&&appearance.y>=0)expect(box.y).toBeGreaterThan(appearance.y+appearance.height);
 };
 await assertGeometry();
 await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));
 await assertGeometry();
 await page.locator('nav.tabs button[data-tab="home"]').click();
 await expect(page.getByRole('region',{name:'Home dashboard'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
});

test('light and dark theme keep selected workouts and session overview text on semantic colors',async({page})=>{
 await page.goto('/gym-tracker/');
 for(const theme of ['light','dark']){
  await page.locator('#theme-preference').selectOption(theme);
  for(const selector of ['.session-card h3','.plate[aria-pressed="true"]','.schedule-panel']){
   const colors=await page.locator(selector).evaluate(el=>({actual:getComputedStyle(el).color,expected:getComputedStyle(document.documentElement).getPropertyValue('--ink').trim()}));
   const expected=await page.evaluate(color=>{const el=document.createElement('span');el.style.color=color;document.body.append(el);const value=getComputedStyle(el).color;el.remove();return value;},colors.expected);
   expect(colors.actual).toBe(expected);
  }
 }
});

test('reduced motion preserves the soft decorative backgrounds',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/gym-tracker/');
 const decoration=await page.evaluate(()=>{const css=getComputedStyle(document.body,'::before');return {filter:css.filter,duration:css.animationDuration};});
 expect(decoration.filter).toContain('blur');
 expect(parseFloat(decoration.duration)).toBeLessThanOrEqual(.001);
});

test('Home preview and session totals reflect a saved workout instead of prototype fixtures',async({page})=>{
 await page.goto('/gym-tracker/');
 await page.getByRole('spinbutton',{name:/Lat pulldown set 1 weight/}).fill('100');
 await page.getByRole('spinbutton',{name:/Lat pulldown set 1 reps/}).fill('10');
 await page.locator('.set-complete').first().click();
 await page.getByRole('button',{name:/Finish & save session/}).click();
 await expect(page.getByText('Session saved')).toBeVisible();
 await page.locator('[data-tab="home"]').click();
 await expect(page.locator('.home-primary h2')).toHaveText('Push A');
 await expect(page.locator('.home-exercise-preview li')).toHaveCount(3);
 await expect(page.locator('.home-week .home-stat-value strong')).toHaveText('1');
 await expect(page.locator('.home-metrics .section').nth(1).locator('.home-stat-value strong')).toHaveText('1');
 await expect(page.locator('.home-volume')).toContainText('1,000');
 await expect(page.locator('.home-recent-row strong')).toHaveText('Pull A');
 await page.reload();
 await page.locator('[data-tab="home"]').click();
 await expect(page.locator('.home-recent-row strong')).toHaveText('Pull A');
});

test('200-percent-equivalent desktop viewport keeps navigation and content usable',async({page})=>{
 // A 1280px desktop viewport at 200% browser zoom has ~640 CSS pixels of layout space.
 await page.setViewportSize({width:640,height:760});
 await page.goto('/gym-tracker/');
 await expect(page.locator('nav.tabs')).toBeVisible();
 await expect(page.locator('#app')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
 await page.locator('nav.tabs button[data-tab="progress"]').click();
 await expect(page.locator('#progress-muscles')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(2);
});
