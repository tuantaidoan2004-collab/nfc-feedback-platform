import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { createBrowserIdentity, BROWSER_KEY, type BrowserIdentity } from '../lib/client/browser-identity';
import { createOpenLifecycle } from '../lib/client/open-lifecycle';

declare global {
  interface Window {
    identityModule: typeof import('../lib/client/browser-identity');
    lifecycleModule: typeof import('../lib/client/open-lifecycle');
    openEvents: { loadKey: string; navigationKind: string }[];
  }
}
let origin: string;
const server = createServer((_req,res) => { res.setHeader('Content-Type','text/html'); res.end('<!doctype html><title>NFC module test</title>'); });
test.beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve));
  const address = server.address(); if (!address || typeof address==='string') throw Error('No port');
  origin = `http://127.0.0.1:${address.port}`;
});
test.afterAll(async () => { await new Promise<void>((resolve,reject) => server.close(e=>e?reject(e):resolve())); });
const bundle = (path: string, name: string) => `window.${name}=(()=>{const exports={};${ts.transpileModule(readFileSync(path,'utf8'),{
  compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS},}).outputText};return exports;})();`;
const scripts = bundle('lib/client/browser-identity.ts','identityModule')+bundle('lib/client/open-lifecycle.ts','lifecycleModule');

test('unit: identity provider pins memory fallback; no lock means no unsafe shared write', async () => {
  let writes=0;
  const provider=createBrowserIdentity({crypto,storage:()=>({getItem:()=>null,setItem:()=>{writes++;}})});
  const [a,b]=await Promise.all([provider(),provider()]);
  expect(a).toBe(b); expect(a.secret).toMatch(/^[a-f0-9]{64}$/); expect(a.persistence).toBe('memory'); expect(writes).toBe(0);
});
test('unit: locked providers converge; storage and lock failures are truthful', async () => {
  const values=new Map<string,string>(); let queue=Promise.resolve();
  const exclusive=(work:()=>BrowserIdentity)=>{
    const result=queue.then(work); queue=result.then(()=>{}); return result;
  };
  const storage=()=>({getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}});
  const a=createBrowserIdentity({crypto,storage,exclusive}), b=createBrowserIdentity({crypto,storage,exclusive});
  const results=await Promise.all([a(),b()]); expect(results[0].secret).toBe(results[1].secret); expect(results[0].persistence).toBe('shared');
  for (const ports of [
    {crypto,storage:()=>{throw Error('blocked');},exclusive},
    {crypto,storage,exclusive:async()=>{throw Error('lock failed');}},
  ]) expect((await createBrowserIdentity(ports)()).persistence).toBe('memory');
});
test('unit: remount/retry and overlapping lifecycle signals reuse keys', () => {
  let count=0; const lifecycle=createOpenLifecycle(()=>String(++count),'load');
  const first=lifecycle.current(); const stop=lifecycle.subscribe(()=>{}); stop(); lifecycle.subscribe(()=>{});
  expect(lifecycle.current()).toBe(first); expect(lifecycle.show()).toBe(first);
  lifecycle.hide(); lifecycle.hide(); const resume=lifecycle.show();
  expect(resume.navigationKind).toBe('resume'); expect(lifecycle.show()).toBe(resume); expect(count).toBe(2);
  lifecycle.hide(); expect(lifecycle.show().loadKey).not.toBe(resume.loadKey);
});
test('Chromium: simultaneous empty-storage tabs share CSPRNG identity, reload retains it', async ({context}) => {
  await context.addInitScript({content:scripts});
  const a=await context.newPage(),b=await context.newPage(); await Promise.all([a.goto(origin),b.goto(origin)]);
  const identities=await Promise.all([a,b].map(p=>p.evaluate(()=>window.identityModule.browserIdentity())));
  expect(identities[0].secret).toBe(identities[1].secret); expect(identities[0].persistence).toBe('shared');
  await a.reload(); expect((await a.evaluate(()=>window.identityModule.browserIdentity())).secret).toBe(identities[0].secret);
  await a.evaluate(key=>localStorage.removeItem(key),BROWSER_KEY); await a.reload();
  expect((await a.evaluate(()=>window.identityModule.browserIdentity())).secret).not.toBe(identities[0].secret);
});
test('Chromium: blocked storage and missing coordination use stable per-document memory', async ({page}) => {
  await page.addInitScript({content:scripts});
  await page.addInitScript(()=>{
    Object.defineProperty(navigator,'locks',{value:undefined});
    Object.defineProperty(window,'BroadcastChannel',{value:undefined});
    Storage.prototype.getItem=()=>{throw Error('blocked');};
  });
  await page.goto(origin);
  const result=await page.evaluate(async()=>{
    const a=await window.identityModule.browserIdentity(),b=await window.identityModule.browserIdentity();
    return {mode:a.persistence,same:a.secret===b.secret};
  }); expect(result).toEqual({mode:'memory',same:true});
});
test('Chromium: actual reload plus simulated BFCache/visibility overlap has one event per boundary', async ({page}) => {
  await page.addInitScript({content:scripts+`window.openEvents=[];window.lifecycleModule.documentLifecycle().subscribe(e=>window.openEvents.push(e));`});
  await page.goto(origin);
  const first=await page.evaluate(()=>window.openEvents);
  expect(first).toHaveLength(1); expect(first[0].navigationKind).toBe('load');
  await page.evaluate(()=>{
    const lifecycle=window.lifecycleModule.documentLifecycle(); const stop=lifecycle.subscribe(()=>{}); stop();
    window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:false}));
    window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'}); document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'}); document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
  });
  expect(await page.evaluate(()=>window.openEvents.length)).toBe(2);
  await page.reload(); const reloaded=await page.evaluate(()=>window.openEvents);
  expect(reloaded).toHaveLength(1); expect(reloaded[0].navigationKind).toBe('reload'); expect(reloaded[0].loadKey).not.toBe(first[0].loadKey);
});
