import { createGetByIdHandler } from '@/lib/api/handlers';

// Refactored using generic handler
export const GET = createGetByIdHandler(
  (storage, id) => storage.getWorkflowById(id),
  'Workflow'
);
