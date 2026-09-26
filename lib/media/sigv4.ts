import { createHash, createHmac } from 'node:crypto';

/**
 * AWS Signature Version 4 query-string presigning, which every S3-compatible store accepts (R2, S3, SeaweedFS). Written
 * with node:crypto instead of an SDK: one function, checked against AWS's published example in
 * tests/contracts/sigv4.spec.ts.
 */
export type PresignInput = {
  /** `host` may carry a port; `scheme` is https except for a store on this machine (lib/media/storage.ts). */
  method: 'GET' | 'PUT'; host: string; scheme?: 'https' | 'http'; path: string; region: string; service: string;
  accessKeyId: string; secretAccessKey: string; date: Date; expiresSeconds: number;
  /** Extra headers the client must send exactly, e.g. content-type and content-length; host is always signed. */
  headers?: Record<string, string>;
};

/** RFC 3986 encoding as SigV4 wants it; the path keeps its slashes. */
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const hmac = (key: Buffer | string, value: string) => createHmac('sha256', key).update(value, 'utf8').digest();
const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

export function presignUrl(input: PresignInput) {
  const stamp = input.date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = stamp.slice(0, 8);
  const scope = `${day}/${input.region}/${input.service}/aws4_request`;
  const headers = Object.fromEntries(Object.entries({ host: input.host, ...input.headers })
    .map(([name, value]) => [name.toLowerCase(), String(value).trim()])) as Record<string, string>;
  const names = Object.keys(headers).sort();
  const signedHeaders = names.join(';');
  const query: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${input.accessKeyId}/${scope}`,
    'X-Amz-Date': stamp, 'X-Amz-Expires': String(input.expiresSeconds), 'X-Amz-SignedHeaders': signedHeaders,
  };
  const canonicalQuery = Object.keys(query).sort().map(key => `${encode(key)}=${encode(query[key])}`).join('&');
  const canonicalPath = input.path.split('/').map(encode).join('/');
  const canonicalRequest = [input.method, canonicalPath, canonicalQuery,
    names.map(name => `${name}:${headers[name]}\n`).join(''), signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', stamp, scope, sha256(canonicalRequest)].join('\n');
  const key = hmac(hmac(hmac(hmac(`AWS4${input.secretAccessKey}`, day), input.region), input.service), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign, 'utf8').digest('hex');
  return `${input.scheme ?? 'https'}://${input.host}${canonicalPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
