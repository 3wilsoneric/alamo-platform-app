import assert from 'node:assert/strict';
import { BASE_URL, prepareArtifactDirs, withBrowserQa } from "./browser-qa-utils.mjs";
import { createWorkflowKnowledgeSource } from '../server/workflow-knowledge-source.mjs';
const source=createWorkflowKnowledgeSource();
const { screenshotDir: destination } = await prepareArtifactDirs('workflow-agent-browser');
await withBrowserQa(async browser => {
 const base = BASE_URL;
 for(const width of [1440,390]){
  console.log('Checking Workflow helper',width); const page=await browser.newPage({viewport:{width,height:900}});page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/platform/everyagent',route=>route.fulfill({json:{workerEnabled:false,working:false,responsibilities:[],skills:[],work:[]}}));
  await page.route('**/api/platform/workflow-knowledge',async route=>route.fulfill({json:await source.read(route.request().postDataJSON())}));
  await page.goto(base+'/home',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Open AlamoAgent',exact:true}).click();
  await page.getByLabel('Question about Workflow').fill('what does an assessor do');await page.getByRole('button',{name:'Search Workflow',exact:true}).click();
  const area=page.getByRole('region',{name:'Workflow knowledge'});await area.getByRole('link',{name:'Assessor',exact:true}).waitFor();
  assert(await area.getByText('Source excerpts for review.',{exact:false}).isVisible());
  await page.screenshot({path:`${destination}/helper-${width}.png`});
  const href=await area.getByRole('link',{name:'Assessor',exact:true}).getAttribute('href');
  await area.getByRole('link',{name:'Assessor',exact:true}).click();
  await page.getByRole('heading',{name:'Assessor',level:1,exact:true}).waitFor();
  assert(!await page.getByText('This source changed since it was cited.',{exact:false}).count());
  const stale=new URL(href,base);stale.searchParams.set('revision','0'.repeat(64));await page.goto(stale.href);
  await page.getByText('This source changed since it was cited.',{exact:false}).waitFor();
  assert(!await page.getByRole('button',{name:'Download',exact:true}).count());
  await page.getByRole('button',{name:'Read the current version',exact:true}).click();await page.getByRole('button',{name:'Download',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);
  await page.screenshot({path:`${destination}/source-${width}.png`});
  assert.deepEqual(errors,[]);await page.close();
 }
 console.log('Workflow helper browser passed at 1440px and 390px: source excerpts, links, exact document, stale citation warning/recovery, no overflow or page errors.');
});
