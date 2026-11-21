// Reuses: Claude Code hooks protocol (JSON on stdin). Never blocks: audit failures must not stop the session.
import { readFileSync } from 'node:fs';
import { handle } from './audit.ts';
try {
  const p = JSON.parse(readFileSync(0, 'utf8'));
  handle(p, p.cwd ?? process.cwd());
} catch (e) { console.error('daylight audit hook error: ' + (e as Error).message); }
