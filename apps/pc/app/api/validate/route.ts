import { NextRequest, NextResponse } from 'next/server';
import Ajv from 'ajv';
import * as fs from 'fs';
import * as path from 'path';
import logger from '@/lib/logger';

const ajv = new Ajv();
const schemaPath = path.resolve('./product/schema/function.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
const validate = ajv.compile(schema);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { data } = body;

    if (!data) {
      return NextResponse.json({ error: 'Missing data field' }, { status: 400 });
    }

    const valid = validate(data);

    if (valid) {
      return NextResponse.json({ valid: true });
    }

    return NextResponse.json({
      valid: false,
      errors: validate.errors,
    });
  } catch (error) {
    logger.error('Failed to validate', { error });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
