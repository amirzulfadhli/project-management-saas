import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { z } from 'zod';

/**
 * Validates request input against a Zod schema and returns the parsed value.
 * On failure it throws a `BadRequestException` carrying per-field error
 * messages, so clients receive actionable validation feedback.
 */
@Injectable()
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const { fieldErrors } = result.error.flatten();
      throw new BadRequestException({
        message: 'Validation failed',
        errors: fieldErrors,
      });
    }

    return result.data;
  }
}
