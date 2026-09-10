import { z } from 'zod';

export const TIME_ENTRY_NOTE_MAX_LENGTH = 500;
export const TIME_ENTRY_MAX_MANUAL_SECONDS = 24 * 60 * 60;
export const TIME_ENTRY_DEFAULT_LIMIT = 30;
export const TIME_ENTRY_MAX_LIMIT = 100;

const note = z.string().trim().max(TIME_ENTRY_NOTE_MAX_LENGTH).nullable();
const timestamp = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));

export const timeTaskIdSchema = z.string().uuid();
export const timeProjectIdSchema = z.string().uuid();

export const startTimerSchema = z
  .object({ note: note.optional().default(null) })
  .strict();

export const stopTimerSchema = z.object({}).strict();

export const createManualTimeEntrySchema = z
  .object({
    startedAt: timestamp,
    endedAt: timestamp,
    note: note.optional().default(null),
  })
  .strict()
  .superRefine((value, context) => {
    const durationSeconds = Math.floor(
      (value.endedAt.getTime() - value.startedAt.getTime()) / 1000,
    );
    if (durationSeconds < 1) {
      context.addIssue({
        code: 'custom',
        path: ['endedAt'],
        message: 'endedAt must be at least one second after startedAt',
      });
    } else if (durationSeconds > TIME_ENTRY_MAX_MANUAL_SECONDS) {
      context.addIssue({
        code: 'custom',
        path: ['endedAt'],
        message: 'A manual time entry cannot exceed 24 hours',
      });
    }
    if (value.endedAt.getTime() > Date.now() + 60_000) {
      context.addIssue({
        code: 'custom',
        path: ['endedAt'],
        message: 'endedAt cannot be in the future',
      });
    }
  });

export const timeEntryListQuerySchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(TIME_ENTRY_MAX_LIMIT)
      .optional()
      .default(TIME_ENTRY_DEFAULT_LIMIT),
  })
  .strict();

export type StartTimerDto = z.infer<typeof startTimerSchema>;
export type CreateManualTimeEntryDto = z.infer<
  typeof createManualTimeEntrySchema
>;
export type TimeEntryListQuery = z.infer<typeof timeEntryListQuerySchema>;
