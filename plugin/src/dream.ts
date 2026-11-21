// Reuses: claude -p (Opus, headless), pstack /reflect idea, /schedule or cron for timing, gh for the harness PR, git worktrees.
// Custom: allowlist + completeness filter and PR assembly (proposals are never applied silently, ADR/AC-82).
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, mkdtempSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { claude, parseResult } from './loop.ts';
import { git } from './worktree.ts';
import { globRe } from './tiers.ts';
import { append, auditFile } from './lib/events.ts';

const CM = ['CLAUDE_CODE', 'EXPERIMENTAL', 'CODE_MODE'].join('_');
interface Proposal { path: string; action: 'append' | 'replace'; content?: string; find?: string; replace?: string; evidence?: string[]; expected_effect?: string; revert?: string }

export async function dreamRun(cwd: string, cfg: any, o: { repo: string; targetDir: string; base: string }) {
  const ldir = join(cwd, '.daylight/lessons');
  const lessons = existsSync(ldir) ? readdirSync(ldir).map((f) => JSON.parse(readFileSync(join(ldir, f), 'utf8'))) : [];
  if (!lessons.length) return { msg: 'no lessons yet: nothing to consolidate' };
  const prompt = 'You consolidate lessons from Daylight runs into proposed edits to the harness. Allowed paths (relative to the plugin): ' + cfg.dream.allowlist.join(', ') + '.\nLessons:\n' + JSON.stringify(lessons).slice(0, 20000) +
    '\nReply ONLY JSON {"proposals":[{"path","action":"append|replace","content"|"find"+"replace","evidence":["event ids"],"expected_effect":"..","revert":".."}]}. Every proposal must cite event ids as evidence.';
  const r = await claude(['-p', prompt, '--model', cfg.models.dream, '--effort', cfg.effort.design, '--output-format', 'json'], cwd);
  const pr = parseResult(r.stdout), f = auditFile(cwd);
  append(f, { kind: 'x_usage', phase: 'dream', model: cfg.models.dream, usage: pr.usage, cost_usd: pr.cost });
  let all: Proposal[] = [];
  try { all = JSON.parse(pr.text.replace(/^```(?:json)?\n?|```$/g, '')).proposals ?? []; } catch { return { msg: 'dream output was not valid JSON; nothing proposed' }; }
  const kept: Proposal[] = [];
  for (const p of all) {
    if (!cfg.dream.allowlist.some((g: string) => globRe(g).test(p.path))) { append(f, { kind: 'x_dropped', phase: 'dream', reason: 'outside_allowlist', path: p.path }); continue; }
    if (!p.evidence?.length || !p.expected_effect || !p.revert) { append(f, { kind: 'x_dropped', phase: 'dream', reason: 'incomplete', path: p.path }); continue; }
    kept.push(p);
  }
  if (!kept.length) return { msg: 'all proposals dropped (see audit log); no PR opened' };
  const branch = 'dream/' + Date.now(), wt = mkdtempSync(join(tmpdir(), 'dream-'));
  const add = git(o.repo, ['worktree', 'add', '-q', '-b', branch, join(wt, 'w'), o.base]); if (add.status !== 0) return { msg: 'worktree failed: ' + add.stderr };
  const w = join(wt, 'w');
  for (const p of kept) {
    const file = join(w, o.targetDir, p.path); mkdirSync(dirname(file), { recursive: true });
    if (p.action === 'replace') writeFileSync(file, readFileSync(file, 'utf8').replace(p.find ?? '', () => p.replace ?? ''));
    else appendFileSync(file, p.content ?? '');
  }
  git(w, ['add', '-A']); git(w, ['commit', '-q', '-m', 'dream: ' + kept.length + ' harness improvement proposal(s)']);
  git(o.repo, ['worktree', 'remove', '--force', w]);
  const body = '# Dream: proposed harness improvements\n\nProposals are never applied silently; this PR is the gate. Revert with the notes below.\n\n' +
    kept.map((p) => '## ' + p.path + '\n' + (p.content ?? p.replace ?? '') + '\n\nEvidence: ' + p.evidence!.join(', ') + '\nExpected effect: ' + p.expected_effect + '\nRevert: ' + p.revert + '\n').join('\n');
  mkdirSync(join(cwd, '.daylight'), { recursive: true }); writeFileSync(join(cwd, '.daylight/dream-pr.md'), body);
  const g = spawnSync(process.env.DAYLIGHT_GH || 'gh', ['pr', 'create', '--base', o.base, '--head', branch, '--title', 'Daylight dream: ' + kept.length + ' harness proposal(s)', '--body-file', join(cwd, '.daylight/dream-pr.md')], { cwd: o.repo, encoding: 'utf8' });
  return { msg: g.status === 0 ? 'PR opened: ' + g.stdout.trim() + ' (branch ' + branch + ')' : 'branch ' + branch + ' created; PR body at .daylight/dream-pr.md (gh: ' + g.stderr.trim().slice(0, 120) + ')', branch };
}
export function scheduleEntry(cwd: string, cfg: any, repo: string) {
  const cli = join(dirname(fileURLToPath(import.meta.url)), 'cli.ts');
  const line = cfg.dream.schedule + ' cd ' + cwd + ' && env -u ' + CM + ' node ' + cli + ' dream run --repo ' + repo + ' --target-dir plugin >> .daylight/dream.log 2>&1';
  mkdirSync(join(cwd, '.daylight/schedule'), { recursive: true }); writeFileSync(join(cwd, '.daylight/schedule/dream.cron'), line + '\n');
  return line;
}
