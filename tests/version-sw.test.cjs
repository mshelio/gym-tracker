// Test an actual shell-asset edit triggers a new worker revision without touching user data.
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const match=source.match(/const SHELL=(\[[\s\S]*?\]);/);
assert(match,'worker shell manifest must exist');
const items=[...match[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gym-pwa-upgrade-'));
try{
 fs.mkdirSync(path.join(tmp,'tests'),{recursive:true});
 fs.copyFileSync(path.join(root,'sw.js'),path.join(tmp,'sw.js'));
 fs.copyFileSync(path.join(root,'tests/version-sw.cjs'),path.join(tmp,'tests/version-sw.cjs'));
 for(const item of items){
  const rel=(item==='.'||item==='./')?'index.html':item.replace(/^\.\//,'');
  const output=path.join(tmp,rel);
  fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.copyFileSync(path.join(root,rel),output);
 }
 const run=(...args)=>cp.execFileSync(process.execPath,[path.join(tmp,'tests/version-sw.cjs'),...args],{cwd:tmp,encoding:'utf8'});
 assert.doesNotThrow(()=>run('--check'),'original shell digest must validate');
 const before=fs.readFileSync(path.join(tmp,'sw.js'),'utf8');
 fs.appendFileSync(path.join(tmp,'js/app.js'),'\n// A simulated release changes the cached app module.\n');
 assert.throws(()=>run('--check'),/stale|Command failed/,'changed app code must fail release gate');
 run();
 const after=fs.readFileSync(path.join(tmp,'sw.js'),'utf8');
 assert.notEqual(before,after,'worker script must change with an app-only deployment');
 assert.match(after,/const VERSION='gt-shell-[a-f0-9]{8}';/);
 assert.doesNotThrow(()=>run('--check'));
 const legacy=source.match(/const VERSION='([^']+)'/)[1];
 const updated=after.match(/const VERSION='([^']+)'/)[1];
 assert.notEqual(legacy,updated,'new version must not reuse the old cache');
 console.log('PASS: app-only edits regenerate worker, stale release fails CI');
}finally{fs.rmSync(tmp,{recursive:true,force:true})}
