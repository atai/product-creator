import { BusinessObject } from './types';

export interface FieldTypeOption {
  value: string;
  label: string;
  source: 'base' | 'object';
}

export const BASE_FIELD_TYPES: FieldTypeOption[] = [
  { value: 'string(40)', label: 'String (40)', source: 'base' },
  { value: 'string(255)', label: 'String (255)', source: 'base' },
  { value: 'text', label: 'Text', source: 'base' },
  { value: 'integer', label: 'Integer', source: 'base' },
  { value: 'bigint', label: 'Big Integer', source: 'base' },
  { value: 'decimal(10,2)', label: 'Decimal (10,2)', source: 'base' },
  { value: 'decimal(18,4)', label: 'Decimal (18,4)', source: 'base' },
  { value: 'boolean', label: 'Boolean', source: 'base' },
  { value: 'date', label: 'Date', source: 'base' },
  { value: 'datetime', label: 'Datetime', source: 'base' },
  { value: 'uuid', label: 'UUID', source: 'base' },
];

export function buildTypeOptions(existingObjects: BusinessObject[], currentId?: string): FieldTypeOption[] {
  const options: FieldTypeOption[] = [...BASE_FIELD_TYPES];
  const seen = new Set(options.map((opt) => opt.value));

  const addObjectType = (objectId: string, name?: string) => {
    if (!objectId || seen.has(objectId)) {
      return;
    }
    options.push({
      value: objectId,
      label: name ? `${name} (${objectId})` : objectId,
      source: 'object',
    });
    seen.add(objectId);
  };

  existingObjects.forEach((object) => addObjectType(object.id, object.name));

  if (currentId) {
    addObjectType(currentId);
  }

  return options;
}




