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
  if (typeof input !== 'string' || input.length > 2048) return null;
  const value = input.trim();
  if (/^https?:\/\//i.test(value)) {
    try {
      for (const [key, id] of new URL(value).searchParams) if (['placeid', 'place_id', 'query_place_id'].includes(key.toLowerCase()) && PLACE_ID.test(id)) return id;
    } catch { /* not a link after all */ }
    return null;
  }
  const id = value.replace(/^place\s*id\s*:?\s*/i, '').replace(/\s+/g, '');
  return PLACE_ID.test(id) ? id : null;
}
