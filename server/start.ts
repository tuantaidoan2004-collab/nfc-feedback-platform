import 'server-only';
import { nfcEnvDeclared } from './env';
import { keyring } from './publishing-runtime';
import { signDraft, verifyDraft } from '@/lib/start/draft-sign';
import type { Draft } from '@/lib/start/draft';

/**
 * Building a page before there is an account (lát D4): the builder at /bat-dau and the draft links at /thu/<token>.
 * Open wherever the deployment declares its environment, like every v2 surface; nothing here reads or writes the
 * database, so there is no feature flag of its own.
 */
export const startEnabled = () => nfcEnvDeclared();
export const signStartDraft = (draft: Draft) => signDraft(draft, keyring());
export const openStartDraft = (token: string) => verifyDraft(token, keyring());
