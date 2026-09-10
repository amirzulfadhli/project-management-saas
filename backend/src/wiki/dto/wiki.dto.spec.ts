import {
  createWikiPageSchema,
  moveWikiPageSchema,
  updateWikiPageSchema,
  WIKI_CONTENT_MAX_LENGTH,
} from './wiki.dto';

describe('Wiki DTOs', () => {
  it('trims titles and defaults root/content values', () => {
    expect(createWikiPageSchema.parse({ title: '  Architecture  ' })).toEqual({
      title: 'Architecture',
      content: '',
      parentId: null,
    });
  });

  it('rejects empty/long titles, oversized content, and unknown fields', () => {
    expect(createWikiPageSchema.safeParse({ title: '   ' }).success).toBe(
      false,
    );
    expect(
      createWikiPageSchema.safeParse({ title: 'x'.repeat(201) }).success,
    ).toBe(false);
    expect(
      createWikiPageSchema.safeParse({
        title: 'Page',
        content: 'x'.repeat(WIKI_CONTENT_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      createWikiPageSchema.safeParse({ title: 'Page', extra: true }).success,
    ).toBe(false);
  });

  it('requires a meaningful update and validates move input', () => {
    expect(updateWikiPageSchema.safeParse({}).success).toBe(false);
    expect(updateWikiPageSchema.safeParse({ content: '' }).success).toBe(true);
    expect(
      moveWikiPageSchema.safeParse({ parentId: null, targetIndex: 0 }).success,
    ).toBe(true);
    expect(
      moveWikiPageSchema.safeParse({ parentId: null, targetIndex: -1 }).success,
    ).toBe(false);
  });
});
