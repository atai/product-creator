/**
 * Field selection by audience (PRODUCTCREATOR-35). Schemas mark fields `x-audience: human | agent | both`
 * (PRODUCTCREATOR-32); a view keeps the fields for its audience and `both`. Fields without a mark are kept.
 * Nested objects and array items are filtered with their own schema.
 */
export type Audience = 'human' | 'agent';

interface SchemaNode {
  'x-audience'?: 'human' | 'agent' | 'both';
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
}

const visible = (node: SchemaNode | undefined, audience: Audience) => !node?.['x-audience'] || node['x-audience'] === 'both' || node['x-audience'] === audience;

export function forAudience<T>(value: T, schema: object, audience: Audience): T {
  const node = schema as SchemaNode;
  if (Array.isArray(value)) return value.map((item) => forAudience(item, node.items ?? {}, audience)) as T;
  if (value === null || typeof value !== 'object' || !node.properties) return value;
  // keys in schema order, then fields the schema does not know; empty strings and lists are left out
  const record = value as Record<string, unknown>;
  const keys = [...Object.keys(node.properties).filter((k) => k in record), ...Object.keys(record).filter((k) => !(k in (node.properties ?? {})))];
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const child = node.properties[key];
    const v = record[key];
    if (!visible(child, audience) || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    out[key] = child ? forAudience(v, child, audience) : v;
  }
  return out as T;
}
