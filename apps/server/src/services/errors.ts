import type { ContentfulStatusCode } from "hono/utils/http-status";

export class HttpError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code?: string;
  readonly details?: unknown;

  constructor(
    status: ContentfulStatusCode,
    message: string,
    opts?: { code?: string; details?: unknown },
  ) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = opts?.code;
    this.details = opts?.details;
  }
}

export class BadRequestError extends HttpError {
  constructor(message = "Bad Request", details?: unknown) {
    super(400, message, { code: "BAD_REQUEST", details });
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "Unauthorized", details?: unknown) {
    super(401, message, { code: "UNAUTHORIZED", details });
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = "Forbidden", details?: unknown) {
    super(403, message, { code: "FORBIDDEN", details });
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Not Found", details?: unknown) {
    super(404, message, { code: "NOT_FOUND", details });
  }
}

export class ConflictError extends HttpError {
  constructor(message = "Conflict", details?: unknown) {
    super(409, message, { code: "CONFLICT", details });
  }
}

export class UnprocessableEntityError extends HttpError {
  constructor(message = "Unprocessable Entity", details?: unknown) {
    super(422, message, { code: "UNPROCESSABLE_ENTITY", details });
  }
}
