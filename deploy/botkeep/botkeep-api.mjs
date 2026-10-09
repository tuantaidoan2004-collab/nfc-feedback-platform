// Đưa trang Tiệm lên Botkeep qua API (https://api.botkeep.cloud/api/v1/developer/openapi.json).
// Khoá API: biến BOTKEEP_API_KEY hoặc tệp ~/.config/botkeep/api-key (quyền 600). Khoá cần quyền:
//   workloads:create workloads:read workloads:update environment:read environment:write domains:read domains:write
//   power:write logs:read files:read files:write deploy:write backups:read backups:create
//
//   node deploy/botkeep/botkeep-api.mjs xem                         → gói + danh sách server
//   node deploy/botkeep/botkeep-api.mjs tao <tệp.zip> [tên]          → tạo server Node 24 từ ZIP (512MB / 0.5 vCore / 1GB)
//   node deploy/botkeep/botkeep-api.mjs ten-mien <id> <alias>        → bật tên miền Botkeep (alias) và in địa chỉ
//   node deploy/botkeep/botkeep-api.mjs env <id> <BASE_URL>          → tạo (1 lần) ~/.config/botkeep/<id>.env khoá mới rồi đẩy lên
//   node deploy/botkeep/botkeep-api.mjs bat|tat|khoi-dong-lai <id>
//   node deploy/botkeep/botkeep-api.mjs log <id> [số dòng]
//   node deploy/botkeep/botkeep-api.mjs goi GET|POST|PUT <đường dẫn> [json] → gọi thẳng 1 API (để dò)
// Tệp .env sinh ra KHÔNG dùng chung khoá với máy chủ thật (bản chạy thử có database riêng).
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';

const API = 'https://api.botkeep.cloud/api/v1/developer';
const CONF = join(homedir(), '.config/botkeep');
const KEY = process.env.BOTKEEP_API_KEY || (existsSync(join(CONF, 'api-key')) ? readFileSync(join(CONF, 'api-key'), 'utf8').trim() : '');
if (!KEY) { console.error('Thiếu khoá: đặt BOTKEEP_API_KEY hoặc lưu vào ~/.config/botkeep/api-key'); process.exit(1); }

async function api(method, path, body) {
  for (let attempt = 0; ; attempt++) {
    const headers = { Authorization: `Bearer ${KEY}`, Accept: 'application/json' };
    if (method !== 'GET') headers['Idempotency-Key'] = body?.__idem || randomUUID();
    if (body) { delete body.__idem; headers['Content-Type'] = 'application/json'; }
    const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 429 && attempt < 5) {
      await new Promise((r) => setTimeout(r, (Number(res.headers.get('retry-after')) || 5) * 1000));
      continue;
    }
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    if (!res.ok) {
      const err = new Error(`${method} ${path} → HTTP ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
      err.status = res.status; throw err;
    }
    return data;
  }
}
const show = (x) => console.log(JSON.stringify(x, null, 2));
const pick = (o, ...keys) => { for (const k of keys) { const v = k.split('.').reduce((a, p) => a?.[p], o); if (v != null) return v; } };

// Chờ thao tác xếp hàng xong ("accepted" chưa phải là xong).
async function waitOp(resp) {
  const opId = pick(resp, 'operation.id', 'operationId', 'operation_id');
  if (!opId) return resp;
  // Trả về: { id, queueState: pending…, operation: { phase: queued… }, confirmed: bool }
  for (let i = 0; i < 200; i++) {
    const op = await api('GET', `/operations/${opId}`);
    const st = [pick(op, 'operation.phase'), pick(op, 'queueState'), pick(op, 'status')].filter(Boolean).join(' ').toLowerCase();
    if (op.confirmed === true || /succeed|success|complete|done|finished/.test(st)) return op;
    if (/fail|error|cancel|reject/.test(st)) throw new Error(`Thao tác ${opId} lỗi: ${JSON.stringify(op)}`);
    if (i % 10 === 0) console.log(`… ${opId.slice(0, 8)}: ${st}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Thao tác ${opId} chưa xong sau 10 phút — xem lại trên bảng điều khiển Botkeep`);
}

function makeEnv(baseUrl) {
  const ALNUM = 'abcdefghijkmnpqrstuvwxyz23456789';
  const adminPw = Array.from({ length: 16 }, (_, i) => (i && i % 4 === 0 ? '-' : '') + ALNUM[randomInt(ALNUM.length)]).join('');
  return [
    '# Bản chạy thử TBQ trên Botkeep — khoá riêng, KHÔNG dùng chung với máy chủ thật.',
    'NODE_ENV=production',
    `BASE_URL=${baseUrl}`,
    `APP_SECRET=${randomBytes(32).toString('base64')}`,
    `DATA_KEY=${randomBytes(32).toString('base64')}`,
    `ADMIN_PASSWORD=${adminPw}`,
    `MAIL_WEBHOOK_SECRET=${randomBytes(32).toString('base64')}`,
    `QS_TICKET_KEY=${randomBytes(32).toString('hex')}`,
    `WORKER_TOKEN=${randomBytes(32).toString('base64url')}`,
    // Chưa gửi mã đăng nhập thật. Muốn thử trọn luồng khách: OTP_PROVIDER=email + LOGIN_BY=email + CF_ACCOUNT_ID/CF_EMAIL_TOKEN/MAIL_FROM.
    'OTP_PROVIDER=none',
    // Tạm dùng địa chỉ cuối X-Forwarded-For (do proxy Botkeep thêm). Xem log "ip-headers" rồi đổi sang CLIENT_IP_HEADER cho đúng.
    'TRUST_PROXY=1',
    'LOG_IP_HEADERS=1',
    'BACKUP_KEEP=14',
    '',
  ].join('\n');
}

const [cmd, ...args] = process.argv.slice(2);
try {
  switch (cmd) {
    case 'xem': {
      show(await api('GET', '/plan'));
      show(await api('GET', '/workloads'));
      break;
    }
    case 'tao': {
      const [zip, name = 'tbq-thu'] = args;
      if (!zip || !existsSync(zip)) throw new Error('Cần đường dẫn tệp ZIP (từ dong-goi-botkeep.sh)');
      const archiveBase64 = readFileSync(zip).toString('base64');
      const resp = await api('POST', '/workloads', {
        name, platform: 'general', runtime: 'nodejs', runtimeVersion: '24',
        sourceType: 'zip', archiveName: zip.split('/').pop(), archiveBase64,
        startCommand: 'npm start',
        resources: { memoryLimitMb: 512, cpuLimitPercent: 50, storageLimitMb: 1024 },
      });
      show(resp);
      show(await waitOp(resp));
      console.log('\nTiếp: node deploy/botkeep/botkeep-api.mjs xem   (lấy id server)');
      break;
    }
    case 'tai-tep': {
      // Tải ảnh / tệp nhị phân (thư mục *-botkeep-tep-rieng từ dong-goi-botkeep.sh) lên đúng đường dẫn trong app.
      const [id, dir] = args;
      if (!id || !dir || !existsSync(dir)) throw new Error('Cần <id> <thư mục tbq-x.y.z-botkeep-tep-rieng>');
      const files = [];
      const walk = (d, rel = '') => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          if (e.isDirectory()) walk(join(d, e.name), `${rel}${e.name}/`);
          else if (e.name !== '.DS_Store') files.push(`${rel}${e.name}`);
        }
      };
      walk(dir);
      for (const rel of files) {
        await waitOp(await api('POST', `/workloads/${id}/files/upload`, {
          path: `/${rel}`, data: readFileSync(join(dir, rel)).toString('base64'), overwrite: true,
        }));
        console.log(`Đã tải ${rel}`);
      }
      break;
    }
    case 'ten-mien': {
      const [id, alias] = args;
      if (!id || !alias) throw new Error('Cần <id> <alias>');
      await waitOp(await api('PUT', `/workloads/${id}/domain`, { enabled: true }));
      await waitOp(await api('PUT', `/workloads/${id}/domain/alias`, { alias }));
      show(await api('GET', `/workloads/${id}/domain`));
      show(await api('GET', `/workloads/${id}/network`));
      break;
    }
    case 'env': {
      const [id, baseUrl] = args;
      if (!id || !/^https:\/\/[^/]+\/colap$/.test(baseUrl || '')) throw new Error('Cần <id> <BASE_URL dạng https://tên-miền/colap>');
      mkdirSync(CONF, { recursive: true, mode: 0o700 });
      const file = join(CONF, `${id}.env`);
      if (!existsSync(file)) writeFileSync(file, makeEnv(baseUrl), { mode: 0o600 });
      let content = readFileSync(file, 'utf8');
      content = content.replace(/^BASE_URL=.*$/m, `BASE_URL=${baseUrl}`);
      writeFileSync(file, content, { mode: 0o600 });
      const cur = await api('GET', `/workloads/${id}/environment`);
      const expectedRevision = pick(cur, 'revision', 'environment.revision', 'expectedRevision');
      if (!expectedRevision) { show(cur); throw new Error('Không đọc được revision của Environment'); }
      await waitOp(await api('PUT', `/workloads/${id}/environment/raw`, { content, expectedRevision, newValuesSecret: true }));
      console.log(`Đã đẩy biến môi trường (tệp gốc: ${file} — mật khẩu quản trị nằm trong tệp này).`);
      break;
    }
    case 'bat': case 'tat': case 'khoi-dong-lai': {
      const action = { bat: 'start', tat: 'stop', 'khoi-dong-lai': 'restart' }[cmd];
      show(await waitOp(await api('POST', `/workloads/${args[0]}/actions`, { action })));
      break;
    }
    case 'log': {
      const d = await api('GET', `/workloads/${args[0]}/logs?lines=${Number(args[1]) || 100}`);
      const lines = pick(d, 'lines', 'data', 'logs');
      console.log(Array.isArray(lines) ? lines.map((l) => (typeof l === 'string' ? l : pick(l, 'line', 'message', 'text') ?? JSON.stringify(l))).join('\n') : JSON.stringify(d, null, 2));
      break;
    }
    case 'goi': {
      const [method, path, json] = args;
      show(await api(method.toUpperCase(), path, json ? JSON.parse(json) : undefined));
      break;
    }
    default:
      console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).slice(0, 14).join('\n'));
  }
} catch (e) {
  console.error(e.message);
  if (e.status === 403) console.error('→ Khoá thiếu quyền. Tạo khoá mới trên Botkeep (Developer → API keys) với các quyền ghi ở đầu tệp này.');
  process.exit(1);
}
