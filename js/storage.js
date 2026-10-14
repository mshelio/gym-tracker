import { LOCAL_KEY, DRAFT_KEY } from "./config.js";
const DB_NAME = "gym-tracker", STORE = "snapshots";
const empty = () => ({sessions:[],body:[],custom:[],schedules:[],drafts:{},preferences:{}});
function open(idb){return new Promise((resolve,reject)=>{const r=idb.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE);};r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error("Database blocked"));r.onsuccess=()=>resolve(r.result);});}
function query(db,mode,fn){return new Promise((resolve,reject)=>{const t=db.transaction(STORE,mode);const req=fn(t.objectStore(STORE));t.oncomplete=()=>resolve(req.result);t.onabort=()=>reject(t.error||Error("Transaction aborted"));req.onerror=()=>reject(req.error);});}
export function createLocalStorage({state,preferences,toast,idb=globalThis.indexedDB,local=globalThis.localStorage}){
 let db=null,mode="legacy",writeQueue=Promise.resolve(),revision=0,conflicted=false;
 const legacy=()=>{const j=JSON.parse(local.getItem(LOCAL_KEY)||"{}"),d=j.drafts??JSON.parse(local.getItem(DRAFT_KEY)||"{}");return {sessions:Array.isArray(j.sessions)?j.sessions:[],body:Array.isArray(j.body)?j.body:[],custom:Array.isArray(j.custom)?j.custom:[],schedules:Array.isArray(j.schedules)?j.schedules:[],preferences:j.preferences||{},drafts:d&&typeof d==="object"&&!Array.isArray(d)?d:{}};};
 const current=()=>({sessions:state.sessions,body:state.body,custom:state.custom,schedules:state.schedules,drafts:state.drafts,preferences:preferences()});
 async function initialize(){
   if(!idb)return safeLegacy();
   try{db=await open(idb);}catch{toast("IndexedDB unavailable; using browser storage.");return safeLegacy();}
   let prior;try{prior=legacy();}catch(error){db.close();throw new Error('Legacy data is malformed; export or restore your backup before migration. '+error.message);}
   // Atomic, idempotent first-run copy. Keep localStorage untouched for recovery.
   const data=await new Promise((resolve,reject)=>{
     const tx=db.transaction(STORE,"readwrite"),store=tx.objectStore(STORE),req=store.get("primary");let value;
     req.onsuccess=()=>{value=req.result||prior;if(!req.result)store.put(value,"primary");};
     req.onerror=()=>reject(req.error);
     tx.onabort=()=>reject(tx.error||Error("Migration aborted"));
     tx.oncomplete=()=>resolve(value);
   });
   mode="idb";revision=data._revision||0;return data;
 }
 function safeLegacy(){try{return legacy();}catch{toast("Stored data could not be read. Restore a JSON backup.");return empty();}}
 async function readLocal(){return mode==="idb"?(await query(db,"readonly",s=>s.get("primary"))||empty()):safeLegacy();}
 async function writeLocal(){
   // Serialize full-snapshot writes and capture state when each transaction starts.
   const task=async()=>{
     const data=current();
     if(mode==="idb"){
       try {
         const next=await new Promise((resolve,reject)=>{
           const tx=db.transaction(STORE,"readwrite"),store=tx.objectStore(STORE),read=store.get("primary");
           let nextRevision=null;
           read.onsuccess=()=>{
             const saved=read.result||{};
             if((saved._revision||0)!==revision){conflicted=true;tx.abort();return;}
             nextRevision=revision+1;store.put({...data,_revision:nextRevision},"primary");
           };
           read.onerror=()=>reject(read.error);
           tx.onabort=()=>reject(conflicted?Error("Another tab updated your data"):tx.error||Error("Write aborted"));
           tx.oncomplete=()=>resolve(nextRevision);
         });
         revision=next;return true;
       } catch {return false;}
     }
     try{local.setItem(LOCAL_KEY,JSON.stringify(data));try{local.setItem(DRAFT_KEY,JSON.stringify(data.drafts));}catch{}return true;}catch{return false;}
   };
   const result=writeQueue.then(task,task);
   writeQueue=result.then(()=>undefined,()=>undefined);
   return result;
 }
 function loadDrafts(data){state.drafts=data?.drafts&&typeof data.drafts==="object"&&!Array.isArray(data.drafts)?data.drafts:{};}
 return {initialize,readLocal,writeLocal,loadDrafts,getMode:()=>mode,hasConflict:()=>conflicted};
}
