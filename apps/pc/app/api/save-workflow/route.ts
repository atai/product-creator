import { createSaveHandler } from '@/lib/api/handlers';
import { Workflow } from '@/lib/types';

// Refactored using generic handler
export const POST = createSaveHandler<Workflow>(
  (storage, data, targetRoot) => storage.saveWorkflow(data, targetRoot),
  'workflow'
);
