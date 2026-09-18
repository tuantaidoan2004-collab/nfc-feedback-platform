import { test, expect } from '@playwright/test';
import { presignUrl } from '../../lib/media/sigv4';

// AWS's own worked example for query-string authentication ("Authenticating Requests: Using Query Parameters").
test('matches the AWS published presigned GET example', () => {
  const url = presignUrl({ method: 'GET', host: 'examplebucket.s3.amazonaws.com', path: '/test.txt', region: 'us-east-1', service: 's3',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    date: new Date('2013-05-24T00:00:00Z'), expiresSeconds: 86400 });
  expect(url).toBe('https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256'
    + '&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z'
    + '&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
});

test('signed PUT pins content type and length, and changes when either changes', () => {
  const base = { method: 'PUT' as const, host: 'acct.r2.cloudflarestorage.com', path: '/bucket/shops/a b/1.jpg', region: 'auto', service: 's3',
    accessKeyId: 'AK', secretAccessKey: 'SK', date: new Date('2026-09-18T10:00:00Z'), expiresSeconds: 300 };
  const one = presignUrl({ ...base, headers: { 'content-type': 'image/jpeg', 'content-length': '1000' } });
  expect(one).toContain('/bucket/shops/a%20b/1.jpg?');
  expect(one).toContain('X-Amz-SignedHeaders=content-length%3Bcontent-type%3Bhost');
  expect(presignUrl({ ...base, headers: { 'content-type': 'image/png', 'content-length': '1000' } })).not.toBe(one);
  expect(presignUrl({ ...base, headers: { 'content-type': 'image/jpeg', 'content-length': '1001' } })).not.toBe(one);
});
