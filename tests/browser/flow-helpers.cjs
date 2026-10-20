const {expect}=require('@playwright/test');
async function enterSession(page){
 await expect(page.locator('#status')).toContainText(/Saved/);
 if(await page.locator('.session-toolbar').count())return;
 // Reopen an existing session without changing its timer state.
 if(await page.getByRole('button',{name:'Workout timer controls',exact:true}).count()){
  await page.getByRole('button',{name:'Workout timer controls',exact:true}).click();
  await page.locator('[data-act="clockreturn"]').click();
 }else{
  await page.locator('nav.tabs [data-tab="home"]').click();
  await page.getByRole('button',{name:/^(Start|Resume) workout$/}).click();
 }
 await expect(page.locator('.session-toolbar')).toBeVisible();
 await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state','saved');
}
async function library(page){
 await page.locator('nav.tabs [data-tab="plan"]').click();
 await page.getByRole('button',{name:'Workouts & exercises',exact:true}).click();
}
async function startTemplate(page,name){
 await library(page);
 if(await page.locator('[data-act="closetemplate"]').count())await page.locator('[data-act="closetemplate"]').click();
 await page.locator('.template-card').filter({hasText:name}).click();
 await page.getByRole('button',{name:'Start this workout'}).click();
}
async function saveSession(page){
 await page.getByRole('button',{name:'Finish workout',exact:true}).click();
 await page.getByRole('button',{name:'Save session',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Workout complete',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'View history',exact:true}).click();
}
async function openDetails(page,selector){const d=page.locator(selector);if(await d.getAttribute('open')===null)await d.locator(':scope > summary').click();}
async function openNested(page,destination){
 if(destination==='history'){
  await page.locator('nav.tabs [data-tab="progress"]').click();
  await page.locator('.subnav [data-destination="history"]').click();
 }else{
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.locator('[data-destination="data"]').click();
 }
}
module.exports={enterSession,library,startTemplate,saveSession,openDetails,openNested};
