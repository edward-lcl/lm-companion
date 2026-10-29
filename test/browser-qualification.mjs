// Synthetic-only browser qualification. No live profiles, cookies, native hosts or site traffic.
// BROWSER=chrome|firefox|zen BROWSER_BINARY=/path node test/browser-qualification.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const browser = process.env.BROWSER || 'chrome';
const scratch = process.env.LMC_SCRATCH || process.env.TMPDIR || os.tmpdir();
fs.mkdirSync(scratch,{recursive:true});
const run = fs.mkdtempSync(path.join(scratch, `lmc-${browser}-`));
const out = process.env.LMC_EVIDENCE || run;
fs.mkdirSync(out, {recursive:true});
const gecko = ['firefox','zen'].includes(browser);
const extension = path.join(run,'extension');
fs.mkdirSync(extension);
for (const p of ['src','icons','manifest.json']) fs.cpSync(path.join(root,p),path.join(extension,p),{recursive:true});
let manifest = JSON.parse(fs.readFileSync(path.join(extension,'manifest.json')));
if (gecko) {
  delete manifest.key; manifest.permissions = manifest.permissions.filter(p=>p!=='offscreen');
  manifest.background={scripts:['src/background.js'],type:'module'};
  manifest.options_ui={page:manifest.options_page,open_in_tab:true}; delete manifest.options_page;
  manifest.browser_specific_settings={gecko:{id:'xjtlu-lm-companion@edward-lcl.github.io',strict_min_version:'140.0',data_collection_permissions:{required:['none']}}};
}
const mockNative=process.env.LMC_MOCK_NATIVE==='1';
if(mockNative){manifest.optional_permissions=manifest.optional_permissions.filter(x=>x!=='nativeMessaging');manifest.permissions.push('nativeMessaging');}
fs.writeFileSync(path.join(extension,'manifest.json'),JSON.stringify(manifest));
const files=[];
function inventory(dir,rel='') { for(const item of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {const p=path.join(rel,item.name); if(item.isDirectory())inventory(path.join(dir,item.name),p); else files.push({path:p,sha256:createHash('sha256').update(fs.readFileSync(path.join(dir,item.name))).digest('hex')});}}
inventory(extension);
const result={browser,mockNative,at:new Date().toISOString(),syntheticOnly:true,source:files,checks:[],errors:[]};
let close=async()=>{}, evaluate,goto,shot,base,checkPanel;
try {
 if(gecko){
  const {Builder}=await import('selenium-webdriver'); const {default:Firefox}=await import('selenium-webdriver/firefox.js');
  const uuid='eea31d62-0e71-42bd-b4de-28b16e379aed';
  const options=new Firefox.Options().setBinary(process.env.BROWSER_BINARY || `/Applications/${browser==='zen'?'Zen':'Firefox'}.app/Contents/MacOS/${browser==='zen'?'zen':'firefox'}`).addArguments('-headless');
  options.setPreference('extensions.webextensions.uuids',JSON.stringify({[manifest.browser_specific_settings.gecko.id]:uuid}));
  options.setPreference('network.proxy.type',1).setPreference('network.proxy.http','127.0.0.1').setPreference('network.proxy.http_port',9).setPreference('network.proxy.ssl','127.0.0.1').setPreference('network.proxy.ssl_port',9).setPreference('network.proxy.no_proxies_on','');
  options.setPreference('datareporting.policy.dataSubmissionEnabled',false);
  const home=path.join(run,'home');fs.mkdirSync(home);
  if(mockNative){
   const host=path.join(run,'browser-native-mock.py');fs.copyFileSync(path.join(root,'test/browser-native-mock.py'),host);fs.chmodSync(host,0o755);
   for(const family of ['Mozilla','Zen']){const dir=path.join(home,`Library/Application Support/${family}/NativeMessagingHosts`);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'edu.xjtlu.lmbar.json'),JSON.stringify({name:'edu.xjtlu.lmbar',description:'Disposable synthetic qualification mock',path:host,type:'stdio',allowed_extensions:[manifest.browser_specific_settings.gecko.id]}));}
  }
  const service=new Firefox.ServiceBuilder().setEnvironment({...process.env,HOME:home,CFFIXED_USER_HOME:home,TMPDIR:run}).addArguments('--allow-system-access','--profile-root',run).setStdio(['ignore',fs.openSync(path.join(out,'geckodriver.log'),'a'),'pipe']);
  const driver=await new Builder().forBrowser('firefox').setFirefoxOptions(options).setFirefoxService(service).build();
  close=()=>driver.quit(); result.version=(await driver.getCapabilities()).get('browserVersion');
  await driver.installAddon(extension,true); base=`moz-extension://${uuid}`;
  evaluate=async(fn,arg)=>driver.executeAsyncScript('const done=arguments[arguments.length-1]; Promise.resolve(('+fn.toString()+')(arguments[0])).then(v=>done({value:v}),e=>done({error:String(e.stack||e)}));',arg).then(r=>{if(r.error)throw Error(r.error);return r.value;});
  goto=async url=>{await driver.setContext('chrome'); await driver.executeScript('gBrowser.selectedBrowser.loadURI(Services.io.newURI(arguments[0]), {triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()});',url);await driver.setContext('content');await new Promise(r=>setTimeout(r,700));}; shot=async name=>fs.writeFileSync(path.join(out,name+'.png'),await driver.takeScreenshot(),'base64');
  await driver.manage().window().setRect({width:1050,height:900});
 } else {
  const {chromium}=await import(process.env.PLAYWRIGHT_CORE || 'playwright-core');
  const home=path.join(run,'home');fs.mkdirSync(home);
  if(mockNative){
   const dir=path.join(run,'profile/NativeMessagingHosts'); fs.mkdirSync(dir,{recursive:true});
   const host=path.join(run,'browser-native-mock.py');fs.copyFileSync(path.join(root,'test/browser-native-mock.py'),host);fs.chmodSync(host,0o755);
   const digest=createHash('sha256').update(Buffer.from(manifest.key,'base64')).digest('hex').slice(0,32);const id=[...digest].map(c=>String.fromCharCode(97+parseInt(c,16))).join('');
   fs.writeFileSync(path.join(dir,'edu.xjtlu.lmbar.json'),JSON.stringify({name:'edu.xjtlu.lmbar',description:'Disposable synthetic qualification mock',path:host,type:'stdio',allowed_origins:[`chrome-extension://${id}/`]}));
  }
  const ctx=await chromium.launchPersistentContext(path.join(run,'profile'),{env:{...process.env,HOME:home,CFFIXED_USER_HOME:home,TMPDIR:run},executablePath:process.env.BROWSER_BINARY || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`,'--enable-unsafe-extension-debugging','--disable-features=DisableLoadExtensionCommandLineSwitch','--proxy-server=http://127.0.0.1:9'],timeout:30000});
  close=()=>ctx.close(); const page=await ctx.newPage();
  page.on('pageerror',e=>result.errors.push(String(e)));
  result.version=ctx.browser()?.version() || await page.evaluate(()=>navigator.userAgent);
  let sw=ctx.serviceWorkers()[0];
  if(!sw){ const session=await ctx.newCDPSession(page); try {const r=await session.send('Extensions.loadUnpacked',{path:extension}); result.loadUnpacked=r;}catch(e){result.loadUnpackedError=String(e);} sw=ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker',{timeout:15000}); }
  base=`chrome-extension://${new URL(sw.url()).host}`; evaluate=(fn,arg)=>page.evaluate(fn,arg); goto=url=>page.goto(url); shot=name=>page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
  await page.setViewportSize({width:1050,height:900});
  checkPanel=async()=>{await ctx.route('https://core.xjtlu.edu.cn/my/',route=>route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><html><body><main id="region-main"><h1>SYNTHETIC dashboard fixture</h1></main></body></html>'}));const dash=await ctx.newPage();dash.on('pageerror',e=>result.errors.push(String(e)));await dash.goto('https://core.xjtlu.edu.cn/my/');await dash.locator('.lmc-panel').waitFor();assert.ok((await dash.locator('.lmc-panel').textContent()).includes('SYNTHETIC — Research report'));await dash.screenshot({path:path.join(out,'panel-zh.png'),fullPage:true});await dash.close();result.checks.push('production content script imports and panel DOM on intercepted synthetic dashboard');};
 }
 await goto(base+'/src/options/options.html');
 const send=msg=>evaluate(msg=>chrome.runtime.sendMessage(msg),msg);
 const initial=await send({cmd:'settings_get'}); assert.equal(initial.state,'ok'); result.checks.push('production background loads and settings_get replies');
 assert.equal(await send({cmd:'bar_permission'}),mockNative); result.checks.push(mockNative?'test-copy native permission present':'native permission absent: standalone usable');
 for(const patch of [{remind:{on:true}},{studyLog:true}]) assert.equal((await send({cmd:'settings_update',operation:{type:'patch',patch}})).state,'permission_required');
 result.checks.push('notification and history denied: no silent enable');
 const changed=await send({cmd:'settings_update',revision:initial.revision,operation:{type:'patch',patch:{refreshMinutes:180}}}); assert.equal(changed.state,'ok');
 assert.equal((await send({cmd:'settings_get'})).settings.refreshMinutes,180);
 assert.equal((await send({cmd:'settings_update',revision:initial.revision,operation:{type:'patch',patch:{refreshMinutes:60}}})).state,'conflict');
 result.checks.push('settings write/readback and stale revision conflict');
 await evaluate(async()=>{const {DEFAULT_SETTINGS}=await import(chrome.runtime.getURL('src/lib/sync.js')); const now=Date.now(); await chrome.storage.local.set({settings:{...DEFAULT_SETTINGS,displayMode:'standalone',lang:'en',showPanel:true},status:{state:'ok',at:now},snapshot:{at:now,deadlines:[{id:'synthetic:1',name:'SYNTHETIC — Research report',type:'assign',courseId:'fixture',code:'TST101',course:'Synthetic course',due:now+3*3600000,url:'https://core.xjtlu.edu.cn/mod/assign/view.php?id=999999',actionable:true}],courses:[],engagement:[],grades:[],assignmentHistory:[]},changes:[]});});
 for(const lang of ['en','zh']){
  await goto(base+'/src/options/options.html');
  await evaluate(lang=>{const e=document.querySelector('#lang');e.value=lang;e.dispatchEvent(new Event('change',{bubbles:true}));},lang);
  await new Promise(r=>setTimeout(r,400));
  assert.equal((await send({cmd:'settings_get'})).settings.lang,lang);
  await goto(base+'/src/options/options.html');
  assert.equal(await evaluate(()=>document.querySelector('#lang').value),lang); await shot(`options-${lang}`);
  await goto(base+'/src/popup/popup.html'); await new Promise(r=>setTimeout(r,400));
  assert.ok((await evaluate(()=>document.body.textContent)).includes('SYNTHETIC — Research report'));
  assert.ok((await evaluate(()=>document.documentElement.lang)).startsWith(lang)); await shot(`popup-${lang}`);
 }
 result.checks.push('production options language UI persists across reload; EN/ZH popup fixture DOM and screenshots');
 if(checkPanel)await checkPanel();
 const reminder=await evaluate(async()=>{const {plan}=await import(chrome.runtime.getURL('src/lib/reminders.js'));const {snapshot,settings}=await chrome.storage.local.get(['snapshot','settings']);const s={...settings,remind:{on:true,before:[2]}};const p=plan(snapshot.deadlines,Date.now(),s);return {count:p.length,dedup:plan(snapshot.deadlines,Date.now(),s,{[p[0]?.key]:true}).length};});
 assert.deepEqual(reminder,{count:1,dedup:0});result.checks.push('reminder planner mock input: one reminder, sent-key dedup; no OS notification');
 if(mockNative){
  assert.equal((await send({cmd:'bar_push'})).ok,true);await new Promise(r=>setTimeout(r,500));
  const revision=(await send({cmd:'settings_get'})).revision;
  const id='d4187fb3-5634-4db6-917a-a02a132f582c';
  fs.writeFileSync(path.join(run,'request.json'),JSON.stringify({cmd:'settings_set',id,at:Date.now()-10,revision,patch:{refreshMinutes:30}}));
  await send({cmd:'bar_push'});await new Promise(r=>setTimeout(r,600));
  assert.equal((await send({cmd:'settings_get'})).settings.refreshMinutes,30);
  const frames=fs.readFileSync(path.join(run,'frames.jsonl'),'utf8').trim().split('\n').map(x=>JSON.parse(x));
  assert.ok(frames.filter(x=>x.cmd==='watch').length>=2);
  assert.ok(frames.some(x=>x.cmd==='settings_result'&&x.id===id&&x.state==='ok'&&x.snapshot.values.refreshMinutes===30));
  result.checks.push('real browser framed mock-host push, disconnect/reconnect, reverse settings_set and correlated settings_result readback');
 }
 if(gecko) {
 await evaluate(async()=>chrome.permissions.remove({origins:['https://core.xjtlu.edu.cn/*']}));
 assert.equal((await send({cmd:'refresh'})).state,'needs_access'); result.checks.push('host permission removed: refresh needs_access, not signed_out');
 } else { await evaluate(()=>chrome.storage.local.set({status:{state:'needs_access'}})); result.checks.push('needs_access UI fixture only: Chromium refuses removal of required origin'); }
 await goto(base+'/src/popup/popup.html'); await new Promise(r=>setTimeout(r,300)); await shot('permission-denied');
 assert.equal(result.errors.length,0,JSON.stringify(result.errors));
 result.passed=true;
} catch(e) {result.passed=false;result.failure=String(e.stack||e);process.exitCode=1;}
finally {await close().catch(e=>result.closeError=String(e));for(const dir of ['profile','home'])fs.rmSync(path.join(run,dir),{recursive:true,force:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,source:`${files.length} hashed files`,evidence:out},null,2));}
