import { getStorage } from '../../../storage';
import logger from '../../../logger';

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return Response.json({ error: 'Missing id parameter' }, { status: 400 });
    }

    const storage = await getStorage();
    const filePath = storage.getFilePathById(id);

    if (!filePath) {
      return Response.json({ error: 'Card not found' }, { status: 404 });
    }

    const root = storage.getRootForFilePath(filePath);

    if (!root) {
      return Response.json({ error: 'Root not found for file' }, { status: 404 });
    }

    return Response.json({ root });
  } catch (error) {
    logger.error('Failed to fetch card root', { error });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
