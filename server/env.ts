import 'server-only';
// Deployment declares its environment explicitly. Unset or unrecognised keeps every v2 surface closed, so a
// missing variable can never open owner, visit or publishing routes; feature flags alone are never sufficient.
const declared = ['local', 'preview', 'production'] as const;
export type NfcEnv = (typeof declared)[number];
export function nfcEnv(): NfcEnv | undefined {
  const value = process.env.NFC_ENV;
  return declared.includes(value as NfcEnv) ? value as NfcEnv : undefined;
}
export const nfcEnvDeclared = () => nfcEnv() !== undefined;
