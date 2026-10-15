// Pure, read-only bridge between v1.2 muscle analytics and anatomical SVG regions.
// Region IDs are a proposed interface for phase B; SVG artwork must implement them.
export const MUSCLE_REGIONS = Object.freeze({
 chest: ["front-chest-left", "front-chest-right"],
 back: ["back-upper-left", "back-upper-right", "back-lats-left", "back-lats-right"],
 shoulders: ["front-deltoid-left", "front-deltoid-right", "back-deltoid-left", "back-deltoid-right"],
 biceps: ["front-biceps-left", "front-biceps-right"],
 triceps: ["back-triceps-left", "back-triceps-right"],
 forearms: ["front-forearm-left", "front-forearm-right", "back-forearm-left", "back-forearm-right"],
 quadriceps: ["front-quads-left", "front-quads-right"],
 hamstrings: ["back-hamstrings-left", "back-hamstrings-right"],
 glutes: ["back-glutes-left", "back-glutes-right"],
 calves: ["back-calves-left", "back-calves-right"],
 core: ["front-core"]
});
export const MUSCLE_IDS = Object.freeze(Object.keys(MUSCLE_REGIONS));
const isFiniteNonnegative = x => typeof x === "number" && Number.isFinite(x) && x >= 0;
const round = x => Math.round(x * 100) / 100;
const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
// Accept an existing muscleVolumeSummary result only; never reclassify exercises.
export function muscleMapData(summary, {metric="hardSets"}={}) {
 if (!summary || !["hardSets","volume"].includes(metric)) throw Error("Invalid muscle map input");
 const primary = new Map((summary.primary || []).filter(x=>x && typeof x.muscle==="string").map(x=>[x.muscle,x]));
 const secondary = new Map((summary.secondary || []).filter(x=>x && typeof x.muscle==="string").map(x=>[x.muscle,x]));
 const value = (map,id,field) => {
  const n=map.get(id)?.[field] ?? 0;
  if (!isFiniteNonnegative(n)) throw Error("Invalid muscle metric");
  return n;
 };
 const max=Math.max(0,...MUSCLE_IDS.map(id=>value(primary,id,metric)));
 const muscles=MUSCLE_IDS.map(id=>{
  const primaryHardSets=value(primary,id,"hardSets"), primaryVolume=value(primary,id,"volume");
  const secondaryHardSets=value(secondary,id,"hardSets"), secondaryVolume=value(secondary,id,"volume");
  const amount=metric==="hardSets"?primaryHardSets:primaryVolume;
  return {id,regions:[...MUSCLE_REGIONS[id]],primaryHardSets,primaryVolume,
   secondaryHardSets,secondaryVolume, intensity:max===0?0:round(amount/max)};
 });
 const otherIds=new Set([...primary.keys(),...secondary.keys()].filter(id=>!own(MUSCLE_REGIONS,id)));
 const unmapped=[...otherIds].sort().map(id=>({id,primaryHardSets:value(primary,id,"hardSets"),
  primaryVolume:value(primary,id,"volume"),secondaryHardSets:value(secondary,id,"hardSets"),
  secondaryVolume:value(secondary,id,"volume")}));
 const unknown=summary.unknown||{hardSets:0,volume:0};
 if (!isFiniteNonnegative(unknown.hardSets)||!isFiniteNonnegative(unknown.volume)) throw Error("Invalid unknown muscle metric");
 return {metric,unit:summary.unit,secondaryCredit:summary.secondaryCredit,
  scaleMax:round(max),muscles,unmapped,unknown:{hardSets:unknown.hardSets,volume:unknown.volume}};
}
