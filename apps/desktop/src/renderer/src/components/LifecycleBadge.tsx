import type { Lifecycle } from '@pc/core/types';

/** Lifecycle badge of a feature or business object (PRODUCTCREATOR-32) */
const CLASSES: Record<Lifecycle, string> = {
  draft: 'bg-warn-muted text-warn-fg',
  approved: 'bg-accent-muted text-accent-fg',
  implemented: 'bg-success-muted text-success-fg',
  deprecated: 'bg-secondary-soft text-secondary-soft-fg',
  removed: 'bg-surface-muted text-fg',
};

export default function LifecycleBadge({ lifecycle, className = 'px-2 py-1' }: { lifecycle: string; className?: string }) {
  const tone = CLASSES[lifecycle as Lifecycle] ?? 'bg-danger-soft text-danger-fg-strong';
  return <span className={`inline-block text-xs rounded ${className} ${tone}`}>{lifecycle}</span>;
}
