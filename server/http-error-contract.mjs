export class HttpError extends Error {
  /** @param {number} statusCode @param {string} code @param {string} message @param {unknown} [details] */
  constructor(statusCode, code, message, details = null) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/** @param {number} statusCode @param {string} code @param {string} message @param {unknown} [details] */
export function createHttpError(statusCode, code, message, details = null) {
  return new HttpError(statusCode, code, message, details);
}
