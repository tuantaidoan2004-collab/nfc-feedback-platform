import 'server-only';
import { nfcEnvDeclared } from './env';

// No environment files are read here; deployment provides config. Gate defaults closed. The guest write path itself
// lives in publishing-runtime.ts: since lát A3b there is only the published page's.
export function visitsV2Enabled() {
  return nfcEnvDeclared() && process.env.NFC_VISITS_V2_ENABLED === 'true';
}
