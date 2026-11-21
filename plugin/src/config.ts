// Reuses: ajv (JSON Schema validation), yaml (parser). Only glue: defaults merge + error formatting.
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { parse } from 'yaml';

const here = join(dirname(fileURLToPath(import.meta.url)), '..', 'config');
const json = (f: string) => JSON.parse(readFileSync(join(here, f), 'utf8'));
const AjvC: any = (Ajv as any).default ?? Ajv;

export function deepMerge(base: any, over: any): any {
  if (over === undefined) return base;
  if (Array.isArray(over) || typeof over !== 'object' || over === null) return over;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = deepMerge(base?.[k], over[k]);
  return out;
}
export function validate(raw: unknown): string[] {
  const v = new AjvC({ allErrors: true }).compile(json('daylight.schema.json'));
  if (v(raw)) return [];
  return (v.errors as any[]).map((e) => {
    const extra = e.params?.additionalProperty ?? e.params?.missingProperty;
    const path = (e.instancePath || '') + (extra ? '/' + extra : '');
    return 'daylight.yaml: ' + (path || '/') + ' ' + e.message;
  });
}
export function loadConfig(file: string): { errors: string[]; config?: any } {
  let raw: unknown;
  try { raw = parse(readFileSync(file, 'utf8')); } catch (e) { return { errors: ['daylight.yaml: cannot read ' + file + ': ' + (e as Error).message] }; }
  const errors = validate(raw ?? {});
  return errors.length ? { errors } : { errors, config: deepMerge(json('defaults.json'), raw) };
}

/** Config precedence: explicit --config file, else the file as committed on the base ref (ADR-005), else ./daylight.yaml, else defaults. */
export function resolveConfig(cwd: string, o: { config?: string; base?: string } = {}): any {
  const defaults = json('defaults.json');
  let text: string | undefined;
  if (o.config) text = readFileSync(o.config, 'utf8');
  else if (o.base) { const r = spawnSync('git', ['show', o.base + ':daylight.yaml'], { cwd, encoding: 'utf8' }); if (r.status === 0) text = r.stdout; }
  else if (existsSync(join(cwd, 'daylight.yaml'))) text = readFileSync(join(cwd, 'daylight.yaml'), 'utf8');
  if (text === undefined) return defaults;
  const raw = parse(text) ?? {};
  const errs = validate(raw);
  if (errs.length) throw new Error(errs.join('; '));
  return deepMerge(defaults, raw);
}
