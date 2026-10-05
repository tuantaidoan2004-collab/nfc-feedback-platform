/** Sáu tab của giao diện chính (kịch bản mục 7). Module thường, để cả trang máy chủ lẫn khung phía trình duyệt cùng đọc. */
export const TAB_KEYS = ['dashboard', 'data', 'library', 'my-card', 'quan-ly', 'cai-dat'] as const;
export type TabKey = typeof TAB_KEYS[number];
export const TAB_LABELS: Record<TabKey, string> = { dashboard: 'Dashboard', data: 'Data', library: 'Library', 'my-card': 'My Card', 'quan-ly': 'Quản lý', 'cai-dat': 'Cài đặt' };
