/**
 * One folding rule for the whole product, in a module of its own with no imports, because the publishing policy
 * check runs in the browser and the activity log runs on the server. Extracted by copying the bytes, not by
 * retyping them: the combining-mark range is an escape the file-writing tool mangles (operations-gotchas.md).
 */
/** Lowercase, no marks, đ as d, spaces collapsed: "Bàn 3" and "ban 3" find each other. */
export function fold(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
}
