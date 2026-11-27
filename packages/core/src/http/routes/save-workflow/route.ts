import { createSaveHandler } from '../../handlers';
import { Workflow } from '../../../types';

export const POST = createSaveHandler<Workflow>(
  (storage, data, targetRoot) => storage.saveWorkflow(data, targetRoot),
  'workflow',
  'workflow'
);
