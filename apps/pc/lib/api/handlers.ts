import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from '../storage';

/**
 * Generic API handlers to eliminate duplication across routes
 * Factory pattern for creating handlers
 */

/**
 * Create a GET handler for fetching all entities
 * Usage: export const GET = createGetAllHandler((storage) => storage.getAllWorkflows());
 */
export function createGetAllHandler<T>(
  getter: (storage: Awaited<ReturnType<typeof getStorage>>) => T[]
) {
  return async function GET() {
    try {
      const storage = await getStorage();
      const items = getter(storage);
      return NextResponse.json(items);
    } catch (error) {
      console.error('Failed to fetch items:', error);
      return NextResponse.json(
        { error: 'Failed to fetch items' },
        { status: 500 }
      );
    }
  };
}

/**
 * Create a GET handler for fetching single entity by ID
 * Usage: export const GET = createGetByIdHandler((storage, id) => storage.getWorkflowById(id), 'Workflow');
 */
export function createGetByIdHandler<T>(
  getter: (storage: Awaited<ReturnType<typeof getStorage>>, id: string) => T | null,
  entityName: string
) {
  return async function GET(request: NextRequest) {
    try {
      const { searchParams } = new URL(request.url);
      const id = searchParams.get('id');

      if (!id) {
        return NextResponse.json(
          { error: `${entityName} ID is required` },
          { status: 400 }
        );
      }

      const storage = await getStorage();
      const item = getter(storage, id);

      if (!item) {
        return NextResponse.json(
          { error: `${entityName} not found` },
          { status: 404 }
        );
      }

      return NextResponse.json(item);
    } catch (error) {
      console.error(`Failed to fetch ${entityName}:`, error);
      return NextResponse.json(
        { error: `Failed to fetch ${entityName}` },
        { status: 500 }
      );
    }
  };
}

/**
 * Create a POST handler for saving entities
 * Usage: export const POST = createSaveHandler(
 *   (storage, data, targetRoot) => storage.saveWorkflow(data, targetRoot),
 *   'workflow'
 * );
 */
export function createSaveHandler<T>(
  saver: (
    storage: Awaited<ReturnType<typeof getStorage>>,
    data: T,
    targetRoot: string
  ) => Promise<{ success: boolean; error?: string }>,
  entityKey: string
) {
  return async function POST(request: NextRequest) {
    try {
      const body = await request.json();
      const entity = body[entityKey];
      const { appId } = body;

      if (!entity) {
        return NextResponse.json(
          { error: `${entityKey} data is required` },
          { status: 400 }
        );
      }

      if (!appId) {
        return NextResponse.json(
          { error: 'App ID is required' },
          { status: 400 }
        );
      }

      const storage = await getStorage();
      const app = storage.getAppById(appId);
      if (!app || !app.directory) {
        return NextResponse.json(
          { error: 'App not found or directory not configured' },
          { status: 400 }
        );
      }

      const targetRoot = app.directory;
      const result = await saver(storage, entity as T, targetRoot);

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || `Failed to save ${entityKey}` },
          { status: 400 }
        );
      }

      return NextResponse.json({ success: true });
    } catch (error) {
      console.error(`Failed to save ${entityKey}:`, error);
      return NextResponse.json(
        { error: `Failed to save ${entityKey}` },
        { status: 500 }
      );
    }
  };
}
