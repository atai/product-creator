import { getStorage } from '../../../storage';
import { validators } from '../../../validation/schemas';
import logger from '../../../logger';
import { Feature } from '../../../types';
import { rejectInvalidSave } from '../../../validation/guard';

const validate = validators.feature;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const data: Feature = body.data || body;
    const appId: string | undefined = body.appId;

    logger.info('Save request received', {
      id: data.id,
      bounded_context: data.bounded_context,
      entity: data.entity,
      action: data.action,
      name: data.name,
      appId,
      fullData: JSON.stringify(data)
    });

    // Validate appId is provided and get directory from app
    if (!appId) {
      logger.warn('App ID not provided');
      return Response.json(
        { error: 'App ID is required' },
        { status: 400 }
      );
    }

    const storage = await getStorage();
    const app = storage.getAppById(appId);
    if (!app || !app.directory) {
      logger.warn('App not found or directory missing', { appId });
      return Response.json(
        { error: 'App not found or directory not configured' },
        { status: 400 }
      );
    }

    const targetRoot = app.directory;

    // Validate
    const valid = validate(data);
    if (!valid) {
      logger.warn('Validation failed', { errors: validate.errors });
      return Response.json(
        { error: 'Validation failed', details: validate.errors },
        { status: 400 }
      );
    }

    // Check path pattern
    const expectedPath = `${data.bounded_context}/${data.entity}.${data.action}.yml`;
    const idParts = data.id.split('.');
    if (
      idParts.length !== 3 ||
      idParts[0] !== data.bounded_context ||
      idParts[1] !== data.entity ||
      idParts[2] !== data.action
    ) {
      logger.warn('ID pattern mismatch', { id: data.id, expected: expectedPath });
      return Response.json(
        { error: 'ID does not match pattern: <bounded_context>.<entity>.<action>' },
        { status: 400 }
      );
    }

    // References, duplicates and the other model rules (PRODUCTCREATOR-29)
    const rejected = rejectInvalidSave(storage, 'feature', data, appId);
    if (rejected) return rejected;

    const existing = storage.getFeatureById(data.id);

    logger.info('Attempting save', {
      id: data.id,
      existingFound: !!existing,
      isUpdate: !!existing
    });

    const result = await storage.saveFeature(data, targetRoot);

    if (!result.success) {
      logger.error('Save failed in storage layer', { error: result.error });
      if (result.error?.includes('already exists')) {
        return Response.json({ error: result.error }, { status: 409 });
      }
      if (result.error?.includes('Missing required fields')) {
        return Response.json({ error: result.error }, { status: 400 });
      }
      return Response.json({ error: result.error }, { status: 500 });
    }

    const statusCode = existing ? 200 : 201;
    return Response.json({ success: true, id: data.id }, { status: statusCode });
  } catch (error) {
    logger.error('Failed to save feature', { error });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
