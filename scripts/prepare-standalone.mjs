// Copies static assets next to the standalone server. Skipped when the build did not emit one.
import { cp, mkdir } from 'node:fs/promises';
if ((process.env.NFC_BUILD_TARGET ?? 'standalone') !== 'standalone') {
  console.log('Standalone output disabled; nothing to prepare.');
} else {
  await mkdir('.next/standalone/.next', { recursive: true });
  await cp('.next/static', '.next/standalone/.next/static', { recursive: true });
  await cp('public', '.next/standalone/public', { recursive: true });
}
