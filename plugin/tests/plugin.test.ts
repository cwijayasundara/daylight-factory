import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN, tmp } from './helpers.ts';

test('AC-1 plugin.json passes claude plugin validate and declared parts exist', () => {
  const r = spawnSync('claude', ['plugin', 'validate', PLUGIN], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /✘/);
  const m = JSON.parse(readFileSync(join(PLUGIN, '.claude-plugin/plugin.json'), 'utf8'));
  assert.equal(m.name, 'daylight');
  const hooks = JSON.parse(readFileSync(join(PLUGIN, 'hooks/hooks.json'), 'utf8'));
  for (const groups of Object.values<any[]>(hooks.hooks)) for (const g of groups) for (const h of g.hooks) {
    const rel = String(h.command).replace(/"/g, '').replace('${CLAUDE_PLUGIN_ROOT}/', '').split(' ').pop()!;
    assert.ok(existsSync(join(PLUGIN, rel)), 'hook script missing: ' + rel);
  }
  assert.ok(readdirSync(join(PLUGIN, 'commands')).includes('run.md'));
});
test('AC-2 local install into an empty git repo lists /daylight:run', () => {
  const cfg = tmp(), repo = tmp();
  const env = { ...process.env, CLAUDE_CONFIG_DIR: cfg } as Record<string, string>;
  const x = (a: string[]) => spawnSync('claude', a, { cwd: repo, env, encoding: 'utf8' });
  spawnSync('git', ['init', '-q'], { cwd: repo });
  const add = x(['plugin', 'marketplace', 'add', join(PLUGIN, '..')]);
  assert.equal(add.status, 0, add.stdout + add.stderr);
  const inst = x(['plugin', 'install', 'daylight@daylight-local', '--scope', 'project']);
  assert.equal(inst.status, 0, inst.stdout + inst.stderr);
  const det = x(['plugin', 'details', 'daylight']);
  assert.match(det.stdout + det.stderr, /Skills \(\d+\)[^\n]*\brun\b/); // plugin commands are listed under their name; invoked as /daylight:run
  assert.match(readFileSync(join(PLUGIN, 'commands/run.md'), 'utf8'), /--help/);
});
