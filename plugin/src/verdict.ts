// Reuses: Superpowers SDD review loop shape. Glue: ADR-002 contract (uncited fail = inconclusive).
export function normalize(v: any) {
  if (!v || !['pass', 'fail'].includes(v.verdict) || !Array.isArray(v.criteria)) throw new Error('invalid verdict JSON: needs verdict (pass|fail) and criteria[]');
  const cited = v.criteria.filter((c: any) => c.result === 'fail' && c.cite);
  const effective = v.verdict === 'pass' ? 'pass' : cited.length ? 'fail' : 'inconclusive';
  return { ...v, effective, citations: cited.map((c: any) => c.cite) };
}
