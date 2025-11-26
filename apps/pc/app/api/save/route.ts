import { NextRequest, NextResponse } from 'next/server';
import { getStorage } from '@/lib/storage';
import Ajv from 'ajv';
import * as fs from 'fs';
import * as path from 'path';
import logger from '@/lib/logger';
import { FunctionCard } from '@/lib/types';

const ajv = new Ajv();
const schemaPath = path.resolve('./product/schema/function.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
const validate = ajv.compile(schema);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data: FunctionCard = body.data || body;
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
      return NextResponse.json(
        { error: 'App ID is required' },
        { status: 400 }
      );
    }

    const storage = await getStorage();
    const app = storage.getAppById(appId);
    if (!app || !app.directory) {
      logger.warn('App not found or directory missing', { appId });
      return NextResponse.json(
        { error: 'App not found or directory not configured' },
        { status: 400 }
      );
    }

    const targetRoot = app.directory;

    // Validate
    const valid = validate(data);
    if (!valid) {
      logger.warn('Validation failed', { errors: validate.errors });
      return NextResponse.json(
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
      return NextResponse.json(
        { error: 'ID does not match pattern: <bounded_context>.<entity>.<action>' },
        { status: 400 }
      );
    }

    const existing = storage.getById(data.id);

    logger.info('Attempting save', {
      id: data.id,
      existingFound: !!existing,
      isUpdate: !!existing
    });

    const result = await storage.save(data, targetRoot);

    if (!result.success) {
      logger.error('Save failed in storage layer', { error: result.error });
      if (result.error?.includes('already exists')) {
        return NextResponse.json({ error: result.error }, { status: 409 });
      }
      if (result.error?.includes('Missing required fields')) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    const statusCode = existing ? 200 : 201;
    return NextResponse.json({ success: true, id: data.id }, { status: statusCode });
  } catch (error) {
    logger.error('Failed to save card', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
