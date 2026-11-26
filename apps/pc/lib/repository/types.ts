/**
 * Common repository types and interfaces
 */

export interface SaveResult {
  success: boolean;
  error?: string;
}

export interface IRepository<T, ID = string> {
  getAll(): T[];
  getById(id: ID): T | null;
  save(data: T, targetRoot: string): Promise<SaveResult>;
}

export interface EntityConfig<T> {
  tableName: string;
  subdirectory: string;
  getIdField: (entity: T) => string;
  getFileName: (entity: T) => string;
  getFilePath?: (entity: T, targetRoot: string, subdirectory: string) => string;
  validateRequired: (entity: T) => string | null;
  toRow: (entity: T, filePath: string) => Record<string, unknown>;
  fromRow: (row: Record<string, unknown>) => T;
}
