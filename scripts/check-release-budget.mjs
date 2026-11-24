import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { browserCaptureDuration, releaseBudget, runNpmScript } from './check-platform-ready.mjs';

const run = (code, timeoutMs = 2_000) => runNpmScript('fixture', {
  executable: process.execPath, args: ['-e', code], timeoutMs, quiet: true,
});

test('routine release has a fixed, combined five-minute check budget', () => {
  assert.equal(releaseBudget('ally'), 180_000);
  assert.equal(releaseBudget('ally-data'), 180_000);
  assert.equal(releaseBudget('ally-live'), 120_000);
  assert.equal(releaseBudget('ally') + releaseBudget('ally-live'), 300_000);
  assert.equal(releaseBudget('full'), null);
});

test('main-Chrome capture consumes the live budget before receipt validation', () => {
  const capture = duration => ({startedAt:'2026-11-24T12:00:00Z',completedAt:new Date(Date.parse('2026-11-24T12:00:00Z')+duration).toISOString()});
  const now=Date.parse('2026-11-24T13:00:00Z');
  assert.equal(releaseBudget('ally-live')-browserCaptureDuration(capture(90_000),now),30_000);
  assert(browserCaptureDuration(capture(121_000),now)>releaseBudget('ally-live'),'an over-budget capture cannot pass as a short validation');
  assert.throws(()=>browserCaptureDuration({},now),/completed, timed/);
  assert.throws(()=>browserCaptureDuration(capture(-1),now),/completed, timed/);
  assert.throws(()=>browserCaptureDuration(capture(90_000),now-3_600_000),/completed, timed/);
});

test('an expired live budget records failure without launching any remaining check', () => {
  const cwd=mkdtempSync(path.join(tmpdir(),'ally-release-budget-'));
  try {
    const evidence=path.join(cwd,'capture.json'),end=Date.now()-1000;
    writeFileSync(evidence,JSON.stringify({startedAt:new Date(end-121_000).toISOString(),completedAt:new Date(end).toISOString()}));
    const result=spawnSync(process.execPath,[fileURLToPath(new URL('./check-platform-ready.mjs',import.meta.url))],{
      cwd,env:{...process.env,PLATFORM_READY_PROFILE:'ally-live',PLATFORM_READY_START_AT:'',PRODUCTION_MAIN_CHROME_EVIDENCE:evidence},encoding:'utf8',timeout:2000,
    });
    assert.equal(result.status,1);
    const receipt=JSON.parse(readFileSync(path.join(cwd,'generated/platform-ready/latest.json'),'utf8'));
    assert.equal(receipt.status,'fail');assert.equal(receipt.capturedBrowserMs,121_000);
    assert.equal(receipt.results.length,1);assert.equal(receipt.results[0].exitCode,124);
    assert.equal(receipt.results[0].elapsedMs,0,'no npm command ran after the actual budget was consumed');
  } finally {rmSync(cwd,{recursive:true,force:true});}
});

test('passing, failing and unavailable checks retain their actual result', async () => {
  assert.equal((await run('console.log("passed")')).status, 'pass');
  const failed = await run('process.exit(7)');
  assert.equal(failed.status, 'fail'); assert.equal(failed.exitCode, 7);
  const missing = await runNpmScript('missing', { executable: '/nonexistent-release-check', quiet: true, timeoutMs: 500 });
  assert.equal(missing.status, 'fail'); assert.match(missing.stderr, /ENOENT/);
});

test('a timeout fails and terminates the check and its nested process', { skip: process.platform === 'win32' }, async () => {
  const result = await run(`
    const {spawn}=require('node:child_process');
    const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'inherit'});
    console.log(child.pid);setInterval(()=>{},1000);
  `, 400);
  assert.equal(result.status, 'fail'); assert.equal(result.exitCode, 124);
  assert.equal(result.timedOut, true); assert.match(result.stderr, /budget exhausted/);
  assert(result.elapsedMs < 2_000, 'timeout does not leave the check waiting on inherited pipes');
  const pid = Number(result.stdout.trim()); assert(pid > 0);
  for (let i = 0; i < 20; i++) {
    try { process.kill(pid, 0); await delay(25); }
    catch (error) { assert.equal(error.code, 'ESRCH'); return; }
  }
  assert.fail(`nested check process ${pid} survived the deadline`);
});

test('a scoped release cannot turn a skipped prefix into a passing receipt', () => {
  const result = spawnSync(process.execPath, ['scripts/check-platform-ready.mjs'], {
    env: { ...process.env, PLATFORM_READY_PROFILE: 'ally', PLATFORM_READY_START_AT: 'build' }, encoding: 'utf8',
  });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /cannot skip stages/);
});
