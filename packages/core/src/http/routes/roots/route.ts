import { getStorage } from '../../../storage';
import logger from '../../../logger';

export async function GET() {
  try {
    const storage = await getStorage();
    const roots = storage.getRoots();

    logger.info('Roots requested', { count: roots.length });

    return Response.json({
      roots: roots.map(root => ({
        path: root,
        label: root, // Use full path as label
      })),
    });
  } catch (error) {
    logger.error('Failed to get roots', { error });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
