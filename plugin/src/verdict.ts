// Reuses: Superpowers SDD review loop shape. Glue: ADR-002 contract (uncited fail = inconclusive).
export function withMatrix(v: any, m: { rows: { ac: string; result: string }[] }) {
  const ok = new Set(m.rows.filter((r) => r.result === 'PASS').map((r) => r.ac));
  const claimed: string[] = v.covered ?? [];
  const bad = claimed.filter((a) => !ok.has(a));
  return bad.length ? { ...v, covered: claimed.filter((a) => ok.has(a)), effective: 'fail', citations: [...(v.citations ?? []), ...bad.map((a) => 'matrix:' + a)] } : v;
}
export function normalize(v: any) {
  if (!v || !['pass', 'fail'].includes(v.verdict) || !Array.isArray(v.criteria)) throw new Error('invalid verdict JSON: needs verdict (pass|fail) and criteria[]');
  const cited = v.criteria.filter((c: any) => c.result === 'fail' && c.cite);
  const effective = v.verdict === 'pass' ? 'pass' : cited.length ? 'fail' : 'inconclusive';
  return { ...v, effective, citations: cited.map((c: any) => c.cite) };
}
