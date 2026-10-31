/**
 * 구조화 로거 (JSON 한 줄). 모든 출력은 redact() 를 거쳐 토큰/비밀값이 섞여 나가지 않게 한다.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';
const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:secret_|ntn_)[A-Za-z0-9]{20,}/g, '[REDACTED]'], // Notion 통합 토큰
  [/(Bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, '$1[REDACTED]'],
  [/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s]+@/gi, '$1[REDACTED]@'], // DB URL 비밀번호
  [/(X-Amz-[A-Za-z-]+=)[^&\s"]+/g, '$1[REDACTED]'], // Notion 파일 서명 URL
];

const SECRET_ENV_KEYS = ['NOTION_TOKEN', 'SYNC_SECRET', 'CRON_SECRET', 'ADMIN_PASSWORD', 'DATABASE_URL'];

export function redact(input: string): string {
  let out = input;
  for (const key of SECRET_ENV_KEYS) {
    const value = process.env[key];
    if (value && value.length >= 8) out = out.split(value).join('[REDACTED]');
  }
  for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

function serializeError(err: unknown) {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      ...(process.env.NODE_ENV !== 'production' ? { stack: err.stack } : {}),
      ...('code' in err ? { code: (err as { code: unknown }).code } : {}),
    };
  }
  return { message: String(err) };
}

function minLevel(): number {
  const env = (process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'test' ? 'warn' : 'info')) as Level;
  return LEVELS[env] ?? LEVELS.info;
}

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (LEVELS[level] < minLevel()) return;
  const payload: Record<string, unknown> = { level, time: new Date().toISOString(), msg };
  if (fields) {
    for (const [k, v] of Object.entries(fields)) payload[k] = v instanceof Error ? serializeError(v) : v;
  }
  const line = redact(JSON.stringify(payload));
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => write('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => write('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write('error', msg, fields),
};
