import 'server-only';
import { database } from './db';
import { nfcEnvDeclared } from './env';
import { createVisitV2Api } from './visit-v2-api';

// No environment files are read here; deployment provides config. Gate defaults closed.
export function visitsV2Enabled() {
  return nfcEnvDeclared() && process.env.NFC_VISITS_V2_ENABLED === 'true';
}

export function visitV2Api() {
  return createVisitV2Api({
    enabled: visitsV2Enabled() && process.env.NFC_PUBLISHING_ENABLED !== 'true',
    origin: process.env.APP_ORIGIN, pool: database,
  });
}
