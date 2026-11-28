import { useFieldArray, type Control, type UseFormRegister } from 'react-hook-form';
import type { Feature, FeatureAcceptance, FeatureCodeRef, FeatureConstraint, FeatureDecision, FeatureQuestion, FeatureRequirement, FeatureScreen } from '@pc/core/types';

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
      <h2 className="text-lg font-semibold">Links</h2>

      <div>
        <label className="block text-sm font-medium mb-1 text-fg-2">Tickets</label>
        <p className="text-xs text-meta mb-2">Tracker issues the feature is planned or built in.</p>
        <input {...register('tickets')} className={input} placeholder="PRODUCTCREATOR-34, #12" />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1 text-fg-2">Also implemented in</label>
        <p className="text-xs text-meta mb-2">Other places of the implementation (UI page, API route, CLI), in this or another component. The main file is Source file, set by code sync.</p>
        <div className="space-y-2">
          {codeRefs.fields.map((field, index) => (
            <div key={field.id} className="flex gap-2">
              <input {...register(`code_refs.${index}.component`)} className="w-32 px-3 py-2 border border-border-strong rounded bg-surface text-fg placeholder-meta" placeholder="component" />
              <input {...register(`code_refs.${index}.file`)} className={`${input} font-mono text-sm`} placeholder="renderer/src/pages/doc.tsx" />
              <input {...register(`code_refs.${index}.role`)} className="w-28 px-3 py-2 border border-border-strong rounded bg-surface text-fg placeholder-meta" placeholder="UI" />
              <button type="button" onClick={() => codeRefs.remove(index)} className={removeBtn}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" onClick={() => codeRefs.append({ component: '', file: '', role: '' })} className={addBtn}>
            + Add place
          </button>
        </div>
      </div>

      <h2 className="text-lg font-semibold pt-2">Spec</h2>

      <div>
        <label className="block text-sm font-medium mb-1 text-fg-2">Actors</label>
        <p className="text-xs text-meta mb-2">Who uses the feature: roles of people or systems.</p>
        <div className="space-y-2">
          {actors.fields.map((field, index) => (
            <div key={field.id} className="flex gap-2">
              <input {...register(`actors.${index}.value`)} className={input} placeholder="project owner, AI agent, CI…" />
              <button type="button" onClick={() => actors.remove(index)} className={removeBtn}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" onClick={() => actors.append({ value: '' })} className={addBtn}>
            + Add actor
          </button>
        </div>
      </div>

      <SpecList {...form} name="requirements" label="Requirements" hint="What the feature must do: one testable statement per item." addLabel="+ Add requirement">
        {(i) => (
          <div className="flex gap-2">
            <textarea {...register(`requirements.${i}.text`)} className={input} rows={2} placeholder="The agent can …" />
            <select {...register(`requirements.${i}.priority`)} className={select}>
              <option value="must">must</option>
              <option value="should">should</option>
              <option value="could">could</option>
            </select>
          </div>
        )}
      </SpecList>

      <SpecList {...form} name="acceptance" label="Acceptance criteria" hint="How to check that it is done: given / when / then, or one sentence. Covers: requirement ids (R1, R2)." addLabel="+ Add criterion">
        {(i) => (
          <>
            {(['covers', 'given', 'when', 'then', 'text', 'verify'] as const).map((key) => (
              <label key={key} className="flex gap-2 items-center">
                <span className="w-14 shrink-0 text-xs text-meta">{key}</span>
                <input {...register(`acceptance.${i}.${key}`)} className={key === 'verify' ? `${input} font-mono text-sm` : input} placeholder={ACCEPTANCE_HINTS[key]} />
              </label>
            ))}
          </>
        )}
      </SpecList>

      <SpecList {...form} name="constraints" label="Constraints" hint="Non-functional requirements and limits, measurable where possible." addLabel="+ Add constraint">
        {(i) => (
          <div className="flex gap-2">
            <select {...register(`constraints.${i}.kind`)} className={select}>
              {CONSTRAINT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <input {...register(`constraints.${i}.text`)} className={input} placeholder="responds in < 200 ms" />
          </div>
        )}
      </SpecList>

      <SpecList {...form} name="decisions" label="Decisions" hint="What was decided for this feature and why." addLabel="+ Add decision">
        {(i) => (
          <>
            <input {...register(`decisions.${i}.decision`)} className={input} placeholder="decision" />
            <textarea {...register(`decisions.${i}.reason`)} className={input} rows={2} placeholder="why; rejected alternatives" />
            <div className="flex gap-2">
              <input {...register(`decisions.${i}.date`)} className={input} placeholder="YYYY-MM-DD" />
              <select {...register(`decisions.${i}.status`)} className={select}>
                <option value="accepted">accepted</option>
                <option value="superseded">superseded</option>
              </select>
            </div>
          </>
        )}
      </SpecList>

      <SpecList {...form} name="screens" label="Screens" hint="Screenshots of the UI for the spec, captured by the project's capture command (screenshots in product-creator.yml). Click/fill actions and viewport: in the YAML." addLabel="+ Add screen">
        {(i) => (
          <>
            <input {...register(`screens.${i}.title`)} className={input} placeholder="caption: The feature form" />
            <input {...register(`screens.${i}.path`)} className={`${input} font-mono text-sm`} placeholder="path: /features/new" />
            <div className="flex gap-2">
              <input {...register(`screens.${i}.wait`)} className={`${input} font-mono text-sm`} placeholder="wait for selector (optional)" />
              <input {...register(`screens.${i}.element`)} className={`${input} font-mono text-sm`} placeholder="capture element (optional)" />
            </div>
          </>
        )}
      </SpecList>

      <SpecList {...form} name="open_questions" label="Open questions" hint="Not answered yet. When answered, turn the question into a decision." addLabel="+ Add question">
        {(i) => (
          <div className="flex gap-2">
            <input {...register(`open_questions.${i}.question`)} className={input} placeholder="question" />
            <input {...register(`open_questions.${i}.owner`)} className="w-40 px-3 py-2 border border-border-strong rounded bg-surface text-fg placeholder-meta" placeholder="owner" />
          </div>
        )}
      </SpecList>
    </div>
  );
}

const ACCEPTANCE_HINTS = {
  covers: 'R1, R2',
  given: 'precondition',
  when: 'action',
  then: 'expected result',
  text: 'or the whole criterion as one sentence',
  verify: 'pnpm --filter @pc/core test validation',
} as const;

const CONSTRAINT_KINDS: NonNullable<FeatureConstraint['kind']>[] = ['performance', 'security', 'reliability', 'compatibility', 'usability', 'compliance', 'other'];
