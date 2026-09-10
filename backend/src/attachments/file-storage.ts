export const FILE_STORAGE = Symbol('FILE_STORAGE');

export interface FileStorage {
  store(storageKey: string, contents: Buffer): Promise<void>;
  read(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
  exists(storageKey: string): Promise<boolean>;
}
