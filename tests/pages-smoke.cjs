// Production smoke: isolated browser context, never uses a real user's profile.
const {chromium}=require('@playwright/test');
const base=process.env.PAGES_URL||'https://mshelio.github.io/gym-tracker/';
const expected={
 '':'text/html',
 'css/styles.css':'text/css',
 'js/app.js':'javascript',
 'ppl-default-workouts.json':'json',
 'js/storage.js':'javascript',
 'js/config.js':'javascript'
};
async function verify(){
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({serviceWorkers:'block'});
  const page=await context.newPage();
  const failures=[];page.on('pageerror',e=>failures.push(e.message));
  for(const [path,type] of Object.entries(expected)){
   const url=new URL(path,base).toString();
   const response=await page.request.get(url,{timeout:15000});
   if(response.status()!==200)throw Error(url+' returned '+response.status());
   const mime=response.headers()['content-type']||'';
   if(!mime.includes(type))throw Error(url+' invalid Content-Type '+mime);
   const body=await response.text();
   if(!body.trim())throw Error(url+' returned empty content');
   if(path==='') {
    if(!body.includes('./js/app.js')||!body.includes('./css/styles.css'))throw Error('HTML references missing relative assets');
   }
   if(path==='ppl-default-workouts.json'){
    const json=JSON.parse(body);
    if(!Array.isArray(json.workouts)||!json.workouts.length)throw Error('Program JSON has no workouts');
   }
   console.log('OK',response.status(),mime,url);
  }
  const navigation=await page.goto(base,{waitUntil:'domcontentloaded',timeout:20000});
  if(navigation.status()!==200)throw Error('Document navigation failed');
  await page.getByText('Make every rep count.').waitFor({timeout:15000});
  await page.getByText('Pull A').first().waitFor({timeout:15000});
  await page.getByRole('button',{name:/history/i}).first().click();
  await page.getByText('The work adds up.').waitFor({timeout:10000});
  if(failures.length)throw Error('Browser errors: '+failures.join('; '));
  console.log('PASS production startup, navigation and native modules on isolated profile');
  await context.close();
 }finally{await browser.close();}
}
(async()=>{
 for(let attempt=1;attempt<=6;attempt++){
  try{await verify();process.exitCode=0;return;}
  catch(e){console.error('Attempt '+attempt+'/6: '+e.message);if(attempt===6){process.exitCode=1;return;}await new Promise(r=>setTimeout(r,10000));}
 }
})();
