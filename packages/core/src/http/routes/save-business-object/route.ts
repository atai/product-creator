import { createSaveHandler } from '../../handlers';
import { BusinessObject } from '../../../types';

export const POST = createSaveHandler<BusinessObject>(
  (storage, data, targetRoot) => storage.saveBusinessObject(data, targetRoot),
  'businessObject',
  'business_object'
);




