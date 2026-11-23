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
    console.log(`Executive Ally: checking ${width}px`);
    const store=createExecutiveReportStore({azure:false,localRoot:path.join(localRoot,String(width))});
    const service=createExecutiveReportService({store,source,model,allowedSubjects:[owner,reader]});
    const context=await browser.newContext({viewport:{width,height:width===1440?1000:844},hasTouch:width<700,reducedMotion:width===320?'reduce':'no-preference'});
    await context.addInitScript(()=>{window.print=()=>{};});
    const page=await context.newPage(),errors=[];let loseResponse=false,hold=false,denyHistory=false,currentAuth=auth;
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/agent/v1/reports*',async route=>{
      try {
        const req=route.request(),url=new URL(req.url());let result;
        if(req.method()==='POST') {const body=req.postDataJSON();result=await service[body.operation](currentAuth,body.input);if(loseResponse){loseResponse=false;await route.abort();return;}}
        else if(url.searchParams.has('id')) {if(denyHistory && Number(url.searchParams.get('version'))>0 && Number(url.searchParams.get('version'))<3) {await route.fulfill({status:403,json:{code:'source_forbidden'}});return;}const id=url.searchParams.get('id');if(!hold)for(let i=0;i<3;i++)await service.advance({ownerId:owner,id});result=await service.get(currentAuth,url.searchParams.get('ownerId'),id,url.searchParams.has('version')?Number(url.searchParams.get('version')):null);}
        else result={reports:await service.list(currentAuth)};
        // The independent API adds a validated optional measureKey. Keep this
        // wire fixture separate from the host’s older source-runtime package.
        if (result?.view && result.selectedVersion !== 2) result = {...result,view:{...result.view,blocks:result.view.blocks.map(block=>({...block,measureKey:'discharges'}))}};
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
    assert.equal(await panel.getByLabel('Chart measure').inputValue(),'discharges','the chart must use the saved measure, not the first numeric column');
    assert.equal(await panel.getByRole('list',{name:'Discharges',exact:true}).count(),1);
    await panel.getByText('View data table').click();await panel.getByRole('table').first().waitFor();
    await panel.getByText('View data table').click();
    const overflow=await panel.evaluate(el=>el.scrollWidth-el.clientWidth);assert(overflow<=1,`${width}px panel overflow ${overflow}`);
    const small=await panel.locator('button:visible,input:visible,select:visible,summary:visible').evaluateAll(els=>els.filter(el=>el.getBoundingClientRect().height<43).map(el=>el.outerHTML));assert.deepEqual(small,[],'controls are at least 44px');
    await page.screenshot({path:path.join(output,`report-${width}.png`),fullPage:true});
    await panel.getByLabel('More report actions').click();
    const actionBox=await panel.getByRole('group',{name:'Report actions'}).boundingBox(),bodyBox=await panel.locator('.executive-ally-body').boundingBox();
    assert(actionBox&&bodyBox&&actionBox.y>=bodyBox.y&&actionBox.y+actionBox.height<=bodyBox.y+bodyBox.height,'answer actions are fully visible above the composer');
    await panel.getByLabel('More report actions').click();

    if(width===1440){
      const opened=context.waitForEvent('page');await panel.getByLabel('More report actions').click();await panel.getByRole('button',{name:'Save PDF'}).click();const pdf=await opened;await pdf.getByRole('article',{name:'Report findings'}).waitFor();
      assert.equal(await pdf.getByRole('list',{name:'Discharges',exact:true}).count(),1,'PDF must retain the report’s default chart measure');
      await pdf.pdf({path:path.join(output,'Ally fixture report.pdf'),format:'A4',printBackground:true});await pdf.close();
      await panel.getByLabel('More report actions').click();await panel.getByRole('button',{name:'Share report'}).click();await panel.getByLabel('Test reviewer').click(); await page.waitForFunction(()=>document.querySelector('.ally-report-sharing input')?.checked === true);
      await panel.getByLabel('Test reviewer').waitFor();assert.equal((await service.list({...auth,claims:{...auth.claims,oid:reader}})).length,1);
      await context.grantPermissions(['clipboard-read','clipboard-write']);await panel.getByRole('button',{name:'Copy link',exact:true}).click();
      const sharedLink=await page.evaluate(()=>navigator.clipboard.readText());assert(new URL(sharedLink).searchParams.has('allyReport'));
      currentAuth={...auth,claims:{...auth.claims,oid:reader}};await page.goto(sharedLink,{waitUntil:'domcontentloaded'});
      await panel.getByRole('article',{name:'Report findings'}).waitFor();assert(await panel.getByRole('textbox',{name:'Follow-up question'}).isDisabled());
      assert.equal(await panel.getByRole('button',{name:/^(Refresh report|Share report)$/,includeHidden:true}).count(),0,'recipient has no owner controls, including closed-menu actions');
      sourceReady=false;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await panel.getByRole('alert').waitFor();
      assert.equal(await panel.getByRole('article',{name:'Report findings'}).count(),0);assert.equal(await panel.getByRole('navigation',{name:'Saved reports'}).count(),0,'revocation clears cached report titles too');
      sourceReady=true;currentAuth=auth;await page.goto(sharedLink,{waitUntil:'domcontentloaded'});await panel.getByRole('article',{name:'Report findings'}).waitFor();
      assert.equal(await panel.getByLabel('Chart measure').inputValue(),'discharges','reopening keeps the source-bound chart measure');
      await panel.getByLabel('Chart measure').selectOption('admissions');
      const overrideOpened=context.waitForEvent('page');await panel.getByLabel('More report actions').click();await panel.getByRole('button',{name:'Save PDF'}).click();const overridePdf=await overrideOpened;await overridePdf.getByRole('article',{name:'Report findings'}).waitFor();
      assert.equal(await overridePdf.getByRole('list',{name:'Admissions',exact:true}).count(),1,'explicit user choice takes precedence in PDF');await overridePdf.close();
      await panel.getByLabel('More report actions').click();await panel.getByRole('button',{name:'Refresh report',exact:true}).click();
      const second=panel.locator('.ally-thread-turn[data-version="2"]');await second.getByRole('article',{name:'Report findings'}).waitFor();
      assert.equal(await second.getByLabel('Chart measure').inputValue(),'admissions','legacy versions without a measure retain first-column behavior');
      assert.equal(await panel.locator('.ally-thread-question').count(),1,'refresh replaces the answer without repeating the question');
      await second.getByRole('button',{name:'Open report',exact:true}).click();const readerView=panel.getByRole('complementary',{name:'Expanded report'});
      await readerView.getByLabel('Report version').selectOption('1');
      assert.equal(await readerView.getByRole('button',{name:/^(Refresh report|Share report)$/,includeHidden:true}).count(),0,'historical reader has no mutation controls');
      assert.equal(await readerView.getByLabel('Chart measure').inputValue(),'admissions','each version retains its explicit chart selection');
      const historicalOpened=context.waitForEvent('page');await readerView.getByRole('button',{name:'Save PDF'}).click();const historicalPdf=await historicalOpened;
      await historicalPdf.getByRole('article',{name:'Report findings'}).waitFor();assert.equal(await historicalPdf.getByRole('list',{name:'Admissions',exact:true}).count(),1);await historicalPdf.close();
      await readerView.getByRole('button',{name:'Close report'}).click();
      hold=true;
      const composer=panel.getByRole('textbox',{name:'Follow-up question'});
      await composer.fill('Explain the net additions');await composer.press('Shift+Enter');await composer.pressSequentially('and show the supporting values.');
      assert.equal(await composer.inputValue(),'Explain the net additions\nand show the supporting values.');
      await composer.dispatchEvent('keydown',{key:'Enter',code:'Enter',bubbles:true,isComposing:true});
      assert.equal((await service.list(auth))[0].version,2,'IME confirmation must not submit');
      await composer.press('Enter');const third=panel.locator('.ally-thread-turn[data-version="3"]');await third.waitFor();
      assert.equal(await second.getByRole('article',{name:'Report findings'}).count(),1,'the previous answer stays visible during follow-up');
      assert(await composer.isEnabled(),'the user can draft while Ally works');await composer.fill('Draft for the next question');
      const scroller=panel.locator('.executive-ally-body');await scroller.evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll'));});
      hold=false;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));await third.getByRole('article',{name:'Report findings'}).waitFor();
      assert.equal(await scroller.evaluate(el=>el.scrollTop),0,'finishing an answer must not move a reader inspecting older work');
      assert.equal(await composer.inputValue(),'Draft for the next question','polling preserves the next draft');await composer.fill('');
      assert.equal(await panel.locator('.ally-thread-question').count(),2,'a follow-up produces a visible conversation');
      await page.setViewportSize({width:1440,height:636});
      await composer.focus();
      const scrollBounds=await panel.evaluate(el=>({overflow:el.scrollHeight-el.clientHeight,top:el.scrollTop,header:el.querySelector('header').getBoundingClientRect().top,composer:el.querySelector('.executive-ally-composer').getBoundingClientRect().bottom,bottom:el.getBoundingClientRect().bottom}));
      assert(scrollBounds.overflow<=1&&scrollBounds.top===0&&scrollBounds.header>=0&&scrollBounds.composer<=scrollBounds.bottom,'long conversations scroll only the answer body, keeping the header and composer in the panel: '+JSON.stringify(scrollBounds));
      await page.setViewportSize({width:1440,height:1000});
      const ids=await panel.locator('[id^="ally-turn-"]').evaluateAll(els=>els.map(el=>el.id));assert.equal(new Set(ids).size,ids.length,'citations have unique per-answer destinations');
      await page.screenshot({path:path.join(output,'conversation-1440.png'),fullPage:true});
      await second.getByRole('button',{name:'Open report',exact:true}).click();
      denyHistory=true;await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
      await panel.getByText('Some earlier answers are unavailable.',{exact:false}).waitFor();
      assert.equal(await panel.locator('.ally-thread-turn[data-version="2"]').count(),0,'a historical source denial removes the older answer');
      assert.equal(await panel.getByRole('complementary',{name:'Expanded report'}).count(),0,'an open historical document closes when its source access is denied');
      assert.equal(await third.getByRole('article',{name:'Report findings'}).count(),1,'a separately authorized current answer remains usable');
      denyHistory=false;await panel.getByRole('button',{name:'Retry',exact:true}).click();await second.getByRole('article',{name:'Report findings'}).waitFor();
      await panel.getByLabel('Saved conversations').click();
      const menu=panel.getByRole('navigation',{name:'Saved reports'});await menu.getByLabel('Search conversations').fill('Explain the net additions');
      assert.equal(await menu.getByRole('button').count(),1,'history searches the saved conversations');
      await page.screenshot({path:path.join(output,'history-1440.png'),fullPage:true});
      await page.keyboard.press('Escape');assert.equal(await menu.isVisible(),false,'Escape closes history before the workspace');


    }
    if(width===1440 && await panel.getByRole('button',{name:'Restore Ally panel'}).count()) await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});assert.equal(await panel.isVisible(),false);await page.getByRole('button',{name:'Open Ally chat',exact:true}).filter({visible:true}).evaluate(el=>{if(document.activeElement!==el)throw Error('Focus not restored');});
    await page.goto(`${BASE_URL}/admissions`,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Open Ally chat',exact:true}).filter({visible:true}).click();await panel.getByLabel('Saved conversations').click();
    const historyBox=await panel.getByRole('navigation',{name:'Saved reports'}).boundingBox();assert(historyBox&&historyBox.x>=0&&historyBox.x+historyBox.width<=width,`${width}px history stays inside the viewport`);
    await page.screenshot({path:path.join(output,`saved-history-${width}.png`),fullPage:true});
    await panel.getByRole('navigation',{name:'Saved reports'}).getByRole('button').first().click();
    await panel.getByRole('article',{name:'Report findings'}).last().waitFor();
    if(width===1440){await panel.locator('.ally-thread-turn[data-version="2"] article').waitFor();assert.equal(await panel.locator('.ally-thread-question').count(),2,'saved reopening restores the conversation');await page.waitForFunction(()=>{const body=document.querySelector('.executive-ally-body'),turn=document.querySelector('.ally-thread-turn[data-version="3"]');return body&&turn&&turn.getBoundingClientRect().top>=body.getBoundingClientRect().top&&turn.getBoundingClientRect().top<body.getBoundingClientRect().bottom;});}
    if(width===390){await panel.getByRole('button',{name:'Open report',exact:true}).click();const readerView=panel.getByRole('complementary',{name:'Expanded report'});await readerView.waitFor();assert.equal(await panel.locator('.ally-conversation-column').isVisible(),false,'phone report uses one reading surface');await readerView.getByRole('button',{name:'Close report'}).click();assert(await panel.getByRole('textbox',{name:'Follow-up question'}).isVisible());}
    if(width===320){await panel.getByRole('button',{name:'New chat',exact:true}).click();hold=true;await panel.getByRole('textbox',{name:'Ask Ally',exact:true}).fill('A cancellable report');await panel.getByRole('button',{name:'Send question'}).click();await panel.getByRole('button',{name:'Stop',exact:true}).click();await panel.getByText('Stopped',{exact:true}).waitFor();hold=false;}
    if(width===320){
      let full=await service.create(auth,{requestId:crypto.randomUUID(),objective:'At the conversation limit',scope:{communityIds:[],from:'2026-01-01',through:'2026-11-23'}});
      for(let version=1;version<=12;version++){
        for(let step=0;step<3;step++)await service.advance({ownerId:owner,id:full.id});
        full=await service.get(auth,owner,full.id);
        if(version<12)full=await service.command(auth,{ownerId:owner,id:full.id,revision:full.revision,action:'refresh',requestId:crypto.randomUUID()});
      }
      await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Open Ally chat',exact:true}).filter({visible:true}).click();
      await panel.getByLabel('Saved conversations').click();await panel.getByRole('button',{name:'At the conversation limit',exact:true}).click();
      await panel.getByText('Continue in a new chat.',{exact:true}).waitFor();
      assert.equal(await panel.getByRole('textbox',{name:'Follow-up question'}).isEnabled(),false,'full conversations offer a usable next step before a failed submission');
      assert.equal(await panel.getByRole('button',{name:'Refresh report',includeHidden:true}).count(),0);
      await panel.getByRole('button',{name:'New chat',exact:true}).click();assert(await panel.getByRole('textbox',{name:'Ask Ally',exact:true}).isEnabled());
      assert.equal(await panel.locator('.ally-thread-turn').count(),0,'new chat does not inherit previous questions');
    }
    assert.deepEqual(errors,[]);await context.close();
  }
},{});console.log('Executive Ally browser: 320/390/1440, controls, reduced motion, retry, charts, conversation/history, stable scrolling/drafts, IME, versioning, shared links, recipient controls, current and historical revocation, PDF, cancellation and saved reopening passed.'); }
finally {await rm(localRoot,{recursive:true,force:true});}
