import { createSaveHandler } from '../../handlers';
import { Workflow } from '../../../types';

// Refactored using generic handler
export const POST = createSaveHandler<Workflow>(
  (storage, data, targetRoot) => storage.saveWorkflow(data, targetRoot),
  'workflow'
);
