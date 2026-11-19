import { BadRequestException, Controller, Get, NotFoundException, Param, StreamableFile } from '@nestjs/common';
import { createReadStream, existsSync } from 'fs';
import { join } from 'path';
import { env } from '../../config';
import { Public } from '../../common/decorators';

const TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const;

/** Product images are public (used by the customer catalog). Filename whitelist prevents path traversal. */
@Controller('uploads')
export class UploadsController {
  @Public() @Get(':file')
  get(@Param('file') file: string) {
    const m = /^[a-f0-9]{32}\.(jpg|png|webp)$/.exec(file);
    if (!m) throw new BadRequestException('Invalid file name');
    const path = join(env.UPLOAD_DIR, file);
    if (!existsSync(path)) throw new NotFoundException();
    return new StreamableFile(createReadStream(path), { type: TYPES[m[1] as keyof typeof TYPES] });
  }
}
