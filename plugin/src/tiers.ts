// Reuses: daylight.yaml (tiers.rules) + shipped defaults. Glue: glob->regex and first-match-wins classification.
export type Tier = 'low' | 'medium' | 'high';
interface Rule { tier: Tier; paths?: string[]; keywords?: string[] }

export const DEFAULT_RULES: Rule[] = [{
  tier: 'high',
  paths: ['**/auth/**', '**/authn/**', '**/authz/**', '**/authentication/**', '**/authorization/**', '**/secrets/**', '**/*secret*', '**/migrations/**', '**/db/**', '**/*.sql',
    '**/billing/**', '**/payment/**', '**/payments/**', '.github/workflows/**', '**/Dockerfile', '**/docker-compose*.yml', 'deploy/**', '**/deploy/**'],
  keywords: ['authentication', 'authorization', 'password', 'secret', 'credential', 'migration', 'payment', 'billing', 'ci workflow'],
}];

const re = (g: string) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '(?:.*/)?').replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*') + '$');
const order: Tier[] = ['low', 'medium', 'high'];

/** Operator rules are evaluated first (they override); defaults follow when use_defaults. Per path: first matching rule wins; item tier = max over paths and title keywords. */
export function classify(paths: string[], title: string, cfg: { tiers: { use_defaults: boolean; rules: Rule[] } }) {
  const rules = [...cfg.tiers.rules, ...(cfg.tiers.use_defaults ? DEFAULT_RULES : [])];
  const hits: { tier: Tier; why: string }[] = [];
  for (const p of paths) {
    const r = rules.find((x) => x.paths?.some((g) => re(g).test(p)));
    if (r) hits.push({ tier: r.tier, why: 'path ' + p + ' matches a ' + r.tier + ' rule' });
  }
  for (const r of rules) for (const k of r.keywords ?? []) if (new RegExp('\\b' + k + '\\b', 'i').test(title)) hits.push({ tier: r.tier, why: 'title keyword "' + k + '"' });
  const tier = hits.reduce<Tier>((m, h) => (order.indexOf(h.tier) > order.indexOf(m) ? h.tier : m), hits.length ? hits[0].tier : 'low');
  return { tier: hits.length ? tier : null, why: hits.map((h) => h.why) };
}

export function gatePolicy(tier: Tier, cfg: any, degraded = false) {
  const pr = cfg.gates.pr;
  if (tier === 'high' || degraded) return { tier, agent_only: false, human_required: true, reason: degraded ? 'degraded evaluator verdict cannot be the only approval' : 'high tier requires a human decision' };
  if (tier === 'low') return { tier, agent_only: true, human_required: false, reason: 'low tier allows an agent-only gate' };
  const h = !!(pr.human_required || pr.human_after_agent);
  return { tier, agent_only: !h, human_required: h, reason: 'medium tier follows the configured policy' };
}
