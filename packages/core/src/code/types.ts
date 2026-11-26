/**
 * Types for code analysis and parsing
 */

/**
 * Represents an exported function found in source code
 */
export interface ExportedFunction {
  name: string;
  filePath: string;
  relativePath: string;
  lineNumber: number;
  isDefault: boolean;
  isAsync: boolean;
  parameters: string[];
  bodyText?: string;
}

/**
 * Represents a function call found in code
 */
export interface FunctionCall {
  functionName: string;
  lineNumber: number;
  isMethodCall: boolean;
  objectName?: string; // For method calls like obj.method()
}

/**
 * Represents a parsed source file with its functions and imports
 */
export interface ParsedFile {
  filePath: string;
  relativePath: string;
  exportedFunctions: ExportedFunction[];
  imports: ImportInfo[];
  functionCalls: Map<string, FunctionCall[]>; // Map of function name to calls
}

/**
 * Import information from a file
 */
export interface ImportInfo {
  modulePath: string;
  importedNames: string[];
  isDefault: boolean;
  isNamespace: boolean;
}

/**
 * Result of code analysis
 */
export interface CodeAnalysisResult {
  files: ParsedFile[];
  allExportedFunctions: ExportedFunction[];
  functionDependencies: Map<string, string[]>; // Map of function name to called function names
}

