import { createGetByIdHandler } from '../../handlers';

// Refactored using generic handler
export const GET = createGetByIdHandler(
  (storage, id) => storage.getStreamById(id),
  'Stream'
);
