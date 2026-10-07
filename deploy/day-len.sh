#!/usr/bin/env bash
# Chạy trên máy Mac: đẩy gói TBQ mới nhất lên máy chủ rồi cài / nâng cấp.
#   bash deploy/day-len.sh root@<IP máy chủ>              (hoặc ubuntu@<IP> nếu nhà cung cấp cho user ubuntu có sudo)
# Đăng nhập bằng khoá ~/.ssh/tbq_vps (khoá công khai ~/.ssh/tbq_vps.pub đã dán vào máy chủ lúc thuê). Không dùng mật khẩu.
set -euo pipefail

DICH="${1:-}"
[ -n "$DICH" ] || { echo "Cách dùng: bash deploy/day-len.sh root@<IP>"; exit 1; }
KHOA="${TBQ_SSH_KEY:-$HOME/.ssh/tbq_vps}"
GOC="$(cd "$(dirname "$0")/../.." && pwd)"
GOI="$(ls -t "$GOC"/ban-phat-hanh/tbq-*.tar.gz 2>/dev/null | head -1)"
[ -n "$GOI" ] || { echo "Chưa có gói trong ban-phat-hanh/ — chạy: npm run dong-goi"; exit 1; }
(cd "$(dirname "$GOI")" && shasum -a 256 -c "$(basename "$GOI").sha256" >/dev/null) || { echo "Gói hỏng (sai mã kiểm)."; exit 1; }

SSH=(ssh -i "$KHOA" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new)
echo "Gói: $(basename "$GOI") → $DICH"
"${SSH[@]}" "$DICH" 'mkdir -p ~/tbq-cai'
scp -i "$KHOA" -o IdentitiesOnly=yes "$GOI" "$(dirname "$0")/cai-may-chu.sh" "$DICH":tbq-cai/
SUDO=sudo; [ "${DICH%%@*}" = root ] && SUDO=
"${SSH[@]}" -t "$DICH" "cd ~/tbq-cai && $SUDO bash cai-may-chu.sh $(basename "$GOI")"
