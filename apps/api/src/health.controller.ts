import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { Public } from './common/decorators';

@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private conn: Connection) {}

  /** Used by Docker / the reverse proxy: 200 only when the database connection is up. */
  @Public() @Get() ok() {
    if (this.conn.readyState !== 1) throw new ServiceUnavailableException({ status: 'down', db: 'down' });
    return { status: 'ok', db: 'up', time: new Date().toISOString() };
  }
}
