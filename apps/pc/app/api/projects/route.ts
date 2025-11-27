import { NextResponse } from 'next/server';
import { getStorage } from '@/lib/storage';
import logger from '@/lib/logger';
import { generateProjectId } from '@/lib/utils/id';

export async function GET() {
  try {
    const storage = await getStorage();
    const projects = storage.getAllProjects();
    return NextResponse.json({ projects });
  } catch (error) {
    logger.error('Failed to list projects', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, description, id } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const storage = await getStorage();
    const existingProjects = storage.getAllProjects();
    const existingIds = new Set(existingProjects.map(project => project.id));

    let projectId: string;
    if (id) {
      projectId = String(id).toLowerCase();
      if (!/^[a-z]{5}$/.test(projectId)) {
        return NextResponse.json({ error: 'Project ID must be 5 lowercase letters' }, { status: 400 });
      }
      if (existingIds.has(projectId)) {
        return NextResponse.json({ error: 'Project ID already exists' }, { status: 409 });
      }
    } else {
      projectId = generateProjectId(name, existingIds);
    }

    const payload = {
      id: projectId,
      name: name.trim(),
      description: description ? String(description) : '',
    };

    const result = await storage.saveProject(payload);
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Failed to save project' }, { status: 500 });
    }

    logger.info('Project created', { id: projectId });

    return NextResponse.json({ project: payload }, { status: 201 });
  } catch (error) {
    logger.error('Failed to create project', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}




