// Registration is additive; a failed worker never prevents local-first logging.
const banner=document.createElement('div');
banner.id='pwa-status';
banner.setAttribute('role','status');
banner.setAttribute('aria-live','polite');
banner.className='pwa-status-banner';
banner.hidden=true;
document.body.append(banner);
const message=(text,action)=>{
 banner.replaceChildren(document.createTextNode(text));
 if(action){const button=document.createElement('button');button.type='button';button.textContent='Update now';button.className='pwa-status-action';button.addEventListener('click',action);banner.append(button);}
 banner.hidden=false;
};
const connectivity=()=>{if(!navigator.onLine)message('Offline — workouts remain on this device.');else if(!banner.querySelector('button'))banner.hidden=true;};
window.addEventListener('online',connectivity);
window.addEventListener('offline',connectivity);
connectivity();
if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1')){
 let applying=false;
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(applying)location.reload();});
 navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(reg=>{
  const offer=()=>{if(!reg.waiting||!navigator.serviceWorker.controller)return;
   message('Update available. Finish and save your workout before updating.',()=>{
    // Never discard an uncommitted draft with an unsolicited reload.
    if(document.querySelector('[data-save-status][data-state="pending"],[data-save-status][data-state="error"],[data-save-status][data-state="conflict"]')){
     message('Save or export your current draft before updating.');return;
    }
    applying=true;reg.waiting.postMessage({type:'SKIP_WAITING'});
   });
  };
  offer();
  reg.addEventListener('updatefound',()=>reg.installing?.addEventListener('statechange',offer));
 }).catch(()=>{if(navigator.onLine)message('Offline installation unavailable; online logging still works.');});
}
