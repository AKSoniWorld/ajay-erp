import { StreamableFile } from '@nestjs/common';

export const pdfFile = (buffer: Buffer, filename: string, download = false) =>
  new StreamableFile(buffer, { type: 'application/pdf', disposition: `${download ? 'attachment' : 'inline'}; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '_')}"` });
