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
    const data: FunctionCard = await request.json();

    // Validate
    const valid = validate(data);
    if (!valid) {
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
      return NextResponse.json(
        { error: 'ID does not match pattern: <bounded_context>.<entity>.<action>' },
        { status: 400 }
      );
    }

    const storage = await getStorage();
    const existing = storage.getById(data.id);

    const result = await storage.save(data);

    if (!result.success) {
      if (result.error?.includes('already exists')) {
        return NextResponse.json({ error: result.error }, { status: 409 });
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
