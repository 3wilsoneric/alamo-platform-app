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
let sourceReady=true, sourceReads=0, trendFixture=false, proseTableFixture=false, derivedFixture=false;
const derivedDataset={title:'Occupied beds',shape:'categories',columns:[{key:'community',label:'Community',type:'string'},{key:'census',label:'Census',type:'number'},{key:'capacity',label:'Capacity',type:'number'}],rows:[{community:'Alpha',census:4,capacity:8},{community:'Beta',census:9,capacity:10},{community:'Gamma',census:7,capacity:20}]};
const proseDataset={title:'Community ages',shape:'records',columns:[{key:'community',label:'Community',type:'string'},{key:'age',label:'Average age',type:'number'},{key:'known',label:'Known ages',type:'number'},{key:'missing',label:'Missing ages',type:'number'}],rows:[{community:'A deliberately long fictional community name',age:44.9,known:136,missing:0},{community:'Another community <img src=x onerror=alert()>',age:40.7,known:138,missing:1}]};
const trendDataset={title:'Monthly occupied bed-days',shape:'series',columns:[{key:'as_of_date',label:'as_of_date',type:'string'},{key:'occupied_bed_days',label:'occupied_bed_days',type:'number'}],rows:[{as_of_date:'2026-01-01',occupied_bed_days:-1200},{as_of_date:'2026-02-01',occupied_bed_days:null},{as_of_date:'2026-03-01',occupied_bed_days:150443},{as_of_date:'2026-04-01',occupied_bed_days:130000}]};
const source={authorize:async()=>sourceReady?{revision:reportHash('fixture-grant'),detail:false}:false,catalog:async()=>[{id:'resident-flow',title:'Resident flow',inputSchema:{type:'object'}}],read:async(subject,scope,step)=>{
  sourceReads++;
  return {capability:step.capability,inputHash:reportHash(step.input),scope,revision:reportHash(sourceReads),grantRevision:reportHash('fixture-grant'),requiresDetail:false,observedAt:'2026-11-20T10:00:00Z',period:`${scope.from}–${scope.through}`,grain:'admission episode',status:'verified',coverage:'complete',title:'Admissions and discharges',note:'Fictional records used only for interface checks.',answer:derivedFixture?JSON.stringify(derivedDataset.rows):proseTableFixture?JSON.stringify(proseDataset.rows):'40 admission episodes, 25 discharges and 15 net additions. This is a synthetic fixture.',dataset:derivedFixture?derivedDataset:proseTableFixture?proseDataset:trendFixture?trendDataset:{title:'Community flow',shape:'categories',columns:[{key:'community',label:'Community',type:'string'},{key:'admissions',label:'admissions',type:'number'},{key:'discharges',label:'discharges',type:'number'},{key:'operatingCapacity',label:'operatingCapacity',type:'number'},{key:'occupied_bed_days',label:'occupied_bed_days',type:'number'},{key:'capacityAsOf',label:'capacityAsOf',type:'string'}],rows:[{community:'San Pablo',admissions:15,discharges:8,operatingCapacity:175,occupied_bed_days:150443,capacityAsOf:'2026-07-30'},{community:'Victoria’s House — long community name for layout validation',admissions:4,discharges:3},{community:'JC Wallace House',admissions:8,discharges:6},{community:'Turlock',admissions:5,discharges:4},{community:'Santa Clarita',admissions:8,discharges:4}].map(row=>({operatingCapacity:null,occupied_bed_days:null,capacityAsOf:null,...row}))}};
}};
const model={plan:async()=>({plan:{steps:[{capability:'resident-flow',input:{}}],gaps:[]}}),synthesize:async()=>({findings:[{text:derivedFixture?'Recorded census is 4, 9 and 7.':proseTableFixture?'| Community | Average age | Known ages | Missing ages |\n|---|---:|---:|---:|\n| A deliberately long fictional community name | 44.9 | 136 | 0 |\n| Another community <img src=x onerror=alert()> | 40.7 | 138 | 1 |\n\n**Summary**\nThe missing age remains missing.':trendFixture?'Monthly occupied bed-days.\n\n**Context**\n- Missing values stay missing.\n- Negative values stay below zero.\n\n<img src=x onerror=alert()>':'40 admission episodes and 25 discharges produced 15 net additions.',sourceIds:['source-1']}],views:{version:'1.0',blocks:derivedFixture?[{id:'derived',componentId:'comparison',datasetId:'source-1',measureKey:'census',sort:{key:'derived_occupancy',direction:'desc'},computedColumns:[{key:'derived_occupancy',label:'Occupancy percent',operation:'percent',left:'census',right:'capacity'}]}]:proseTableFixture?[{id:'ages',componentId:'table',datasetId:'source-1'}]:[{id:'flow',componentId:trendFixture?'trend':'comparison',datasetId:'source-1'}]}})};
try { await withBrowserQa(async browser=>{
  for(const width of [1440,390,320]) {
    console.log(`Executive Ally: checking ${width}px`);
    const store=createExecutiveReportStore({azure:false,localRoot:path.join(localRoot,String(width))});
    let fixtureTime=Date.now();
    const service=createExecutiveReportService({store,source,model,allowedSubjects:[owner,reader],now:()=>fixtureTime});
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
        if (result?.view && result.selectedVersion !== 2 && !derivedFixture) result = {...result,view:{...result.view,blocks:result.view.blocks.map(block=>({...block,measureKey:trendFixture?'occupied_bed_days':'discharges'}))}};
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
    await panel.getByText('View data table').click();
    assert.equal(await panel.getByLabel('Chart measure').getByRole('option',{name:'Operating capacity',exact:true}).count(),1,'legacy database keys become readable measure names');
    if(width<700){
      const records=panel.locator('.ally-report-data-table .ally-report-records');await records.waitFor();
      assert.match(await records.innerText(),/Occupied bed-days/);assert.match(await records.innerText(),/150,443/);assert.match(await records.innerText(),/30 Jul 2026/);
      assert.equal(await panel.getByRole('table').count(),0,'narrow layouts expose readable records instead of squeezed table columns');
      const bounds=await records.evaluate(el=>({left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,overflow:el.scrollWidth-el.clientWidth}));
      assert(bounds.left>=0&&bounds.right<=width&&bounds.overflow<=1,'record labels and values fit the phone');
      await page.screenshot({path:path.join(output,`readable-data-${width}.png`),fullPage:true});
    }else{
      await panel.getByRole('table').first().waitFor();
      assert.equal(await panel.getByRole('columnheader',{name:'Occupied bed-days',exact:true}).count(),1);
    }
    await panel.getByText('View data table').click();
    const references=panel.locator('.ally-report-sources');
    assert.equal(await references.getAttribute('open'),null,'source metadata stays out of the answer by default');
    assert.equal(await panel.getByText('Source evidence',{exact:true}).count(),0);
    assert.equal(await panel.locator('article pre').count(),0,'the report never dumps JSON into the reader');
    await references.getByText('Sources',{exact:true}).click();
    const sourceLink=references.getByRole('link',{name:'Community flow',exact:true});await sourceLink.focus();await page.keyboard.press('Enter');
    const sourceReader=panel.getByRole('complementary',{name:'Expanded report'});await sourceReader.waitFor();
    assert.equal(await sourceReader.locator('#ally-document-source-1').evaluate(el=>el===document.activeElement),true,'source link focuses the exact saved data view');
    assert.equal(await sourceReader.locator('pre').count(),0);
    await sourceReader.getByRole('button',{name:'Close report'}).click();
    // closeDocument restores focus on the next animation frame. Check the
    // observable result, after that scheduled work, rather than racing click().
    await page.waitForFunction(link=>link===document.activeElement,await sourceLink.elementHandle(),{timeout:1500});
    assert.equal(await sourceLink.evaluate(el=>el===document.activeElement),true,'closing a source returns focus to its link');
    await references.getByText('Sources',{exact:true}).click();
    const overflow=await panel.evaluate(el=>el.scrollWidth-el.clientWidth);assert(overflow<=1,`${width}px panel overflow ${overflow}`);
    // Query and measure in one DOM evaluation: the transient Latest button can
    // disappear between locator resolution and evaluateAll, leaving a detached
    // element with a zero box. Only current visible controls are touch targets.
    const small=await panel.evaluate(panel=>[...panel.querySelectorAll('button,input,select,summary')]
      .filter(el=>el.getClientRects().length && getComputedStyle(el).visibility==='visible')
      .filter(el=>el.getBoundingClientRect().height<43)
      .map(el=>({html:el.outerHTML,height:el.getBoundingClientRect().height})));
    assert.deepEqual(small,[],'controls are at least 44px');
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
      await page.setViewportSize({width:1440,height:320});
      await panel.locator('.ally-report-scope summary').click();
      const short=await panel.evaluate(el=>({outer:el.scrollHeight-el.clientHeight,body:el.querySelector('.executive-ally-body').clientHeight,composer:el.querySelector('.executive-ally-composer').getBoundingClientRect().bottom,bottom:el.getBoundingClientRect().bottom}));
      assert(short.outer<=1&&short.body>40&&short.composer<=short.bottom,'expanded scope cannot push the composer outside a short viewport: '+JSON.stringify(short));
      await panel.locator('.ally-report-scope summary').click();
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
      assert.equal(await menu.locator('button:not(.ally-guidance-history)').count(),1,'history searches the saved conversations; the separate guidance command is not a report');
      assert.equal(await menu.getByRole('button',{name:'Explain the net additions and show the supporting values.',exact:true}).count(),1);
      await page.screenshot({path:path.join(output,'history-1440.png'),fullPage:true});
      await page.keyboard.press('Escape');assert.equal(await menu.isVisible(),false,'Escape closes history before the workspace');


    }
    if(width===1440 && await panel.getByRole('button',{name:'Restore Ally panel'}).count()) await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');await panel.waitFor({state:'hidden'});assert.equal(await panel.isVisible(),false);await page.getByRole('button',{name:'Open Ally chat',exact:true}).filter({visible:true}).evaluate(el=>{if(document.activeElement!==el)throw Error('Focus not restored');});
    await page.goto(`${BASE_URL}/admissions`,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Open Ally chat',exact:true}).filter({visible:true}).click();await panel.getByLabel('Saved conversations').click();
    const historyBox=await panel.getByRole('navigation',{name:'Saved reports'}).boundingBox(),panelBox=await panel.boundingBox();assert(historyBox&&panelBox&&historyBox.x>=panelBox.x&&historyBox.x+historyBox.width<=panelBox.x+panelBox.width&&historyBox.y>=panelBox.y&&historyBox.y+historyBox.height<=panelBox.y+panelBox.height,`${width}px history stays inside its panel, not merely the page viewport`);
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
    // Same report path, with long values, a missing point and a negative baseline.
    await panel.getByRole('button',{name:'New chat',exact:true}).click();trendFixture=true;
    await panel.getByRole('textbox',{name:'Ask Ally',exact:true}).fill('Show the monthly occupied bed-days.');
    await panel.getByRole('button',{name:'Send question'}).click();
    const trend=panel.getByRole('figure',{name:'Monthly occupied bed-days: Occupied bed-days'});await trend.waitFor();
    assert.equal(await panel.locator('.ally-report-prose strong').innerText(),'Context');
    assert.equal(await panel.locator('.ally-report-prose li').count(),2);
    assert.equal(await panel.locator('.ally-report-prose ul').evaluate(el=>getComputedStyle(el).listStyleType),'disc','global list resets must not erase bullets');
    assert.equal(await panel.locator('article img').count(),0,'model HTML stays literal text');
    assert.equal(await trend.locator('circle').count(),3,'missing values do not become zero');
    assert.equal(await trend.locator('line.ally-report-trend').count(),1,'missing values break the line');
    assert.match(await trend.innerText(),/150,443/);assert.match(await trend.innerText(),/-1,200/);
    assert.match(await trend.innerText(),/1 Jan 2026/);assert.match(await trend.innerText(),/1 Apr 2026/);
    const trendBounds=await trend.evaluate(el=>({width:el.clientWidth,overflow:el.scrollWidth-el.clientWidth,right:el.getBoundingClientRect().right}));
    assert(trendBounds.width>100&&trendBounds.overflow<=1&&trendBounds.right<=width,'trend axes and dates fit the available width');
    const baseline=Number(await trend.locator('.ally-report-axis').getAttribute('y1'));assert(baseline>0&&baseline<136,'zero axis reflects negative values');
    await page.screenshot({path:path.join(output,`trend-${width}.png`),fullPage:true});
    await panel.getByText('View data table').click();
    if(width<700){
      const records=panel.locator('.ally-report-data-table .ally-report-records');
      await records.locator('li').nth(2).scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(output,`record-detail-${width}.png`),fullPage:true});
    }else{
      const opened=context.waitForEvent('page');await panel.getByLabel('More report actions').click();await panel.getByRole('button',{name:'Save PDF'}).click();const pdf=await opened;
      await pdf.getByRole('article',{name:'Report findings'}).waitFor();await pdf.emulateMedia({media:'print'});
      assert.equal(await pdf.locator('.ally-report-records:visible').count(),0,'print keeps full tables');
      assert.equal(await pdf.getByRole('columnheader',{name:'Occupied bed-days',exact:true}).count(),1);
      await pdf.pdf({path:path.join(output,'Ally trend report.pdf'),format:'A4',printBackground:true});await pdf.close();
    }
    trendFixture=false;proseTableFixture=true;
    await panel.getByRole('button',{name:'New chat',exact:true}).click();
    await panel.getByRole('textbox',{name:'Ask Ally',exact:true}).fill('Compare the fictional community ages in a table.');
    await panel.getByRole('button',{name:'Send question'}).click();
    const prose=panel.locator('.ally-report-prose');
    try { await prose.getByText('The missing age remains missing.',{exact:false}).waitFor(); }
    catch(error) { console.error('Prose table fixture:',await panel.innerText(),errors); throw error; }
    assert.equal(await prose.locator('strong').innerText(),'Summary');
    assert.equal(await prose.locator('img,a,script').count(),0,'table cells do not turn model markup into active content');
    assert.equal((await prose.innerText()).includes('|---'),false,'model Markdown tables render as tables, not pipe-delimited prose');
    if(width<700){
      const records=prose.locator('.ally-report-records');assert(await records.isVisible());
      assert.equal(await records.evaluate(el=>getComputedStyle(el).listStyleType),'none','mobile record cards do not inherit prose bullets');
      assert.equal(await records.locator('li').count(),2);assert.match(await records.innerText(),/Missing ages/);assert.match(await records.innerText(),/40\.7/);
      const bounds=await records.evaluate(el=>({overflow:el.scrollWidth-el.clientWidth,right:el.getBoundingClientRect().right}));assert(bounds.overflow<=1&&bounds.right<=width);
    }else{
      const table=prose.getByRole('table');assert(await table.isVisible());assert.equal(await table.getByRole('columnheader').count(),4);
      assert.equal(await table.getByRole('cell',{name:'136',exact:true}).count(),1);assert.equal(await table.getByRole('cell',{name:'1',exact:true}).count(),1);
    }
    await page.screenshot({path:path.join(output,`prose-table-${width}.png`),fullPage:true});
    proseTableFixture=false;
    fixtureTime+=24*60*60*1000;
    derivedFixture=true;
    await panel.getByRole('button',{name:'New chat',exact:true}).click();
    await panel.getByRole('textbox',{name:'Ask Ally',exact:true}).fill('Rank by occupancy, then chart census.');
    await panel.getByRole('button',{name:'Send question'}).click();
    await panel.getByText('Recorded census is 4, 9 and 7.',{exact:true}).waitFor();
    const ranked=panel.getByRole('list',{name:'Census',exact:true});
    assert.deepEqual(await ranked.locator('li>span').allTextContents(),['Beta','Alpha','Gamma'],'bars use calculated occupancy order, not census order or prose only');
    assert.deepEqual(await ranked.locator('li>strong').allTextContents(),['9','4','7']);
    await panel.getByLabel('Chart measure').selectOption('derived_occupancy');
    const ratios=panel.getByRole('list',{name:'Occupancy percent',exact:true});
    assert.deepEqual(await ratios.locator('li>strong').allTextContents(),['90','50','35']);
    if(width===1440){
      const opened=context.waitForEvent('page');await panel.getByLabel('More report actions').click();await panel.getByRole('button',{name:'Save PDF'}).click();const pdf=await opened;
      const printed=pdf.getByRole('list',{name:'Occupancy percent',exact:true});await printed.waitFor();
      assert.deepEqual(await printed.locator('li>span').allTextContents(),['Beta','Alpha','Gamma']);
      await pdf.emulateMedia({media:'print'});
      assert.equal(await pdf.getByRole('table',{name:'Occupied beds',exact:true}).count(),1,'one exact table prints per chart');
      await pdf.pdf({path:path.join(output,'Ally derived report.pdf'),format:'A4',printBackground:true});await pdf.close();
    }
    await page.screenshot({path:path.join(output,`derived-chart-${width}.png`),fullPage:true});
    derivedFixture=false;
    // Dense history in the normal side panel was the production failure. Check
    // clipping ancestors and real hit testing, not just page-level overflow.
    fixtureTime+=24*60*60*1000; // Separate history-layout fixtures from the earlier daily quota tests.
    for(let i=0;i<8;i++) await service.create(auth,{requestId:crypto.randomUUID(),objective:`History fixture ${i}: compare a deliberately long community name and its incident counts across the selected dates.`,scope:{communityIds:[],from:'2026-01-01',through:'2026-11-23'}});
    await page.goto(`${BASE_URL}/admissions`,{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Open Ally chat',exact:true}).filter({visible:true}).click();
    for(const expanded of width===1440?[false,true]:[false]){
      if(expanded)await panel.getByRole('button',{name:'Expand Ally to full screen'}).click();
      await panel.getByLabel('Saved conversations').click();
      const menu=panel.getByRole('navigation',{name:'Saved reports'});
      await menu.getByLabel('Search conversations').fill('History fixture');assert.equal(await menu.getByRole('button').count(),8);
      const bounds=await menu.evaluate(el=>{const r=el.getBoundingClientRect(),p=el.closest('dialog').getBoundingClientRect();return {inside:r.left>=p.left&&r.right<=p.right&&r.bottom<=p.bottom,scrolls:el.scrollHeight>el.clientHeight};});
      assert(bounds.inside&&bounds.scrolls,'long history is contained and independently scrollable');
      await menu.getByRole('button').last().scrollIntoViewIfNeeded();
      assert(await menu.getByRole('button').last().evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.left+4,r.top+r.height/2));}),'the start of the title is visible and clickable');
      await page.screenshot({path:path.join(output,`history-dense-${width}-${expanded?'expanded':'panel'}.png`)});
      await page.keyboard.press('Escape');assert.equal(await menu.isVisible(),false);assert(await panel.getByLabel('Saved conversations').evaluate(el=>el===document.activeElement));
    }
    assert.deepEqual(errors,[]);await context.close();
  }
},{});console.log('Executive Ally browser: 320/390/1440, controls, reduced motion, retry, charts, conversation/history, stable scrolling/drafts, IME, versioning, shared links, recipient controls, current and historical revocation, PDF, cancellation and saved reopening passed.'); }
finally {await rm(localRoot,{recursive:true,force:true});}
