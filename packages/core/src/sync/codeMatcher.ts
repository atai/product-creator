import { ExportedFunction } from '../code/types';
import { Feature } from '../types';
import { SyncMapping } from './mappingStorage';

/**
 * Code sync (PRODUCTCREATOR-30): code functions are the implementation of features, not features themselves.
 * The sync links exported code functions to existing features (`source_file`, `calls`) and lists the rest as
 * candidates; it does not create a feature per exported function unless asked to (action `create`).
 *
 *   linked     the feature already points to this code (source_file) — skip
 *   proposed   an existing feature matches (mapping, same file + name, or name ↔ entity/action) — link
 *   candidate  no feature matches — skip by default; create a feature or link it by hand
 *   stale      a feature points to a file that is no longer in the code base — skip by default; unlink clears source_file
 */
export type SyncAction = 'skip' | 'link' | 'create' | 'unlink' | 'update' | 'delete';

/** Actions accepted by the sync routes; `update` and `delete` are the old names of `link` and `unlink` */
export const CODE_SYNC_ACTIONS: SyncAction[] = ['skip', 'link', 'create', 'unlink', 'update', 'delete'];

export const normalizeCodeAction = (action: SyncAction): 'skip' | 'link' | 'create' | 'unlink' =>
  action === 'update' ? 'link' : action === 'delete' ? 'unlink' : action;

export type MatchStatus = 'linked' | 'proposed' | 'candidate' | 'stale';

export interface MatchedFunction {
  exportedFunction: ExportedFunction;
  /** The feature this code function implements (linked / proposed / stale) */
  functionCard?: Feature;
  action: SyncAction;
  status: MatchStatus;
  /** Feature id: the matched one, or the id `create` would use */
  functionId?: string;
  /** Why the feature was proposed */
  reason?: string;
  changes?: string[];
}

/** Compact key for name matching: `createOrder`, `create_order`, `Create order` → `createorder` */
export const nameKey = (value?: string | null): string => (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** One id part matching ^[a-z0-9_]+$: `useEntityForm` → `use_entity_form`, `[id]` → `id` */
export function idPart(value: string, fallback = 'default'): string {
  const part = value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return part || fallback;
}

const SKIP_DIRS = new Set(['src', 'lib', 'app', 'index', 'renderer', 'main']);

/** Feature id for `create`: <folder>.<file>.<function>, every part sanitised to the id pattern */
export function suggestFeatureId(fn: ExportedFunction): { id: string; bounded_context: string; entity: string; action: string } {
  const parts = fn.relativePath
    .replace(/\.(c|m)?[jt]sx?$/, '')
    .split(/[/\\]/)
    .filter((p) => p && !SKIP_DIRS.has(p.toLowerCase()));
  const entity = idPart(parts[parts.length - 1] ?? 'default');
  const bounded_context = idPart(parts.length > 1 ? parts[parts.length - 2] : parts[0] ?? 'default');
  const action = idPart(fn.name || 'default');
  return { id: `${bounded_context}.${entity}.${action}`, bounded_context, entity, action };
}

const sameFile = (a?: string, b?: string) => Boolean(a && b && a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase());

/** Does the feature describe this code function? (name, action, action+entity, entity+action) */
function nameMatches(fn: ExportedFunction, f: Feature): boolean {
  const key = nameKey(fn.name);
  if (!key) return false;
  return [f.name, f.action, `${f.action}${f.entity}`, `${f.entity}${f.action}`].some((v) => nameKey(v) === key);
}

export function matchCodeToFunctions(
  exportedFunctions: ExportedFunction[],
  existingFeatures: Feature[],
  mapping: SyncMapping,
  _featuresDirectory?: string,
  /** All analysed source files (relative); default: the files of the exported functions */
  sourceFiles?: string[]
): MatchedFunction[] {
  const matched: MatchedFunction[] = [];
  const used = new Set<string>();
  const byId = new Map(existingFeatures.map((f) => [f.id, f]));
  const codeFiles = new Set((sourceFiles ?? exportedFunctions.map((fn) => fn.relativePath)).map((file) => file.replace(/\\/g, '/').toLowerCase()));

  const linked = (fn: ExportedFunction, f: Feature, reason: string): MatchedFunction => {
    used.add(f.id);
    const already = sameFile(f.source_file, fn.relativePath);
    return {
      exportedFunction: fn,
      functionCard: f,
      functionId: f.id,
      status: already ? 'linked' : 'proposed',
      action: already ? 'skip' : 'link',
      reason,
      changes: already ? undefined : [`source_file: ${f.source_file ?? '(none)'} → ${fn.relativePath}`],
    };
  };

  // 1. previous syncs (mapping) and features already pointing to the file
  const pending: ExportedFunction[] = [];
  for (const fn of exportedFunctions) {
    if (!fn.name) continue;
    const entry = mapping[`${fn.relativePath}:${fn.name}`];
    const fromMapping = entry ? byId.get(entry.businessObjectId) : undefined;
    if (fromMapping && !used.has(fromMapping.id)) {
      matched.push(linked(fn, fromMapping, 'linked by an earlier sync'));
      continue;
    }
    const inFile = existingFeatures.find((f) => !used.has(f.id) && sameFile(f.source_file, fn.relativePath) && nameMatches(fn, f));
    if (inFile) {
      matched.push(linked(fn, inFile, 'same file and name'));
      continue;
    }
    pending.push(fn);
  }

  // 2. features without code yet whose name or entity/action matches the code function
  for (const fn of pending) {
    const candidates = existingFeatures.filter((f) => !used.has(f.id) && !f.source_file && nameMatches(fn, f));
    if (candidates.length === 1) {
      matched.push(linked(fn, candidates[0], 'name matches the feature name or entity/action'));
      continue;
    }
    const suggestion = suggestFeatureId(fn);
    matched.push({
      exportedFunction: fn,
      status: 'candidate',
      action: 'skip',
      functionId: suggestion.id,
      reason: candidates.length > 1 ? `several features match: ${candidates.map((f) => f.id).join(', ')}` : 'no feature describes this code function',
    });
  }

  // 3. features that point to a file which is not in the code base any more
  for (const f of existingFeatures) {
    if (!f.source_file || used.has(f.id) || codeFiles.has(f.source_file.replace(/\\/g, '/').toLowerCase())) continue;
    matched.push({
      exportedFunction: { name: f.name, filePath: '', relativePath: f.source_file, lineNumber: 0, isDefault: false, isAsync: false, parameters: [] },
      functionCard: f,
      functionId: f.id,
      status: 'stale',
      action: 'skip',
      reason: `${f.source_file} is not in the code base`,
    });
  }
  return matched;
}
