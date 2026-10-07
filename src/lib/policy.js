// Luật Google cho chữ TBQ hiện cho khách. Khối TBQ nằm trên trang quán (có lời mời đánh giá Google), nên một câu kiểu
// "đánh giá để nhận tài khoản" làm QUÁN bị Google phạt. Dùng cùng "dây bẫy" với tính năng QS của Tài để 2 bên không vênh nhau:
// chép từ lib/publishing/policy.ts `freeTextProblem` + lib/text-fold.ts `fold` (nhánh feat/local-app-foundation, 05/10/2026) —
// từ chối câu có từ về ĐÁNH GIÁ đứng cùng từ về QUÀ/ƯU ĐÃI hoặc lời nhờ NHẮC TÊN. Khớp theo từ, bỏ dấu.
// Kiểm ở biên GHI (lúc admin lưu), không ở biên đọc.

/** Chữ thường, bỏ dấu, đ → d, gộp khoảng trắng: "Đánh giá" và "danh gia" gặp nhau. */
export function fold(text) {
  return String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ').trim();
}

// Ba danh sách chép nguyên của QS.
const REVIEW = ['google', 'danh gia', 'nhan xet', 'review', 'rating', 'sao', 'star'];
const QS_REWARD = ['qua', 'tang', 'mien phi', 'giam gia', 'khuyen mai', 'voucher', 'uu dai', 'coupon', 'the cao', 'boc tham', 'quay thuong', 'tich diem',
  'gift', 'free', 'discount', 'reward', 'prize', 'voucher', 'points'];
const NAMING = ['nhac ten', 'ghi ten', 'ten nhan vien', 'ten ban', 'mention', 'name the staff', 'name our'];
// Thêm của TBQ: quà ở đây chính là TÀI KHOẢN dùng thử. Danh sách của QS (05/10) để lọt câu ví dụ trong HANDOFF của Tài
// "Đánh giá 5 sao để nhận tài khoản" — đã báo Tài trong docs/phoi-hop-voi-QS.md.
const TBQ_REWARD = ['tai khoan', 'account', 'dung thu', 'trial'];
const REWARD = [...QS_REWARD, ...TBQ_REWARD];

const hits = (text, words) => {
  const padded = ` ${text.replace(/[^a-z0-9]+/g, ' ').trim()} `;
  return words.some((word) => padded.includes(` ${word} `));
};

/** → 'reward' | 'naming' | null. Chỉ từ chối khi câu nối đánh giá với quà, hoặc nhờ khách nhắc tên ai đó. */
export function freeTextProblem(value) {
  const text = fold(value);
  if (!hits(text, REVIEW)) return null;
  if (hits(text, REWARD)) return 'reward';
  if (hits(text, NAMING)) return 'naming';
  return null;
}

/** Câu báo lỗi cho admin TBQ. */
export const POLICY_MESSAGE = {
  reward: 'nối đánh giá/Google với quà hoặc miễn phí — Google cấm, quán có thể bị phạt',
  naming: 'nhờ khách nhắc tên khi đánh giá — Google cấm, quán có thể bị phạt',
};
