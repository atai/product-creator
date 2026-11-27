import { describe, expect, it } from 'vitest';
import type { ExportedFunction } from '../src/code/types';
import type { Feature } from '../src/types';
import { idPart, matchCodeToFunctions, suggestFeatureId } from '../src/sync/codeMatcher';

const fn = (name: string, relativePath: string): ExportedFunction => ({ name, relativePath, filePath: `/repo/${relativePath}`, lineNumber: 1, isDefault: false, isAsync: false, parameters: [] });
const feature = (id: string, extra: Partial<Feature> = {}): Feature => {
  const [bounded_context, entity, action] = id.split('.');
  return { id, name: id, bounded_context, entity, action, owner: 't', lifecycle: 'active', ...extra };
};

describe('code sync matching (PRODUCTCREATOR-30)', () => {
  it('links code functions to features, lists the rest as candidates, reports stale links', () => {
    const features = [
      feature('orders.order.create'),
      feature('orders.order.cancel', { source_file: 'src/orders.ts', name: 'cancelOrder' }),
      feature('billing.invoice.send', { source_file: 'src/old/invoice.ts' }),
      feature('mail.message.send', { name: 'Send message' }),
    ];
    const code = [fn('createOrder', 'src/orders.ts'), fn('cancelOrder', 'src/orders.ts'), fn('formatDate', 'src/utils/date.ts'), fn('sendMessage', 'src/mail.ts')];
    const result = Object.fromEntries(matchCodeToFunctions(code, features, {}, '', ['src/orders.ts', 'src/utils/date.ts', 'src/mail.ts']).map((m) => [m.exportedFunction.name, m]));
    expect(result.createOrder).toMatchObject({ status: 'proposed', action: 'link', functionId: 'orders.order.create' });
    expect(result.cancelOrder).toMatchObject({ status: 'linked', action: 'skip', functionId: 'orders.order.cancel' });
    expect(result.sendMessage).toMatchObject({ status: 'proposed', functionId: 'mail.message.send' });
    expect(result.formatDate).toMatchObject({ status: 'candidate', action: 'skip', functionId: 'utils.date.format_date' });
    expect(result.formatDate.functionCard).toBeUndefined();
    const stale = Object.values(result).find((m) => m.status === 'stale');
    expect(stale).toMatchObject({ functionId: 'billing.invoice.send', action: 'skip' });
  });

  it('suggested ids follow the feature id pattern', () => {
    expect(idPart('useEntityForm')).toBe('use_entity_form');
    expect(idPart('[id]')).toBe('id');
    expect(suggestFeatureId(fn('GET', 'app/api/marketing-campaigns/[id]/route.ts')).id).toBe('id.route.get');
    expect(suggestFeatureId(fn('useRoots', 'renderer/src/hooks/useRoots.ts')).id).toMatch(/^[a-z0-9_]+\.[a-z0-9_]+\.[a-z0-9_]+$/);
  });
});
