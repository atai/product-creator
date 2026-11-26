import * as fs from 'fs';
import * as path from 'path';
import yaml from 'js-yaml';

/**
 * Interface specifications (PRODUCTCREATOR-9, first step).
 *
 * Services publish their interfaces as OpenAPI documents. Product Creator imports the
 * operations and (next steps) links function cards to them:
 *  - provider side: a function `implements` an operation of its own service;
 *  - consumer side: a function `calls` an operation of another service/project.
 * This gives a cross-service / cross-project trace: feature -> function -> operation -> function.
 */

export const HTTP_METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;
export type HttpMethod = Uppercase<(typeof HTTP_METHODS)[number]>;

export interface InterfaceOperation {
  /** Stable key: `<METHOD> <path>` (operationId may be missing or change) */
  key: string;
  method: HttpMethod;
  path: string;
  operationId?: string;
  summary?: string;
  tags?: string[];
  deprecated?: boolean;
}

export interface InterfaceSpec {
  /** Absolute path of the spec file */
  file: string;
  title?: string;
  version?: string;
  openapi?: string;
  operations: InterfaceOperation[];
  error?: string;
}

/** Role of a function in relation to an interface operation */
export type InterfaceLinkRole = 'implements' | 'calls';

/** Link between a function card and an operation (stored in the card in a later step) */
export interface InterfaceLink {
  functionId: string;
  /** App (service) that owns the function */
  appId: string;
  role: InterfaceLinkRole;
  /** `<appId>#<METHOD> <path>` of the provider operation */
  operationRef: string;
}

interface OpenApiDocument {
  openapi?: string;
  swagger?: string;
  info?: { title?: string; version?: string };
  paths?: Record<string, Record<string, { operationId?: string; summary?: string; tags?: string[]; deprecated?: boolean } | unknown>>;
}

export function operationRef(appId: string, operation: Pick<InterfaceOperation, 'key'>): string {
  return `${appId}#${operation.key}`;
}

/** Parse an OpenAPI 3.x / Swagger 2 document (JSON or YAML) and list its operations */
export function loadOpenApiSpec(file: string): InterfaceSpec {
  const abs = path.resolve(file);
  try {
    const content = fs.readFileSync(abs, 'utf-8');
    const doc = (abs.endsWith('.json') ? JSON.parse(content) : yaml.load(content)) as OpenApiDocument;
    const operations: InterfaceOperation[] = [];
    for (const [opPath, item] of Object.entries(doc?.paths ?? {})) {
      for (const [method, raw] of Object.entries(item ?? {})) {
        if (!(HTTP_METHODS as readonly string[]).includes(method)) continue;
        const op = (raw ?? {}) as { operationId?: string; summary?: string; tags?: string[]; deprecated?: boolean };
        const upper = method.toUpperCase() as HttpMethod;
        operations.push({
          key: `${upper} ${opPath}`,
          method: upper,
          path: opPath,
          operationId: op.operationId,
          summary: op.summary,
          tags: op.tags,
          deprecated: op.deprecated,
        });
      }
    }
    return {
      file: abs,
      title: doc?.info?.title,
      version: doc?.info?.version,
      openapi: doc?.openapi ?? doc?.swagger,
      operations,
    };
  } catch (error) {
    return { file: abs, operations: [], error: error instanceof Error ? error.message : String(error) };
  }
}
