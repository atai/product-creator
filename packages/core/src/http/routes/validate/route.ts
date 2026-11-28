import { validators } from '../../../validation/schemas';
import logger from '../../../logger';

const validate = validators.feature;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { data } = body;

    if (!data) {
      return Response.json({ error: 'Missing data field' }, { status: 400 });
    }

    const valid = validate(data);

    if (valid) {
      return Response.json({ valid: true });
    }

    return Response.json({
      valid: false,
      errors: validate.errors,
    });
  } catch (error) {
    logger.error('Failed to validate', { error });
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
