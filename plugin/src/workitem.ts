// Reuses: gh CLI for issues (DAYLIGHT_GH overrides the binary for tests). Glue: normalise to one work-item shape.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export interface WorkItem { id: string; source: 'prd' | 'issue' | 'task'; title: string; body: string; evidence: { kind: string; ref: string }[]; paths: string[]; scope?: string }

const PATH_RE = /[\w.-]+(?:\/[\w.-]+)+(?:\.\w+)?|\bDockerfile\b/g;
export const findPaths = (text: string) => [...new Set((text.match(PATH_RE) ?? []).filter((p) => /\.\w+$|Dockerfile/.test(p) && !p.startsWith('http')))];
const idOf = (s: string) => 'wi-' + createHash('sha256').update(s).digest('hex').slice(0, 8);

export function normalize(arg: string): WorkItem {
  if (/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/\d+/.test(arg)) {
    const r = spawnSync(process.env.DAYLIGHT_GH || 'gh', ['issue', 'view', arg, '--json', 'title,body,number,url'], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error('gh failed: ' + r.stderr);
    const j = JSON.parse(r.stdout);
    return { id: idOf(arg), source: 'issue', title: j.title, body: j.body ?? '', evidence: [{ kind: 'issue', ref: j.url ?? arg }], paths: findPaths(j.body ?? '') };
  }
  const text = readFileSync(arg, 'utf8');
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
  const body = fm ? text.slice(fm[0].length) : text;
  const title = (body.match(/^#\s+(.+)$/m) ?? [])[1] ?? arg;
  const isTask = !!fm && /kind:\s*task/.test(fm[1]);
  const scope = fm?.[1].match(/scope:\s*(\w+)/)?.[1];
  const origin = fm?.[1].match(/origin_run:\s*(\S+)/)?.[1];
  return { id: idOf(arg + text), source: isTask ? 'task' : 'prd', title, body, evidence: [{ kind: isTask ? 'task-file' : 'prd', ref: arg }, ...(origin ? [{ kind: 'originating-run', ref: origin }] : [])], paths: findPaths(body), ...(scope ? { scope } : {}) };
}
