import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  MONGO_URI: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  ACCESS_TTL: z.string().default('15m'),
  REFRESH_TTL_DAYS: z.coerce.number().default(7),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  LOGIN_RATE_LIMIT: z.coerce.number().default(5),
  UPLOAD_DIR: z.string().default('./uploads'),
  PUBLIC_WHATSAPP_DEFAULT: z.string().regex(/^\d{10,15}$/).optional(), // e.g. 919876543210 — used when a branch has no WhatsApp number
  SEED_DEMO: z.string().optional(),
  PDF_FONT_DIR: z.string().default('/usr/share/fonts/truetype/noto'), // needs NotoSans-Regular.ttf + NotoSans-Bold.ttf for the ₹ sign
  ADMIN_NAME: z.string().default('Admin'),
  ADMIN_MOBILE: z.string().regex(/^[6-9]\d{9}$/).optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
});
export const env = schema.parse(process.env);
