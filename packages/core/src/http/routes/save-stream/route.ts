import { createSaveHandler } from '../../handlers';
import { Stream } from '../../../types';

// a save that adds model errors is rejected, like workflows (PRODUCTCREATOR-43)
export const POST = createSaveHandler<Stream>(
  (storage, data, targetRoot) => storage.saveStream(data, targetRoot),
  'stream',
  'stream'
);
