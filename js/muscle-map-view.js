import { MUSCLE_REGIONS } from "./muscle-map-data.js";

// Self-authored schematic regions (not a medical anatomical illustration).
// Each focusable muscle shape is a semantic button; keyboard and pointer share one handler.
const shapes = {
 "front-chest-left":[94,108,25,18],"front-chest-right":[146,108,25,18],
 "front-deltoid-left":[65,91,13,23],"front-deltoid-right":[175,91,13,23],
 "front-biceps-left":[55,145,12,28],"front-biceps-right":[185,145,12,28],
 "front-forearm-left":[43,202,10,30],"front-forearm-right":[197,202,10,30],
 "front-core":[120,180,29,47],
 "front-quads-left":[99,299,18,53],"front-quads-right":[141,299,18,53],
 "back-upper-left":[99,111,22,25],"back-upper-right":[141,111,22,25],
 "back-lats-left":[99,156,19,37],"back-lats-right":[141,156,19,37],
 "back-deltoid-left":[65,91,13,23],"back-deltoid-right":[175,91,13,23],
 "back-triceps-left":[55,149,12,27],"back-triceps-right":[185,149,12,27],
 "back-forearm-left":[43,202,10,30],"back-forearm-right":[197,202,10,30],
 "back-glutes-left":[101,244,19,26],"back-glutes-right":[139,244,19,26],
 "back-hamstrings-left":[99,316,18,48],"back-hamstrings-right":[141,316,18,48],
 "back-calves-left":[100,399,13,34],"back-calves-right":[140,399,13,34]
};
const sides=["front","back"];
const humanize = name => name==="core"?"Core / abdominals":name[0].toUpperCase()+name.slice(1);
const escapeText = value => String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
export function renderMuscleMap(data,{selected="chest"}={}){
 if(!data||!Array.isArray(data.muscles))throw Error("Muscle-map data required");
 const chosen=data.muscles.find(m=>m.id===selected)||data.muscles[0];
 const byRegion=new Map();
 for(const m of data.muscles)for(const id of m.regions)if(Object.hasOwn(shapes,id))byRegion.set(id,m);
 const renderSide=side=>{
  const regions=[...byRegion.entries()].filter(([id])=>id.startsWith(side+"-")).map(([id,m])=>{
   const [x,y,rx,ry]=shapes[id], intensity=Math.max(0,Math.min(1,Number(m.intensity)||0));
   const active=chosen?.id===m.id;
   return `<ellipse id="${id}" class="muscle-map__region${active?" is-selected":""}" data-muscle="${m.id}" role="button" tabindex="0" aria-label="${escapeText(humanize(m.id))}, ${m.primaryHardSets} primary hard sets" aria-pressed="${active}" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" style="--muscle-intensity:${intensity}"><title>${escapeText(humanize(m.id))}</title></ellipse>`;
  }).join("");
  return `<figure class="muscle-map__view"><svg viewBox="0 0 240 462" role="group" aria-label="${side==="front"?"Front":"Back"} muscle regions" xmlns="http://www.w3.org/2000/svg"><g class="muscle-map__silhouette" aria-hidden="true"><circle cx="120" cy="35" r="24"/><path d="M95 62 Q65 67 61 92 L32 212 L48 220 L78 133 L86 238 L79 336 L87 450 L109 450 L120 270 L131 450 L153 450 L161 336 L154 238 L162 133 L192 220 L208 212 L179 92 Q175 67 145 62Z"/></g>${regions}</svg><figcaption>${side==="front"?"Front":"Back"} view</figcaption></figure>`;
 };
 const details=chosen?`<section class="muscle-map__details" aria-live="polite"><h4>${escapeText(humanize(chosen.id))}</h4><dl><div><dt>Primary hard sets</dt><dd>${chosen.primaryHardSets}</dd></div><div><dt>Secondary credited sets</dt><dd>${chosen.secondaryHardSets}</dd></div><div><dt>Primary volume</dt><dd>${chosen.primaryVolume} ${escapeText(data.unit||"kg")}</dd></div><div><dt>Secondary credited volume</dt><dd>${chosen.secondaryVolume} ${escapeText(data.unit||"kg")}</dd></div></dl></section>`:"";
 const rows=data.muscles.map(m=>`<tr><th scope="row"><button type="button" data-muscle="${m.id}" aria-pressed="${m.id===chosen?.id}">${escapeText(humanize(m.id))}</button></th><td>${m.primaryHardSets}</td><td>${m.secondaryHardSets}</td><td>${m.primaryVolume}</td></tr>`).join("");
 return `<section class="muscle-map" aria-label="Muscle activity map"><p class="muscle-map__notice">Schematic training workload only, not muscle growth or recovery. Colors show relative ${data.metric==="volume"?"primary volume":"primary hard sets"} in this date range; secondary contributions are shown separately.</p><div class="muscle-map__diagrams">${sides.map(renderSide).join("")}</div><div class="muscle-map__legend"><span>No recorded primary activity</span><div aria-hidden="true" class="muscle-map__scale"></div><span>Highest relative activity (${data.scaleMax})</span></div>${details}<details class="muscle-map__table"><summary>View exact muscle values</summary><table><thead><tr><th>Muscle</th><th>Primary sets</th><th>Secondary sets</th><th>Primary volume</th></tr></thead><tbody>${rows}</tbody></table><p>Unknown exercises: ${data.unknown?.hardSets||0} hard sets, ${data.unknown?.volume||0} ${escapeText(data.unit||"kg")} volume.</p></details></section>`;
}
// Bind to a stable container after rendering. Returns an unsubscribe function.
// onSelect updates external selection state and re-renders; no persistence writes.
export function bindMuscleMap(container,onSelect){
 if(!container||typeof onSelect!=="function")throw Error("Muscle map container and handler required");
 const select=event=>{
  const target=event.target?.closest?.("[data-muscle]");
  if(!target||!container.contains(target))return;
  if(event.type==="keydown"&&!["Enter"," "].includes(event.key))return;
  if(event.type==="keydown")event.preventDefault();
  onSelect(target.dataset.muscle);
 };
 container.addEventListener("click",select);
 container.addEventListener("keydown",select);
 return ()=>{container.removeEventListener("click",select);container.removeEventListener("keydown",select);};
}
