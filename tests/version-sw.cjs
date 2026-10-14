// Generate a reproducible service worker revision from all precached assets.
// Run before deployment. Does not touch IndexedDB or user-generated data.
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),swPath=path.join(root,'sw.js');
const source=fs.readFileSync(swPath,'utf8');
const match=source.match(/const SHELL=(\[[\s\S]*?\]);/);
if(!match)throw Error('Missing SHELL declaration');
const items=[...match[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
if(!items.length)throw Error('Empty app shell');
let digest=2166136261;
const hashText=text=>{for(const c of Buffer.from(text,'utf8')){digest=Math.imul(digest^c,16777619)>>>0;}};
for(const item of items){
 const filename=path.join(root,(item==='.'||item==='./')?'index.html':item.replace(/^\.\//,''));
 if(!fs.existsSync(filename))throw Error('Missing cached asset: '+item);
 hashText(item+'\0'+execFileSync('git',['hash-object',filename],{cwd:root,encoding:'utf8'}).trim()+'\0');
}
const revision='gt-shell-'+digest.toString(16).padStart(8,'0');
const next=source.replace(/const VERSION='gt-shell-[^']+';/,"const VERSION='"+revision+"';");
if(next===source&&!source.includes("const VERSION='"+revision+"';"))throw Error('Cannot update SW revision');
if(process.argv.includes('--check')){
 if(!source.includes("const VERSION='"+revision+"';")){console.error('Service worker revision stale, expected '+revision);process.exitCode=1;}
 else console.log('Service worker revision current:',revision);
}else{
 if(next!==source)fs.writeFileSync(swPath,next);
 console.log('Service worker revision:',revision);
}
