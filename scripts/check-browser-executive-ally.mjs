import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { BASE_URL, withBrowserQa } from "./browser-qa-utils.mjs";
import { createExecutiveReportStore } from '@alamo/agent-runtime/server/executive-report-store.mjs';
import { createExecutiveReportService } from '@alamo/agent-runtime/server/executive-report-service.mjs';
import { reportHash } from '@alamo/agent-runtime/shared/executive-report-contracts.mjs';
import { EVERYAGENT_TENANT } from '../shared/everyagent-identity.mjs';

// Explicit fixture only: real report persistence/commands, fictional source and
// canned model. No provider key, source grants, production session or emails.
const owner='11111111-1111-4111-8111-111111111111',reader='22222222-2222-4222-8222-222222222222';
process.env.VITE_ALLY_REPORTS_ENABLED='true';process.env.VITE_ALLY_REPORT_PARTICIPANTS=JSON.stringify([{id:owner,name:'Test executive'},{id:reader,name:'Test reviewer'}]);
const output=path.resolve('generated/executive-ally-browser');await mkdir(output,{recursive:true});
const localRoot=await mkdtemp(path.join(os.tmpdir(),'platform-report-browser-'));
const auth={authenticated:true,mode:'entra-delegated',claims:{tid:EVERYAGENT_TENANT,oid:owner}};
let sourceReady=true, sourceReads=0;
const source={authorize:async()=>sourceReady?{revision:reportHash('fixture-grant'),detail:false}:false,catalog:async()=>[{id:'resident-flow',title:'Resident flow',inputSchema:{type:'object'}}],read:async(subject,scope,step)=>{
  sourceReads++;
  return {capability:step.capability,inputHash:reportHash(step.input),scope,revision:reportHash(sourceReads),grantRevision:reportHash('fixture-grant'),requiresDetail:false,observedAt:'2026-11-20T10:00:00Z',period:`${scope.from}–${scope.through}`,grain:'admission episode',status:'verified',coverage:'complete',title:'Admissions and discharges',note:'Fictional records used only for interface checks.',answer:'40 admission episodes, 25 discharges and 15 net additions. This is a synthetic fixture.',dataset:{title:'Community flow',shape:'categories',columns:[{key:'community',label:'Community',type:'string'},{key:'admissions',label:'Admissions',type:'number'},{key:'discharges',label:'Discharges',type:'number'}],rows:[{community:'San Pablo',admissions:15,discharges:8},{community:'Victoria’s House — long community name for layout validation',admissions:4,discharges:3},{community:'JC Wallace House',admissions:8,discharges:6},{community:'Turlock',admissions:5,discharges:4},{community:'Santa Clarita',admissions:8,discharges:4}]}};
}};
const model={plan:async()=>({plan:{steps:[{capability:'resident-flow',input:{}}],gaps:[]}}),synthesize:async()=>({findings:[{text:'40 admission episodes and 25 discharges produced 15 net additions.',sourceIds:['source-1']}],views:{version:'1.0',blocks:[{id:'flow',componentId:'comparison',datasetId:'source-1'}]}})};
try { await withBrowserQa(async browser=>{
  for(const width of [1440,390,320]) {
    const store=createExecutiveReportStore({azure:false,localRoot:path.join(localRoot,String(width))});
    const service=createExecutiveReportService({store,source,model,allowedSubjects:[owner,reader]});
    const context=await browser.newContext({viewport:{width,height:width===1440?1000:844},hasTouch:width<700,reducedMotion:width===320?'reduce':'no-preference'});
    await context.addInitScript(()=>{window.print=()=>{};});
    const page=await context.newPage(),errors=[];let loseResponse=false,hold=false,currentAuth=auth;
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/agent/v1/reports*',async route=>{
      try {
        const req=route.request(),url=new URL(req.url());let result;
        if(req.method()==='POST') {const body=req.postDataJSON();result=await service[body.operation](currentAuth,body.input);if(loseResponse){loseResponse=false;await route.abort();return;}}
        else if(url.searchParams.has('id')) {const id=url.searchParams.get('id');if(!hold)for(let i=0;i<3;i++)await service.advance({ownerId:owner,id});result=await service.get(currentAuth,url.searchParams.get('ownerId'),id,url.searchParams.has('version')?Number(url.searchParams.get('version')):null);}
        else result={reports:await service.list(currentAuth)};
        await route.fulfill({status:200,json:result,headers:{'cache-control':'no-store'}});
      } catch(e){await route.fulfill({status:e.statusCode??503,json:{code:e.code??'report_unavailable'}});}
    });
    await page.goto(`${BASE_URL}/admissions`,{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Open Ally chat',exact:true}).filter({visible:true}).click();const panel=page.getByRole('dialog',{name:'Ally',exact:true});
    await panel.getByRole('textbox',{name:'Ask Ally',exact:true}).fill('Compare admissions and discharges across communities.');
    loseResponse=width===1440;await panel.getByRole('button',{name:'Send question'}).click();
    if(width===1440){await panel.getByRole('alert').waitFor();await panel.getByRole('button',{name:'Send question'}).click();}
    await panel.getByText('40 admission episodes and 25 discharges produced 15 net additions.',{exact:true}).waitFor();
    assert.equal((await service.list(auth)).length,1,'lost acknowledgement retry must not duplicate the investigation');
    await panel.getByLabel('Chart measure').selectOption('discharges');await panel.getByRole('button',{name:'Show values'}).click();await panel.getByRole('table').waitFor();
    await panel.getByRole('button',{name:'Show chart'}).click();
    const overflow=await panel.evaluate(el=>el.scrollWidth-el.clientWidth);assert(overflow<=1,`${width}px panel overflow ${overflow}`);
    const small=await panel.locator('button:visible,input:visible,select:visible,summary:visible').evaluateAll(els=>els.filter(el=>el.getBoundingClientRect().height<43).map(el=>el.outerHTML));assert.deepEqual(small,[],'controls are at least 44px');
    await page.screenshot({path:path.join(output,`report-${width}.png`),fullPage:true});
    if(width===1440){
      const opened=context.waitForEvent('page');await panel.getByRole('button',{name:'Print or save PDF'}).click();const pdf=await opened;await pdf.getByRole('article',{name:'Report findings'}).waitFor();
      await pdf.pdf({path:path.join(output,'Ally fixture report.pdf'),format:'A4',printBackground:true});await pdf.close();
      await panel.getByRole('button',{name:'Share report'}).click();await panel.getByLabel('Test reviewer').click(); await page.waitForFunction(()=>document.querySelector('.ally-report-sharing input')?.checked === true);
      await panel.getByLabel('Test reviewer').waitFor();assert.equal((await service.list({...auth,claims:{...auth.claims,oid:reader}})).length,1);
      await context.grantPermissions(['clipboard-read','clipboard-write']);await panel.getByRole('button',{name:'Copy link',exact:true}).click();
      const sharedLink=await page.evaluate(()=>navigator.clipboard.readText());assert(new URL(sharedLink).searchParams.has('allyReport'));
      currentAuth={...auth,claims:{...auth.claims,oid:reader}};await page.goto(sharedLink,{waitUntil:'domcontentloaded'});
      await panel.getByRole('article',{name:'Report findings'}).waitFor();assert(await panel.getByRole('textbox',{name:'Follow-up question'}).isDisabled());
      assert.equal(await panel.getByRole('button',{name:'Share report',exact:true}).count(),0,'recipient has no owner controls');
      sourceReady=false;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await panel.getByRole('alert').waitFor();
      assert.equal(await panel.getByRole('article',{name:'Report findings'}).count(),0);assert.equal(await panel.getByLabel('Saved reports').locator('option').count(),1,'revocation clears cached report titles too');
      sourceReady=true;currentAuth=auth;await page.goto(sharedLink,{waitUntil:'domcontentloaded'});await panel.getByRole('article',{name:'Report findings'}).waitFor();
      await panel.getByRole('button',{name:'Refresh report',exact:true}).click();await page.waitForFunction(()=>document.querySelector('select[aria-label="Report version"]')?.value==='2');
      await panel.getByLabel('Report version').selectOption('1');await page.waitForFunction(()=>document.querySelector('select[aria-label="Report version"]')?.value==='1');assert.equal(await panel.getByRole('button',{name:'Refresh report',exact:true}).count(),0);
      await panel.getByLabel('Report version').selectOption('2');await panel.getByRole('textbox',{name:'Follow-up question'}).fill('Explain the net additions and show the supporting values.');await panel.getByRole('button',{name:'Send question'}).click();await page.waitForFunction(()=>document.querySelector('select[aria-label="Report version"]')?.value==='3');
    }
    await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});assert.equal(await panel.isVisible(),false);await page.getByRole('button',{name:'Open Ally chat',exact:true}).filter({visible:true}).evaluate(el=>{if(document.activeElement!==el)throw Error('Focus not restored');});
    await page.goto(`${BASE_URL}/admissions`,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Open Ally chat',exact:true}).filter({visible:true}).click();await panel.getByLabel('Saved reports').selectOption({label:'Compare admissions and discharges across communities.'}).catch(async()=>{const option=await panel.getByLabel('Saved reports').locator('option').nth(1).getAttribute('value');await panel.getByLabel('Saved reports').selectOption(option);});
    await panel.getByRole('article',{name:'Report findings'}).waitFor();
    if(width===320){await panel.getByRole('button',{name:'New report'}).click();hold=true;await panel.getByRole('textbox',{name:'Ask Ally',exact:true}).fill('A cancellable report');await panel.getByRole('button',{name:'Send question'}).click();await panel.getByRole('button',{name:'Stop',exact:true}).click();await panel.getByText('Stopped',{exact:true}).waitFor();hold=false;}
    assert.deepEqual(errors,[]);await context.close();
  }
},{});console.log('Executive Ally browser: 320/390/1440, controls, reduced motion, retry, charts, versioning, follow-up, shared links, recipient controls, revocation, PDF, cancellation and saved reopening passed.'); }
finally {await rm(localRoot,{recursive:true,force:true});}
