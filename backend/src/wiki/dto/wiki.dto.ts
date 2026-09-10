import { z } from 'zod';

export const WIKI_TITLE_MAX_LENGTH = 200;
// Stays below Express' existing 100 KiB JSON body ceiling so validation can
// return the normal structured 400 response rather than relying on parser 413s.
export const WIKI_CONTENT_MAX_LENGTH = 96 * 1024;
export const WIKI_MAX_DEPTH = 5;

const title = z.string().trim().min(1).max(WIKI_TITLE_MAX_LENGTH);
const content = z.string().max(WIKI_CONTENT_MAX_LENGTH);
const parentId = z.string().uuid().nullable();

export const wikiProjectIdSchema = z.string().uuid();
export const wikiPageIdSchema = z.string().uuid();

export const createWikiPageSchema = z
  .object({
    title,
    content: content.optional().default(''),
    parentId: parentId.optional().default(null),
  })
  .strict();

export const updateWikiPageSchema = z
  .object({
    title: title.optional(),
    content: content.optional(),
  })
  .strict()
  .refine((value) => value.title !== undefined || value.content !== undefined, {
    message: 'At least one field is required',
  });

export const moveWikiPageSchema = z
  .object({
    parentId,
    targetIndex: z.number().int().min(0),
  })
  .strict();

export type CreateWikiPageDto = z.infer<typeof createWikiPageSchema>;
export type UpdateWikiPageDto = z.infer<typeof updateWikiPageSchema>;
export type MoveWikiPageDto = z.infer<typeof moveWikiPageSchema>;
