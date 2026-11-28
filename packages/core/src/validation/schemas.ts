import Ajv, { type ValidateFunction } from 'ajv';
import featureSchema from '../../schema/feature.schema.json';
import workflowSchema from '../../schema/workflow.schema.json';
import businessObjectSchema from '../../schema/business-object.schema.json';

/**
 * One Ajv instance for all catalog schemas (model validation, save routes, MCP).
 * `x-audience: human | agent | both` marks who a field is for (PRODUCTCREATOR-32); it is an annotation, not a check.
 * verbose: errors carry their schema, so messages can quote the field's description (model.ts).
 */
export const ajv = new Ajv({ allErrors: true, verbose: true });
ajv.addVocabulary(['x-audience']);

export type SchemaKind = 'feature' | 'workflow' | 'business_object';

export const catalogSchemas: Record<SchemaKind, object> = {
  feature: featureSchema,
  workflow: workflowSchema,
  business_object: businessObjectSchema,
};

export const validators: Record<SchemaKind, ValidateFunction> = {
  feature: ajv.compile(featureSchema),
  workflow: ajv.compile(workflowSchema),
  business_object: ajv.compile(businessObjectSchema),
};
