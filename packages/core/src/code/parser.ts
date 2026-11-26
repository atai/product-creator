import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import {
  ExportedFunction,
  FunctionCall,
  ParsedFile,
  ImportInfo,
  CodeAnalysisResult,
} from './types';

/**
 * Recursively find all TypeScript files in a directory
 */
export function findTypeScriptFiles(dirPath: string, basePath: string): string[] {
  const files: string[] = [];
  
  if (!fs.existsSync(dirPath)) {
    return files;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    
    // Skip node_modules, .next, and other common directories
    if (entry.isDirectory()) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '.next' ||
        entry.name === 'dist' ||
        entry.name === 'build' ||
        entry.name.startsWith('.')
      ) {
        continue;
      }
      files.push(...findTypeScriptFiles(fullPath, basePath));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Parse a TypeScript file and extract exported functions
 */
export function parseTypeScriptFile(filePath: string, basePath: string): ParsedFile {
  const content = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true
  );

  const relativePath = path.relative(basePath, filePath);
  const exportedFunctions: ExportedFunction[] = [];
  const imports: ImportInfo[] = [];
  const functionCalls = new Map<string, FunctionCall[]>();

  // Visit all nodes in the AST
  function visit(node: ts.Node) {
    // Handle exports
    if (ts.isFunctionDeclaration(node) && node.name) {
      const isExported = node.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword
      );
      const isDefault = node.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.DefaultKeyword
      );

      if (isExported || isDefault) {
        const funcName = node.name.text;
        const lineNumber = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        const isAsync = node.modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.AsyncKeyword
        ) || false;

        const parameters = node.parameters.map((p) => {
          const name = ts.isIdentifier(p.name) ? p.name.text : 'unknown';
          const type = p.type ? sourceFile.text.substring(p.type.getStart(), p.type.getEnd()) : '';
          return type ? `${name}: ${type}` : name;
        });

        const bodyText = node.body
          ? sourceFile.text.substring(node.body.getStart(), node.body.getEnd())
          : undefined;

        exportedFunctions.push({
          name: funcName,
          filePath,
          relativePath,
          lineNumber,
          isDefault: !!isDefault,
          isAsync,
          parameters,
          bodyText,
        });

        // Extract function calls from this function's body
        if (node.body) {
          const calls = extractFunctionCalls(node.body, sourceFile);
          functionCalls.set(funcName, calls);
        }
      }
    }

    // Handle exported const functions: export const funcName = () => {}
    if (ts.isVariableStatement(node)) {
      const isExported = node.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword
      );

      if (isExported) {
        node.declarationList.declarations.forEach((decl) => {
          if (ts.isIdentifier(decl.name) && decl.initializer) {
            const funcName = decl.name.text;
            let funcNode: ts.FunctionLike | null = null;
            let isAsync = false;

            if (ts.isArrowFunction(decl.initializer)) {
              funcNode = decl.initializer;
              isAsync = decl.initializer.modifiers?.some(
                (m) => m.kind === ts.SyntaxKind.AsyncKeyword
              ) || false;
            } else if (ts.isFunctionExpression(decl.initializer)) {
              funcNode = decl.initializer;
              isAsync = decl.initializer.modifiers?.some(
                (m) => m.kind === ts.SyntaxKind.AsyncKeyword
              ) || false;
            }

            if (funcNode) {
              const lineNumber = sourceFile.getLineAndCharacterOfPosition(decl.getStart()).line + 1;
              const parameters = funcNode.parameters.map((p) => {
                const name = ts.isIdentifier(p.name) ? p.name.text : 'unknown';
                const type = p.type ? sourceFile.text.substring(p.type.getStart(), p.type.getEnd()) : '';
                return type ? `${name}: ${type}` : name;
              });

              const bodyText = funcNode.body
                ? sourceFile.text.substring(funcNode.body.getStart(), funcNode.body.getEnd())
                : undefined;

              exportedFunctions.push({
                name: funcName,
                filePath,
                relativePath,
                lineNumber,
                isDefault: false,
                isAsync,
                parameters,
                bodyText,
              });

              // Extract function calls
              if (funcNode.body) {
                const calls = extractFunctionCalls(funcNode.body, sourceFile);
                functionCalls.set(funcName, calls);
              }
            }
          }
        });
      }
    }

    // Handle default exports: export default function name() {}
    if (ts.isFunctionDeclaration(node) && node.name) {
      const isDefault = node.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.DefaultKeyword
      );
      const isExported = node.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword
      );

      if (isDefault && isExported) {
        // Already handled above, but ensure it's marked as default
        const existing = exportedFunctions.find((f) => f.name === node.name!.text);
        if (existing) {
          existing.isDefault = true;
        }
      }
    }

    // Handle imports
    if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const modulePath = node.moduleSpecifier.text;
      const importedNames: string[] = [];
      let isDefault = false;
      let isNamespace = false;

      if (node.importClause) {
        // Default import
        if (node.importClause.name) {
          importedNames.push(node.importClause.name.text);
          isDefault = true;
        }

        // Named imports
        if (node.importClause.namedBindings) {
          if (ts.isNamespaceImport(node.importClause.namedBindings)) {
            importedNames.push(node.importClause.namedBindings.name.text);
            isNamespace = true;
          } else if (ts.isNamedImports(node.importClause.namedBindings)) {
            node.importClause.namedBindings.elements.forEach((elem) => {
              const name = elem.propertyName ? elem.propertyName.text : elem.name.text;
              importedNames.push(name);
            });
          }
        }
      }

      if (importedNames.length > 0 || isNamespace) {
        imports.push({
          modulePath,
          importedNames,
          isDefault,
          isNamespace,
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return {
    filePath,
    relativePath,
    exportedFunctions,
    imports,
    functionCalls,
  };
}

/**
 * Extract function calls from a node (function body)
 */
function extractFunctionCalls(node: ts.Node, sourceFile: ts.SourceFile): FunctionCall[] {
  const calls: FunctionCall[] = [];

  function visitCall(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const lineNumber = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;

      if (ts.isPropertyAccessExpression(node.expression)) {
        // Method call: obj.method()
        const objectName = ts.isIdentifier(node.expression.expression)
          ? node.expression.expression.text
          : undefined;
        const methodName = node.expression.name.text;

        calls.push({
          functionName: methodName,
          lineNumber,
          isMethodCall: true,
          objectName,
        });
      } else if (ts.isIdentifier(node.expression)) {
        // Direct function call: func()
        calls.push({
          functionName: node.expression.text,
          lineNumber,
          isMethodCall: false,
        });
      } else if (ts.isElementAccessExpression(node.expression)) {
        // Array/object access call: obj['method']()
        // Try to extract the name if it's a string literal
        if (ts.isStringLiteral(node.expression.argumentExpression)) {
          calls.push({
            functionName: node.expression.argumentExpression.text,
            lineNumber,
            isMethodCall: true,
            objectName: ts.isIdentifier(node.expression.expression)
              ? node.expression.expression.text
              : undefined,
          });
        }
      }
    }

    ts.forEachChild(node, visitCall);
  }

  visitCall(node);

  return calls;
}

/**
 * Analyze code and build dependency graph
 */
export function analyzeCode(codeBasePath: string): CodeAnalysisResult {
  const resolvedPath = path.isAbsolute(codeBasePath)
    ? codeBasePath
    : path.resolve(process.cwd(), codeBasePath);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Code base path does not exist: ${resolvedPath}`);
  }

  // Find all TypeScript files
  const tsFiles = findTypeScriptFiles(resolvedPath, resolvedPath);

  // Parse all files
  const parsedFiles = tsFiles.map((filePath) => parseTypeScriptFile(filePath, resolvedPath));

  // Collect all exported functions
  const allExportedFunctions: ExportedFunction[] = [];
  parsedFiles.forEach((file) => {
    allExportedFunctions.push(...file.exportedFunctions);
  });

  // Build dependency graph
  // Create a map of function names to their file info
  const functionNameMap = new Map<string, ExportedFunction[]>();
  allExportedFunctions.forEach((func) => {
    if (!functionNameMap.has(func.name)) {
      functionNameMap.set(func.name, []);
    }
    functionNameMap.get(func.name)!.push(func);
  });

  // Resolve dependencies
  const functionDependencies = new Map<string, string[]>();

  parsedFiles.forEach((parsedFile) => {
    parsedFile.exportedFunctions.forEach((exportedFunc) => {
      const calledFunctions = new Set<string>();
      const calls = parsedFile.functionCalls.get(exportedFunc.name) || [];

      calls.forEach((call) => {
        // Check if this is a call to an exported function
        // First check local file
        const localFunc = parsedFile.exportedFunctions.find((f) => f.name === call.functionName);
        if (localFunc) {
          calledFunctions.add(localFunc.name);
        } else {
          // Check imported functions
          parsedFile.imports.forEach((imp) => {
            if (imp.importedNames.includes(call.functionName)) {
              // Try to resolve the module and find exported function
              // For now, we'll use the imported name as the function name
              // In a more sophisticated implementation, we'd resolve the actual module
              calledFunctions.add(call.functionName);
            } else if (imp.isNamespace && call.objectName === imp.importedNames[0]) {
              // Namespace import: import * as utils from './utils'; utils.func()
              calledFunctions.add(call.functionName);
            }
          });

          // Also check if it's a known exported function from any file
          const knownFuncs = functionNameMap.get(call.functionName);
          if (knownFuncs && knownFuncs.length > 0) {
            calledFunctions.add(call.functionName);
          }
        }
      });

      if (calledFunctions.size > 0) {
        functionDependencies.set(exportedFunc.name, Array.from(calledFunctions));
      }
    });
  });

  return {
    files: parsedFiles,
    allExportedFunctions,
    functionDependencies,
  };
}

