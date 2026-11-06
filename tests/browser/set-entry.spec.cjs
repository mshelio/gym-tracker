const {test,expect}=require('@playwright/test');
const {enterSession,openSetOptions,closeSheet,saveSession,logSet}=require('./flow-helpers.cjs');
const readSnapshot=page=>page.evaluate(()=>new Promise((ok,no)=>{const q=indexedDB.open('gym-tracker',1);q.onerror=()=>no(q.error);q.onsuccess=()=>{const db=q.result,r=db.transaction('snapshots','readonly').objectStore('snapshots').get('primary');r.onsuccess=()=>{db.close();ok(r.result)};r.onerror=()=>no(r.error);};}));
test('weight adjustments preserve other sets and do not start rest',async({page})=>{
 await page.setViewportSize({width:320,height:800});await page.goto('/gym-tracker/');await enterSession(page);
 const weight=page.getByRole('textbox',{name:'Barbell row set 1 weight in pounds',exact:true});
 await weight.fill('20');
 await openSetOptions(page,'Barbell row',1);await page.getByRole('button',{name:'Increase Barbell row set 1 weight',exact:true}).click();await expect(page.locator('.sheet .sheet-meta')).toContainText('25 lb');await closeSheet(page);await expect(weight).toHaveValue('25');
 await openSetOptions(page,'Barbell row',1);await page.getByRole('button',{name:'Decrease Barbell row set 1 weight',exact:true}).click();await closeSheet(page);await expect(weight).toHaveValue('20');
 await expect(page.getByRole('textbox',{name:'Barbell row set 2 weight in pounds',exact:true})).toHaveValue('');
 await expect(page.locator('.rest-bar')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
});
test('a decimal comma weight is saved as a decimal',async({page})=>{
 await page.goto('/gym-tracker/');
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByLabel('Default weight unit').selectOption('kg');await expect(page.locator('#toast')).toHaveText('Preference saved');
 await page.reload();await enterSession(page);
 const weight=page.getByRole('textbox',{name:'Barbell row set 1 weight in kilograms',exact:true});
 await expect(weight).toHaveAttribute('inputmode','decimal');
 await logSet(page,'Barbell row',1,{w:'72,5',r:8});
 await expect(weight).toHaveValue('72,5');
 await saveSession(page);
 const set=(await readSnapshot(page)).sessions[0].exercises[0];
 expect(set.unit).toBe('kg');expect(set.sets[0].w).toBe(72.5);expect(set.sets[0].r).toBe(8);
 // The history editor takes a comma too and still rejects text that isn't a number.
 await page.locator('details.hist').first().evaluate(el=>el.open=true);
 await page.getByRole('button',{name:'Edit session'}).click();
 const edit=page.getByRole('textbox',{name:'Barbell row set 1 weight',exact:true});
 await edit.fill('7a');await page.getByRole('button',{name:'Save changes'}).click();
 await expect(page.locator('#toast')).toHaveText('Each exercise needs a set with non-negative weight and positive whole-number reps.');
 expect((await readSnapshot(page)).sessions[0].exercises[0].sets[0].w).toBe(72.5);
 await edit.fill('80,5');await page.getByRole('button',{name:'Save changes'}).click();
 await expect.poll(async()=>(await readSnapshot(page)).sessions[0].exercises[0].sets[0].w).toBe(80.5);
});
test('a weight that is not a number is rejected instead of truncated',async({page})=>{
 await page.goto('/gym-tracker/');await enterSession(page);
 await logSet(page,'Barbell row',1,{w:'7a',r:8});
 await page.getByRole('button',{name:'Finish workout',exact:true}).click();
 await expect(page.locator('#session-validation')).toHaveText('Use non-negative weights and whole-number reps.');
 await expect(page.locator('.session-review')).toHaveCount(0);
 expect((await readSnapshot(page)).sessions).toHaveLength(0);
});
test('body weight accepts a decimal comma and rejects text',async({page})=>{
 await page.goto('/gym-tracker/');
 await page.getByRole('button',{name:'Log weight'}).click();
 await page.locator('#bUnit').selectOption('kg');
 await page.locator('#bWeight').fill('7a');
 await page.getByRole('button',{name:'Add entry',exact:true}).click();
 await expect(page.locator('#toast')).toHaveText('Enter numbers only, like 72.5 or 72,5.');
 expect((await readSnapshot(page))?.body??[]).toHaveLength(0);
 await page.locator('#bWeight').fill('72,5');
 await page.getByRole('button',{name:'Add entry',exact:true}).click();
 await expect.poll(async()=>(await readSnapshot(page)).body.map(b=>[b.weight,b.unit])).toEqual([[72.5,'kg']]);
});
