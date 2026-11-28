import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import logger from '../logger';

/**
 * Handles all file system operations
 * Single Responsibility: File I/O, YAML parsing
 */
export class FileSystemAdapter {
  /**
   * Get all YAML files in a directory (recursive)
   */
  getAllYamlFiles(dir: string): string[] {
    const files: string[] = [];

    const walk = (currentPath: string) => {
      if (!fs.existsSync(currentPath)) {
        return;
      }

      const entries = fs.readdirSync(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);

        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile() && /\.(yml|yaml)$/i.test(entry.name)) {
          files.push(fullPath);
        }
      }
    };

    walk(dir);
    return files;
  }

  /**
   * Load and parse a YAML file
   */
  loadYamlFile<T>(filePath: string): T | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      // CORE_SCHEMA: no timestamp type, so `date: 2026-11-28` stays the string the schema expects (not a Date)
      return yaml.load(content, { schema: yaml.CORE_SCHEMA }) as T;
    } catch (error) {
      logger.error('Failed to load YAML file', { filePath, error });
      return null;
    }
  }

  /**
   * Save data as YAML file
   */
  saveYamlFile<T>(filePath: string, data: T): boolean {
    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const yamlContent = yaml.dump(data, { lineWidth: -1 });
      fs.writeFileSync(filePath, yamlContent, 'utf-8');

      logger.info('Saved YAML file', { filePath });
      return true;
    } catch (error) {
      logger.error('Failed to save YAML file', { filePath, error });
      return false;
    }
  }

  /**
   * Ensure directory exists
   */
  ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      logger.debug('Created directory', { dirPath });
    }
  }

  /**
   * Check if directory exists
   */
  directoryExists(dirPath: string): boolean {
    return fs.existsSync(dirPath);
  }

  /**
   * Delete file if exists
   */
  deleteFile(filePath: string): boolean {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.info('Deleted YAML file', { filePath });
      }
      return true;
    } catch (error) {
      logger.error('Failed to delete YAML file', { filePath, error });
      return false;
    }
  }
}
