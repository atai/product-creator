/**
 * Types for Prisma schema parsing
 */

export interface PrismaField {
  name: string;
  type: string;
  isOptional: boolean;
  isList: boolean;
  attributes: PrismaAttribute[];
  documentation?: string;
}

export interface PrismaAttribute {
  name: string;
  args?: string[];
}

export interface PrismaModel {
  name: string;
  fields: PrismaField[];
  attributes: PrismaAttribute[];
  documentation?: string;
  tableName?: string; // From @@map attribute
}

export interface PrismaSchema {
  models: PrismaModel[];
}

