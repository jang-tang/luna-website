/** 애플리케이션 공통 에러 계층. message 에 비밀값이 들어가지 않도록 생성 지점에서 주의한다. */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly expose: boolean;

  constructor(code: string, message: string, options: { status?: number; expose?: boolean; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.status = options.status ?? 500;
    // expose=true 인 경우에만 메시지를 API 응답에 그대로 노출한다
    this.expose = options.expose ?? false;
  }
}

export class ConfigError extends AppError {
  constructor(message: string) {
    super('config_error', message, { status: 500 });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super('unauthorized', message, { status: 401, expose: true });
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, cause?: unknown) {
    super('database_error', message, { status: 503, cause });
  }
}

export class NotionApiError extends AppError {
  readonly httpStatus: number;
  readonly notionCode: string;
  readonly retryable: boolean;

  constructor(httpStatus: number, notionCode: string, message: string, retryable: boolean) {
    super('notion_api_error', `Notion API ${httpStatus} ${notionCode}: ${message}`, { status: 502 });
    this.httpStatus = httpStatus;
    this.notionCode = notionCode;
    this.retryable = retryable;
  }
}

export class ValidationError extends AppError {
  readonly issues: string[];

  constructor(message: string, issues: string[]) {
    super('validation_error', message, { status: 400, expose: true });
    this.issues = issues;
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
