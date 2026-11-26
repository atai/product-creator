import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { loadOpenApiSpec, operationRef } from '../src/interfaces/openapi';

describe('loadOpenApiSpec', () => {
  it('lists operations of a YAML spec', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-oas-'));
    const file = path.join(dir, 'openapi.yaml');
    fs.writeFileSync(
      file,
      [
        'openapi: 3.0.3',
        'info: { title: Orders, version: "1.2" }',
        'paths:',
        '  /orders:',
        '    get: { operationId: listOrders, tags: [orders] }',
        '    post: { operationId: createOrder }',
        '    parameters: []',
        '',
      ].join('\n')
    );
    const spec = loadOpenApiSpec(file);
    expect(spec).toMatchObject({ title: 'Orders', version: '1.2', openapi: '3.0.3' });
    expect(spec.operations.map((o) => o.key)).toEqual(['GET /orders', 'POST /orders']);
    expect(operationRef('3f0c', spec.operations[1])).toBe('3f0c#POST /orders');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('reports unreadable files instead of throwing', () => {
    const spec = loadOpenApiSpec('/nonexistent/openapi.json');
    expect(spec.operations).toEqual([]);
    expect(spec.error).toBeTruthy();
  });
});
