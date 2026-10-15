// Visual preference is deliberately separate from workout storage and backup v4.
const KEY='gt-color-theme';
const MODES=new Set(['system','light','dark']);
export const normalizeTheme=value=>MODES.has(value)?value:'system';
export function themePreference(){
 try{return normalizeTheme(localStorage.getItem(KEY));}catch{return 'system';}
}
export function applyTheme(mode=themePreference()){
 const choice=normalizeTheme(mode);
 const dark=choice==='dark'||(choice==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
 document.documentElement.dataset.theme=dark?'dark':'light';
 document.documentElement.dataset.themePreference=choice;
 document.documentElement.style.colorScheme=dark?'dark':'light';
 const meta=document.querySelector('meta[name="theme-color"]');
 meta?.setAttribute('content',dark?'#0b1424':'#1769ff');
 return choice;
}
export function setTheme(mode){
 const choice=normalizeTheme(mode);
 try{localStorage.setItem(KEY,choice);}catch{/* Private mode remains usable. */}
 return applyTheme(choice);
}
export function initTheme(){
 applyTheme();
 const query=matchMedia('(prefers-color-scheme: dark)');
 const update=()=>{if(themePreference()==='system')applyTheme('system');};
 query.addEventListener?.('change',update);
 const choice=document.getElementById('theme-preference');
 if(choice){
  choice.value=themePreference();
  choice.addEventListener('change',()=>{choice.value=setTheme(choice.value);});
 }
 return ()=>query.removeEventListener?.('change',update);
}
initTheme();
