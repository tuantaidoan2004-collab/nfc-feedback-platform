import { test, expect } from '@playwright/test';
import { cspSignal, refusedSignal, SignalBuffer, unexpectedSignal, type SignalRow } from '../../lib/signals';

// Tín hiệu máy chủ (lát B3 phần hai): what is counted, and how often it is written.
test('a signal is built from short lists, never from what the request chose', () => {
  const app = 'https://quitesensational-review-bio.com';
  expect(cspSignal('script-src-elem', 'https://evil.example/x.js?q=secret', app)).toEqual({ kind: 'csp', code: 'script-src-elem external' });
  expect(cspSignal('script-src-elem', `${app}/_next/static/chunk.js`, app).code).toBe('script-src-elem self');
  expect(cspSignal('SCRIPT-SRC-ATTR', 'inline', app).code).toBe('script-src-attr inline');
  expect(cspSignal('img-src', 'data:image/png;base64,AAAA', app).code).toBe('img-src data');
  expect(cspSignal('made-up; DROP TABLE', 'javascript:alert(1)', app).code).toBe('other other');
  expect(cspSignal(undefined, '', app).code).toBe('other unknown');
  expect(refusedSignal('rating', 403, 'ORIGIN_NOT_ALLOWED', 'chrome-ios')).toEqual({ kind: 'guest_refused', code: 'rating 403 ORIGIN_NOT_ALLOWED chrome-ios' });
  expect(refusedSignal('x y<z>', 400, 'A B', '')).toEqual({ kind: 'guest_refused', code: 'xyz 400 AB ?' });
  // An error's name and a PostgreSQL code, never its message.
  const lost = Object.assign(new Error('terminating connection for user nguyen.van.a'), { code: '57P01' });
  expect(unexpectedSignal('owner', lost)).toEqual({ kind: 'unexpected', code: 'owner Error 57P01' });
  expect(unexpectedSignal('admin', new TypeError('value "0987654321" is wrong')).code).toBe('admin TypeError');
  expect(unexpectedSignal('http', 'a string').code).toBe('http NotAnError');
});

test('signals are gathered and written at most once a window, the first one at once, and a failed write breaks nothing', async () => {
  let now = 0;
  const writes: SignalRow[][] = [], deferred: (() => Promise<void>)[] = [];
  let failing = false;
  const buffer = new SignalBuffer(async rows => { if (failing) throw new Error('database down'); writes.push(rows); },
    { windowMs: 5000, maxKeys: 3, clock: () => now, defer: task => { deferred.push(task); } });
  const run = async () => { while (deferred.length) await deferred.shift()!(); };
  buffer.add({ kind: 'csp', code: 'img-src external' });
  await run();
  expect(writes).toHaveLength(1); expect(writes[0]).toMatchObject([{ kind: 'csp', code: 'img-src external', count: 1 }]);
  // Inside the window: counted together, written once the window ends. Past `maxKeys` distinct signals, new ones wait out.
  now = 1000;
  for (let i = 0; i < 5; i++) buffer.add({ kind: 'guest_refused', code: 'rating 401 VISIT_NOT_AUTHORIZED desktop' });
  buffer.add({ kind: 'unexpected', code: 'owner Error' }); buffer.add({ kind: 'unexpected', code: 'admin Error' });
  buffer.add({ kind: 'unexpected', code: 'one too many' });
  expect(deferred).toHaveLength(1);
  const started = Date.now(); now = 5000; await run();
  expect(Date.now() - started).toBeLessThan(1000);
  expect(writes).toHaveLength(2);
  expect(writes[1].map(row => [row.code, row.count])).toEqual([['rating 401 VISIT_NOT_AUTHORIZED desktop', 5], ['owner Error', 1], ['admin Error', 1]]);
  // A write that fails is dropped, and the next signal is written as usual.
  failing = true; now = 20000; buffer.add({ kind: 'csp', code: 'img-src data' }); await run();
  failing = false; now = 30000; buffer.add({ kind: 'csp', code: 'img-src blob' }); await run();
  expect(writes).toHaveLength(3); expect(writes[2]).toMatchObject([{ code: 'img-src blob', count: 1 }]);
});
