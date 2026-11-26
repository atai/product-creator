import * as fs from 'fs';
import '@/lib/server-only';
import { PrismaModel, PrismaField, PrismaAttribute } from './types';

// Dynamic import path to avoid Turbopack static analysis
// Using a variable prevents Turbopack from trying to resolve the module path at build time
const PRISMA_INTERNALS_MODULE = '@prisma/internals';

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
  const { getDMMF } = await import(PRISMA_INTERNALS_MODULE);
  
  const schemaContent = fs.readFileSync(schemaPath, 'utf-8');
  const dmmf = await getDMMF({ datamodel: schemaContent });
  
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

