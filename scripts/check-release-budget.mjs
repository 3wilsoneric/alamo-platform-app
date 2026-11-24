import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { releaseBudget, runNpmScript } from './check-platform-ready.mjs';

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
