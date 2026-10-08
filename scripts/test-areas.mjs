#!/usr/bin/env node
// Which of the heavy suites a change needs (Tài, 08/10: "đụng chỗ nào thì mới chạy chỗ đó").
// The fast suites -- types, lint, build, contracts, client -- run on every push and are not decided here.
//
//   node scripts/test-areas.mjs <from> [<to>]     names the suites for the files changed between two commits
//   node scripts/test-areas.mjs --all             every suite (the "Run workflow" button on GitHub)
//
// CI calls it with --github and reads `repository`, `selfhost` and `integration` (a matrix) from $GITHUB_OUTPUT.
// A file no rule names runs everything: a missed rule costs minutes, never a bug that slips through.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const HARNESS = {
  public: 'node integration-tests/run-local.mjs public-v2.spec.ts browser-hardening.spec.ts --build',
  publishing: 'node integration-tests/run-local.mjs --publishing publishing.spec.ts --build',
  owner: 'node integration-tests/run-local.mjs --owner owner-dashboard.spec.ts --build',
  admin: 'node integration-tests/run-local.mjs --admin admin-http.spec.ts --build',
};
const INTEGRATION = Object.keys(HARNESS);
const EVERYTHING = ['repository', ...INTEGRATION];

// First match wins, so the narrow paths come before the folders that hold them.
const RULES = [
  // Nothing heavy: words, pictures, the agent's own tools, and the fast suites' own files.
  [/^(docs|rieng|\.claude|\.agents|client-tests|tests\/contracts)\//, []],
  [/\.md$|^skills-lock\.json$|^\.github\/workflows\/backup\.yml$|^playwright\.(contracts|client)\.config\.ts$/, []],
  [/^public\//, []],
  [/^templates\//, []], // the harness builds against tests/fixtures/templates; contracts check the real ones
  [/^scripts\/(local\/|local\.mjs$|prepare-standalone\.mjs$)/, INTEGRATION], // the harness starts the app with these
  [/^scripts\/selfhost-smoke\.mjs$/, ['selfhost']],
  [/^scripts\//, []],
  [/^(Dockerfile|deploy\/)/, ['selfhost']],

  // The suites' own files.
  [/^repository-tests\/|^playwright\.repository\.config\.ts$/, ['repository']],
  [/^integration-tests\/(public-v2|browser-hardening)\.spec\.ts$/, ['public']],
  [/^integration-tests\/publishing\.spec\.ts$/, ['publishing']],
  [/^integration-tests\/owner-dashboard\.spec\.ts$/, ['owner']],
  [/^integration-tests\/admin-http\.spec\.ts$/, ['admin']],
  [/^integration-tests\/|^playwright\.(integration\.config|chrome)\.ts$/, INTEGRATION],
  [/^tests\/fixtures\/templates\//, ['public', 'publishing', 'owner']],

  // The guest's page: what a scanned card opens, and the front and legal pages around it.
  [/^components\/qs\/landing\/|^app\/(page\.tsx|pricing\/)/, ['public']],
  [/^app\/(dieu-khoan|quyen-rieng-tu|huong-dan-google)\/|^components\/legal-page/, ['public']],
  [/^components\/(guest\/|published-page\.tsx|canvas\/|effects\/|google-button\.tsx|confetti\.ts)/, ['public', 'publishing']],
  [/^app\/(\[shop\]|ZZZ|t|preview|xem-thu|templates)\/|^app\/api\/(v2|health|csp-report)\//, ['public', 'publishing']],

  // The owner's dashboard and sign-up.
  [/^components\/(admin-|admin\.module|desk\.module)/, ['admin']],
  [/^app\/gov\//, ['admin']],
  [/^components\/(qs\/|platform\/)/, ['owner', 'admin']],
  [/^components\//, ['owner']],
  [/^app\/(owner|app|bat-dau)\/|^app\/api\/(owner|start|google-maps)\//, ['owner']],

  // Server code: repository always, plus the pages that use it.
  [/^lib\/(owner|account|billing|admin)\//, ['repository', 'owner', 'admin']],
  [/^lib\/(client|faces\.ts)/, ['public', 'publishing']],
  [/^lib\/(canvas|publishing|media)\//, ['repository', 'public', 'publishing', 'owner']],
  [/^db\//, [...EVERYTHING, 'selfhost']], // self-host checks the database it builds is db/schema.sql
  [/^(lib|server)\//, EVERYTHING],
  // Everything else (package.json, the lockfile, next.config.ts, proxy.ts, app/layout.tsx, ci.yml ...) falls through.
];

function areasFor(file) {
  for (const [pattern, areas] of RULES) if (pattern.test(file)) return areas;
  return EVERYTHING;
}

const args = process.argv.slice(2);
const github = args.includes('--github');
const positional = args.filter((a) => !a.startsWith('--'));
let files = null;
const wanted = new Set();
if (args.includes('--all') || positional.length === 0 || /^0+$/.test(positional[0])) {
  // A new branch has no "before" commit; treat it like the button.
  EVERYTHING.forEach((a) => wanted.add(a));
  wanted.add('selfhost');
} else {
  const range = `${positional[0]}..${positional[1] ?? 'HEAD'}`;
  try {
    files = execFileSync('git', ['diff', '--name-only', range], { encoding: 'utf8' }).split('\n').filter(Boolean);
    for (const file of files) for (const area of areasFor(file)) wanted.add(area);
  } catch {
    // A force push leaves "before" outside the history: run everything rather than guess.
    console.log(`không đọc được ${range}, chạy hết`);
    [...EVERYTHING, 'selfhost'].forEach((a) => wanted.add(a));
  }
}

const integration = INTEGRATION.filter((name) => wanted.has(name)).map((name) => ({ name, command: HARNESS[name] }));
if (github) {
  appendFileSync(process.env.GITHUB_OUTPUT, [
    `repository=${wanted.has('repository')}`,
    `selfhost=${wanted.has('selfhost')}`,
    `integration=${JSON.stringify({ include: integration })}`,
    `any_integration=${integration.length > 0}`,
  ].join('\n') + '\n');
}
if (files) for (const file of files) console.log(`${(areasFor(file).join(', ') || '-').padEnd(40)} ${file}`);
console.log(`\nluôn chạy: types, lint, build, contracts, client`);
console.log(`thêm: ${[...wanted].join(', ') || 'không bộ nặng nào'}`);
