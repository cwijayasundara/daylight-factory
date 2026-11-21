// Reuses: Superpowers brainstorming + mattpocock to-spec produce the artefacts; this file only lints them (AC-19..23) and stamps revisions.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FILES = ['intent.md', 'spec.md', 'architecture.md'];
export const nfrs = (prd: string): string[] => {
  const m = prd.match(/^##\s+Non-functional requirements\s*\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/im);
  if (!m) return [];
  return m[1].split('\n').filter((l) => /^\s*[-*]\s+\S/.test(l)).map((l, i) => (l.match(/NFR-\d+/) ?? ['NFR-' + (i + 1)])[0]);
};
export const prdCheck = (text: string) => (nfrs(text).length ? [] : ['PRD refused: it needs a "## Non-functional requirements" section with at least one bullet']);
const section = (t: string, h: string) => (t.match(new RegExp('^##\\s+' + h + '\\s*\\n([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))', 'im')) ?? [])[1]?.trim() ?? '';
const VERB = /\b(returns?|produces?|fails?|exits?|writes?|rejects?|shows?|contains?|records?|lists?|prints?|blocks?|denies|emits?|creates?|opens?|renders?|reports?|stops?|refuses|runs?|logs?|equals?|matches|persists?|responds?|stores?|requires?|never)\b|[<>=]|\d/i;

export function lint(dir: string, prdText?: string): string[] {
  const errs: string[] = [];
  const read: Record<string, string> = {};
  for (const f of FILES) { if (!existsSync(join(dir, f))) errs.push('missing ' + f); else read[f] = readFileSync(join(dir, f), 'utf8'); }
  if (read['intent.md'] !== undefined) {
    const t = read['intent.md'];
    if (!section(t, 'Why')) errs.push('intent.md: "Why" section is empty');
    const sc = section(t, 'Success criteria');
    if (!sc) errs.push('intent.md: "Success criteria" section is empty');
    else if (!sc.split('\n').some((l) => /\d/.test(l))) errs.push('intent.md: success criteria are not measurable (no number)');
  }
  if (read['spec.md'] !== undefined) {
    const seen = new Set<string>();
    const acs = [...read['spec.md'].matchAll(/^[-*]\s+\*\*(AC-\d+)\*\*\s+(.*)$/gm)];
    if (!acs.length) errs.push('spec.md: no acceptance criteria found');
    for (const [, id, text] of acs) {
      if (seen.has(id)) errs.push('spec.md: duplicate ' + id);
      seen.add(id);
      const tag = /^\[([^\]]*)\]/.exec(text)?.[1];
      if (tag !== undefined && !/^(test|run|sensor:[\w-]+)$/.test(tag)) errs.push('spec.md: ' + id + ' has an invalid verification tag [' + tag + '] (use [test], [run] or [sensor:<name>]' + (tag === 'sensor' ? '; a sensor tag needs the sensor name' : '') + ')');
      if (!VERB.test(text)) errs.push('spec.md: ' + id + ' has no verifiable condition (use an observable verb or a threshold)');
    }
  }
  if (read['architecture.md'] !== undefined) {
    const t = read['architecture.md'];
    const adrs = t.split(/^###\s+(?=ADR-\d+)/m).slice(1);
    if (!adrs.length) errs.push('architecture.md: needs at least one ADR');
    for (const a of adrs) for (const w of ['Status', 'Context', 'Decision', 'Consequences']) if (!new RegExp('\\b' + w + '\\b', 'i').test(a)) errs.push('architecture.md: ' + a.split('\n')[0].split(' ')[0] + ' missing ' + w);
    if (prdText) for (const n of nfrs(prdText)) if (!new RegExp('\\|\\s*' + n + '\\s*\\|').test(t)) errs.push('architecture.md: ' + n + ' is not mapped to a mechanism');
  }
  return errs;
}
export function stamp(dir: string, revision: number) {
  for (const f of FILES) {
    const p = join(dir, f); if (!existsSync(p)) continue;
    const body = readFileSync(p, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '');
    writeFileSync(p, '---\nrevision: ' + revision + '\n---\n' + body);
  }
}
export const ARTEFACTS = FILES;
