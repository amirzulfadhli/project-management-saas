import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import {
  MAX_ATTACHMENT_SIZE_BYTES,
  contentDisposition,
  sanitizeOriginalName,
  validateAttachmentFile,
} from './attachment-policy';

const upload = (
  originalname: string,
  mimetype: string,
  buffer: Buffer,
): Express.Multer.File =>
  ({
    originalname,
    mimetype,
    buffer,
    size: buffer.length,
  }) as Express.Multer.File;

describe('attachment policy', () => {
  it('accepts supported content and strips path components from display names', () => {
    const result = validateAttachmentFile(
      upload('../../notes.txt', 'text/plain', Buffer.from('safe text')),
    );
    expect(result).toMatchObject({ originalName: 'notes.txt', sizeBytes: 9 });
  });

  it('rejects oversized, executable, and MIME-spoofed files', () => {
    expect(() =>
      validateAttachmentFile({
        ...upload('large.txt', 'text/plain', Buffer.from('x')),
        size: MAX_ATTACHMENT_SIZE_BYTES + 1,
      }),
    ).toThrow(PayloadTooLargeException);
    expect(() =>
      validateAttachmentFile(
        upload('payload.exe', 'application/octet-stream', Buffer.from('MZ')),
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      validateAttachmentFile(
        upload('fake.pdf', 'application/pdf', Buffer.from('not a pdf')),
      ),
    ).toThrow('File contents do not match');
  });

  it('rejects control characters and emits injection-safe Unicode download headers', () => {
    expect(() => sanitizeOriginalName('report\r\nX-Evil: yes.pdf')).toThrow(
      BadRequestException,
    );
    const header = contentDisposition('résumé 2026.pdf');
    expect(header).toContain('filename="r_sum_ 2026.pdf"');
    expect(header).toContain("filename*=UTF-8''r%C3%A9sum%C3%A9%202026.pdf");
    expect(header).not.toContain('\r');
    expect(header).not.toContain('\n');
  });
});
