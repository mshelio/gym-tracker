import { MUSCLE_REGIONS } from "./muscle-map-data.js";
import { ANATOMY_PATHS } from "./anatomy-paths.js";

// SVG path geometry is adapted from vulovix/body-muscles under Apache-2.0.
// Retain the original conservative 11-group taxonomy; no inference for unknown exercises.
const sides=["front","back"];
const anatomyGroup = id => {
 if (/^chest-/.test(id)) return "chest";
 if (/^(traps-|lats-|lower-back-|spine$)/.test(id)) return "back";
 if (/^(shoulder-|deltoid-)/.test(id)) return "shoulders";
 if (/^biceps-/.test(id)) return "biceps";
 if (/^triceps-/.test(id)) return "triceps";
 if (/^forearm-/.test(id)) return "forearms";
 if (/^quads-/.test(id)) return "quadriceps";
 if (/^hamstrings-/.test(id)) return "hamstrings";
 if (/^gluteus-/.test(id)) return "glutes";
 if (/^calves-/.test(id)) return "calves";
 if (/^(abs-|obliques-|serratus-)/.test(id)) return "core";
 return null;
};
const regionId=(side,p)=>{
 // Keep selectors used by existing smoke tests stable.
 if(p.id==="chest-upper-left")return "front-chest-left";
 if(p.id==="gluteus-maximus-left")return "back-glutes-left";
 if(p.id==="triceps-long-left")return "back-triceps-left";
 return side+"-"+p.id;
};

const humanize = name => name==="core"?"Core / abdominals":name[0].toUpperCase()+name.slice(1);
const escapeText = value => String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
export function renderMuscleMap(data,{selected="chest",contributors=[]}={}){
 if(!data||!Array.isArray(data.muscles))throw Error("Muscle-map data required");
 const chosen=data.muscles.find(m=>m.id===selected)||data.muscles[0];
 const byMuscle=new Map(data.muscles.map(m=>[m.id,m]));
 const renderSide=side=>{
  const regions=ANATOMY_PATHS[side].map(p=>{
   const muscle=anatomyGroup(p.id),m=byMuscle.get(muscle);
   const id=regionId(side,p),intensity=Math.max(0,Math.min(1,Number(m?.intensity)||0));
   const active=m?.id===chosen?.id;
   return m
    ? `<path id="${id}" d="${p.path}" class="muscle-map__region${active?" is-selected":""}" data-muscle="${m.id}" role="button" tabindex="0" aria-label="${escapeText(p.name)}, ${m.primaryHardSets} primary hard sets" aria-pressed="${active}" style="--muscle-intensity:${intensity}"><title>${escapeText(p.name)}</title></path>`
    : `<path id="${id}" d="${p.path}" class="muscle-map__anatomy-base" aria-hidden="true"/>`;
  }).join("");
  const viewBox=side==="front"?"0 0 35 93":"37 0 35 93";
  return `<figure class="muscle-map__view"><svg viewBox="${viewBox}" role="group" aria-label="${side==="front"?"Front":"Back"} muscle regions; use Tab and Enter or Space to select" xmlns="http://www.w3.org/2000/svg">${regions}</svg><figcaption>${side==="front"?"Front":"Back"} view</figcaption></figure>`;
 };
 const contributionRows=(Array.isArray(contributors)?contributors:[]).filter(x=>x.muscle===chosen?.id).sort((a,b)=>a.name.localeCompare(b.name)||a.kind.localeCompare(b.kind));
 const contributing=chosen?`<details class="muscle-map__contributors"><summary>Contributing exercises (${contributionRows.length})</summary><table><caption>Exercise contributions for ${escapeText(humanize(chosen.id))}; secondary credits shown separately</caption><thead><tr><th scope="col">Exercise</th><th scope="col">Credit</th><th scope="col">Hard sets</th><th scope="col">Volume (${escapeText(data.unit||"kg")}·reps)</th></tr></thead><tbody>${contributionRows.map(x=>`<tr><th scope="row">${escapeText(x.name)}</th><td>${x.kind==="secondary"?"Secondary (0.5)":"Primary"}</td><td>${x.hardSets}</td><td>${x.volume}</td></tr>`).join("")||'<tr><td colspan="4">No classified exercise contributions in the selected range.</td></tr>'}</tbody></table></details>`:"";
 const details=chosen?`<section class="muscle-map__details" aria-live="polite"><h4>${escapeText(humanize(chosen.id))}</h4><dl><div><dt>Primary hard sets</dt><dd>${chosen.primaryHardSets}</dd></div><div><dt>Secondary credited sets</dt><dd>${chosen.secondaryHardSets}</dd></div><div><dt>Primary volume</dt><dd>${chosen.primaryVolume} ${escapeText(data.unit||"kg")}</dd></div><div><dt>Secondary credited volume</dt><dd>${chosen.secondaryVolume} ${escapeText(data.unit||"kg")}</dd></div></dl></section>`:"";
 const rows=data.muscles.map(m=>`<tr><th scope="row"><button type="button" data-muscle="${m.id}" aria-pressed="${m.id===chosen?.id}">${escapeText(humanize(m.id))}</button></th><td>${m.primaryHardSets}</td><td>${m.secondaryHardSets}</td><td>${m.primaryVolume}</td></tr>`).join("");
 return `<section class="muscle-map" aria-label="Muscle activity map"><p class="muscle-map__notice">Schematic training workload only, not muscle growth or recovery. Colors show relative ${data.metric==="volume"?"primary volume":"primary hard sets"} in this date range; secondary contributions are shown separately.</p><p class="muscle-map__instructions">Select a muscle using the diagram or the accessible muscle table below. Small regions can be selected by name in the table.</p><div class="muscle-map__diagrams">${sides.map(renderSide).join("")}</div><div class="muscle-map__legend"><span>No recorded primary activity</span><div aria-hidden="true" class="muscle-map__scale"></div><span>Highest relative activity (${data.scaleMax})</span></div>${details}${contributing}<details class="muscle-map__table"><summary>View exact muscle values</summary><table><thead><tr><th>Muscle</th><th>Primary sets</th><th>Secondary sets</th><th>Primary volume</th></tr></thead><tbody>${rows}</tbody></table><p>Unknown exercises: ${data.unknown?.hardSets||0} hard sets, ${data.unknown?.volume||0} ${escapeText(data.unit||"kg")} volume.</p></details></section>`;
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

// Training-plan anatomical preview. Illustrative only: it does not invent hard sets
// or infer exercise identity and never replaces the saved-session analytics.
export function renderExerciseMusclePreview(metadata) {
 if(!metadata||!metadata.primaryMuscle||!Object.hasOwn(MUSCLE_REGIONS,metadata.primaryMuscle))return '<p class="muted">Muscle classification unavailable for this exercise.</p>';
 const secondary=new Set((metadata.secondaryMuscles||[]).filter(m=>Object.hasOwn(MUSCLE_REGIONS,m)&&m!==metadata.primaryMuscle));
 const labelled=m=>humanize(m);
 const diagrams=sides.map(side=>{
  const regions=ANATOMY_PATHS[side].map(p=>{
   const muscle=anatomyGroup(p.id);
   const kind=muscle===metadata.primaryMuscle?"primary":secondary.has(muscle)?"secondary":"inactive";
   return `<path id="activation-${regionId(side,p)}" d="${p.path}" class="muscle-map__activation muscle-map__activation--${kind}"><title>${escapeText(p.name)}: ${kind}</title></path>`;
  }).join("");
  return `<svg viewBox="${side==="front"?"0 0 35 93":"37 0 35 93"}" role="img" aria-label="${side==="front"?"Front":"Back"}: primary ${escapeText(labelled(metadata.primaryMuscle))}; secondary ${escapeText([...secondary].map(labelled).join(", ")||"none")}" xmlns="http://www.w3.org/2000/svg">${regions}</svg>`;
 }).join("");
 return `<div class="muscle-map__exercise"><p><strong>Primary:</strong> ${escapeText(labelled(metadata.primaryMuscle))}. <strong>Secondary:</strong> ${escapeText([...secondary].map(labelled).join(", ")||"None recorded")}.</p><div class="muscle-map__exercise-figures">${diagrams}</div><p class="muted">Illustrative muscle involvement, not measured activation or recovery.</p></div>`;
}
