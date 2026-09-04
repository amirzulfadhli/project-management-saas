import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const schema = z.object({ name: z.string().min(2, 'Name too short') });
  const pipe = new ZodValidationPipe(schema);

  it('returns parsed data on valid input', () => {
    expect(pipe.transform({ name: 'ab' })).toEqual({ name: 'ab' });
  });

  it('throws BadRequestException with field errors on invalid input', () => {
    let error: unknown;
    try {
      pipe.transform({ name: '' });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(BadRequestException);
    const response = (error as BadRequestException).getResponse() as {
      message: string;
      errors: Record<string, string[]>;
    };
    expect(response.message).toBe('Validation failed');
    expect(response.errors.name).toBeDefined();
  });

  it('rejects unknown fields on a strict object schema', () => {
    const strictPipe = new ZodValidationPipe(
      z.strictObject({ name: z.string() }),
    );
    expect(() => strictPipe.transform({ name: 'x', extra: true })).toThrow(
      BadRequestException,
    );
  });
});
