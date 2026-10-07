import type { PageDoc } from './doc';

/**
 * Trang đầu của mọi quán mới (Tài 06/10: xoá hết mẫu cũ, chờ loạt mẫu đẹp). Không phải template: không hiện ở Library, landing,
 * /templates. Chỉ có tên quán, lời mời, nút Google, dòng pháp lý và máy bay giấy góp ý; Admin Tài dựng trang thật sau.
 */
export const START_DOC: PageDoc = {
  v: 1,
  sections: [{
    id: 'a', name: 'Khúc A', h: 690, bg: { fill: '#f6f6f3' },
    els: [
      { id: 'ngon-ngu', t: 'lang', look: 'select', color: '#1d2b24', x: 43, y: 22, w: 307, h: 34, label: true },
      { id: 'tam', t: 'stack', x: 41, y: 150, w: 311, h: 300, gap: 12, pad: 16, align: 'center', kids: [
        { id: 'ten-quan', t: 'text', h: 40, words: { vi: 'Tên Quán' }, font: 'sans', size: 30, color: '#1d2b24', weight: 800, slot: 'name' },
        { id: 'loi-moi', t: 'text', h: 20, words: { vi: 'Thật tuyệt nếu nhận được đánh giá của bạn trên:', en: 'We would love to hear your review on:' },
          font: 'sans', size: 12.5, color: '#2a2a2a' },
        { id: 'google', t: 'google', look: 'g', h: 50, w: 278, bg: '#1d2b24', fg: '#ffffff' },
        { id: 'phap-ly', t: 'legal', h: 44, color: '#6b6f76', size: 11 },
      ] },
      { id: 'gop-y', t: 'feedback', x: 14, y: 616, w: 60, h: 60, icon: 'plane', color: '#229ED9', edge: '#FFFFFF' },
    ],
  }],
} as PageDoc;
