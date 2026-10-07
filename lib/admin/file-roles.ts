// Shared by the server (desk.ts) and Bàn dựng's screen (components/admin-desk.tsx): nothing here may import server code.
/**
 * Ô thả mặc định của Bàn dựng (Tài 07/10), mỗi ô một vai: what each file is for decides where it goes on the page.
 * The kinds a role takes keep a font out of the poster and a song out of the logo.
 */
export const FILE_ROLES = {
  poster: { name: 'Poster', kinds: ['image', 'video'] }, nen: { name: 'Nền', kinds: ['image', 'video'] }, logo: { name: 'Logo', kinds: ['image'] },
  'logo-phu': { name: 'Logo phụ', kinds: ['image'] }, anh: { name: 'Ảnh quán', kinds: ['image'] }, 'anh-phu': { name: 'Ảnh phụ (lật)', kinds: ['image'] },
  video: { name: 'Video', kinds: ['video'] }, 'font-dac-biet': { name: 'Font đặc biệt', kinds: ['font'] }, 'font-chinh': { name: 'Font chính', kinds: ['font'] },
  'am-thanh': { name: 'Âm thanh nền', kinds: ['audio'] },
} as const;
export type FileRole = keyof typeof FILE_ROLES;
