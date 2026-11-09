const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'js/exercise-catalog.js'),'utf8').replace(/^export /gm,'');
const context=vm.createContext({});
vm.runInContext(source,context);
const catalog=vm.runInContext('getExerciseCatalog()',context);
assert.ok(catalog.length>=200,'catalog should contain at least 200 curated exercises');
assert.equal(new Set(catalog.map(e=>e.exerciseId)).size,catalog.length,'exercise IDs must be unique');
assert.equal(new Set(catalog.map(e=>e.name.toLowerCase())).size,catalog.length,'exercise names must be unique');
for(const exercise of catalog){
 const metadata=vm.runInContext(`resolveExerciseMetadata(${JSON.stringify(exercise.name)})`,context);
 assert.ok(metadata,exercise.name+' should resolve metadata');
 assert.equal(metadata.exerciseId,exercise.exerciseId);
 assert.ok(metadata.primaryMuscle,exercise.name+' should have a primary target');
 assert.ok(Array.isArray(metadata.secondaryMuscles));
 assert.ok(metadata.equipment);
 assert.doesNotThrow(()=>vm.runInContext(`validateExerciseMetadata(${JSON.stringify(metadata)})`,context),exercise.name+' metadata should validate');
}
for(const name of ['Barbell bench press','Lat pulldown','Romanian deadlift','Hip abduction machine','Pallof press','Kettlebell swing'])assert.ok(catalog.some(e=>e.name===name),name+' should be catalogued');
assert.ok(catalog.some(e=>e.primaryMuscle==='adductors'),'adductors should be represented');
console.log(`PASS: ${catalog.length} curated exercises have unique IDs and valid primary/secondary muscle and equipment metadata`);