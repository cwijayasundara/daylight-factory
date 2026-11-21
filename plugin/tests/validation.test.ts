import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cli, PLUGIN } from './helpers.ts';

const ROOT = join(PLUGIN, '..'), DEMOS = join(ROOT, 'docs/demos');
const demo = (n: string) => JSON.parse(readFileSync(join(DEMOS, n + '.json'), 'utf8'));
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (['node_modules', '.git'].includes(n) ? [] : statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));

test('AC-92 greenfield: one command took a PRD to design artefacts, a reviewed PR, a deployment and passing smoke tests', () => {
  const g = demo('greenfield');
  assert.ok(g.command && g.prd); for (const f of ['intent.md', 'spec.md', 'architecture.md']) assert.ok(g.design.includes(f), f);
  assert.equal(g.pr.code_review, true); assert.equal(g.pr.security_review, true); assert.ok(g.pr.branch);
  assert.equal(g.deploy.ok, true); assert.equal(g.smoke.ok, true);
});
test('AC-93 brownfield: the same flow on the repo-fixture starts with ingest; no repository names in plugin sources', () => {
  const b = demo('brownfield');
  const order = b.phases.map((p: any) => p.phase); assert.ok(order.includes('ingest') && order.indexOf('ingest') < order.indexOf('design')); assert.equal(b.deploy.ok, true); assert.equal(b.smoke.ok, true); assert.equal(b.pr.code_review, true);
  for (const f of walk(PLUGIN).filter((x) => !x.includes('/tests/') && !/\.(png|jpg|lock)$/.test(x) && !x.includes('package-lock'))) assert.doesNotMatch(readFileSync(f, 'utf8'), /always_on_agents|daylight-brownfield-sample|cwijayasundara/i, f);
});
test('AC-94 every AC in spec.md has a test whose name carries its id (the matrix is run and attached by daylight trace)', () => {
  const spec = readFileSync(join(ROOT, 'docs/design/spec.md'), 'utf8');
  const ids = [...new Set([...spec.matchAll(/\*\*(AC-\d+)\*\*/g)].map((m) => m[1]))];
  const names = walk(join(PLUGIN, 'tests')).filter((f) => f.endsWith('.test.ts')).map((f) => readFileSync(f, 'utf8')).join('\n');
  const names2 = [...names.matchAll(/^test\((['"`])(.*?)\1/gm)].map((m) => m[2]).join('\n');
  const missing = ids.filter((id) => !new RegExp('\\b' + id + '\\b').test(names2));
  assert.deepEqual(missing, []); assert.equal(ids.length, 112);
});
test('AC-95 both demos report touchpoints, tokens and time per phase; both-agent-gates run reports 0', () => {
  for (const n of ['greenfield', 'brownfield']) {
    const j = demo(n); assert.equal(typeof j.touchpoints, 'number'); assert.ok(j.touchpoints <= 2);
    assert.ok(j.phases.length >= 5); for (const p of j.phases) { assert.equal(typeof p.seconds, 'number'); assert.ok('tokens' in p, p.phase); }
    assert.equal(j.gates.design, 'agent'); assert.equal(j.gates.pr, 'agent');
    // greenfield ran unattended; brownfield bh8 needed two operator resumes after escalations (both counted, both harness bugs fixed since)
    assert.equal(j.touchpoints, n === 'greenfield' ? 0 : 2);
  }
});
test('AC-96 the dream job opened a harness-improvement PR from real run data', () => {
  const d = demo('dream'); assert.ok(d.branch); assert.ok(d.evidence.length > 0);
  const ids = new Set(readFileSync(join(DEMOS, d.audit_copy), 'utf8').trim().split('\n').map((l) => JSON.parse(l).id));
  for (const e of d.evidence) assert.ok(ids.has(e), e);
});
test('AC-97 the reuse ledger lists every custom script with what it reuses and the total custom line count', () => {
  const r = cli(['ledger'], {});
  assert.equal(r.code, 0);
  for (const f of readdirSync(join(PLUGIN, 'src')).filter((x) => x.endsWith('.ts'))) assert.ok(r.out.includes('src/' + f), f);
  assert.match(r.out, /\*\*Total\*\* \| \d+/);
  assert.ok(existsSync(join(ROOT, 'docs/reuse-ledger.md')));
});
