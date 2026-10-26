const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({});vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../js/records.js'),'utf8').replace(/export /g,''),c);
const session=(id,date,w,unit='kg',extra=[])=>({id,date,exercises:[{name:'Bench press',unit,sets:[{w,r:6},...extra]}]});
const rows=c.strengthHighlights([session('a','2026-10-01',100),session('b','2026-10-08',110,'kg',[{w:300,r:6,type:'warmup'},{w:400,r:6,completed:false}])]);
assert.equal(rows[0].latest,132);assert.equal(rows[0].previous,120);assert.equal(rows[0].best,132);
assert.equal(c.strengthHighlights([session('a','2026-10-01',100)])[0].previous,null);
assert.equal(c.strengthHighlights([]).length,0);
const mixed=c.strengthHighlights([session('a','2026-10-01',100),session('b','2026-10-08',220.462262,'lb')]);assert.equal(mixed[0].latest,mixed[0].previous);
console.log('PASS: strength comparisons, mixed units, exclusions and empty history');
