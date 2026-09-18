/** One face per internal score, shared by the guest card and the dashboard (Tài, 2026-09-18). Index 0 is score 1. */
export const FACES = ['😡', '😤', '😕', '😊', '🤩'] as const;
export const faceFor = (score: number | null) => score && score >= 1 && score <= 5 ? FACES[score - 1] : null;
