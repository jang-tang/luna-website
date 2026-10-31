/**
 * Lighthouse JSON 결과 디렉터리를 표로 요약한다.
 *   node scripts/perf/summarize-lighthouse.mjs <dir>
 */
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/perf/summarize-lighthouse.mjs <dir>');
  process.exit(1);
}

const rows = [];
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
  const lhr = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const a = lhr.audits;
  const num = (id) => a[id]?.numericValue;
  const items = a['network-requests']?.details?.items ?? [];
  const js = items.filter((i) => i.resourceType === 'Script').reduce((s, i) => s + (i.transferSize || 0), 0);
  const total = items.reduce((s, i) => s + (i.transferSize || 0), 0);
  rows.push({
    page: file.replace('.json', ''),
    score: Math.round((lhr.categories.performance?.score ?? 0) * 100),
    FCP: Math.round(num('first-contentful-paint')),
    LCP: Math.round(num('largest-contentful-paint')),
    CLS: Number((num('cumulative-layout-shift') ?? 0).toFixed(3)),
    TBT: Math.round(num('total-blocking-time')),
    TTFB: Math.round(num('server-response-time')),
    SI: Math.round(num('speed-index')),
    jsKB: Math.round(js / 1024),
    totalKB: Math.round(total / 1024),
    requests: items.length,
    errors: lhr.runtimeError?.code ?? '',
  });
}
console.table(rows);
fs.writeFileSync(path.join(dir, 'summary.csv'), [Object.keys(rows[0]).join(','), ...rows.map((r) => Object.values(r).join(','))].join('\n'));
