import {test,expect} from '@playwright/test';
import {parseFilters} from '../../lib/owner/filters';
import {csvCell,dictionary,exportHeaders} from '../../lib/owner/export';
import {sessionHash} from '../../lib/owner/auth';
import {createHash} from 'node:crypto';
test('calendar boundaries use Vietnam dates and reject malformed/duplicate/unsafe filters',()=>{
 const f=parseFilters(new URLSearchParams('from=2026-09-13&to=2026-09-13'));expect(f.from).toBe('2026-09-12T17:00:00.000Z');expect(f.to).toBe('2026-09-13T17:00:00.000Z');
 for(const query of ['from=2026-13-99','from=2026-02-30','from=2026-09-15&to=2026-09-13','rating=6','scope=test','rating=1&rating=2','source=bad','cursor=broken'])expect(()=>parseFilters(new URLSearchParams(query))).toThrow();
});
test('CSV quotes every cell and neutralizes spreadsheet formulas/control prefixes',()=>{
 for(const v of ['=cmd()','+1','-1','@x','  =SUM(A1)','\tword','\rword','\nword','\uFEFF=1'])expect(csvCell(v)).toBe('"\''+v+'"');
 expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"');expect(csvCell(null)).toBe('""');
 for(const dataset of ['experiences','page_visits','receipts'] as const){const d=dictionary(dataset);expect(d.fields.every(f=>f.meaning&&typeof f.nullable==='boolean')).toBe(true);expect(exportHeaders('jsonl',dataset)['Content-Disposition']).toMatch(/^attachment; filename="nfc-v1-/);}
});
test('session hash domain separation differs from browser or raw token hashes',()=>{
 const token='a'.repeat(64);expect(sessionHash(token)).not.toBe(token);expect(sessionHash(token)).not.toBe(createHash('sha256').update(token).digest('hex'));
});
