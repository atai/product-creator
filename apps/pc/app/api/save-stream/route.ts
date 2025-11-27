import { createSaveHandler } from '@/lib/api/handlers';
import { Stream } from '@/lib/types';

// Refactored using generic handler
export const POST = createSaveHandler<Stream>(
  (storage, data, targetRoot) => storage.saveStream(data, targetRoot),
  'stream'
);
