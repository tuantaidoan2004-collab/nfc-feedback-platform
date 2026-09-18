import type { Permission } from './auth';
/** The role switches in Vietnamese, shared by the team page and the history, so a line reads as words, not keys. */
export const PERMISSION_LABELS: Record<Permission, string> = {
  feedback: 'Đọc góp ý của khách', design: 'Sửa giao diện & phát hành', cards: 'Thêm, sửa, tắt thẻ',
  members: 'Mời và quản lý thành viên', activity: 'Xem lịch sử hoạt động', export: 'Tải dữ liệu về',
};
