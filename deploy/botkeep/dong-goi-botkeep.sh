#!/bin/bash
# Đóng gói ZIP cho Botkeep từ 1 bản phát hành có sẵn (không sửa mã app).
#   bash deploy/botkeep/dong-goi-botkeep.sh ../ban-phat-hanh/tbq-2.1.9.tar.gz
# → ../ban-phat-hanh/tbq-<bản>-botkeep.zip : mã app + botkeep.js ở gốc, "npm start" chạy botkeep.js.
# Không có .env, database hay khoá nào trong ZIP: khoá đặt ở mục Environment của Botkeep.
set -euo pipefail
TARBALL="${1:?Cách dùng: dong-goi-botkeep.sh <tbq-x.y.z.tar.gz>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="$(cd "$(dirname "$TARBALL")" && pwd)"
NAME="$(basename "$TARBALL" .tar.gz)"           # tbq-2.1.9
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [ -f "$OUT_DIR/$NAME.tar.gz.sha256" ]; then
  (cd "$OUT_DIR" && shasum -a 256 -c "$NAME.tar.gz.sha256" >/dev/null) || { echo "Sai mã kiểm tra $NAME.tar.gz.sha256"; exit 1; }
fi
tar xzf "$TARBALL" -C "$WORK"
APP="$WORK/$NAME"
[ -f "$APP/src/server.js" ] || { echo "Không thấy src/server.js trong $TARBALL"; exit 1; }

cp "$HERE/botkeep.js" "$APP/botkeep.js"
# npm start → botkeep.js (đọc thêm .env nếu có, còn bình thường khoá lấy từ Environment của Botkeep)
node -e '
const fs = require("fs"), f = process.argv[1], p = JSON.parse(fs.readFileSync(f, "utf8"));
p.scripts.start = "node --disable-warning=ExperimentalWarning --env-file-if-exists=.env botkeep.js";
p.scripts["start-goc"] = "node --disable-warning=ExperimentalWarning --env-file-if-exists=.env src/server.js";
fs.writeFileSync(f, JSON.stringify(p, null, 2) + "\n");
' "$APP/package.json"
rm -f "$APP/.env" "$APP/.tunnel-token" "$APP"/data/*.sqlite* 2>/dev/null || true
printf '%s — gói Botkeep, đóng %s\n' "$NAME" "$(date '+%H:%M %d/%m/%Y')" >> "$APP/PHIEN-BAN.txt"

# Botkeep chỉ nhận ZIP toàn tệp chữ UTF-8 (≤200 tệp, ≤5MB): tách ảnh / tệp rỗng ra thư mục riêng,
# botkeep-api.mjs tai-tep tải chúng lên sau khi tạo server. data/ app tự tạo khi chạy.
BIN="$OUT_DIR/$NAME-botkeep-tep-rieng"
rm -rf "$BIN"
(cd "$APP" && find . -type f ! -name .DS_Store) | while IFS= read -r f; do
  if [ ! -s "$APP/$f" ] || file -b --mime "$APP/$f" | grep -q 'charset=binary'; then
    if [ -s "$APP/$f" ]; then mkdir -p "$BIN/$(dirname "$f")" && cp "$APP/$f" "$BIN/$f"; fi
    rm -f "$APP/$f"
  fi
done

ZIP="$OUT_DIR/$NAME-botkeep.zip"
rm -f "$ZIP"
(cd "$APP" && zip -qr -X "$ZIP" . -x '.DS_Store' '*/.DS_Store')
# Kiểm tra lại: không lọt khoá / database
if unzip -l "$ZIP" | grep -E '(^|/)\.env$|\.sqlite|tunnel-token' ; then echo "ZIP chứa tệp bí mật — huỷ"; rm -f "$ZIP"; exit 1; fi
shasum -a 256 "$ZIP" | sed "s#  .*/#  #" > "$ZIP.sha256"
echo "Xong: $ZIP ($(du -h "$ZIP" | cut -f1), $(unzip -Z1 "$ZIP" | grep -vc '/$') tệp)"
[ -d "$BIN" ] && echo "Tệp tải riêng: $BIN ($(find "$BIN" -type f | wc -l | tr -d ' ') tệp)"
