// Reuses: the audit JSONL only; plain HTML/CSS, no framework, no network (AC-16). Metrics follow the S16/S17 factory metrics.
import { spawnSync } from 'node:child_process';
import { load, touchpoints } from './metrics.ts';

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) + '%' : 'n/a');
const secs = (ms: number) => (ms / 1000).toFixed(1) + ' s';

export function trailerShare(repo: string): string {
  const r = spawnSync('git', ['log', '--format=%B%x1e'], { cwd: repo, encoding: 'utf8' });
  if (r.status !== 0) return 'n/a';
  const msgs = r.stdout.split('\x1e').map((m) => m.trim()).filter(Boolean);
  return pct(msgs.filter((m) => /^Daylight-Run:/m.test(m)).length, msgs.length);
}
export function render(file: string, run: string, repo?: string): string {
  const evs = load(file);
  const ts = (e: any) => Date.parse(e.ts);
  const phases = [...new Set(evs.map((e) => e.phase ?? 'session'))];
  const tp = touchpoints(file);
  const usage = evs.filter((e) => e.kind === 'x_usage' || (e.kind === 'subagent_stop' && e.tokens));
  const tok = (e: any) => (e.kind === 'x_usage' ? { i: e.usage?.input_tokens, o: e.usage?.output_tokens } : { i: e.tokens?.input, o: e.tokens?.output });
  const cost = evs.filter((e) => e.kind === 'x_usage' && typeof e.cost_usd === 'number').reduce((s, e) => s + e.cost_usd, 0);
  const judged = evs.filter((e) => e.kind === 'verdict' && e.role === 'judge').length, vetoes = evs.filter((e) => e.kind === 'x_veto').length;
  const recovered = evs.filter((e) => e.kind === 'x_recovery' && e.recovered).length;
  const span = evs.length ? ts(evs[evs.length - 1]) - ts(evs[0]) : 0;
  const metrics: [string, string][] = [
    ['Cost per PR', cost ? '$' + cost.toFixed(4) : 'n/a (no usage recorded)'], ['Cycle time', secs(span)], ['Human touches per PR', String(tp.count)],
    ['Daylight-trailer share', repo ? trailerShare(repo) : 'n/a'], ['Veto rate', pct(vetoes, judged)], ['Recovery rate', pct(recovered, vetoes)],
  ];
  const rows = phases.map((p) => {
    const pe = evs.filter((e) => (e.phase ?? 'session') === p);
    const byModel = new Map<string, { i: number; o: number; known: boolean }>();
    for (const e of pe.filter((x) => usage.includes(x))) { const t = tok(e), m = byModel.get(e.model) ?? { i: 0, o: 0, known: false }; if (t.i != null) { m.i += t.i; m.known = true; } m.o += t.o ?? 0; byModel.set(e.model, m); }
    const sensors = pe.filter((e) => e.kind === 'sensor').map((e) => e.name + ': ' + (e.ok ? 'pass' : 'FAIL'));
    const verdicts = pe.filter((e) => e.kind === 'verdict').map((e) => e.role + ' ' + e.verdict + (e.degraded ? ' (degraded)' : ''));
    const gates = pe.filter((e) => e.kind === 'gate').map((e) => e.gate + ': ' + e.decision + ' (' + e.source + ')');
    const hum = pe.filter((e) => e.kind === 'gate' && e.source === 'human' && !e.after_escalation).length + pe.filter((e) => e.kind === 'x_escalation').length;
    const retries = pe.filter((e) => e.kind === 'x_dispatch' && e.role === 'generator' && e.attempt > 1).length;
    const tokens = [...byModel].map(([m, v]) => esc(m) + ': in ' + (v.known ? v.i : 'n/a') + ' / out ' + v.o).join('<br>') || 'n/a';
    return '<tr><td>' + esc(p) + '</td><td>' + secs(ts(pe[pe.length - 1]) - ts(pe[0])) + '</td><td>' + tokens + '</td><td>' + retries + '</td><td>' + esc(sensors.join(', ')) + '</td><td>' + esc(verdicts.join(', ')) + '</td><td>' + esc(gates.join(', ')) + '</td><td>' + hum + '</td></tr>';
  }).join('\n');
  const kids = new Map<string, any[]>(); for (const e of evs) if (e.parent_id) kids.set(e.parent_id, [...(kids.get(e.parent_id) ?? []), e]);
  const tl = evs.filter((e) => !e.parent_id && e.kind !== 'repl_post').map((e) => {
    if (e.kind === 'repl_pre') {
      const post = evs.find((x) => x.kind === 'repl_post' && x.tool_use_id === e.tool_use_id), inner = kids.get(e.id) ?? [];
      return '<details><summary>' + esc(e.ts) + ' REPL batch ' + esc(e.id) + ' (' + inner.length + ' inner calls)</summary><pre>' + esc(e.code) + '</pre>' +
        (post ? '<p>stdout: <code>' + esc(post.stdout) + '</code> result: <code>' + esc(post.result) + '</code></p>' : '') + inner.map((i) => '<div class="in">' + esc(i.tool) + ' ' + esc(JSON.stringify(i.summary)) + '</div>').join('') + '</details>';
    }
    return '<div>' + esc(e.ts) + ' <b>' + esc(e.kind) + '</b> ' + esc(e.tool ?? e.name ?? e.gate ?? e.task ?? '') + '</div>';
  }).join('\n');
  return '<!doctype html><html><head><meta charset="utf-8"><title>Daylight run ' + esc(run) + '</title><style>body{font:14px system-ui;margin:2rem;max-width:1100px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:4px 8px;vertical-align:top;text-align:left}th{background:#f4f4f4}pre{background:#f7f7f7;padding:8px;overflow:auto}.in{margin-left:1rem;color:#555}</style></head><body>' +
    '<h1>Daylight run ' + esc(run) + '</h1><h2>Factory metrics</h2><table>' + metrics.map(([k, v]) => '<tr><th>' + k + '</th><td>' + esc(v) + '</td></tr>').join('') + '</table>' +
    '<h2>Phases</h2><p>Human touchpoints for the run: <b>' + tp.count + '</b> (gate decisions ' + tp.human + ', escalations ' + tp.escalations + ')</p><table><tr><th>Phase</th><th>wall-clock</th><th>Tokens per model</th><th>retries</th><th>Sensors</th><th>Verdicts</th><th>Gate decisions</th><th>Human touchpoints</th></tr>' + rows + '</table>' +
    '<h2>Timeline</h2>' + tl + '<p>Human touchpoints: ' + tp.count + '</p></body></html>';
}
