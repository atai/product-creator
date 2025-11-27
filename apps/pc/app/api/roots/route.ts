import { NextResponse } from 'next/server';
import { getStorage } from '@/lib/storage';
import logger from '@/lib/logger';

export async function GET() {
  try {
    const storage = await getStorage();
    const roots = storage.getRoots();

    logger.info('Roots requested', { count: roots.length });

    return NextResponse.json({
      roots: roots.map(root => ({
        path: root,
        label: root, // Use full path as label
      })),
    });
  } catch (error) {
    logger.error('Failed to get roots', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
