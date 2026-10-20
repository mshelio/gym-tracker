const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'js/exercise-images.js'),'utf8').replace(/^import .*;$/gm,'').replace(/export /g,'');
const context=vm.createContext({});
vm.runInContext(source,context);
const resolve=name=>vm.runInContext(`exerciseImageFor(${JSON.stringify(name)})`,context);
for(const name of ['__proto__','constructor','My custom lift',''])assert.equal(resolve(name),null);
assert.equal(resolve('  LAT   PULLDOWN ').id,'Wide-Grip_Lat_Pulldown');
assert.notEqual(resolve('Lat pulldown').id,resolve('Neutral-grip pulldown').id);
const program=JSON.parse(fs.readFileSync(path.join(root,'ppl-default-workouts.json')));
for(const workout of program.workouts)for(const exercise of workout.exercises){
 const photo=resolve(exercise.name);assert.ok(photo,exercise.name);
 const bytes=fs.readFileSync(path.join(root,'assets/exercises',photo.id+'.jpg'));
 assert.equal(bytes.readUInt16BE(0),0xffd8,exercise.name+' must have a real JPEG');
}
console.log('PASS: default exercise photo coverage, explicit variants, and unknown custom names');
