import { NextResponse } from 'next/server';
import { getStorage } from '@/lib/storage';
import logger from '@/lib/logger';

export async function GET() {
  try {
    const storage = await getStorage();
    const functions = storage.getAll();

    return NextResponse.json(functions);
  } catch (error) {
    logger.error('Failed to fetch index', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
