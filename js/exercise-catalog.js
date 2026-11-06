// Stable semantic IDs are assigned only to known names; unknown user names
// stay uncategorized. Never infer identity from workout position.
// Aliases are true synonyms only (same implement and movement). A different
// implement or movement is its own entry, so its history and suggestions stay apart.
const known=[
 ["lat-pulldown","Lat pulldown","back",["biceps"],"cable",["Neutral-grip pulldown"]],
 ["close-grip-pulldown","Close-grip pulldown","back",["biceps"],"cable",[]],
 ["straight-arm-pulldown","Straight-arm cable pulldown","back",["biceps"],"cable",[]],
 ["barbell-row","Barbell row","back",["biceps"],"barbell",[]],
 ["t-bar-row","T-bar row","back",["biceps"],"barbell",[]],
 ["cable-row","Seated cable row","back",["biceps"],"cable",[]],
 ["machine-row","Machine row","back",["biceps"],"machine",["Seated machine row"]],
 ["rear-delt-fly","Rear delt fly","shoulders",["back"],"dumbbell",[]],
 ["reverse-pec-deck","Reverse pec deck","shoulders",["back"],"machine",[]],
 ["ez-curl","EZ-bar curl","biceps",[],"barbell",[]],
 ["dumbbell-curl","Dumbbell curl","biceps",[],"dumbbell",[]],
 ["cable-curl","Cable curl","biceps",[],"cable",[]],
 ["bench-press","Barbell bench press","chest",["triceps","shoulders"],"barbell",["Bench press"]],
 ["dumbbell-bench-press","Dumbbell bench press","chest",["triceps","shoulders"],"dumbbell",[]],
 ["machine-chest-press","Machine chest press","chest",["triceps","shoulders"],"machine",[]],
 ["shoulder-press","Seated dumbbell shoulder press","shoulders",["triceps"],"dumbbell",[]],
 ["machine-shoulder-press","Machine shoulder press","shoulders",["triceps"],"machine",[]],
 ["overhead-press","Standing overhead press","shoulders",["triceps"],"barbell",["Overhead press","Barbell overhead press","Military press"]],
 ["incline-press","Incline dumbbell press","chest",["triceps","shoulders"],"dumbbell",[]],
 ["incline-barbell-press","Incline barbell press","chest",["triceps","shoulders"],"barbell",[]],
 ["incline-machine-press","Incline machine press","chest",["triceps","shoulders"],"machine",[]],
 ["lateral-raise","Lateral raise","shoulders",[],"dumbbell",[]],
 ["cable-lateral-raise","Cable lateral raise","shoulders",[],"cable",[]],
 ["machine-lateral-raise","Machine lateral raise","shoulders",[],"machine",[]],
 ["triceps-pushdown","Triceps pushdown","triceps",[],"cable",["Rope pushdown"]],
 ["back-squat","Back squat","quadriceps",["glutes"],"barbell",[]],
 ["goblet-squat","Goblet squat","quadriceps",["glutes"],"dumbbell",[]],
 ["smith-machine-squat","Smith machine squat","quadriceps",["glutes"],"machine",[]],
 ["leg-press","Leg press","quadriceps",["glutes"],"machine",[]],
 ["hack-squat","Hack squat","quadriceps",["glutes"],"machine",[]],
 ["leg-extension","Leg extension","quadriceps",[],"machine",[]],
 ["single-leg-extension","Single-leg extension","quadriceps",[],"machine",[]],
 ["leg-curl","Lying leg curl","hamstrings",[],"machine",[]],
 ["seated-leg-curl","Seated leg curl","hamstrings",[],"machine",[]],
 ["ball-leg-curl","Stability ball leg curl","hamstrings",[],"bodyweight",[]],
 ["calf-raise","Standing calf raise","calves",[],"machine",[]],
 ["leg-press-calf-raise","Leg press calf raise","calves",[],"machine",[]],
 ["smith-calf-raise","Smith machine calf raise","calves",[],"machine",[]],
 ["knee-raise","Hanging knee raise","core",[],"bodyweight",["Captain's chair knee raise"]],
 ["reverse-crunch","Reverse crunch","core",[],"bodyweight",[]],
 ["hammer-curl","Hammer curl","biceps",["forearms"],"dumbbell",[]],
 ["rope-hammer-curl","Rope cable hammer curl","biceps",["forearms"],"cable",[]],
 ["cross-body-curl","Cross-body curl","biceps",["forearms"],"dumbbell",[]],
 ["pull-up","Pull-ups","back",["biceps"],"bodyweight",["Pull-up"]],
 ["chin-up","Chin-ups","back",["biceps"],"bodyweight",[]],
 // Assisted equipment logs the counterweight: less weight means a stronger lift.
 ["assisted-pull-up","Assisted pull-up machine","back",["biceps"],"assisted",["Assisted pull-up","Assisted pull-ups","Assisted chin-up"]],
 ["band-assisted-pull-up","Band-assisted pull-up","back",["biceps"],"bodyweight",[]],
 ["incline-curl","Incline dumbbell curl","biceps",[],"dumbbell",[]],
 ["bayesian-curl","Bayesian cable curl","biceps",[],"cable",[]],
 ["preacher-curl","Preacher curl","biceps",[],"barbell",[]],
 ["chest-supported-row","Chest-supported dumbbell row","back",["biceps"],"dumbbell",["Chest-supported row"]],
 ["single-arm-dumbbell-row","Single-arm dumbbell row","back",["biceps"],"dumbbell",[]],
 ["face-pull","Face pull","shoulders",["back"],"cable",[]],
 ["band-pull-apart","Band pull-apart","shoulders",["back"],"bodyweight",[]],
 ["chest-fly","Cable chest fly","chest",[],"cable",[]],
 ["pec-deck","Pec deck","chest",[],"machine",[]],
 ["dumbbell-fly","Dumbbell chest fly","chest",[],"dumbbell",["Dumbbell fly"]],
 ["overhead-triceps","Overhead triceps extension","triceps",[],"dumbbell",[]],
 ["cable-overhead-extension","Cable overhead extension","triceps",[],"cable",[]],
 ["rdl","Romanian deadlift","hamstrings",["glutes"],"barbell",[]],
 ["dumbbell-rdl","Dumbbell Romanian deadlift","hamstrings",["glutes"],"dumbbell",["Dumbbell RDL"]],
 ["split-squat","Bulgarian split squat","quadriceps",["glutes"],"dumbbell",[]],
 ["split-squat-regular","Split squat","quadriceps",["glutes"],"dumbbell",[]],
 ["hip-thrust","Hip thrust","glutes",["hamstrings"],"barbell",[]],
 ["machine-hip-thrust","Machine hip thrust","glutes",["hamstrings"],"machine",[]],
 ["seated-calf","Seated calf raise","calves",[],"machine",["Seated machine calf raise"]],
 ["cable-crunch","Cable crunch","core",[],"cable",["Kneeling cable crunch"]]
];
const normalize=name=>String(name||"").trim().toLowerCase().replace(/\s+/g," ");
const lookup=new Map();
for(const [id,name,primaryMuscle,secondaryMuscles,equipment,aliases] of known){
 const value={id:"catalog:"+id,primaryMuscle,secondaryMuscles,equipment};
 lookup.set(normalize(name),value);
}
for(const [id,name,primaryMuscle,secondaryMuscles,equipment,aliases] of known){
 const value={id:"catalog:"+id,primaryMuscle,secondaryMuscles,equipment};
 for(const alias of aliases){const k=normalize(alias);if(!lookup.has(k))lookup.set(k,value);}
}
export function resolveExerciseMetadata(name){
 const item=lookup.get(normalize(name));
 return item?{exerciseId:item.id,primaryMuscle:item.primaryMuscle,secondaryMuscles:[...item.secondaryMuscles],equipment:item.equipment}:null;
}
export function resolveExerciseIdentity(name,existingId){
 // Explicit custom IDs remain stable, even when the user renames an exercise.
 if(existingId&&!String(existingId).startsWith("catalog:"))return existingId;
 // Catalog IDs are re-derived from a known name, so older records that stored a
 // shared ID (e.g. dumbbell bench under catalog:bench-press) resolve correctly.
 return resolveExerciseMetadata(name)?.exerciseId||existingId||null;
}
export function validateExerciseMetadata(value){
 if(!value||typeof value!=="object")return null;
 const muscles=["chest","back","shoulders","biceps","triceps","forearms","quadriceps","hamstrings","glutes","calves","core"];
 if(!muscles.includes(value.primaryMuscle)||!Array.isArray(value.secondaryMuscles)||value.secondaryMuscles.some(m=>!muscles.includes(m)||m===value.primaryMuscle)||new Set(value.secondaryMuscles).size!==value.secondaryMuscles.length||typeof value.equipment!=="string")throw Error("Invalid exercise metadata");
 return value;
}
