const {expect}=require('@playwright/test');
// The workout, review and summary screens hide the tab bar. Step back to a tabbed screen first.
async function leaveSession(page){
 if(await page.locator('.session-review').count())await page.getByRole('button',{name:'Keep training'}).click();
 if(await page.locator('.session-summary').count())await page.getByRole('button',{name:'Back to Today',exact:true}).click();
 if(await page.locator('.session-toolbar').count())await page.getByRole('button',{name:'Minimize workout',exact:true}).click();
}
async function enterSession(page){
 await expect(page.locator('#status')).toContainText(/Saved/);
 if(await page.locator('.session-review').count())await page.getByRole('button',{name:'Keep training'}).click();
 if(await page.locator('.session-toolbar').count())return;
 await leaveSession(page);
 if(await page.locator('.resume-bar').count())await page.locator('.resume-bar').click();
 else{
  await page.locator('nav.tabs [data-tab="home"]').click();
  const start=page.getByRole('button',{name:/^(Start|Resume) workout$/});
  if(await start.count())await start.click();
  else await startTemplate(page,'Pull A');
 }
 await expect(page.locator('.session-toolbar')).toBeVisible();
 await expect(page.locator('[data-save-status]')).toHaveAttribute('data-state','saved');
}
async function library(page){
 await leaveSession(page);
 await page.locator('nav.tabs [data-tab="plan"]').click();
 await page.locator('.subnav [data-destination="library"]').click();
 if(await page.locator('[data-act=closetemplate]').count())await page.locator('[data-act=closetemplate]').click();
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
// Only ticked sets are saved: fill a set and tick its check button.
const escapeRegExp=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
async function logSet(page,exercise,set,{w,r}={}){
 if(w!=null)await page.getByLabel(new RegExp(`^${escapeRegExp(exercise)} set ${set} weight in `)).fill(String(w));
 if(r!=null)await page.getByLabel(`${exercise} set ${set} reps`,{exact:true}).fill(String(r));
 await page.getByRole('button',{name:`${exercise} set ${set} mark complete`,exact:true}).click();
 await expect(page.getByRole('button',{name:`${exercise} set ${set} mark incomplete`,exact:true})).toHaveAttribute('aria-pressed','true');
}
async function openDetails(page,selector){const d=page.locator(selector);if(await d.getAttribute('open')===null)await d.locator(':scope > summary').click();}
async function openNested(page,destination){
 await leaveSession(page);
 if(destination==='history'){
  await page.locator('nav.tabs [data-tab="progress"]').click();
  await page.locator('.subnav [data-destination="history"]').click();
 }else{
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await page.locator('[data-destination="data"]').click();
 }
}
// Exercise and set details live in bottom sheets opened from the workout card.
async function openExerciseOptions(page,index=0,group=''){
 await openDetails(page,`[data-exercise-id="${group==='x'?'extra':'base'}-${index}"]`);
 await page.locator(`[data-act="opensheet"][data-sheet="exercise"][data-g="${group}"][data-i="${index}"]`).click();
 await expect(page.getByRole('dialog')).toBeVisible();
}
async function openSetOptions(page,exercise,set){
 await page.getByRole('button',{name:`${exercise} set ${set} options`,exact:true}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
}
async function closeSheet(page){
 await page.locator('.sheet [data-act="closesheet"]').click();
 await expect(page.locator('.sheet')).toHaveCount(0);
}
module.exports={enterSession,leaveSession,library,startTemplate,saveSession,logSet,openDetails,openNested,openExerciseOptions,openSetOptions,closeSheet};
