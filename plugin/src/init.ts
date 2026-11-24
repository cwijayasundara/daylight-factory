// Reuses: git, yaml, ingest.ts, and the plugin's own skills/rules/config. Glue: one-command target repo scaffolding (/daylight:init).
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { git } from './worktree.ts';
import { detectLanguage, ingest } from './ingest.ts';

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..');
const STACK_CFG: Record<string, { tests: string; smoke: string; lang: string }> = {
  ts: { tests: 'npm test', smoke: 'npm run smoke', lang: 'TypeScript / Node.js' },
  python: { tests: 'uv run pytest -v', smoke: 'python3 scripts/smoke.py', lang: 'Python 3.14 (uv + pytest)' },
  rust: { tests: 'cargo test', smoke: 'cargo run --bin smoke', lang: 'Rust (cargo)' },
};

export async function initRepo(cwd: string, cfg: any, o: { stack?: string; gates?: string; github?: boolean } = {}) {
  const created: string[] = [];
  if (!existsSync(join(cwd, '.git'))) { git(cwd, ['init', '-q', '-b', 'main']); created.push('.git (main)'); }
  const gi = join(cwd, '.gitignore');
  if (!existsSync(gi) || !readFileSync(gi, 'utf8').includes('.daylight/')) { appendFileSync(gi, '\n# daylight\n.daylight/\n.DS_Store\n.idea/\nnode_modules/\n__pycache__/\n.venv/\ntarget/\n'); created.push('.gitignore'); }
  const fdir = join(cwd, '.daylight/factory');
  mkdirSync(fdir, { recursive: true });
  for (const d of ['skills', 'rules', 'config']) cpSync(join(PLUGIN, d), join(fdir, d), { recursive: true });
  created.push('.daylight/factory/{skills,rules,config}');

  const det = detectLanguage(cwd);
  const stack = (o.stack ?? (det.primary === 'Python' ? 'python' : det.primary === 'Rust' ? 'rust' : 'ts')).toLowerCase();
  const s = STACK_CFG[stack] ?? STACK_CFG.ts;
  const zero = o.gates === '0';
  if (det.primary && !existsSync(join(cwd, 'daylight.yaml'))) {
    const r = await ingest(cwd, cfg, {});
    if (r.code === 0) { await ingest(cwd, cfg, { accept: true }); created.push('daylight.yaml (from ingest)'); }
  }
  if (!existsSync(join(cwd, 'daylight.yaml'))) {
    const doc = {
      gates: { design: { approver: zero ? 'agent' : 'human' }, pr: { approver: 'agent', human_after_agent: !zero } },
      ...(zero ? { tiers: { use_defaults: false } } : {}),
      deploy: { target: 'local', smoke_command: s.smoke },
      sensors: { required: ['tests', 'secrets'], commands: { tests: s.tests } },
    };
    writeFileSync(join(cwd, 'daylight.yaml'), stringify(doc));
    created.push('daylight.yaml (' + stack + ', ' + (zero ? '0-gate' : '2-gate') + ')');
  }
  if (!existsSync(join(cwd, 'prd.md'))) {
    writeFileSync(join(cwd, 'prd.md'), '# Feature PRD (' + s.lang + ')\n\n## Requirements\n- Describe the behaviour, endpoints, and Docker/smoke requirements here.\n\n## Non-functional requirements\n- ' + s.lang + ' with automated tests.\n- Container passes health check and smoke script exits 0.\n');
    created.push('prd.md');
  }
  if (o.github && !git(cwd, ['remote', 'get-url', 'origin']).stdout.trim()) {
    const gh = spawnSync(process.env.DAYLIGHT_GH || 'gh', ['repo', 'create', basename(cwd), '--private', '--source=.', '--remote=origin'], { cwd, encoding: 'utf8' });
    if (gh.status === 0) created.push('github repo (' + basename(cwd) + ', private, remote=origin)');
    else created.push('github repo skipped: ' + (gh.stderr || gh.stdout).trim().slice(0, 120));
  }
  return { ok: true, stack, gates: zero ? 0 : 2, created, next: 'Commit baseline (git add -A && git commit -m "initial baseline"), then run /daylight:run prd.md' + (zero ? ' --agents' : '') };
}
