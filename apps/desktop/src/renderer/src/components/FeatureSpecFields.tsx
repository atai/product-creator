import { useFieldArray, type Control, type UseFormRegister } from 'react-hook-form';
import type { Feature, FeatureAcceptance, FeatureCodeRef, FeatureConstraint, FeatureDecision, FeatureQuestion, FeatureRequirement, FeatureScreen } from '@pc/core/types';
import { t } from '@/i18n';

/**
 * Spec fields of a feature (PRODUCTCREATOR-32): actors, requirements, acceptance, constraints, decisions, open questions.
 * In the form, actors are `{ value }` rows and `acceptance.covers` is a comma-separated string; `specFromForm` turns them back.
 */
export interface SpecFormData {
  actors: { value: string }[];
  requirements: FeatureRequirement[];
  acceptance: (Omit<FeatureAcceptance, 'covers'> & { covers: string })[];
  constraints: FeatureConstraint[];
  decisions: FeatureDecision[];
  open_questions: FeatureQuestion[];
  /** comma-separated issue keys (PRODUCTCREATOR-33) */
  tickets: string;
  code_refs: FeatureCodeRef[];
  /** PRODUCTCREATOR-36; actions and viewport are kept from the card (edited in YAML) */
  screens: FeatureScreen[];
}

/** Values of the feature form (FeatureForm): string lists are `{ value }` rows for useFieldArray */
export type FeatureFormData = Omit<Feature, 'tags' | 'emits' | 'consumes' | keyof SpecFormData> &
  SpecFormData & {
    tags: { value: string }[];
    emits: { value: string }[];
    consumes: { value: string }[];
  };

type SpecFields = Pick<Feature, 'actors' | 'requirements' | 'acceptance' | 'constraints' | 'decisions' | 'open_questions' | 'tickets' | 'code_refs' | 'screens'>;

export function specToForm(f: Partial<Feature> | null | undefined): SpecFormData {
  return {
    actors: (f?.actors ?? []).map((value) => ({ value })),
    requirements: f?.requirements ?? [],
    acceptance: (f?.acceptance ?? []).map((a) => ({ ...a, covers: (a.covers ?? []).join(', ') })),
    constraints: f?.constraints ?? [],
    decisions: f?.decisions ?? [],
    open_questions: f?.open_questions ?? [],
    tickets: (f?.tickets ?? []).join(', '),
    code_refs: f?.code_refs ?? [],
    screens: f?.screens ?? [],
  };
}

/** Drop empty strings and empty optional values, so the YAML stays clean and the schema (minLength 1) passes */
function compact<T extends object>(item: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(item)) {
    const value = typeof v === 'string' ? v.trim() : v;
    if (value === '' || value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[k] = value;
  }
  return out as T;
}

/** Form values → feature spec fields; empty lists are left out */
export function specFromForm(d: Partial<SpecFormData>): SpecFields {
  const spec: SpecFields = {
    actors: (d.actors ?? []).map((a) => a.value.trim()).filter(Boolean),
    requirements: (d.requirements ?? []).map(compact).filter((r) => r.text),
    acceptance: (d.acceptance ?? [])
      .map(({ covers, ...a }) => compact({ ...a, covers: covers.split(/[\s,]+/).filter(Boolean) }))
      .filter((a) => a.then || a.text || a.given || a.when),
    constraints: (d.constraints ?? []).map(compact).filter((c) => c.text),
    decisions: (d.decisions ?? []).map(compact).filter((x) => x.decision),
    open_questions: (d.open_questions ?? []).map(compact).filter((q) => q.question),
    tickets: (d.tickets ?? '').split(/[\s,]+/).filter(Boolean),
    code_refs: (d.code_refs ?? []).map(compact).filter((c) => c.component && c.file),
    screens: (d.screens ?? []).map(compact).filter((s) => s.title && s.path),
  };
  for (const key of Object.keys(spec) as (keyof SpecFields)[]) if (!spec[key]?.length) delete spec[key];
  return spec;
}

/** Next free local id: R1, R2, … (removed ids are not reused while later ones exist) */
const nextId = (prefix: string, items: { id?: string }[]) =>
  `${prefix}${Math.max(0, ...items.map((i) => Number(String(i.id ?? '').slice(prefix.length)) || 0)) + 1}`;

const input = 'w-full px-3 py-2 border border-border-strong rounded bg-surface text-fg placeholder-meta';
const idInput = 'w-16 px-2 py-2 border border-border-strong rounded bg-surface-muted text-meta font-mono text-sm';
const select = 'px-2 py-2 border border-border-strong rounded bg-surface text-fg self-start';
const removeBtn = 'px-3 py-2 bg-danger-fill text-on rounded hover:bg-danger-fill-hover self-start';
const addBtn = 'px-3 py-2 bg-surface-strong text-fg-2 rounded hover:bg-surface-stronger text-sm';

type ListName = 'requirements' | 'acceptance' | 'constraints' | 'decisions' | 'open_questions' | 'screens';
type Form = { control: Control<FeatureFormData>; register: UseFormRegister<FeatureFormData> };

const EMPTY: { [K in ListName]: Omit<FeatureFormData[K][number], 'id'> } = {
  requirements: { text: '', priority: 'must' },
  acceptance: { covers: '', given: '', when: '', then: '', text: '', verify: '' },
  constraints: { text: '', kind: 'other' },
  decisions: { decision: '', reason: '', date: '', status: 'accepted' },
  open_questions: { question: '', owner: '' },
  screens: { title: '', path: '', wait: '', element: '' },
};
const PREFIX: Record<ListName, string> = { requirements: 'R', acceptance: 'A', constraints: 'C', decisions: 'D', open_questions: 'Q', screens: 'S' };

function SpecList({ control, register, name, label, hint, addLabel, children }: Form & { name: ListName; label: string; hint: string; addLabel: string; children: (index: number) => React.ReactNode }) {
  const { fields, append, remove } = useFieldArray({ control, name, keyName: 'key' });
  const add = () => {
    const item = { ...EMPTY[name], id: nextId(PREFIX[name], fields) };
    if (name === 'decisions') Object.assign(item, { date: new Date().toISOString().slice(0, 10) });
    append(item as FeatureFormData[typeof name][number]);
  };
  return (
    <div>
      <label className="block text-sm font-medium mb-1 text-fg-2">{label}</label>
      <p className="text-xs text-meta mb-2">{hint}</p>
      <div className="space-y-2">
        {fields.map((field, index) => (
          <div key={field.key} className="flex gap-2">
            <input {...register(`${name}.${index}.id`)} className={idInput} readOnly />
            <div className="flex-1 space-y-1">{children(index)}</div>
            <button type="button" onClick={() => remove(index)} className={removeBtn}>
              ✕
            </button>
          </div>
        ))}
        <button type="button" onClick={add} className={addBtn}>
          {addLabel}
        </button>
      </div>
    </div>
  );
}

export default function FeatureSpecFields({ control, register }: Form) {
  const actors = useFieldArray({ control, name: 'actors' });
  const codeRefs = useFieldArray({ control, name: 'code_refs' });
  const form = { control, register };

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <h2 className="text-lg font-semibold">{t('sf.links')}</h2>

      <div>
        <label className="block text-sm font-medium mb-1 text-fg-2">{t('sf.tickets')}</label>
        <p className="text-xs text-meta mb-2">{t('sf.ticketsHint')}</p>
        <input {...register('tickets')} className={input} placeholder="PRODUCTCREATOR-34, #12" />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 text-fg-2">{t('sf.alsoIn')}</label>
        <p className="text-xs text-meta mb-2">{t('sf.alsoInHint')}</p>
        <div className="space-y-2">
          {codeRefs.fields.map((field, index) => (
            <div key={field.id} className="flex gap-2">
              <input {...register(`code_refs.${index}.component`)} className="w-32 px-3 py-2 border border-border-strong rounded bg-surface text-fg placeholder-meta" placeholder={t('sf.component')} />
              <input {...register(`code_refs.${index}.file`)} className={`${input} font-mono text-sm`} placeholder="renderer/src/pages/doc.tsx" />
              <input {...register(`code_refs.${index}.role`)} className="w-28 px-3 py-2 border border-border-strong rounded bg-surface text-fg placeholder-meta" placeholder="UI" />
              <button type="button" onClick={() => codeRefs.remove(index)} className={removeBtn}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" onClick={() => codeRefs.append({ component: '', file: '', role: '' })} className={addBtn}>
            {t('sf.addPlace')}
          </button>
        </div>
      </div>

      <h2 className="text-lg font-semibold pt-2">{t('sf.spec')}</h2>

      <div>
        <label className="block text-sm font-medium mb-1 text-fg-2">{t('sf.actors')}</label>
        <p className="text-xs text-meta mb-2">{t('sf.actorsHint')}</p>
        <div className="space-y-2">
          {actors.fields.map((field, index) => (
            <div key={field.id} className="flex gap-2">
              <input {...register(`actors.${index}.value`)} className={input} placeholder={t('sf.actorPlaceholder')} />
              <button type="button" onClick={() => actors.remove(index)} className={removeBtn}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" onClick={() => actors.append({ value: '' })} className={addBtn}>
            {t('sf.addActor')}
          </button>
        </div>
      </div>

      <SpecList {...form} name="requirements" label={t('sf.requirements')} hint={t('sf.requirementsHint')} addLabel={t('sf.addRequirement')}>
        {(i) => (
          <div className="flex gap-2">
            <textarea {...register(`requirements.${i}.text`)} className={input} rows={2} placeholder={t('sf.requirementPlaceholder')} />
            <select {...register(`requirements.${i}.priority`)} className={select}>
              <option value="must">{t('sf.priority.must')}</option>
              <option value="should">{t('sf.priority.should')}</option>
              <option value="could">{t('sf.priority.could')}</option>
            </select>
          </div>
        )}
      </SpecList>

      <SpecList {...form} name="acceptance" label={t('sf.acceptance')} hint={t('sf.acceptanceHint')} addLabel={t('sf.addCriterion')}>
        {(i) => (
          <>
            {(['covers', 'given', 'when', 'then', 'text', 'verify'] as const).map((key) => (
              <label key={key} className="flex gap-2 items-center">
                <span className="w-14 shrink-0 text-xs text-meta">{t(`sf.field.${key}`)}</span>
                <input {...register(`acceptance.${i}.${key}`)} className={key === 'verify' ? `${input} font-mono text-sm` : input} placeholder={ACCEPTANCE_HINTS[key]()} />
              </label>
            ))}
          </>
        )}
      </SpecList>

      <SpecList {...form} name="constraints" label={t('sf.constraints')} hint={t('sf.constraintsHint')} addLabel={t('sf.addConstraint')}>
        {(i) => (
          <div className="flex gap-2">
            <select {...register(`constraints.${i}.kind`)} className={select}>
              {CONSTRAINT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`sf.kind.${k}`)}
                </option>
              ))}
            </select>
            <input {...register(`constraints.${i}.text`)} className={input} placeholder={t('sf.constraintPlaceholder')} />
          </div>
        )}
      </SpecList>

      <SpecList {...form} name="decisions" label={t('sf.decisions')} hint={t('sf.decisionsHint')} addLabel={t('sf.addDecision')}>
        {(i) => (
          <>
            <input {...register(`decisions.${i}.decision`)} className={input} placeholder={t('sf.decisionPlaceholder')} />
            <textarea {...register(`decisions.${i}.reason`)} className={input} rows={2} placeholder={t('sf.reasonPlaceholder')} />
            <div className="flex gap-2">
              <input {...register(`decisions.${i}.date`)} className={input} placeholder="YYYY-MM-DD" />
              <select {...register(`decisions.${i}.status`)} className={select}>
                <option value="accepted">{t('sf.status.accepted')}</option>
                <option value="superseded">{t('sf.status.superseded')}</option>
              </select>
            </div>
          </>
        )}
      </SpecList>

      <SpecList {...form} name="screens" label={t('sf.screens')} hint={t('sf.screensHint')} addLabel={t('sf.addScreen')}>
        {(i) => (
          <>
            <input {...register(`screens.${i}.title`)} className={input} placeholder={t('sf.screenTitle')} />
            <input {...register(`screens.${i}.path`)} className={`${input} font-mono text-sm`} placeholder={t('sf.screenPath')} />
            <div className="flex gap-2">
              <input {...register(`screens.${i}.wait`)} className={`${input} font-mono text-sm`} placeholder={t('sf.screenWait')} />
              <input {...register(`screens.${i}.element`)} className={`${input} font-mono text-sm`} placeholder={t('sf.screenElement')} />
            </div>
          </>
        )}
      </SpecList>

      <SpecList {...form} name="open_questions" label={t('sf.questions')} hint={t('sf.questionsHint')} addLabel={t('sf.addQuestion')}>
        {(i) => (
          <div className="flex gap-2">
            <input {...register(`open_questions.${i}.question`)} className={input} placeholder={t('sf.questionPlaceholder')} />
            <input {...register(`open_questions.${i}.owner`)} className="w-40 px-3 py-2 border border-border-strong rounded bg-surface text-fg placeholder-meta" placeholder={t('sf.ownerPlaceholder')} />
          </div>
        )}
      </SpecList>
    </div>
  );
}

/** Placeholders, read at render time (the UI language is set before the first render) */
const ACCEPTANCE_HINTS = {
  covers: () => 'R1, R2',
  given: () => t('sf.hint.given'),
  when: () => t('sf.hint.when'),
  then: () => t('sf.hint.then'),
  text: () => t('sf.hint.text'),
  verify: () => 'pnpm --filter @pc/core test validation',
} as const;

const CONSTRAINT_KINDS: NonNullable<FeatureConstraint['kind']>[] = ['performance', 'security', 'reliability', 'compatibility', 'usability', 'compliance', 'other'];
