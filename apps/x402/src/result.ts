/** What a paid handler answers with, before anything knows it is an HTTP response. */
export interface Result {
  status: number;
  body: unknown;
}

export function ok(body: unknown): Result {
  return { status: 200, body };
}

export function failure(status: number, code: string, message: string): Result {
  return { status, body: { error: { code, message } } };
}
