import featureSchema from '../../schema/feature.schema.json';
import workflowSchema from '../../schema/workflow.schema.json';
import businessObjectSchema from '../../schema/business-object.schema.json';
import { issueLink } from '../project/model';
import type { BusinessObject, Feature, Workflow } from '../types';
import type { ValidationIssue } from '../validation/model';
import { forAudience } from './audience';
import type { SpecFeature, SpecModel } from './build';
import type { Messages } from './messages';

/**
 * Human view of the spec (PRODUCTCREATOR-35): one Markdown document. Only fields for people (`x-audience`
 * human / both) are rendered; labels come from `messages`. Problems are shown next to the entry and listed at the end.
 */

/** One line of table cell or inline text: no line breaks, no column separators */
const cell = (text: string | undefined) => (text ?? '').replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|');

function issueLines(m: Messages, issues: ValidationIssue[]): string[] {
  if (!issues.length) return [];
  return [
    '',
    `> **${m.problems}:**`,
    ...issues.map((i) => `> - ${i.severity === 'error' ? `**${m.error}**` : m.warning}: ${cell(i.message)}${i.field ? ` (\`${i.field}\`)` : ''}`),
  ];
}

function tickets(spec: SpecModel, keys: string[] | undefined): string {
  return (keys ?? []).map((k) => (issueLink(spec.project.tracker, k) ? `[${k}](${issueLink(spec.project.tracker, k)})` : k)).join(', ');
}

function actorNames(spec: SpecModel, ids: string[] | undefined): string {
  const names = new Map((spec.project.actors ?? []).map((a) => [a.id, a.name]));
  return (ids ?? []).map((id) => names.get(id) ?? id).join(', ');
}

function featureSection(spec: SpecModel, m: Messages, entry: SpecFeature): string[] {
  const f = forAudience(entry.data, featureSchema, 'human') as Partial<Feature>;
  const out: string[] = ['', `#### ${cell(f.name)} (\`${entry.data.id}\`)`, ''];
  const meta = [`*${m.lifecycle[entry.data.lifecycle] ?? entry.data.lifecycle}*`, `${m.component}: ${entry.component.name}`];
  if (f.tickets?.length) meta.push(`${m.tickets}: ${tickets(spec, f.tickets)}`);
  out.push(meta.join(' · '));
  if (f.description) out.push('', f.description);
  if (f.actors?.length) out.push('', `**${m.actors}:** ${actorNames(spec, f.actors)}`);
  if (f.requirements?.length) {
    out.push('', `**${m.requirements}**`, '');
    for (const r of f.requirements) out.push(`- **${r.id}** ${cell(r.text)}${r.priority && r.priority !== 'must' ? ` *(${m.priority[r.priority]})*` : ''}`);
  }
  if (f.acceptance?.length) {
    out.push('', `**${m.acceptance}**`, '');
    for (const a of f.acceptance) {
      const covers = a.covers?.length ? ` (${m.covers} ${a.covers.join(', ')})` : '';
      const parts = [a.given && `**${m.given}** ${cell(a.given)}`, a.when && `**${m.when}** ${cell(a.when)}`, a.then && `**${m.then}** ${cell(a.then)}`].filter(Boolean);
      out.push(`- **${a.id}**${covers}: ${[...parts, a.text ? cell(a.text) : ''].filter(Boolean).join('; ')}`);
    }
  }
  if (f.constraints?.length) {
    out.push('', `**${m.constraints}**`, '');
    for (const c of f.constraints) out.push(`- **${c.id}**${c.kind ? ` *${c.kind}*` : ''} ${cell(c.text)}`);
  }
  if (f.decisions?.length) {
    out.push('', `**${m.decisions}**`, '');
    for (const d of f.decisions) {
      const text = `**${d.id}** ${cell(d.decision)}${d.reason ? ` — ${cell(d.reason)}` : ''}${d.date ? ` (${d.date})` : ''}`;
      out.push(`- ${d.status === 'superseded' ? `~~${text}~~ *(${m.superseded})*` : text}`);
    }
  }
  if (f.open_questions?.length) {
    out.push('', `**${m.openQuestions}**`, '');
    for (const q of f.open_questions) out.push(`- **${q.id}** ${cell(q.question)}${q.owner ? ` — ${q.owner}` : ''}`);
  }
  if (entry.screens.length) {
    out.push('', `**${m.screens}**`);
    for (const s of entry.screens) {
      const caption = `${s.screen.id} — ${cell(s.screen.title)}`;
      out.push('', s.exists ? `![${caption}](${s.file})` : `> *${caption}: ${m.screenNotCaptured}*`, '', `*${caption}*`);
    }
  }
  if (f.objects?.length) out.push('', `**${m.objects}:** ${f.objects.map((o) => `\`${o.id}\` (${o.access === 'write' ? m.write : m.read})`).join(', ')}`);
  if (f.apis?.length) out.push('', `**${m.apis}:** ${f.apis.map((a) => `\`${a.method} ${a.path}\``).join(', ')}`);
  if (f.emits?.length) out.push('', `**${m.emits}:** ${f.emits.map((e) => `\`${e}\``).join(', ')}`);
  if (f.consumes?.length) out.push('', `**${m.consumes}:** ${f.consumes.map((e) => `\`${e}\``).join(', ')}`);
  out.push(...issueLines(m, entry.issues));
  return out;
}

function featureGroups(spec: SpecModel, m: Messages, features: SpecFeature[]): string[] {
  const out: string[] = [];
  let context = '';
  for (const f of features) {
    if (f.data.bounded_context !== context) {
      context = f.data.bounded_context;
      out.push('', `### ${context}`);
    }
    out.push(...featureSection(spec, m, f));
  }
  return out;
}

export function renderHuman(spec: SpecModel, m: Messages): string {
  const p = spec.project;
  const agreed = spec.features.filter((f) => f.data.lifecycle !== 'draft');
  const drafts = spec.features.filter((f) => f.data.lifecycle === 'draft');
  const featureName = new Map(spec.features.map((f) => [f.data.id, f.data.name]));
  const sections = [m.product, m.features, m.data, m.workflows, ...(drafts.length ? [m.drafts] : []), m.problems];
  const status = spec.counts.errors ? m.statusErrors(spec.counts.errors, spec.counts.warnings) : spec.counts.warnings ? m.statusWarnings(spec.counts.warnings) : m.statusClean;

  // problems are a highlighted block; a clean model is a plain line
  const out: string[] = [`# ${p.name}: ${m.title}`, '', spec.issues.length ? `> ${status}` : status, '', `*${m.generatedNote}*`, '', `## ${m.contents}`, ''];
  sections.forEach((s, i) => out.push(`${i + 1}. ${s}`));
  let n = 0;
  const h2 = (title: string) => out.push('', `## ${++n}. ${title}`);

  h2(m.product);
  if (p.description) out.push('', p.description);
  if (p.vision) out.push('', `### ${m.vision}`, '', p.vision);
  if (p.goals?.length) {
    out.push('', `### ${m.goals}`, '');
    for (const g of p.goals) out.push(`- **${g.id}** ${cell(g.text)}`);
  }
  if (p.actors?.length) {
    out.push('', `### ${m.actors}`, '', `| ${m.actor} | ${m.description} |`, '| --- | --- |');
    for (const a of p.actors) out.push(`| ${cell(a.name)} | ${cell(a.description)} |`);
  }
  if (p.glossary?.length) {
    out.push('', `### ${m.glossary}`, '', `| ${m.term} | ${m.definition} |`, '| --- | --- |');
    for (const t of p.glossary) out.push(`| ${cell(t.term)} | ${cell(t.definition)} |`);
  }

  h2(m.features);
  out.push(...(agreed.length ? featureGroups(spec, m, agreed) : ['', m.none]));

  h2(m.data);
  for (const entry of spec.objects) {
    const o = forAudience(entry.data, businessObjectSchema, 'human') as Partial<BusinessObject>;
    out.push('', `### ${cell(o.name)} (\`${entry.data.id}\`)`, '', `*${m.lifecycle[entry.data.lifecycle] ?? entry.data.lifecycle}* · ${m.component}: ${entry.component.name}`);
    if (o.tickets?.length) out.push('', `${m.tickets}: ${tickets(spec, o.tickets)}`);
    if (o.description) out.push('', o.description);
    if (o.fields?.length) {
      out.push('', `| ${m.field} | ${m.type} | ${m.description} |`, '| --- | --- | --- |');
      for (const fl of o.fields) out.push(`| ${cell(fl.name)} | \`${cell(fl.type)}\` | ${cell(fl.description)} |`);
    }
    if (entry.usedBy.length) out.push('', `**${m.usedBy}:** ${entry.usedBy.map((u) => `${featureName.get(u.id) ?? u.id} (${u.access === 'write' ? m.write : m.read})`).join(', ')}`);
    out.push(...issueLines(m, entry.issues));
  }
  if (!spec.objects.length) out.push('', m.none);

  h2(m.workflows);
  for (const entry of spec.workflows) {
    const w = forAudience(entry.data, workflowSchema, 'human') as Partial<Workflow>;
    out.push('', `### ${cell(w.name ?? entry.data.workflow)} (\`${entry.data.workflow}\`)`, '', `*${m.lifecycle[entry.data.lifecycle] ?? entry.data.lifecycle ?? '?'}*`);
    if (w.tickets?.length) out.push('', `${m.tickets}: ${tickets(spec, w.tickets)}`);
    if (w.description) out.push('', w.description);
    if (w.steps?.length) {
      out.push('', `**${m.steps}**`, '');
      w.steps.forEach((step, i) => {
        const comp = w.compensations?.[step];
        out.push(`${i + 1}. ${featureName.get(step) ?? step} (\`${step}\`)${comp ? ` — ${m.compensation}: ${featureName.get(comp) ?? comp} (\`${comp}\`)` : ''}`);
      });
    }
    out.push(...issueLines(m, entry.issues));
  }
  if (!spec.workflows.length) out.push('', m.none);

  if (drafts.length) {
    h2(m.drafts);
    out.push('', `*${m.draftsNote}*`, ...featureGroups(spec, m, drafts));
  }

  h2(m.problems);
  if (!spec.issues.length) out.push('', m.statusClean);
  else {
    out.push('', `| ${m.severity} | ${m.entry} | ${m.field} | ${m.message} |`, '| --- | --- | --- | --- |');
    for (const i of spec.issues) out.push(`| ${i.severity === 'error' ? m.error : m.warning} | \`${i.id}\` | ${i.field ? `\`${cell(i.field)}\`` : ''} | ${cell(i.message)} |`);
  }
  return out.join('\n') + '\n';
}
