const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
(async()=>{
 const source=fs.readFileSync(path.join(__dirname,"../js/muscle-map-data.js"),"utf8");
 const {MUSCLE_IDS,MUSCLE_REGIONS,muscleMapData}=await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));
 assert.equal(MUSCLE_IDS.length,11);
 assert.equal(new Set(MUSCLE_IDS).size,MUSCLE_IDS.length);
 assert.equal(new Set(Object.values(MUSCLE_REGIONS).flat()).size,Object.values(MUSCLE_REGIONS).flat().length);
 const summary={unit:"kg",secondaryCredit:0.5,primary:[{muscle:"chest",hardSets:4,volume:2000},{muscle:"back",hardSets:2,volume:1000}],
 secondary:[{muscle:"triceps",hardSets:2,volume:1000}],unknown:{hardSets:1,volume:100}};
 const data=muscleMapData(summary);
 assert.equal(data.scaleMax,4);
 assert.equal(data.muscles.find(x=>x.id==="chest").intensity,1);
 assert.equal(data.muscles.find(x=>x.id==="back").intensity,0.5);
 assert.equal(data.muscles.find(x=>x.id==="triceps").primaryHardSets,0);
 assert.equal(data.muscles.find(x=>x.id==="triceps").secondaryHardSets,2);
 assert.equal(data.unknown.hardSets,1);
 assert.equal(data.muscles.find(x=>x.id==="triceps").intensity,0);
 assert.equal(muscleMapData(summary,{metric:"volume"}).scaleMax,2000);
 assert.equal(muscleMapData({unit:"kg",primary:[],secondary:[]}).scaleMax,0);
 assert.equal(muscleMapData({...summary,primary:[{muscle:"neck",hardSets:2,volume:50}]}).unmapped[0].id,"neck");
 assert.throws(()=>muscleMapData(summary,{metric:"invalid"}));
 assert.throws(()=>muscleMapData({...summary,unknown:{hardSets:-1,volume:0}}));
 console.log("Muscle map adapter tests passed");
})().catch(e=>{console.error(e);process.exitCode=1});
