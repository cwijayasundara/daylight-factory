import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJson } from '../src/lib/json.ts';

test('extractJson: plain JSON', () => assert.deepEqual(extractJson('{"a":1}'), { a: 1 }));
test('extractJson: fenced JSON', () => assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 }));
test('extractJson: prose around the object', () => assert.deepEqual(extractJson('Here you go:\n{"verdict":"pass","criteria":[]}\nDone.'), { verdict: 'pass', criteria: [] }));
test('extractJson: braces inside strings do not confuse it', () => assert.deepEqual(extractJson('x {"f":"a } b","n":{"k":2}} y'), { f: 'a } b', n: { k: 2 } }));
test('extractJson: skips a leading non-JSON brace group', () => assert.deepEqual(extractJson('use {curly} then {"ok":true}'), { ok: true }));
test('extractJson: no JSON throws', () => assert.throws(() => extractJson('nothing here'), /no JSON object/));
