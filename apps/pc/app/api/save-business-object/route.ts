import { createSaveHandler } from '@/lib/api/handlers';
import { BusinessObject } from '@/lib/types';

export const POST = createSaveHandler<BusinessObject>(
  (storage, data, targetRoot) => storage.saveBusinessObject(data, targetRoot),
  'businessObject'
);




