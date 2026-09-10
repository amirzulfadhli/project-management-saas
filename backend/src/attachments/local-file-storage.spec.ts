import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { LocalFileStorage } from './local-file-storage';

describe('LocalFileStorage', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'flowplan-storage-unit-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('stores, reads, checks, and deletes an opaque key', async () => {
    const storage = new LocalFileStorage(root);
    const key = randomUUID();
    await storage.store(key, Buffer.from('hello'));
    expect(await storage.exists(key)).toBe(true);
    expect((await storage.read(key)).toString()).toBe('hello');
    await storage.delete(key);
    expect(await storage.exists(key)).toBe(false);
  });

  it('rejects traversal and absolute paths', async () => {
    const storage = new LocalFileStorage(root);
    await expect(storage.store('../outside', Buffer.from('x'))).rejects.toThrow(
      'Invalid storage key',
    );
    await expect(storage.read('C:\\Windows\\system.ini')).rejects.toThrow(
      'Invalid storage key',
    );
  });
});
