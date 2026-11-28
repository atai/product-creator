import * as fs from 'fs';
import '../server-only';
import { PrismaModel, PrismaField, PrismaAttribute } from './types';

// Only the Prisma schema parser (WASM, ~3 MB) is needed to get the DMMF. @prisma/internals also shipped
// the query/schema engines and their deps (~70 MB of the desktop package), see PRODUCTCREATOR-21.
// Dynamic import so the WASM package is loaded only when a schema is parsed
const PRISMA_SCHEMA_WASM_MODULE = '@prisma/prisma-schema-wasm';

/**
 * Prisma 7 schemas keep the connection URL in prisma.config.ts, but the Prisma 6 parser
 * requires `url` in the datasource block. Only the data model is needed here, so add a placeholder.
 */
export function withDatasourceUrl(schema: string): string {
  return schema.replace(/datasource\s+\w+\s*\{[^}]*\}/g, (block) =>
    /\burl\s*=/.test(block) ? block : block.replace(/\}\s*$/, '  url = env("PC_PRISMA_PLACEHOLDER_URL")\n}')
  );
}

/** Subset of the Prisma DMMF field used by this converter */
interface DmmfField {
  name: string;
  type: string;
  /** scalar | object (relation) | enum */
  kind?: string;
  dbName?: string | null;
  isId?: boolean;
  isUnique?: boolean;
  isRequired?: boolean;
  isList?: boolean;
  default?: { toString(): string } | null;
  documentation?: string;
}

/** Subset of the Prisma DMMF model used by this converter */
interface DmmfModel {
  name: string;
  dbName?: string | null;
  fields: DmmfField[];
  documentation?: string;
}

/** Error thrown by the WASM parser: a JSON string with `error_code` and `message` */
function prismaErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  try {
    const parsed = JSON.parse(raw) as { message?: string };
    // eslint-disable-next-line no-control-regex
    return (parsed.message ?? raw).replace(/\u001b\[[0-9;]*m/g, '');
  } catch {
    return raw;
  }
}

/**
 * Parse Prisma schema file and extract models
 * Uses @prisma/prisma-schema-wasm (get_dmmf) for parsing, loaded lazily on first use
 */
export async function parsePrismaSchema(schemaPath: string): Promise<PrismaModel[]> {
  type GetDmmf = (params: string) => string;
  const wasm = (await import(PRISMA_SCHEMA_WASM_MODULE)) as { get_dmmf?: GetDmmf; default?: { get_dmmf?: GetDmmf } };
  // ESM import of the CommonJS package exposes it either directly or under `default` (Electron main bundle)
  const getDmmf = wasm.get_dmmf ?? wasm.default?.get_dmmf;
  if (!getDmmf) throw new Error('@prisma/prisma-schema-wasm: get_dmmf not found');

  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
  let dmmf: { datamodel?: { models?: DmmfModel[]; enums?: { name: string; values: { name: string }[] }[] } };
  try {
    dmmf = JSON.parse(getDmmf(JSON.stringify({ prismaSchema: withDatasourceUrl(schemaContent) })));
  } catch (error) {
    throw new Error(`Failed to parse Prisma schema ${schemaPath}: ${prismaErrorMessage(error)}`);
  }

  if (!dmmf || !dmmf.datamodel || !dmmf.datamodel.models) {
    throw new Error('Failed to parse Prisma schema: invalid DMMF structure');
  }

  // enum fields become `enum<A|B>`: a scalar type validation accepts (PRODUCTCREATOR-34), not a relation
  const enums = new Map((dmmf.datamodel.enums ?? []).map((e) => [e.name, `enum<${e.values.map((v) => v.name).join('|')}>`]));
  return dmmf.datamodel.models.map((model: DmmfModel) => convertToPrismaModel(model, enums));
}

/**
 * Convert Prisma DMMF model to our PrismaModel format
 */
function convertToPrismaModel(dmmfModel: DmmfModel, enums: Map<string, string> = new Map()): PrismaModel {
  const attributes: PrismaAttribute[] = [];
  let tableName: string | undefined;

  // Extract @@map attribute for table name
  if (dmmfModel.dbName) {
    tableName = dmmfModel.dbName;
    attributes.push({ name: '@@map', args: [dmmfModel.dbName] });
  }

  const fields: PrismaField[] = dmmfModel.fields.map((field: DmmfField) => {
    const fieldAttributes: PrismaAttribute[] = [];
    
    // Extract @map attribute for column name
    if (field.dbName && field.dbName !== field.name) {
      fieldAttributes.push({ name: '@map', args: [field.dbName] });
    }

    // Extract other attributes
    if (field.isId) {
      fieldAttributes.push({ name: '@id' });
    }
    if (field.isUnique) {
      fieldAttributes.push({ name: '@unique' });
    }
    if (field.default) {
      fieldAttributes.push({ name: '@default', args: [field.default.toString()] });
    }

    return {
      name: field.name,
      type: field.kind === 'enum' ? enums.get(field.type) ?? field.type : field.type,
      isOptional: !field.isRequired,
      isList: field.isList || false,
      attributes: fieldAttributes,
      documentation: field.documentation,
    };
  });

  return {
    name: dmmfModel.name,
    fields,
    attributes,
    documentation: dmmfModel.documentation,
    tableName,
  };
}

