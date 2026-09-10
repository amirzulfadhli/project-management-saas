import { Injectable } from '@nestjs/common';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { FileStorage } from './file-storage';

const STORAGE_KEY_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class LocalFileStorage implements FileStorage {
  private readonly root: string;

  constructor(storageRoot: string) {
    this.root = resolve(storageRoot);
  }

  async store(storageKey: string, contents: Buffer): Promise<void> {
    const target = this.resolveKey(storageKey);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents, { flag: 'wx' });
  }

  async read(storageKey: string): Promise<Buffer> {
    return readFile(this.resolveKey(storageKey));
  }

  async delete(storageKey: string): Promise<void> {
    await unlink(this.resolveKey(storageKey));
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      await readFile(this.resolveKey(storageKey));
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  private resolveKey(storageKey: string): string {
    if (!STORAGE_KEY_PATTERN.test(storageKey)) {
      throw new Error('Invalid storage key');
    }
    const target = resolve(this.root, storageKey);
    if (dirname(target) !== this.root) {
      throw new Error('Storage key escaped the configured root');
    }
    return target;
  }
}

export function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}
