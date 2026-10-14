const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
const path=require('path');
const root=path.join(__dirname,'..');
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const workerSource=fs.readFileSync(path.join(root,'sw.js'),'utf8');
assert.match(workerSource,/gt-shell-95304dcd/);
assert.match(workerSource,/ppl-default-workouts.json/);
assert.match(workerSource,/SKIP_WAITING/);
assert(!workerSource.includes('indexedDB.deleteDatabase'));
const canonical = JSON.parse(fs.readFileSync(path.join(root,'ppl-default-workouts.json'),'utf8'));

const pwaManifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'),'utf8'));
assert.equal(pwaManifest.start_url,'./');
assert.equal(pwaManifest.scope,'./');
assert.equal(pwaManifest.display,'standalone');
assert.equal(pwaManifest.id,'./');
assert(pwaManifest.icons.some(icon=>icon.purpose==='maskable'&&icon.sizes==='512x512'));
for(const icon of pwaManifest.icons){
  assert(icon.src.startsWith('./')&&!icon.src.startsWith('//'));
  const bytes=fs.readFileSync(path.join(root,icon.src));
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  const dimensions=icon.sizes.split('x').map(Number);
  assert.equal(bytes.readUInt32BE(16),dimensions[0]);
  assert.equal(bytes.readUInt32BE(20),dimensions[1]);
}
assert.match(html,/rel="manifest" href="\.\/manifest\.webmanifest"/);

const moduleFiles = ['config.js','state.js','workouts.js','render.js','schedules.js','storage.js','timers.js','exercise-settings.js','progression.js','records.js','analytics.js','app.js'];
const sources = Object.fromEntries(moduleFiles.map(f => [f, fs.readFileSync(path.join(root,'js',f),'utf8')]));
const moduleCode = sources['app.js'];
const combined = moduleFiles.map(f => sources[f].replace(/^\s*import\s+[^;]+;\s*/gm, '').replace(/^export\s+\{[^}]+\};?\s*/gm, '').replace(/^export\s+(?=(?:async\s+)?function|const|class)/gm, '')).join('\n');
assert.match(html, /type="module" src="\.\/js\/app\.js"/);
const code = combined.replace('initApp();\n})();', 'globalThis.test = {S, parseProgram, applyProgram, initApp, getDay, getDraft, nextDayId, saveSession, saveWorkout, addBody, viewLog, viewHistory, viewProgress, viewData, render, importJSON, exportJSON, putSession, removeSession, updateSessionMeter, useProgramFile, flushDrafts, buildAppData, validateAppData, activeSchedule, nextSlot, scheduleIndex, saveScheduleList, skipScheduleDay, useSchedule, validateSchedules, scheduleAction, viewScheduleEditor, viewScheduleManager, hardSetCount,normalizeExerciseSetting,convertIncrement,resolveRestSeconds,exerciseKey,recommendProgression,calculateRecords,analyticsSummary,analyticsRange,sampleChartPoints,chartSVG};\ninitApp();\n})();');
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
  // Import preference contract: merge overlays keys, replace clears missing keys.
  const fixture=a.buildAppData();
  fixture.preferences.exerciseDefaults={"name:bench":{restSeconds:150,loadIncrement:2.5,incrementUnit:"kg"}};
  fixture.preferences.progressionEnabled=false;
  a.S.exerciseDefaults={"name:row":{restSeconds:90}};a.S.progressionEnabled=true;
  node('#importText').value=JSON.stringify(fixture);node('#importMode').value="merge";
  await a.importJSON();
  assert.equal(a.S.exerciseDefaults["name:bench"].restSeconds,150);
  assert.equal(a.S.exerciseDefaults["name:row"].restSeconds,90);
  assert.equal(a.S.progressionEnabled,false);
  const beforeFailed=a.S.exerciseDefaults,enabledBefore=a.S.progressionEnabled;
  const failing=JSON.parse(JSON.stringify(fixture));failing.preferences.exerciseDefaults={"name:bench":{restSeconds:300}};
  node('#importText').value=JSON.stringify(failing);
  c.setRejectWrites(true);await a.importJSON();c.setRejectWrites(false);
  assert.equal(a.S.exerciseDefaults,beforeFailed);
  assert.equal(a.S.progressionEnabled,enabledBefore);
  node('#importMode').value="replace";
  await a.importJSON();
  assert.equal(a.S.exerciseDefaults["name:row"],undefined);
  assert.equal(a.S.exerciseDefaults["name:bench"].restSeconds,300);
  assert.equal(a.S.progressionEnabled,false);
  const withoutOptional=JSON.parse(JSON.stringify(fixture));delete withoutOptional.preferences.exerciseDefaults;delete withoutOptional.preferences.progressionEnabled;
  node('#importText').value=JSON.stringify(withoutOptional);node('#importMode').value="replace";await a.importJSON();
  assert.equal(Object.keys(a.S.exerciseDefaults).length,0);
  assert.equal(a.S.progressionEnabled,true);

  for(const w of canonical.workouts){
    const mapped=a.getDay(w.id);assert.equal(mapped.name,w.name);assert.equal(mapped.type,w.type);
    w.exercises.forEach((e,i)=>{assert.equal(mapped.ex[i].n,e.name);assert.equal(mapped.ex[i].s,e.sets);assert.equal(mapped.ex[i].lo,e.repsMin);assert.equal(mapped.ex[i].hi,e.repsMax);assert.deepEqual(Array.from(mapped.ex[i].alt),e.alternatives)});
  }
  assert(a.viewLog().includes('data-act="completeset"'));
  const big=Array.from({length:10000},(_,i)=>({id:String(i),date:"2026-10-12",dayId:"pullA",exercises:[{name:"Lat pulldown",unit:"kg",sets:[{w:50+i%20,r:10}]}]}));
  // >100k chart points previously overflowed function argument limits in
  // Math.min(...xs)/Math.max(...ys), despite rendering being downsampled.
  const hugePoints=Array.from({length:120000},(_,i)=>({x:Date.UTC(2026,0,1)+i*60000,y:i%91}));
  const hugeChart=a.chartSVG(hugePoints,'red','kg');
  assert(hugeChart.includes('with 120000 points'));
  assert((hugeChart.match(/<circle /g)||[]).length<=240);
  assert(hugeChart.length<50000);
  // Dashboard can skip materializing individual set points without changing totals.
  const fullAnalytics=a.analyticsSummary(big,{unit:"kg"});
  const aggregateAnalytics=a.analyticsSummary(big,{unit:"kg",includeExercisePoints:false});
  assert.deepEqual(aggregateAnalytics.weekly,fullAnalytics.weekly);
  assert.equal(aggregateAnalytics.sessions,fullAnalytics.sessions);
  assert.equal(aggregateAnalytics.volume,fullAnalytics.volume);
  assert.equal(aggregateAnalytics.hardSets,fullAnalytics.hardSets);
  assert.equal(aggregateAnalytics.exercisePoints.length,0);
  assert.equal(fullAnalytics.exercisePoints.length,10000);
  const start=Date.now();const metrics=a.analyticsSummary(big,{unit:"kg"});
  assert.equal(metrics.sessions,10000);assert.equal(metrics.hardSets,10000);
  assert.equal(metrics.weekly.length,1);
  const largePR=a.calculateRecords(big,"Lat pulldown","kg");assert.equal(largePR.heaviest.value,69);
  assert.equal(largePR.sampleCount,10000);
  const points=Array.from({length:10000},(_,i)=>({x:i,y:i%127}));
  const reduced=a.sampleChartPoints(points);
  assert(reduced.length<=240);assert.equal(reduced[0].x,0);assert.equal(reduced[reduced.length-1].x,9999);
  assert(a.chartSVG(points,"red","kg").match(/<circle/g).length<=240);
  assert(Date.now()-start<12000,"Large dataset regression exceeded 12 seconds");
  assert(a.viewLog().includes('data-save-status'));
  assert(a.viewLog().includes('data-act="recoverbackup"'));
  assert(a.viewLog().includes('Draft saved on this device'));
  const scopedSessions=[
    {id:"mixed",dayId:"pushA",date:"2026-10-12",createdAt:1,exercises:[{name:"Bench",unit:"kg",sets:[{w:50,r:10,type:"working"},{w:20,r:12,type:"warmup"},{w:30,r:8,type:"drop"}]},{name:"Row",unit:"lb",sets:[{w:220.462262,r:5}]}]},
    {id:"outside",dayId:"pullA",date:"2026-09-30",createdAt:2,exercises:[{name:"Bench",unit:"lb",sets:[{w:220.462262,r:6}]}]}
  ];
  assert.equal(a.analyticsSummary(scopedSessions,{from:"2026-10-01",to:"2026-10-31",workout:"pushA",exercise:"Bench",unit:"kg"}).volume,740);
  assert.equal(a.analyticsSummary(scopedSessions,{from:"2026-10-01",to:"2026-10-31",workout:"pushA",exercise:"Bench",unit:"kg"}).hardSets,1);
  assert.equal(a.analyticsSummary(scopedSessions,{from:"2026-10-01",to:"2026-10-31",workout:"pushA",exercise:"Bench",unit:"kg"}).sessions,1);
  assert.equal(a.calculateRecords(a.analyticsRange(scopedSessions,{from:"2026-10-01",workout:"pushA",exercise:"Bench"}),"Bench","kg").sessionVolume.value,740);
  assert.equal(a.calculateRecords(a.analyticsRange(scopedSessions,{from:"2026-10-01",workout:"pushA",exercise:"Bench"}),"Bench","lb").sessionVolume.value,1631.42);
  assert.equal(a.calculateRecords(a.analyticsRange(scopedSessions,{from:"2026-10-20",exercise:"Bench"}),"Bench").sessionVolume,null);
  assert.equal(a.analyticsSummary(scopedSessions,{unit:"kg"}).sessions,2);

  const analyticsFixture=[{id:"one",dayId:"pullA",date:"2026-10-12",exercises:[{name:"Row",unit:"kg",sets:[{w:50,r:10,type:"working"},{w:20,r:15,type:"warmup"},{w:30,r:8,type:"drop"}]}]},{id:"two",dayId:"pushA",date:"2026-10-13",exercises:[{name:"Press",unit:"lb",sets:[{w:100,r:8}]}]}];
  assert.equal(a.analyticsSummary(analyticsFixture,{workout:"pullA"}).hardSets,1);
  assert.equal(a.analyticsSummary(analyticsFixture,{workout:"pullA"}).volume,740);
  assert.equal(a.analyticsSummary(analyticsFixture,{from:"2026-10-14"}).sessions,0);
  assert.equal(a.analyticsSummary(analyticsFixture,{exercise:"Row"}).weekly.length,1);
  assert.equal(a.analyticsSummary([]).weekly.length,0);
  const samplePR={id:"r1",date:"2026-10-01",exercises:[{name:"Bench",unit:"lb",sets:[{w:100,r:8},{w:200,r:20,type:"warmup"}]}]};
  const pr=a.calculateRecords([samplePR], "Bench","kg");
  assert.equal(pr.heaviest.value,45.36);
  assert.equal(pr.mostReps.value,8);
  assert.equal(pr.sampleCount,1);
  assert.equal(a.calculateRecords([samplePR,samplePR],"Bench","kg").heaviest.tieCount,2);
  assert.equal(a.calculateRecords([],"Bench","kg").heaviest,null);
  assert.equal(a.recommendProgression({sessions:[],exerciseName:"Bench"}).kind,"unavailable");
  const sample={date:"2026-10-10",exercises:[{name:"Bench",unit:"kg",sets:[{w:50,r:12,type:"working",completed:true,rir:2},{w:50,r:12,type:"working",completed:true,rir:2},{w:25,r:20,type:"warmup"}]}]};
  assert.equal(a.recommendProgression({sessions:[sample],exerciseName:"Bench",unit:"kg",minimum:8,maximum:12,increment:2.5}).weight,52.5);
  assert.equal(a.recommendProgression({sessions:[sample],exerciseName:"Bench",unit:"kg",minimum:8,maximum:12,increment:5,incrementUnit:"lb"}).weight,52.27);
  assert.equal(a.recommendProgression({sessions:[sample],exerciseName:"Bench",enabled:false}).kind,"disabled");
  assert(a.viewLog().includes('data-act="copyforward"'));
  // Exercise IDs from custom workout definitions must survive draft creation and reload.
  const identityWorkout={id:'identity-test',name:'Identity test',type:'other',unit:'kg',ex:[{n:'Row',exerciseId:'unique-row-1',s:2,lo:8,hi:12,alt:[]},{n:'Row',exerciseId:'unique-row-2',s:2,lo:8,hi:12,alt:[]}]};
  a.S.custom.push(identityWorkout);
  a.S.exerciseDefaults={'id:unique-row-1':{restSeconds:180},'id:unique-row-2':{restSeconds:75}};
  const identityDraft=a.getDraft('identity-test');
  assert.equal(identityDraft.ex[0].exerciseId,'unique-row-1');
  assert.equal(identityDraft.ex[1].exerciseId,'unique-row-2');
  assert.equal(a.getDraft('identity-test').ex[0].exerciseId,'unique-row-1');
  assert.equal(identityDraft.ex[0].restSeconds,180);
  assert.equal(identityDraft.ex[1].restSeconds,75);
  delete identityDraft.ex[1].exerciseId; // Older v4 draft: recover ID from unchanged definition.
  assert.equal(a.getDraft('identity-test').ex[1].exerciseId,'unique-row-2');
  a.S.custom.pop();a.S.exerciseDefaults={};delete a.S.drafts['identity-test'];
  assert(a.viewLog().includes('data-act="savedefault"'));
  assert.equal(a.hardSetCount([{exercises:[{sets:[{r:8,type:"working",completed:true},{r:10,type:"warmup",completed:true},{r:9,type:"drop",completed:true},{r:6}]}]}]),2);
  assert.equal(a.hardSetCount([{exercises:[{sets:[{r:12,type:"working",completed:false}]}]}]),0);
  assert.equal(a.normalizeExerciseSetting({restSeconds:14}).restSeconds,undefined);
  assert.equal(a.normalizeExerciseSetting({restSeconds:135}).restSeconds,135);
  assert.equal(a.convertIncrement(2.20462262,"lb","kg"),1);
  assert.equal(a.convertIncrement(1,"kg","lb"),2.2);
  assert.equal(a.resolveRestSeconds({set:{restSeconds:45},exercise:{restSeconds:90},defaults:{restSeconds:120},draft:{restSeconds:180}}),45);
  assert.equal(a.resolveRestSeconds({set:{restSeconds:999},exercise:{restSeconds:80},defaults:{restSeconds:120},draft:{restSeconds:180}}),80);
  assert.equal(a.resolveRestSeconds({defaults:{restSeconds:120},draft:{restSeconds:180}}),120);
  assert.equal(a.resolveRestSeconds({draft:{restSeconds:180}}),180);
  assert.equal(a.resolveRestSeconds({set:{restSeconds:0}}),90);
  assert.notEqual(a.exerciseKey("Row","row-id-1"),a.exerciseKey("Row","row-id-2"));


  assert(a.viewHistory().includes('hard sets') || a.S.sessions.length===0);
  assert(a.viewLog().includes('data-act="timerpause"'));
  assert(a.viewLog().includes('data-act="settype"'));
  assert(a.viewLog().includes('data-f="rir"'));
  assert(a.viewLog().includes('data-f="exrest"'));
  assert(a.viewLog().includes('data-act="timerreset"'));
  assert(a.viewLog().includes('Make every')===false);assert(node('#app').innerHTML.includes('Make every rep count.'));
  const d=a.getDraft('pullA');d.restSeconds=135;d.restTimer={durationSeconds:135,deadline:Date.now()+135000,pausedRemainingMs:90000};d.startedAt=Date.now()-40000;d.ex[0].restSeconds=120;d.ex[0].loadIncrement='2.5';d.ex[0].incrementUnit='kg';d.ex[0].sets[0]={w:'100',r:'8',type:'working',completed:true,completedAt:'2026-10-14T10:00:00Z',rir:2};assert.equal(a.buildAppData().drafts.pullA.restTimer.pausedRemainingMs,90000);assert.equal(a.buildAppData().drafts.pullA.ex[0].restSeconds,120);assert.equal(a.buildAppData().drafts.pullA.ex[0].sets[0].rir,2);a.updateSessionMeter();assert.equal(node('#loggedSets').textContent,1);
  await a.saveSession({disabled:false,textContent:''});assert.equal(a.S.sessions.length,1);assert.equal(a.nextDayId(),'pushA');assert.equal(a.S.tab,'history');assert.equal(a.S.sessions[0].exercises[0].unit,'lb');assert.equal(a.S.sessions[0].exercises[0].sets[0].w,100);
  assert(JSON.parse(c.storage['ppl-tracker-v1']).sessions.length===1);assert.equal(JSON.parse(c.storage['ppl-tracker-v1']).drafts.pullA,undefined);assert.equal(JSON.parse(c.storage['ppl-tracker-v1']).schedules[0].cursor,1);assert.equal(JSON.parse(c.storage['ppl-tracker-v1']).preferences.selectedWorkoutId,'pushA');
  a.S.tab='data';a.render();await a.exportJSON();assert.equal(c.downloads.length,1);const backup=node('#exportOut').value;assert.equal(JSON.parse(backup).app,'ppl-tracker');
  const restored=setup();await settle();restored.node('#importText').value=backup;await restored.api.importJSON();assert.equal(restored.api.S.sessions.length,1);await restored.api.importJSON();assert.equal(restored.api.S.sessions.length,1);
  a.S.editing={id:'custom1',name:'Home workout',type:'other',unit:'kg',ex:[{n:'Goblet squat',s:3,lo:8,hi:12}]};await a.saveWorkout({});assert.equal(a.S.custom.length,1);assert.equal(a.nextDayId(),'pushA');assert.equal(a.S.dayId,'custom1');
  a.S.tab='progress';node('#bDate').value='2026-10-05';node('#bWeight').value='80';node('#bWaist').value='90';node('#bUnit').value='kg';await a.addBody();assert.equal(a.S.body.length,1);assert(a.viewProgress().includes('80 kg'));
  await a.putSession({id:'test-second',dayId:'pullA',dayName:'Pull A',date:'2026-10-06',createdAt:2,exercises:[{name:'Lat pulldown',unit:'kg',sets:[{w:50,r:8}]}]});a.S.progressEx='Lat pulldown';assert(a.viewProgress().includes('Trend chart'));assert(a.viewHistory().includes('Pull A'));
  const reload=setup({storage:c.storage});await settle();assert.equal(reload.api.S.sessions.length,2);assert.equal(reload.api.S.custom.length,1);assert.equal(reload.api.S.body.length,1);
  a.S.tab='data';a.render();await a.exportJSON();assert(!node('#toast').textContent.includes('Cannot export'),node('#toast').textContent);const full=setup();await settle();full.node('#importText').value=node('#exportOut').value;await full.api.importJSON();assert.equal(full.api.S.sessions.length,2,full.node('#toast').textContent);assert.equal(full.api.S.body.length,1);assert.equal(full.api.S.custom.length,1);
  full.node('#importText').value=JSON.stringify({sessions:[{id:'bad',date:'2026-10-05',exercises:[{name:'Invalid',sets:null}]}],custom:[{id:'badc',name:'Invalid',ex:[null]}]});await full.api.importJSON();assert.equal(full.api.S.sessions.length,2);assert.equal(full.api.S.custom.length,1);assert(full.node('#toast').textContent.includes('Import cancelled'));
  full.node('#importText').value='null';await full.api.importJSON();assert(full.node('#toast').textContent.includes('tracker backup'));
  const rotation=setup();await settle();for(const expected of canonical.rotation){assert.equal(rotation.api.nextDayId(),expected);rotation.api.S.dayId=expected;rotation.api.getDraft(expected).ex[0].sets[0]={w:'20',r:'8'};await rotation.api.saveSession({})}assert.equal(rotation.api.nextDayId(),'pullA');
  const offline=setup({fetchFail:true,storage:c.storage});await settle();assert.equal(offline.api.S.ready,true);assert(offline.api.viewData().includes('file unavailable'));
  const missing=setup({fetchFail:true});await settle();assert.equal(missing.api.S.ready,false);assert(missing.node('#app').innerHTML.includes('Choose program JSON'));
  await missing.api.useProgramFile({text:async()=>JSON.stringify(canonical)});assert.equal(missing.api.S.ready,true);
  const transfer=setup();await settle();transfer.api.S.dayId='pushA';const td=transfer.api.getDraft('pushA');td.ex[0].sets[0]={w:'60.5',r:'7'};td.notes='Unfinished session';transfer.api.S.bodyUnit='lb';transfer.api.S.progressEx='Barbell bench press';const complete=transfer.api.buildAppData();assert.equal(complete.version,4);assert.equal(complete.drafts.pushA.notes,'Unfinished session');
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
  // Version 3 backups must migrate to v4 without losing sessions or schedules.
  const v3=JSON.parse(JSON.stringify(packageData));v3.version=3;
  const v3Target=setup();await settle();v3Target.node('#importText').value=JSON.stringify(v3);await v3Target.api.importJSON();
  assert.equal(v3Target.api.S.sessions.length,packageData.sessions.length);
  assert.equal(v3Target.api.activeSchedule().id,packageData.preferences.activeScheduleId);
  assert.equal(v3Target.api.buildAppData().version,4);
  // Explicit v4 optional fields must survive backup normalization.
  const meta=JSON.parse(JSON.stringify(packageData));meta.sessions[0].exercises[0].sets[0].rir=2;
  meta.sessions[0].exercises[0].sets[0].type='working';
  const metaTarget=setup();await settle();metaTarget.node('#importText').value=JSON.stringify(meta);await metaTarget.api.importJSON();
  assert.equal(metaTarget.api.buildAppData().sessions.find(x=>x.id===meta.sessions[0].id).exercises[0].sets[0].rir,2);
  assert.deepEqual(JSON.parse(moduleCode.match(/const DATA_SCHEMA = ([^\n]+);/)[1]),JSON.parse(fs.readFileSync(path.join(root,'ppl-tracker-data.schema.json'),'utf8')));
  console.log('PASS: flexible repeating/weekly schedules, reorder, rest, independent progress, v1/v2 migration, v4 round trips, rollback;  JSON schema and exact defaults, project-relative URL, sessions, rotation, units, progress, custom workouts, body log, persistence, backup download/import/deduplication, cached program, missing-file recovery, storage-failure rollback and modified program.');
})().catch(e=>{console.error(e);process.exitCode=1});
