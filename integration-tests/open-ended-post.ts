import http from 'node:http';

/**
 * Sends `size` bytes of a body it never finishes, and resolves with the status the server answers before it gives up
 * (rà bảo mật 29/09, U1): a route that reads the whole body before checking its size never answers this at all.
 */
export function openEndedPost(path: string, type: string, size: number, port = 3317) {
  return new Promise<number>((resolve, reject) => {
    const sent = http.request({ host: '127.0.0.1', port, path, method: 'POST', headers: { 'content-type': type, 'transfer-encoding': 'chunked',
      origin: `http://127.0.0.1:${port}`, 'sec-fetch-site': 'same-origin' } }, answer => { resolve(answer.statusCode ?? 0); answer.resume(); sent.destroy(); });
    sent.on('error', () => undefined);
    sent.write('x'.repeat(size));
    setTimeout(() => { sent.destroy(); reject(new Error('no answer while the body was still open')); }, 5000);
  });
}
