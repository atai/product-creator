import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from '@/lib/storage';
import logger from '@/lib/logger';

interface ProjectUpdatePayload {
  name?: string;
  description?: string;
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const storage = await getStorage();
    const { id } = await params;
    const project = storage.getProjectById(id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    const apps = storage.getAllApps().filter(app => app.projectId === project.id);
    return NextResponse.json({ project, apps });
  } catch (error) {
    logger.error('Failed to fetch project', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const storage = await getStorage();
    const { id } = await params;
    const existing = storage.getProjectById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const body = (await request.json()) as ProjectUpdatePayload;
    const name = body.name?.trim();
    const description = body.description ? String(body.description) : '';

    const payload = {
      ...existing,
      name: name || existing.name,
      description,
    };

    const result = await storage.saveProject(payload);
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to update project' }, { status: 500 });
    }

    return NextResponse.json({ project: payload });
  } catch (error) {
    logger.error('Failed to update project', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const storage = await getStorage();
    const { id } = await params;
    const existing = storage.getProjectById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const apps = storage.getAllApps().filter(app => app.projectId === existing.id);
    if (apps.length > 0) {
      return NextResponse.json({ error: 'Delete or reassign apps before deleting the project' }, { status: 400 });
    }

    const deleted = await storage.deleteProject(existing.id);
    if (!deleted) {
      return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
    }

    logger.info('Project deleted', { id: existing.id });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to delete project', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

