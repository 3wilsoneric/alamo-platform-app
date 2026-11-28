import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {BASE_URL,withBrowserQa} from './browser-qa-utils.mjs';

// Rendering controls only: these invented appointments do not grade model quality.
const owner='11111111-1111-4111-8111-111111111111';
process.env.VITE_ALLY_REPORTS_ENABLED='true';process.env.VITE_ALLY_REPORT_PARTICIPANTS=JSON.stringify([{id:owner,name:'Layout test'}]);
const output='generated/ally-calendar';await mkdir(output,{recursive:true});
const rows=['2026-11-23','2026-11-24','2026-11-24','2026-11-30','2026-12-01',null].map((day,i)=>({day,name:i===1?'A long invented appointment name that must wrap without losing the person’s identity':i===2?'<img src=x onerror=alert()>':`Invented appointment ${i+1}`,community:'Example community',status:i===5?'Unscheduled':'Planned',workspace:`https://alamo-pipeline.com/?view=referrals&screen=packet&referralId=${i+1}&workspaceView=workflow`}));
const dataset={title:'Scheduled interviews',shape:'records',columns:[{key:'day',label:'Date',type:'string'},{key:'name',label:'Appointment',type:'string'},{key:'community',label:'Community',type:'string'},{key:'status',label:'Status',type:'string'},{key:'workspace',label:'Workspace',type:'string'}],rows};
const report={id:'c'.repeat(64),ownerId:owner,title:'Scheduled interviews',status:'ready',revision:1,version:1,selectedVersion:1,canEdit:true,updatedAt:'2026-11-24T12:00:00Z',completedSources:1,totalSources:1,readers:[],scope:{communityIds:[],from:'2026-11-23',through:'2026-12-01'},objective:'Show the appointments on a calendar',error:null,sourceProgress:[{id:'source-1',title:dataset.title,status:'verified'}],versions:[{version:1,createdAt:'2026-11-24T12:00:00Z',status:'ready'}],artifact:{title:'Scheduled interviews',generatedAt:'2026-11-24T12:00:00Z',coverage:'complete',findings:[],gaps:[],sections:[{id:'source-1',title:dataset.title,observedAt:'2026-11-24T12:00:00Z',status:'verified',coverage:'complete',period:'November–December 2026',grain:'appointment',note:'Rendering fixture',answer:'',dataset}]},view:{blocks:[{id:'schedule',componentId:'calendar',datasetId:'source-1',sourceIds:['source-1'],dateKey:'day',labelKey:'name'}]}};
await withBrowserQa(async browser=>{
 for(const width of [1440,390,320]){
  const context=await browser.newContext({viewport:{width,height:1000},hasTouch:width<700,reducedMotion:width===320?'reduce':'no-preference'});
  await context.addInitScript(()=>{window.print=()=>{};});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/agent/v1/reports*',route=>route.fulfill({status:200,json:route.request().method()==='POST'||new URL(route.request().url()).searchParams.has('id')?report:{reports:[]}}));
  await page.goto(`${BASE_URL}/admissions`,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Open Ally chat',exact:true}).filter({visible:true}).click();
  const panel=page.getByRole('dialog',{name:'Ally',exact:true});
  await panel.getByRole('textbox',{name:'Ask Ally',exact:true}).fill(report.objective);await panel.getByRole('button',{name:'Send question'}).click();
  const calendar=panel.locator('.ally-calendar');await calendar.waitFor();
  assert.equal(await calendar.locator('.ally-calendar-event').count(),6,'Every source event appears exactly once, including undated records');
  assert.equal(await calendar.locator('img,script').count(),0);
  assert.equal(await calendar.getByRole('heading',{name:'November 2026'}).count(),1);
  assert.equal(await calendar.getByRole('heading',{name:'December 2026'}).count(),1);
  assert.equal(await calendar.getByRole('heading',{name:'Date not recorded'}).count(),1);
  assert.equal(await calendar.locator('.ally-calendar-day:has(time[datetime="2026-11-24"])').locator('.ally-calendar-event').count(),2);
  const bounds=await calendar.evaluate(el=>({overflow:el.scrollWidth-el.clientWidth,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right}));assert(bounds.overflow<=1 && bounds.left>=0 && bounds.right<=width);
  const small=await calendar.locator('.ally-calendar-event summary').evaluateAll(nodes=>nodes.filter(el=>el.scrollWidth>el.clientWidth+1));assert.equal(small.length,0,'Names wrap, never clip');
  await page.screenshot({path:`${output}/calendar-${width}.png`,fullPage:true});
  if(width===1440){
    await panel.getByRole('button',{name:'Expand Ally to full screen'}).click();
    assert.equal(await calendar.locator('.ally-calendar-weekdays').first().evaluate(el=>getComputedStyle(el).display),'grid');
    await page.screenshot({path:`${output}/calendar-wide.png`,fullPage:true});
    await calendar.locator('.ally-calendar-event summary').first().click();
    const link=calendar.locator('.ally-calendar-event a').first();await link.focus();assert(await link.evaluate(el=>document.activeElement===el));
    const opened=context.waitForEvent('page');await panel.getByLabel('More report actions').click();await panel.getByRole('button',{name:'Save PDF'}).click();
    const pdf=await opened;await pdf.locator('.ally-calendar').waitFor();await pdf.emulateMedia({media:'print'});
    assert.equal(await pdf.locator('.ally-calendar-event').count(),6);await pdf.pdf({path:`${output}/Calendar report.pdf`,format:'A4',printBackground:true});await pdf.close();
  }
  for(const detail of await calendar.locator('.ally-calendar-event details').all())if(!await detail.evaluate(el=>el.open))await detail.locator('summary').click();
  assert.equal(await calendar.locator('.ally-calendar-event').getByRole('link',{name:'Workspace',exact:true}).count(),6);
  await calendar.getByText('View data table',{exact:true}).click();
  if(width<700){assert(await calendar.locator('.ally-report-records').isVisible());assert.equal(await calendar.locator('.ally-report-records>li').count(),6);assert.equal(await calendar.locator('.ally-calendar-day--empty:visible').count(),0);}
  else assert(await calendar.getByRole('region',{name:'Scheduled interviews data'}).isVisible());
  assert.deepEqual(errors,[]);await context.close();console.log(`Calendar controls passed at ${width}px`);
 }
});
