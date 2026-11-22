#!/usr/bin/env node
// Rebase the current browser build onto the exact live Platform image. The
// server, Carelog route, licensing alert and all other runtime files stay put.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync, brotliCompressSync } from 'node:zlib';

const root = process.cwd();
const base = process.env.PLATFORM_UI_BASE_IMAGE;
assert.match(base ?? '', /^pipelineprodacra6qdvl6ebenac\.azurecr\.io\/alamo-platform@sha256:[a-f0-9]{64}$/, 'Set PLATFORM_UI_BASE_IMAGE to the current immutable image.');
const run = (program, args) => execFileSync(program, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const current = run('az', ['containerapp', 'show', '-n', 'alamo-platform-prod-web', '-g', 'alamo-data-rg', '--query', 'properties.template.containers[0].image', '-o', 'tsv']).trim();
assert.equal(current, base, 'Production image changed; reconcile again.');
const live = run('curl', ['-fsSL', 'https://www.alamoplatform.com/']);
const imageHtml = run('docker', ['run', '--rm', '--platform', 'linux/amd64', '--network', 'none', '--entrypoint', 'cat', base, '/app/dist/index.html']);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(sha(live), sha(imageHtml), 'Live HTML does not match the selected image.');
const extraScripts = [
  '<script defer src="/licensing-nav-alert.js"></script>',
  '<script defer src="/point-of-care-launcher.js?v=523fde0578b4"></script>',
];
for (const script of extraScripts) assert(imageHtml.includes(script), `Current shell lost ${script}`);
const inheritedStyles = [...imageHtml.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)]
  .filter(([, href]) => !/^\/assets\/index-[^/]+\.css$/.test(href))
  .map(([tag]) => tag);
assert(!inheritedStyles.some(tag => /href="\/assets\/index-/.test(tag)), 'The prior main stylesheet must not override this build.');
assert(inheritedStyles.some(tag => tag.includes('proforma-release-')), 'The current Workflow stylesheet must be retained.');
const out = path.join(root, 'generated/platform-ui-release');
const overlay = path.join(out, 'overlay/dist');
await rm(out, { recursive: true, force: true });
await mkdir(path.join(overlay, 'assets'), { recursive: true });
await cp(path.join(root, 'dist/assets'), path.join(overlay, 'assets'), { recursive: true });
await mkdir(path.join(overlay, 'brand'), { recursive: true });
await cp(path.join(root, 'dist/brand/ally-mark.svg'), path.join(overlay, 'brand/ally-mark.svg'));
const files = {};
for (const file of ['index.html', 'admissions/index.html', 'chat/index.html']) {
  let html = await readFile(path.join(root, 'dist', file), 'utf8');
  assert(!extraScripts.some(script => html.includes(script)), 'Duplicate external script.');
  html = html.replace('</head>', `    ${inheritedStyles.join('\n    ')}\n    ${extraScripts[0]}\n  </head>`).replace('</body>', `    ${extraScripts[1]}\n  </body>`);
  const target = path.join(overlay, file);
  await mkdir(path.dirname(target), { recursive: true });
  for (const [suffix, bytes] of [['', Buffer.from(html)], ['.gz', gzipSync(html)], ['.br', brotliCompressSync(Buffer.from(html))]]) {
    await writeFile(target + suffix, bytes);
    files[`dist/${file}${suffix}`] = sha(bytes);
  }
}
await writeFile(path.join(out, 'Dockerfile'), `FROM ${base}\nCOPY --chown=node:node overlay /app\n`);
await writeFile(path.join(out, '.dockerignore'), '*\n!Dockerfile\n!overlay/\n!overlay/**\n');
await writeFile(path.join(out, 'receipt.json'), JSON.stringify({ base, rollback: base, sourceCommit: run('git', ['rev-parse', 'HEAD']).trim(), originalHtmlSha256: sha(imageHtml), files, preservedScripts: extraScripts, preservedStyles: inheritedStyles, boundary: 'Browser assets and three SPA entry documents only. Base server, API, Carelog and licensing runtime unchanged.' }, null, 2));
console.log(out);
