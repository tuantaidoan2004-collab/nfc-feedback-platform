#!/usr/bin/env bash
# Cài (hoặc nâng cấp) TBQ trên máy chủ Ubuntu / Debian mới — chạy bằng quyền root, đứng cùng thư mục với gói tbq-X.Y.Z.tar.gz:
#   sudo bash cai-may-chu.sh tbq-1.0.3.tar.gz
# Thường không gõ tay: trên máy Mac chạy deploy/day-len.sh <user>@<IP> (tự chép gói + lệnh này lên rồi chạy).
#
# Làm: Node 22 + Caddy (kho apt chính thức) → người dùng tbq → giải nén vào /opt/tbq-trial → .env (tự sinh khoá, KHÔNG ghi đè)
#      → database + gói công cụ (chỉ lần đầu) → Caddy HTTPS → chạy nền + sao lưu 05:30 → tường lửa (SSH, 80, 443) → kiểm.
# Chạy lại an toàn: giữ nguyên .env và data/, chỉ thay mã nguồn rồi khởi động lại.
set -euo pipefail

GOI="${1:-}"
APP=/opt/tbq-trial
NODE_MIN=22.13
buoc() { printf '\n== %s\n' "$*"; }
loi() { printf '✘ %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || loi "Phải chạy bằng root (sudo bash $0 ...)."
[ -n "$GOI" ] && [ -f "$GOI" ] || loi "Thiếu gói: sudo bash $0 tbq-X.Y.Z.tar.gz"
command -v apt-get >/dev/null || loi "Chỉ hỗ trợ Ubuntu / Debian."
export DEBIAN_FRONTEND=noninteractive

buoc "Gói phần mềm hệ thống"
apt-get update -q
apt-get install -y -q curl ca-certificates gnupg ufw debian-keyring debian-archive-keyring apt-transport-https sqlite3 >/dev/null
timedatectl set-timezone Asia/Ho_Chi_Minh 2>/dev/null || true   # chỉ cho log dễ đọc; app tự tính giờ Việt Nam

buoc "Node.js 22"
node_ok() { command -v node >/dev/null && node -e "const [a,b]=process.versions.node.split('.').map(Number),[x,y]='$NODE_MIN'.split('.').map(Number);process.exit(a>x||(a===x&&b>=y)?0:1)"; }
if ! node_ok; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -q nodejs >/dev/null
fi
node_ok || loi "Node $(node -v 2>/dev/null) cũ hơn $NODE_MIN."
[ -x /usr/bin/node ] || ln -sf "$(command -v node)" /usr/bin/node   # tbq.service gọi /usr/bin/node
echo "Node $(node -v)"

buoc "Caddy (HTTPS tự động)"
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q && apt-get install -y -q caddy >/dev/null
fi
caddy version

buoc "Mã nguồn TBQ → $APP"
id tbq >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin tbq
mkdir -p "$APP"
CU=0; [ -f "$APP/.env" ] && CU=1
[ "$CU" = 1 ] && systemctl stop tbq 2>/dev/null || true
# Xoá mã cũ (giữ .env + data/) để tệp đã bỏ ở bản mới không sót lại.
find "$APP" -mindepth 1 -maxdepth 1 ! -name .env ! -name data ! -name .npm -exec rm -rf {} +
tar -xzf "$GOI" -C "$APP" --strip-components=1
mkdir -p "$APP/data/backup"
chown -R tbq:tbq "$APP"
cat "$APP/PHIEN-BAN.txt" 2>/dev/null | head -3 || true

chay() { (cd "$APP" && runuser -u tbq -- env HOME="$APP" node --disable-warning=ExperimentalWarning --env-file-if-exists=.env "$@"); }

if [ "$CU" = 0 ]; then
  buoc "Khoá bí mật (.env) — lần đầu"
  chay scripts/tao-env.js | tee /root/tbq-lan-dau.txt
  chmod 600 /root/tbq-lan-dau.txt "$APP/.env"
  echo "(Bản ghi lần đầu cất ở /root/tbq-lan-dau.txt — chỉ root đọc được.)"
else
  echo "Giữ nguyên .env cũ."
fi

if [ ! -f "$APP/data/tbq.sqlite" ]; then
  buoc "Database + gói công cụ — lần đầu"
  chay scripts/seed.js
  chay scripts/pilot.js
else
  echo "Giữ nguyên database cũ ($(du -h "$APP/data/tbq.sqlite" | cut -f1))."
fi

buoc "Caddy: thu.tiembanquyen.com → TBQ"
CF=/etc/caddy/Caddyfile
if grep -q 'thu\.tiembanquyen\.com' "$CF" 2>/dev/null && ! grep -q '^import /etc/caddy/tbq.caddy' "$CF"; then
  echo "Caddyfile đã có khối thu.tiembanquyen.com — không đụng."
elif [ ! -s "$CF" ] || grep -q '/usr/share/caddy' "$CF"; then
  cp "$APP/deploy/Caddyfile" "$CF"                      # Caddyfile mặc định khi mới cài → thay hẳn
  echo "Đã thay Caddyfile mặc định."
else
  cp "$APP/deploy/Caddyfile" /etc/caddy/tbq.caddy      # máy chủ đã có trang khác (vd. QS) → ghép, không chép đè
  grep -q '^import /etc/caddy/tbq.caddy' "$CF" || printf '\nimport /etc/caddy/tbq.caddy\n' >> "$CF"
  echo "Đã ghép /etc/caddy/tbq.caddy vào Caddyfile đang có."
fi
caddy validate --config "$CF" --adapter caddyfile >/dev/null
systemctl enable caddy >/dev/null 2>&1
systemctl reload caddy 2>/dev/null || systemctl restart caddy

buoc "Chạy nền + sao lưu mỗi ngày 05:30"
cp "$APP"/deploy/tbq.service "$APP"/deploy/tbq-backup.service "$APP"/deploy/tbq-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable tbq tbq-backup.timer >/dev/null 2>&1
systemctl restart tbq
systemctl start tbq-backup.timer
for i in $(seq 1 30); do
  curl -fsS -o /dev/null http://127.0.0.1:3000/colap/healthz 2>/dev/null && break
  [ "$i" = 30 ] && { journalctl -u tbq -n 30 --no-pager; loi "TBQ không chạy — xem log ở trên."; }
  sleep 1
done
echo "TBQ đang chạy (127.0.0.1:3000)."

buoc "Tường lửa: chỉ mở SSH, 80, 443"
for p in $(ss -Htlnp 2>/dev/null | awk '/sshd/ {n=split($4,a,":"); print a[n]}' | sort -u) 22; do ufw allow "$p/tcp" >/dev/null; done
ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; ufw allow 443/udp >/dev/null
ufw --force enable >/dev/null
ufw status | head -12

buoc "Kiểm trước khi mở bán"
chay scripts/kiem-tra.js --mang || true
cat <<'XONG'

Xong phần máy chủ. Mục ✘ còn lại thường là:
  - eSMS chưa điền   → sửa /opt/tbq-trial/.env (ESMS_*), rồi: sudo systemctl restart tbq
  - HTTPS chưa được  → bản ghi DNS "thu" chưa trỏ về máy chủ này (Caddy tự lấy chứng chỉ khi DNS đúng)
  - Kho trống        → vào trang quản trị › Kho tài khoản › dán kho
Log: journalctl -u tbq -f
XONG
