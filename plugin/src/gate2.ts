// Reuses: parseFindings/classify from review.ts (AC-60 blocking rule). Glue: Gate 2 as a pure function of evidence, so approval is deterministic and testable.
import { parseFindings, classify } from './review.ts';

export interface Evidence {
  matrix: { ac: string; result: string }[];
  sensorsOk: boolean;
  scopeErrors: string[];
  judge: 'pass' | 'fail' | 'inconclusive' | 'missing';
  /** raw reviewer output by kind; a missing key means the review did not run */
  reviews: Record<string, string | undefined>;
}
export interface Gate2Result { decision: 'approve' | 'reject'; reasons: string[]; blocking: any[]; advisory: any[] }
const REVIEWS = ['code-review', 'security-review'];

export function gate2(e: Evidence): Gate2Result {
  const reasons: string[] = [];
  if (!e.matrix.length) reasons.push('traceability matrix is empty');
  const notPass = e.matrix.filter((r) => r.result !== 'PASS');
  if (notPass.length) reasons.push('matrix not all PASS: ' + notPass.map((r) => r.ac + ' ' + r.result).join(', '));
  if (!e.sensorsOk) reasons.push('sensors are not green');
  if (e.scopeErrors.length) reasons.push('scope drift: ' + e.scopeErrors.join('; '));
  if (e.judge !== 'pass') reasons.push('run judge verdict is ' + e.judge);
  const findings: any[] = [];
  for (const k of REVIEWS) { const t = e.reviews[k]; if (t === undefined) reasons.push(k + ' is missing'); else findings.push(...parseFindings(t)); }
  const { blocking, advisory } = classify(findings);
  if (blocking.length) reasons.push(blocking.length + ' blocking finding(s): ' + blocking.map((f) => f.file + ':' + f.line).join(', '));
  return { decision: reasons.length ? 'reject' : 'approve', reasons, blocking, advisory };
}
