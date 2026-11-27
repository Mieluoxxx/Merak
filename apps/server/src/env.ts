import path from "node:path";
import { z } from "zod";

const dataDirDefault = path.resolve(process.cwd(), "data");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATA_DIR: z.string().default(dataDirDefault),
  DB_PATH: z.string().optional(),
  MEDIA_DIR: z.string().optional(),
  BETTER_AUTH_SECRET: z
    .string()
    .min(16)
    .default("merak-dev-secret-change-in-production-32chars"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
});

const parsed = envSchema.parse(process.env);
const resolvedDataDir = path.resolve(parsed.DATA_DIR);

export const env = {
  ...parsed,
  DATA_DIR: resolvedDataDir,
  DB_PATH: parsed.DB_PATH ? path.resolve(parsed.DB_PATH) : path.join(resolvedDataDir, "merak.db"),
  MEDIA_DIR: parsed.MEDIA_DIR ? path.resolve(parsed.MEDIA_DIR) : path.join(resolvedDataDir, "media"),
} as const;
