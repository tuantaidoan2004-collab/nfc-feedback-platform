/**
 * Place ID → link đánh giá Google, phần dùng chung cho máy chủ và màn hình (kịch bản mục 5). Thủ công (Tài 05/10: chưa nạp
 * tiền nên chưa bật Places API): chủ quán, và Tài ở /gov, mở trang tìm Place ID của Google rồi dán mã vào.
 */
export const PLACE_ID_FINDER = 'https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder';
export const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;
export const reviewLink = (placeId: string) => `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;

/**
 * The Place ID inside whatever was pasted: the bare ID, the finder's "Place ID: ChIJ…" line, or a Google link that carries
 * one (`placeid`, `place_id`, `query_place_id`). Null when there is none.
 */
export function parsePlaceId(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 4000) return null;
  const value = input.trim();
  const link = value.match(/https?:\/\/[^\s<>"']+/)?.[0];
  if (link) {
    try {
      for (const [key, id] of new URL(link).searchParams) if (['placeid', 'place_id', 'query_place_id'].includes(key.toLowerCase()) && PLACE_ID.test(id)) return id;
    } catch { /* not a link after all */ }
    return placeIdOfFeature(link);
  }
  const id = value.replace(/^place\s*id\s*:?\s*/i, '').replace(/\s+/g, '');
  return PLACE_ID.test(id) ? id : null;
}

/**
 * Tài 08/10: "phải tự động tìm place id khi dán link gg map chứ". A Google Maps place link carries the place's feature id, two
 * hex numbers `0x…:0x…` (in `data=…!1s0x…:0x…` or `ftid=`); a classic Place ID ("ChIJ…") is those two numbers as a small
 * protobuf (field 1 holding fixed64 field 1 and fixed64 field 2, little-endian), base64url. No call to Google, no key.
 * Null when the text carries no feature id (a short maps.app.goo.gl link: the server opens it first, lib/google/place-from-link.ts).
 */
export function placeIdOfFeature(text: string): string | null {
  let decoded = text; try { decoded = decodeURIComponent(text); } catch { /* keep it as it is */ }
  const found = decoded.match(/0x([0-9a-f]{1,16}):0x([0-9a-f]{1,16})/i);
  if (!found) return null;
  const bytes = [0x0a, 0x12, 0x09, ...littleEndian(found[1]), 0x11, ...littleEndian(found[2])];
  const id = base64url(bytes);
  return PLACE_ID.test(id) ? id : null;
}
const littleEndian = (hex: string) => {
  const full = hex.padStart(16, '0'), out: number[] = [];
  for (let i = 14; i >= 0; i -= 2) out.push(parseInt(full.slice(i, i + 2), 16));
  return out;
};
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function base64url(bytes: number[]) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i], bytes[i + 1], bytes[i + 2]], n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63] + (b === undefined ? '' : ALPHABET[(n >> 6) & 63]) + (c === undefined ? '' : ALPHABET[n & 63]);
  }
  return out;
}
