import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cli, tmp, put, events, MIN_YAML } from './helpers.ts';

export const PRD = '# Todo API\nBuild a todo REST API.\n\n## Non-functional requirements\n- p95 latency under 200ms\n- Data persists across restarts\n';
export const INTENT = '# Intent\n\n## Why\nTeams need a shared todo list.\n\n## Success criteria\n- 95% of requests complete in under 200 ms\n- 100% of ACs trace to passing tests\n';
export const SPEC = '# Spec\n\n- **AC-1** POST /todos returns 201 and the created todo.\n- **AC-2** GET /todos lists all stored todos.\n';
export const ARCH = '# Architecture\n\n### ADR-001 Use SQLite\n- **Status** accepted\n- **Context** need persistence\n- **Decision** SQLite file\n- **Consequences** single node\n\n## NFR mapping\n| NFR | Mechanism |\n|---|---|\n| NFR-1 | in-process SQLite, indexed |\n| NFR-2 | file-backed database |\n';
const mk = (o: Partial<Record<string, string>> = {}) => {
  const d = tmp(); const dd = join(d, 'docs/design');
  put(dd, 'intent.md', o.intent ?? INTENT); put(dd, 'spec.md', o.spec ?? SPEC); put(dd, 'architecture.md', o.arch ?? ARCH);
  put(d, 'prd.md', PRD);
  put(d, 'daylight.yaml', MIN_YAML + 'retries:\n  design: 2\n');
  return { d, dd };
};
const lint = (d: string, dd: string) => cli(['design', 'lint', '--dir', dd, '--prd', join(d, 'prd.md')], { cwd: d });
const st = (d: string) => JSON.parse(readFileSync(join(d, '.daylight/state.json'), 'utf8'));

test('AC-19 a PRD without a Non-functional requirements section is refused', () => {
  const d = tmp();
  const bad = put(d, 'bad.md', '# X\nNo nfrs here\n');
  const r = cli(['prd', 'check', bad], { cwd: d });
  assert.notEqual(r.code, 0); assert.match(r.err, /Non-functional requirements/);
  assert.equal(cli(['prd', 'check', put(d, 'good.md', PRD)], { cwd: d }).code, 0);
});
test('AC-20 lint requires intent.md, spec.md and architecture.md in the design dir', () => {
  const { d, dd } = mk();
  assert.equal(lint(d, dd).code, 0, lint(d, dd).err);
  writeFileSync(join(dd, 'spec.md'), '');
  const d2 = tmp(); put(d2, 'docs/design/intent.md', INTENT);
  const r = cli(['design', 'lint', '--dir', join(d2, 'docs/design')], { cwd: d2 });
  assert.notEqual(r.code, 0); assert.match(r.err, /spec\.md/); assert.match(r.err, /architecture\.md/);
});
test('AC-21 intent lint fails on empty why or success criteria', () => {
  for (const intent of ['# Intent\n\n## Why\n\n## Success criteria\n- 95% pass\n', '# Intent\n\n## Why\nbecause\n\n## Success criteria\n']) {
    const { d, dd } = mk({ intent }); const r = lint(d, dd);
    assert.notEqual(r.code, 0); assert.match(r.err, /intent\.md/);
  }
});
test('AC-22 spec lint rejects duplicate AC ids and ACs with no verifiable condition', () => {
  let m = mk({ spec: SPEC + '- **AC-2** GET /todos lists all stored todos again.\n' });
  assert.match(lint(m.d, m.dd).err, /duplicate AC-2/);
  m = mk({ spec: SPEC + '- **AC-3** The system works well and feels fast.\n' });
  assert.match(lint(m.d, m.dd).err, /AC-3.*verifiable/);
});
test('AC-23 architecture lint needs an ADR with four parts and every NFR mapped', () => {
  let m = mk({ arch: ARCH.replace('| NFR-2 | file-backed database |\n', '') });
  assert.match(lint(m.d, m.dd).err, /NFR-2/);
  m = mk({ arch: ARCH.replace('- **Consequences** single node\n', '') });
  assert.match(lint(m.d, m.dd).err, /Consequences/);
});
test('AC-24 the inner loop cannot start while Gate 1 is pending', () => {
  const { d, dd } = mk();
  cli(['gate', 'request', 'design', '--dir', dd], { cwd: d });
  const r = cli(['inner-start', '--dir', dd], { cwd: d });
  assert.notEqual(r.code, 0); assert.match(r.err, /Gate 1/);
  cli(['gate', 'decide', 'design', '--decision', 'approve', '--source', 'human', '--dir', dd], { cwd: d });
  assert.equal(cli(['inner-start', '--dir', dd], { cwd: d }).code, 0);
});
test('AC-25 human gate presents the artefacts and records source=human', () => {
  const { d, dd } = mk();
  const p = cli(['gate', 'present', 'design', '--dir', dd], { cwd: d });
  for (const f of ['intent.md', 'spec.md', 'architecture.md']) assert.match(p.out, new RegExp(f));
  cli(['gate', 'decide', 'design', '--decision', 'approve', '--source', 'human', '--dir', dd], { cwd: d, env: { DAYLIGHT_RUN: 'r1' } });
  const e = events(d).find((x) => x.kind === 'gate');
  assert.deepEqual([e.gate, e.decision, e.source], ['design', 'approve', 'human']);
});
test('AC-26 agent gate runs on the configured model with the rubric and records per-criterion scores', () => {
  const { d, dd } = mk();
  const argsFile = join(d, 'args.txt');
  const stub = put(d, 'claude', '#!/bin/bash\necho "$@" > ' + argsFile + '\necho \'{"result":"{\\"decision\\":\\"approve\\",\\"scores\\":{\\"testable\\":5,\\"traceable\\":4},\\"feedback\\":\\"\\"}"}\'\n');
  require_chmod(stub);
  cli(['gate', 'agent', 'design', '--dir', dd], { cwd: d, env: { DAYLIGHT_CLAUDE: stub, DAYLIGHT_RUN: 'r1' } });
  const args = readFileSync(argsFile, 'utf8');
  assert.match(args, /--model claude-opus-5-5/); assert.match(args, /design-rubric/);
  const e = events(d).find((x) => x.kind === 'gate');
  assert.equal(e.source, 'agent'); assert.deepEqual(e.scores, { testable: 5, traceable: 4 });
});
test('AC-26 an approver reply with prose around the JSON is still parsed', () => {
  const { d, dd } = mk();
  const stub = put(d, 'claude2', "#!/bin/bash\ncat <<'EOF'\n" + JSON.stringify({ result: 'Here is my review:\n```json\n{"decision":"approve","scores":{"testable":5},"feedback":""}\n```\nDone.' }) + "\nEOF\n");
  chmodSync(stub, 0o755);
  const r = cli(['gate', 'agent', 'design', '--dir', dd], { cwd: d, env: { DAYLIGHT_CLAUDE: stub, DAYLIGHT_RUN: 'r1' } });
  assert.equal(r.code, 0, r.err); assert.equal(events(d).find((x) => x.kind === 'gate').decision, 'approve');
});
test('AC-27 reject-with-feedback loops back: revision increments and feedback is in context', () => {
  const { d, dd } = mk();
  cli(['gate', 'request', 'design', '--dir', dd], { cwd: d });
  cli(['gate', 'decide', 'design', '--decision', 'reject', '--source', 'human', '--feedback', 'add rate limiting NFR', '--dir', dd], { cwd: d });
  assert.equal(st(d).gates.design.revision, 1);
  assert.match(cli(['gate', 'context', 'design'], { cwd: d }).out, /add rate limiting NFR/);
  cli(['design', 'stamp', '--dir', dd], { cwd: d });
  for (const f of ['intent.md', 'spec.md', 'architecture.md']) assert.match(readFileSync(join(dd, f), 'utf8'), /^---\nrevision: 1\n---\n/);
});
test('AC-28 after the design retry cap the gate escalates to a human regardless of approver', () => {
  const { d, dd } = mk();
  const rej = () => cli(['gate', 'decide', 'design', '--decision', 'reject', '--source', 'agent', '--feedback', 'no', '--dir', dd], { cwd: d, env: { DAYLIGHT_RUN: 'r1' } });
  rej(); rej();
  assert.equal(st(d).gates.design.status, 'escalated');
  const a = cli(['gate', 'decide', 'design', '--decision', 'approve', '--source', 'agent', '--dir', dd], { cwd: d });
  assert.notEqual(a.code, 0); assert.match(a.err, /human/);
  assert.equal(cli(['gate', 'decide', 'design', '--decision', 'approve', '--source', 'human', '--dir', dd], { cwd: d }).code, 0);
  assert.ok(events(d).some((x) => x.kind === 'x_escalation' && x.gate === 'design'));
});
test('AC-29 editing an artefact after approval invalidates it and re-opens the gate', () => {
  const { d, dd } = mk();
  cli(['gate', 'decide', 'design', '--decision', 'approve', '--source', 'human', '--dir', dd], { cwd: d });
  assert.equal(cli(['gate', 'verify', 'design', '--dir', dd], { cwd: d }).code, 0);
  writeFileSync(join(dd, 'spec.md'), SPEC + '- **AC-9** GET /health returns 200.\n');
  const r = cli(['gate', 'verify', 'design', '--dir', dd], { cwd: d });
  assert.notEqual(r.code, 0);
  assert.equal(st(d).gates.design.status, 'pending');
  assert.notEqual(cli(['inner-start', '--dir', dd], { cwd: d }).code, 0);
});
import { chmodSync } from 'node:fs';
function require_chmod(p: string) { chmodSync(p, 0o755); }
