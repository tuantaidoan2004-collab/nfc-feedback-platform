/**
 * Mã VietQR chuyển khoản (chuẩn EMVCo của NAPAS 247), dựng ngay trên máy chủ: không gửi số tài khoản đi đâu để vẽ. Mã mang
 * ngân hàng, số tài khoản, số tiền và nội dung; app ngân hàng của khách đọc ra, hiện **tên chủ tài khoản** để khách xác
 * nhận trước khi chuyển. Vẽ thành hình bằng lib/qr.ts.
 *
 * Ngân hàng sai mã BIN có thể trỏ tới tài khoản cùng số ở ngân hàng khác, nên `/gov` bắt Admin Tài quét thử mã của chính
 * mình bằng app ngân hàng và thấy đúng tên mình trước khi khách nào thấy mã.
 */
export const BANKS: { bin: string; name: string }[] = [
  { bin: '970436', name: 'Vietcombank' }, { bin: '970415', name: 'VietinBank' }, { bin: '970418', name: 'BIDV' },
  { bin: '970405', name: 'Agribank' }, { bin: '970407', name: 'Techcombank' }, { bin: '970422', name: 'MB Bank' },
  { bin: '970416', name: 'ACB' }, { bin: '970432', name: 'VPBank' }, { bin: '970423', name: 'TPBank' },
  { bin: '970403', name: 'Sacombank' }, { bin: '970441', name: 'VIB' }, { bin: '970437', name: 'HDBank' },
  { bin: '970443', name: 'SHB' }, { bin: '970426', name: 'MSB' }, { bin: '970448', name: 'OCB' },
  { bin: '970440', name: 'SeABank' }, { bin: '970431', name: 'Eximbank' },
];
export const bankName = (bin: string) => BANKS.find(bank => bank.bin === bin)?.name ?? `Ngân hàng ${bin}`;

/** CRC-16/CCITT-FALSE (đa thức 0x1021, bắt đầu 0xFFFF), như EMVCo quy định cho trường 63. */
export function crc16(text: string) {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(text)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
const field = (id: string, value: string) => {
  if (value.length > 99) throw new Error('VIETQR_FIELD_TOO_LONG');
  return `${id}${String(value.length).padStart(2, '0')}${value}`;
};

/** `memo`: chữ và số không dấu, tối đa 25 ký tự — app ngân hàng điền sẵn vào ô nội dung chuyển khoản. */
export function vietQr({ bin, account, amount, memo }: { bin: string; account: string; amount: number; memo: string }) {
  if (!/^\d{6}$/.test(bin) || !/^[0-9A-Za-z]{4,19}$/.test(account) || !Number.isInteger(amount) || amount <= 0 || !/^[0-9A-Za-z ]{1,25}$/.test(memo))
    throw new Error('VIETQR_INVALID');
  const merchant = field('00', 'A000000727') + field('01', field('00', bin) + field('01', account)) + field('02', 'QRIBFTTA');
  const body = field('00', '01') + field('01', '12') + field('38', merchant) + field('53', '704') + field('54', String(amount))
    + field('58', 'VN') + field('62', field('08', memo)) + '6304';
  return body + crc16(body);
}
