const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
const path=require('path');
const root=path.join(__dirname,'..');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const canonical = JSON.parse(fs.readFileSync(path.join(root,'ppl-default-workouts.json'),'utf8'));
const code = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace('initApp();\n})();', 'globalThis.test = {S, parseProgram, applyProgram, initApp, getDay, getDraft, nextDayId, saveSession, saveWorkout, addBody, viewLog, viewHistory, viewProgress, viewData, render, importJSON, exportJSON, putSession, removeSession, updateSessionMeter, useProgramFile, flushDrafts, buildAppData, validateAppData, activeSchedule, nextSlot, scheduleIndex, saveScheduleList, skipScheduleDay, useSchedule, validateSchedules, scheduleAction, viewScheduleEditor, viewScheduleManager};\ninitApp();\n})();');
function setup({fetchFail=false, storage={}, rejectWrites=false}={}){
  const nodes = new Map();
  const node = (id) => {
    if(!nodes.has(id)) nodes.set(id,{value:'',textContent:'',innerHTML:'',hidden:true,style:{},dataset:{},listeners:{},classList:{add(){},remove(){}},addEventListener(type,fn){this.listeners[type]=fn},querySelector(){return null},setAttribute(){},select(){},focus(){}});
    return nodes.get(id);
  };
  const tabs = ['log','history','progress','data'].map(tab=>({dataset:{tab},setAttribute(){}}));
  const downloads=[]; let requested='',aiResponder;
  const document = {baseURI:'https://user.github.io/ppl-tracker/index.html',activeElement:null,visibilityState:'visible',querySelector:node,querySelectorAll:()=>tabs,addEventListener(){},createElement:()=>({click(){downloads.push(this.download)},remove(){}}),body:{appendChild(){}}};
  const context = {document,window:{addEventListener(){},scrollTo(){}},localStorage:{getItem:k=>storage[k]||null,setItem(k,v){if(rejectWrites) throw Error('Full');storage[k]=v}},CSS:{escape:x=>x},fetch:async (url,options)=>{if(options?.method==='POST')return aiResponder(url,options);requested=url.href;if(fetchFail)throw Error('Offline');return {ok:true,json:async()=>canonical}},URL,Blob,AbortController,Date,Math,console,setTimeout:()=>1,clearTimeout(){},navigator:{clipboard:{writeText:async()=>{}}}};
  vm.createContext(context); vm.runInContext(code,context);
  return {context,api:context.test,node,storage,downloads,requested:()=>requested,setRejectWrites(value){rejectWrites=value},setAIResponder(fn){aiResponder=fn}};
}
async function settle(){for(let i=0;i<10;i++) await Promise.resolve()}
(async()=>{
  const c=setup(); await settle(); const {api:a,node}=c;
  assert.equal(a.S.ready,true); assert.equal(c.requested(),'https://user.github.io/ppl-tracker/ppl-default-workouts.json');
  assert.equal(a.nextDayId(),'pullA');
  for(const w of canonical.workouts){
    const mapped=a.getDay(w.id);assert.equal(mapped.name,w.name);assert.equal(mapped.type,w.type);
    w.exercises.forEach((e,i)=>{assert.equal(mapped.ex[i].n,e.name);assert.equal(mapped.ex[i].s,e.sets);assert.equal(mapped.ex[i].lo,e.repsMin);assert.equal(mapped.ex[i].hi,e.repsMax);assert.deepEqual(Array.from(mapped.ex[i].alt),e.alternatives)});
  }
  assert(a.viewLog().includes('Make every')===false);assert(node('#app').innerHTML.includes('Make every rep count.'));
  const d=a.getDraft('pullA');d.ex[0].sets[0]={w:'100',r:'8'};a.updateSessionMeter();assert.equal(node('#loggedSets').textContent,1);
  await a.saveSession({disabled:false,textContent:''});assert.equal(a.S.sessions.length,1);assert.equal(a.nextDayId(),'pushA');assert.equal(a.S.tab,'history');assert.equal(a.S.sessions[0].exercises[0].unit,'lb');assert.equal(a.S.sessions[0].exercises[0].sets[0].w,100);
  assert(JSON.parse(c.storage['ppl-tracker-v1']).sessions.length===1);assert.equal(JSON.parse(c.storage['ppl-tracker-drafts-v1']).pullA,undefined);
  a.S.tab='data';a.render();await a.exportJSON();assert.equal(c.downloads.length,1);const backup=node('#exportOut').value;assert.equal(JSON.parse(backup).app,'ppl-tracker');
  const restored=setup();await settle();restored.node('#importText').value=backup;await restored.api.importJSON();assert.equal(restored.api.S.sessions.length,1);await restored.api.importJSON();assert.equal(restored.api.S.sessions.length,1);
  a.S.editing={id:'custom1',name:'Home workout',type:'other',unit:'kg',ex:[{n:'Goblet squat',s:3,lo:8,hi:12}]};await a.saveWorkout({});assert.equal(a.S.custom.length,1);assert.equal(a.nextDayId(),'pushA');assert.equal(a.S.dayId,'custom1');
  a.S.tab='progress';node('#bDate').value='2026-10-05';node('#bWeight').value='80';node('#bWaist').value='90';node('#bUnit').value='kg';await a.addBody();assert.equal(a.S.body.length,1);assert(a.viewProgress().includes('80 kg'));
  await a.putSession({id:'test-second',dayId:'pullA',dayName:'Pull A',date:'2026-10-06',createdAt:2,exercises:[{name:'Lat pulldown',unit:'kg',sets:[{w:50,r:8}]}]});a.S.progressEx='Lat pulldown';assert(a.viewProgress().includes('Trend chart'));assert(a.viewHistory().includes('Pull A'));
  const reload=setup({storage:c.storage});await settle();assert.equal(reload.api.S.sessions.length,2);assert.equal(reload.api.S.custom.length,1);assert.equal(reload.api.S.body.length,1);
  a.S.tab='data';a.render();await a.exportJSON();const full=setup();await settle();full.node('#importText').value=node('#exportOut').value;await full.api.importJSON();assert.equal(full.api.S.sessions.length,2);assert.equal(full.api.S.body.length,1);assert.equal(full.api.S.custom.length,1);
  full.node('#importText').value=JSON.stringify({sessions:[{id:'bad',date:'2026-10-05',exercises:[{name:'Invalid',sets:null}]}],custom:[{id:'badc',name:'Invalid',ex:[null]}]});await full.api.importJSON();assert.equal(full.api.S.sessions.length,2);assert.equal(full.api.S.custom.length,1);assert(full.node('#toast').textContent.includes('Import cancelled'));
  full.node('#importText').value='null';await full.api.importJSON();assert(full.node('#toast').textContent.includes('tracker backup'));
  const rotation=setup();await settle();for(const expected of canonical.rotation){assert.equal(rotation.api.nextDayId(),expected);rotation.api.S.dayId=expected;rotation.api.getDraft(expected).ex[0].sets[0]={w:'20',r:'8'};await rotation.api.saveSession({})}assert.equal(rotation.api.nextDayId(),'pullA');
  const offline=setup({fetchFail:true,storage:c.storage});await settle();assert.equal(offline.api.S.ready,true);assert(offline.api.viewData().includes('file unavailable'));
  const missing=setup({fetchFail:true});await settle();assert.equal(missing.api.S.ready,false);assert(missing.node('#app').innerHTML.includes('Choose program JSON'));
  await missing.api.useProgramFile({text:async()=>JSON.stringify(canonical)});assert.equal(missing.api.S.ready,true);
  const transfer=setup();await settle();transfer.api.S.dayId='pushA';const td=transfer.api.getDraft('pushA');td.ex[0].sets[0]={w:'60.5',r:'7'};td.notes='Unfinished session';transfer.api.S.bodyUnit='lb';transfer.api.S.progressEx='Barbell bench press';const complete=transfer.api.buildAppData();assert.equal(complete.version,3);assert.equal(complete.drafts.pushA.notes,'Unfinished session');
  const receiver=setup();await settle();receiver.node('#importText').value=JSON.stringify(complete);await receiver.api.importJSON();assert.equal(receiver.api.getDraft('pushA').ex[0].sets[0].w,'60.5');assert.equal(receiver.api.S.dayId,'pushA');assert.equal(receiver.api.S.bodyUnit,'lb');
  const afterImportReload=setup({storage:receiver.storage});await settle();assert.equal(afterImportReload.api.S.dayId,'pushA');assert.equal(afterImportReload.api.getDraft('pushA').notes,'Unfinished session');
  const starter=JSON.parse(fs.readFileSync(path.join(root,'ppl-tracker-data.json'),'utf8'));receiver.api.validateAppData(starter);
  receiver.node('#importText').value=JSON.stringify(starter);receiver.node('#importMode').value='merge';await receiver.api.importJSON();assert(receiver.api.S.drafts.pushA);
  receiver.node('#importMode').value='replace';await receiver.api.importJSON();assert.equal(receiver.api.S.sessions.length,0);assert.equal(receiver.api.S.body.length,0);assert.equal(receiver.api.S.custom.length,0);assert.equal(Object.keys(JSON.parse(receiver.storage['ppl-tracker-v1']).drafts).length,0);assert.equal(receiver.api.S.drafts.pushA,undefined);
  const legacy=JSON.parse(backup);legacy.version=1;delete legacy.drafts;delete legacy.preferences;const old=setup();await settle();old.node('#importText').value=JSON.stringify(legacy);await old.api.importJSON();assert.equal(old.api.S.sessions.length,1);
  const safe=setup();await settle();safe.node('#importText').value=JSON.stringify(complete);safe.setRejectWrites(true);const before=JSON.stringify(safe.api.S);await safe.api.importJSON();assert.equal(JSON.stringify(safe.api.S),before);assert(safe.node('#importResult').textContent.includes('existing data kept'));
  const wrong=structuredClone(complete);wrong.sessions=[{...JSON.parse(backup).sessions[0],exercises:[{name:'Unsafe',unit:'stone',sets:[{w:10,r:8}]}]}];assert.throws(()=>transfer.api.validateAppData(wrong));
  const duplicate=JSON.parse(backup);duplicate.sessions.push(duplicate.sessions[0]);assert.throws(()=>transfer.api.validateAppData(duplicate));
  const malicious=JSON.parse(JSON.stringify(complete));Object.defineProperty(malicious.drafts,'__proto__',{value:complete.drafts.pushA,enumerable:true});assert.throws(()=>transfer.api.validateAppData(malicious));
  const badDate=structuredClone(complete);badDate.drafts.pushA.date='2026-02-30';assert.throws(()=>transfer.api.validateAppData(badDate));
  const failure=setup({rejectWrites:true});await settle();const fd=failure.api.getDraft('pullA');fd.ex[0].sets[0]={w:'50',r:'10'};await failure.api.saveSession({});assert.equal(failure.api.S.sessions.length,0);assert(failure.api.S.drafts.pullA);assert(failure.node('#toast').textContent.includes('storage'));
  assert.throws(()=>a.parseProgram({...canonical,rotation:['missing']}));assert.throws(()=>a.parseProgram({...canonical,workouts:[{...canonical.workouts[0],exercises:[{name:'Invalid',sets:0,repsMin:8,repsMax:12}]}]}));
  const changed=structuredClone(canonical);changed.defaultUnit='kg';changed.rotation.reverse();changed.workouts[0].exercises[0].sets=4;a.applyProgram(changed);assert.equal(a.getDay('pullA').ex[0].s,4);assert.equal(a.getDay('pullA').unit,'kg');assert.equal(a.nextDayId(),'pushA');
  // Flexible schedules, migrations, calendar plans and atomic persistence.
  const flex=setup();await settle();const f=flex.api;
  const custom={id:'upper',name:'Upper',type:'other',unit:'kg',ex:[{n:'Row',s:3,lo:8,hi:12,alt:[]}]};f.S.custom=[custom];
  const cycle={id:'own',name:'My split',mode:'cycle',days:['upper',null,'pullA','upper'],cursor:0};
  await f.saveScheduleList([f.activeSchedule(),cycle],'own');assert.equal(f.nextSlot(),'upper');
  await f.putSession({id:'off',dayId:'pushA',date:'2026-10-06',createdAt:1,exercises:[]},true);assert.equal(f.activeSchedule().cursor,0);
  f.S.dayId='upper';f.getDraft('upper').ex[0].sets[0]={w:'20',r:'8'};await f.saveSession({});assert.equal(f.nextSlot(),null);assert.equal(f.activeSchedule().cursor,1);
  const count=f.S.sessions.length;await f.skipScheduleDay();assert.equal(f.nextSlot(),'pullA');assert.equal(f.S.sessions.length,count);
  await f.useSchedule('starter-ppl');await f.useSchedule('own');assert.equal(f.activeSchedule().cursor,2);
  const replay=setup({storage:flex.storage});await settle();assert.equal(replay.api.nextSlot(),'pullA');
  f.S.scheduleEditing=JSON.parse(JSON.stringify(f.activeSchedule()));await f.scheduleAction({dataset:{act:'movescheduleday',i:'2',dir:'-1'}});assert.equal(f.S.scheduleEditing.days[1],'pullA');assert(f.viewScheduleEditor().includes('Next step after saving'));
  const weekly={id:'week',name:'Weekly',mode:'weekly',days:['upper',null,'pullA',null,'upper',null,null],cursor:0};await f.saveScheduleList([...f.S.schedules,weekly],'week');
  assert.equal(f.scheduleIndex(),(new Date().getDay()+6)%7);assert.equal(f.nextSlot(),weekly.days[f.scheduleIndex()]);await f.skipScheduleDay();assert.equal(f.activeSchedule().cursor,0);
  assert.throws(()=>f.validateSchedules([{...cycle,days:[null]}]));assert.throws(()=>f.validateSchedules([{...cycle,days:['missing']}]));assert.throws(()=>f.validateSchedules([{...weekly,days:['upper']}]));
  await f.useSchedule('own');flex.setRejectWrites(true);const snap=JSON.stringify({sessions:f.S.sessions,schedules:f.S.schedules});await assert.rejects(f.putSession({id:'failed',dayId:'pullA',date:'2026-10-06',exercises:[]},true));assert.equal(JSON.stringify({sessions:f.S.sessions,schedules:f.S.schedules}),snap);flex.setRejectWrites(false);
  // Remove synthetic session before validating the full backup.
  await f.removeSession('off');const packageData=f.buildAppData();const target=setup();await settle();target.node('#importText').value=JSON.stringify(packageData);await target.api.importJSON();assert.equal(target.api.activeSchedule().id,'own');assert.equal(target.api.activeSchedule().cursor,2);assert.equal(target.api.S.custom[0].id,'upper');
  for(const version of [1,2]){target.node('#importMode').value='replace';target.node('#importText').value=JSON.stringify(packageData);await target.api.importJSON();const oldBackup=JSON.parse(backup);oldBackup.version=version;delete oldBackup.schedules;delete oldBackup.preferences.activeScheduleId;target.node('#importMode').value='merge';target.node('#importText').value=JSON.stringify(oldBackup);await target.api.importJSON();assert.equal(target.api.activeSchedule().id,'own');target.node('#importMode').value='replace';await target.api.importJSON();assert.equal(target.api.activeSchedule().id,'starter-ppl');assert.equal(target.api.nextSlot(),'pushA');}
  const legacyLocal=setup({storage:{'ppl-tracker-v1':JSON.stringify({sessions:JSON.parse(backup).sessions,custom:[],body:[]})}});await settle();assert.equal(legacyLocal.api.nextSlot(),'pushA');
  const broken=JSON.parse(JSON.stringify(packageData));broken.schedules[0].days=['missing'];const stable=JSON.stringify(target.api.S);target.node('#importText').value=JSON.stringify(broken);await target.api.importJSON();assert.equal(JSON.stringify(target.api.S),stable);
  assert.deepEqual(JSON.parse(html.match(/const DATA_SCHEMA = ([^\n]+);/)[1]),JSON.parse(fs.readFileSync(path.join(root,'ppl-tracker-data.schema.json'),'utf8')));
  console.log('PASS: flexible repeating/weekly schedules, reorder, rest, independent progress, v1/v2 migration, v3 round trips, rollback;  JSON schema and exact defaults, project-relative URL, sessions, rotation, units, progress, custom workouts, body log, persistence, backup download/import/deduplication, cached program, missing-file recovery, storage-failure rollback and modified program.');
})().catch(e=>{console.error(e);process.exitCode=1});
