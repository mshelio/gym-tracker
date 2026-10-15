// Stable semantic IDs are assigned only to known names; unknown user names
// stay uncategorized. Never infer identity from workout position.
const known=[
 ["lat-pulldown","Lat pulldown","back",["biceps"],"cable",["Neutral-grip pulldown","Close-grip pulldown","Straight-arm cable pulldown"]],
 ["barbell-row","Barbell row","back",["biceps"],"barbell",["T-bar row"]],
 ["cable-row","Seated cable row","back",["biceps"],"cable",["Machine row","Seated machine row"]],
 ["rear-delt-fly","Rear delt fly","shoulders",["back"],"dumbbell",["Reverse pec deck","Face pull"]],
 ["ez-curl","EZ-bar curl","biceps",[],"barbell",["Dumbbell curl","Cable curl"]],
 ["bench-press","Barbell bench press","chest",["triceps","shoulders"],"barbell",["Bench press","Dumbbell bench press","Machine chest press"]],
 ["shoulder-press","Seated dumbbell shoulder press","shoulders",["triceps"],"dumbbell",["Machine shoulder press","Standing overhead press"]],
 ["incline-press","Incline dumbbell press","chest",["triceps","shoulders"],"dumbbell",["Incline barbell press","Incline machine press"]],
 ["lateral-raise","Lateral raise","shoulders",[],"dumbbell",["Cable lateral raise","Machine lateral raise"]],
 ["triceps-pushdown","Triceps pushdown","triceps",[],"cable",["Rope pushdown"]],
 ["back-squat","Back squat","quadriceps",["glutes"],"barbell",["Goblet squat","Smith machine squat"]],
 ["leg-press","Leg press","quadriceps",["glutes"],"machine",["Hack squat"]],
 ["leg-extension","Leg extension","quadriceps",[],"machine",["Single-leg extension"]],
 ["leg-curl","Lying leg curl","hamstrings",[],"machine",["Seated leg curl","Stability ball leg curl"]],
 ["calf-raise","Standing calf raise","calves",[],"machine",["Leg press calf raise","Smith machine calf raise"]],
 ["knee-raise","Hanging knee raise","core",[],"bodyweight",["Captain's chair knee raise","Reverse crunch"]],
 ["hammer-curl","Hammer curl","biceps",["forearms"],"dumbbell",["Rope cable hammer curl","Cross-body curl"]],
 ["pull-up","Pull-ups","back",["biceps"],"bodyweight",["Assisted pull-up machine","Assisted chin-up"]],
 ["incline-curl","Incline dumbbell curl","biceps",[],"dumbbell",["Bayesian cable curl","Preacher curl"]],
 ["chest-supported-row","Chest-supported dumbbell row","back",["biceps"],"dumbbell",["Single-arm dumbbell row","Chest-supported row"]],
 ["face-pull","Face pull","shoulders",["back"],"cable",["Band pull-apart"]],
 ["chest-fly","Cable chest fly","chest",[],"cable",["Pec deck","Dumbbell chest fly"]],
 ["overhead-triceps","Overhead triceps extension","triceps",[],"dumbbell",["Cable overhead extension"]],
 ["rdl","Romanian deadlift","hamstrings",["glutes"],"barbell",["Dumbbell Romanian deadlift"]],
 ["split-squat","Bulgarian split squat","quadriceps",["glutes"],"dumbbell",["Split squat"]],
 ["hip-thrust","Hip thrust","glutes",["hamstrings"],"barbell",["Machine hip thrust"]],
 ["seated-calf","Seated calf raise","calves",[],"machine",["Seated machine calf raise"]],
 ["cable-crunch","Cable crunch","core",[],"cable",["Kneeling cable crunch"]]
];
const normalize=name=>String(name||"").trim().toLowerCase().replace(/\\s+/g," ");
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
 const known=resolveExerciseMetadata(name);
 // Explicit custom IDs remain stable, even when the user renames an exercise.
 return existingId||known?.exerciseId||null;
}
export function validateExerciseMetadata(value){
 if(!value||typeof value!=="object")return null;
 const muscles=["chest","back","shoulders","biceps","triceps","forearms","quadriceps","hamstrings","glutes","calves","core"];
 if(!muscles.includes(value.primaryMuscle)||!Array.isArray(value.secondaryMuscles)||value.secondaryMuscles.some(m=>!muscles.includes(m)||m===value.primaryMuscle)||new Set(value.secondaryMuscles).size!==value.secondaryMuscles.length||typeof value.equipment!=="string")throw Error("Invalid exercise metadata");
 return value;
}
