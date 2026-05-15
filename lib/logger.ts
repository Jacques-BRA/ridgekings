import pino from "pino";

const isProd = process.env.NODE_ENV === "production";
const logDir = process.env.LOG_DIR ?? "./logs";

export const logger = isProd
  ? pino({
      transport: {
        target: "pino-roll",
        options: {
          file: `${logDir}/app`,
          frequency: "daily",
          extension: ".log",
          mkdir: true,
          dateFormat: "yyyy-MM-dd",
          limit: { count: 14 },
        },
      },
      level: process.env.LOG_LEVEL ?? "info",
    })
  : pino({
      level: process.env.LOG_LEVEL ?? "debug",
    });

export async function logAction<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    logger.info({ action: name, ok: true, durationMs: Date.now() - startedAt });
    return result;
  } catch (err) {
    logger.error({
      action: name,
      ok: false,
      durationMs: Date.now() - startedAt,
      err: err instanceof Error ? { message: err.message, stack: err.stack } : { message: String(err) },
    });
    throw err;
  }
}
