import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from '@/lib/storage';
import logger from '@/lib/logger';

interface AppUpdatePayload {
  name?: string;
  codeBasePath?: string;
  dbSchemaPath?: string;
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const storage = await getStorage();
    const { id } = await params;
    const app = storage.getAppById(id);
    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }
    const project = storage.getProjectById(app.projectId);
    return NextResponse.json({ app, project });
  } catch (error) {
    logger.error('Failed to fetch app', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const storage = await getStorage();
    const { id } = await params;
    const existing = storage.getAppById(id);
    if (!existing) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    const body = (await request.json()) as AppUpdatePayload;
    const payload = {
      ...existing,
      name: body.name ? body.name.trim() : existing.name,
      codeBasePath: body.codeBasePath ?? existing.codeBasePath,
      dbSchemaPath: body.dbSchemaPath ?? existing.dbSchemaPath,
    };

    // App config is always saved to CONFIG_ROOT/apps/, directory is just metadata
    const result = await storage.saveApp(payload);
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to update app' }, { status: 500 });
    }

    return NextResponse.json({ app: payload });
  } catch (error) {
    logger.error('Failed to update app', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const storage = await getStorage();
    const { id } = await params;
    const existing = storage.getAppById(id);
    if (!existing) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 });
    }

    const deleted = await storage.deleteApp(existing.id);
    if (!deleted) {
      return NextResponse.json({ error: 'Failed to delete app' }, { status: 500 });
    }

    logger.info('App deleted', { id: existing.id });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete app', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

