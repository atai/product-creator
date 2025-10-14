import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from '@/lib/storage';
import logger from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing id parameter' }, { status: 400 });
    }

    const storage = await getStorage();
    const filePath = storage.getFilePathById(id);

    if (!filePath) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 });
    }

    const root = storage.getRootForFilePath(filePath);

    if (!root) {
      return NextResponse.json({ error: 'Root not found for file' }, { status: 404 });
    }

    return NextResponse.json({ root });
  } catch (error) {
    logger.error('Failed to fetch card root', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
