import * as fs from 'fs';
import '../server-only';
import { PrismaModel, PrismaField, PrismaAttribute } from './types';

// Dynamic import path to avoid Turbopack static analysis
// Using a variable prevents Turbopack from trying to resolve the module path at build time
const PRISMA_INTERNALS_MODULE = '@prisma/internals';

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

/**
 * Parse Prisma schema file and extract models
 * Uses @prisma/internals for parsing (loaded dynamically to avoid WASM issues in Turbopack)
 */
export async function parsePrismaSchema(schemaPath: string): Promise<PrismaModel[]> {
  // Dynamic import using a variable path to prevent Turbopack from statically analyzing
  // This ensures WASM files are only loaded at runtime, not during module evaluation
  type GetDMMF = (options: { datamodel: string }) => Promise<{ datamodel?: { models?: DmmfModel[] } }>;
  const internals = (await import(PRISMA_INTERNALS_MODULE)) as { getDMMF?: GetDMMF; default?: { getDMMF?: GetDMMF } };
  // ESM import of the CommonJS package exposes it either directly or under `default` (Electron main bundle)
  const getDMMF = internals.getDMMF ?? internals.default?.getDMMF;
  if (!getDMMF) throw new Error('@prisma/internals: getDMMF not found');
  
  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
  const dmmf = await getDMMF({ datamodel: withDatasourceUrl(schemaContent) });
  
  if (!dmmf || !dmmf.datamodel || !dmmf.datamodel.models) {
    throw new Error('Failed to parse Prisma schema: invalid DMMF structure');
  }

  return dmmf.datamodel.models.map((model: DmmfModel) => convertToPrismaModel(model));
}

/**
 * Convert Prisma DMMF model to our PrismaModel format
 */
function convertToPrismaModel(dmmfModel: DmmfModel): PrismaModel {
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
      type: field.type,
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

