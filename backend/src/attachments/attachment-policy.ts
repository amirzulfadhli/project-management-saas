import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { basename } from 'node:path';

export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, readonly string[]> = {
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.webp': ['image/webp'],
  '.pdf': ['application/pdf'],
  '.txt': ['text/plain'],
  '.csv': ['text/csv', 'text/plain', 'application/vnd.ms-excel'],
};

export interface ValidatedAttachment {
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
}

export function validateAttachmentFile(
  file: Express.Multer.File | undefined,
): ValidatedAttachment {
  if (!file) throw new BadRequestException('A file is required');
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new PayloadTooLargeException('Files must be 10 MB or smaller');
  }
  if (file.size < 1 || file.buffer.length < 1) {
    throw new BadRequestException('Empty files are not supported');
  }

  const originalName = sanitizeOriginalName(file.originalname);
  const extension = extensionOf(originalName);
  const allowedMimes = MIME_BY_EXTENSION[extension];
  const mimeType = file.mimetype.toLowerCase().trim();
  if (!allowedMimes?.includes(mimeType)) {
    throw new BadRequestException('This file type is not supported');
  }
  if (!matchesContentBoundary(extension, file.buffer)) {
    throw new BadRequestException('File contents do not match the file type');
  }

  return { originalName, mimeType, sizeBytes: file.size, buffer: file.buffer };
}

export function sanitizeOriginalName(value: string): string {
  const name = basename(value.replace(/\\/g, '/')).normalize('NFC').trim();
  const containsControlCharacter = [...name].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
  if (!name || name === '.' || name === '..' || containsControlCharacter) {
    throw new BadRequestException('Filename is invalid');
  }
  if (name.length > 255) throw new BadRequestException('Filename is too long');
  return name;
}

export function contentDisposition(originalName: string): string {
  const safeName = sanitizeOriginalName(originalName);
  const fallback = safeName
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
}

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index < 0 ? '' : name.slice(index).toLowerCase();
}

function matchesContentBoundary(extension: string, contents: Buffer): boolean {
  if (extension === '.png') {
    return contents
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    return (
      contents[0] === 0xff &&
      contents[1] === 0xd8 &&
      contents[contents.length - 2] === 0xff &&
      contents[contents.length - 1] === 0xd9
    );
  }
  if (extension === '.webp') {
    return (
      contents.subarray(0, 4).toString('ascii') === 'RIFF' &&
      contents.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  if (extension === '.pdf')
    return contents.subarray(0, 5).toString('ascii') === '%PDF-';
  return !contents.includes(0);
}
