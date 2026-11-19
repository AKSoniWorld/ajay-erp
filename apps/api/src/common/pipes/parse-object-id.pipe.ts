import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { isValidObjectId, Types } from 'mongoose';

@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(v: string) {
    if (!isValidObjectId(v) || String(new Types.ObjectId(v)) !== v) throw new BadRequestException('Invalid id');
    return v;
  }
}
