// Reuses: ajv (JSON Schema validation), yaml (parser). Only glue: defaults merge + error formatting.
import { readFileSync } from 'node:fs';
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
