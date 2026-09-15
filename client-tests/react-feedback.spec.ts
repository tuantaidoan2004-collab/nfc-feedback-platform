import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
const resolveDependency = createRequire(join(process.cwd(), 'package.json'));
declare global { interface Window { harness: typeof import('./fixtures/react-feedback-harness'); } }
const modules: Record<string, string> = {};
for (const name of ['react', 'react-dom', 'react-dom/client', 'scheduler']) {
  const resolved = resolveDependency.resolve(name, { paths: [dirname(resolveDependency.resolve('react-dom'))] });
  const filename = name === 'react-dom/client' ? 'react-dom-client.development.js' : `${name}.development.js`;
  modules[name] = readFileSync(join(dirname(resolved), 'cjs', filename), 'utf8');
}
for (const name of ['browser-identity', 'open-lifecycle', 'visit-coordinator', 'visit-fetch-transport', 'lifecycle-queue', 'document-feedback-service', 'use-document-feedback']) {
  modules[name] = ts.transpileModule(readFileSync(`lib/client/${name}.ts`, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
}
// Classic JSX avoids an extra runtime package in this tiny test-only loader.
modules['harness'] = ts.transpileModule(readFileSync('client-tests/fixtures/react-feedback-harness.tsx', 'utf8').replace("import { StrictMode", "import React, { StrictMode"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
}).outputText;
const script = `(() => { const sources=${JSON.stringify(modules)}, cache={};
function require(id) { if(id.startsWith('.')) id=id.split('/').pop(); if(cache[id])return cache[id].exports;
const module={exports:{}};cache[id]=module;new Function('module','exports','require','process',sources[id])(module,module.exports,require,{env:{NODE_ENV:'development'}});return module.exports; }
window.harness=require('harness'); })();`;

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => route.abort()); // No network, including accidental API calls.
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: script });
});

test('StrictMode/remount stable snapshots, one initial open, no duplicate rating or cleanup stop', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.evaluate(() => { return window.harness.mount(); }); await expect(page.locator('#status')).toHaveText('ready');
  const before = await page.evaluate(() => { return window.harness.counts(); });
  await page.getByRole('button', { name: 'rerender' }).click();
  expect((await page.evaluate(() => { return window.harness.counts(); })).opens).toBe(1);
  expect((await page.evaluate(() => { return window.harness.rate(5); })).kind).toBe('saved');
  await expect(page.locator('#status')).toHaveText('saved');
  await page.evaluate(() => { window.harness.unmount(); return window.harness.mount(); });
  await expect(page.locator('#status')).toHaveText('saved');
  const after = await page.evaluate(() => { return window.harness.counts(); });
  expect(after.opens).toBe(1); expect(after.ratings).toBe(1); expect(after.stopCalls).toBe(0);
  expect(after.renders - before.renders).toBeLessThan(30); expect(errors).toEqual([]);
});

test('pending/retry/conflict/error results and resume state propagate through React', async ({ page }) => {
  await page.evaluate(() => { return window.harness.mount(); }); await expect(page.locator('#status')).toHaveText('ready');
  expect((await page.evaluate(() => { window.harness.setMode("pending"); return window.harness.rate(5); })).kind).toBe('pending');
  await expect(page.locator('#status')).toHaveText('pending');
  expect((await page.evaluate(() => { window.harness.setMode("saved"); return window.harness.retry(); })).kind).toBe('saved');
  await expect(page.locator('#status')).toHaveText('saved');
  expect((await page.evaluate(() => { window.harness.setMode("conflict"); return window.harness.rate(3); })).kind).toBe('conflict');
  await expect(page.locator('#status')).toHaveText('conflict');
  expect((await page.evaluate(() => { window.harness.setMode("error"); return window.harness.rate(2); })).kind).toBe('error');
  await expect(page.locator('#last')).toHaveText('error');
  const before = await page.evaluate(() => { return window.harness.counts(); });
  await page.evaluate(() => { window.harness.unmount(); return window.harness.resume(); });
  await page.evaluate(() => { return window.harness.mount(); }); await expect(page.locator('#status')).toHaveText('error');
  expect((await page.evaluate(() => { return window.harness.retryOpen(); })).kind).toBe('ready');
  expect((await page.evaluate(() => { return window.harness.counts(); })).opens).toBe(before.opens + 1);
});

test('gate off does not start service or execute actions', async ({ page }) => {
  await page.evaluate(() => { return window.harness.mount(false); }); await expect(page.locator('#status')).toHaveText('disabled');
  expect(await page.evaluate(() => { return window.harness.rate(5); })).toEqual({ kind: 'error', code: 'FEEDBACK_DISABLED' });
  const counts = await page.evaluate(() => { return window.harness.counts(); }); expect(counts.opens).toBe(0); expect(counts.ratings).toBe(0);
});
