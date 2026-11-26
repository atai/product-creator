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
    const card = storage.getById(id);

    if (!card) {
      return Response.json({ error: 'Card not found' }, { status: 404 });
    }

    return Response.json(card);
  } catch (error) {
    logger.error('Failed to fetch card', { error });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
