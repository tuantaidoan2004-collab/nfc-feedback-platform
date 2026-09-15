'use client';

import { useEffect, useSyncExternalStore } from 'react';
import type { DocumentFeedbackService, FeedbackServiceState } from './document-feedback-service';
import type { CoordinatorResult } from './visit-coordinator';

function createStore(service: DocumentFeedbackService) {
  let snapshot = service.state();
  const listeners = new Set<() => void>();
  let disconnect: (() => void) | undefined;
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (!disconnect) {
        disconnect = service.subscribe(next => {
          snapshot = next;
          for (const notify of [...listeners]) notify();
        });
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) { disconnect?.(); disconnect = undefined; }
      };
    },
  };
}
const stores = new WeakMap<DocumentFeedbackService, ReturnType<typeof createStore>>();
const serverSnapshot = () => null;
const disabledStore = { getSnapshot: serverSnapshot, subscribe: () => () => {} };
const disabledAction = async (): Promise<CoordinatorResult> => ({ kind: 'error', code: 'FEEDBACK_DISABLED' });

/** Pass a document-owned service explicitly after the development gate. Null is off by default. */
export function useDocumentFeedback(service: DocumentFeedbackService | null = null) {
  let store = service ? stores.get(service) : disabledStore;
  if (!store && service) { store = createStore(service); stores.set(service, store); }
  const state = useSyncExternalStore<FeedbackServiceState | null>(
    store!.subscribe, store!.getSnapshot, serverSnapshot,
  );
  useEffect(() => {
    service?.start();
    // Component lifetime only owns subscription. Never stop the document service here.
  }, [service]);
  return {
    state,
    rate: service?.rate ?? disabledAction,
    feedback: service?.feedback ?? disabledAction,
    retry: service?.retry ?? disabledAction,
    retryOpen: service?.retryOpen ?? disabledAction,
  };
}
