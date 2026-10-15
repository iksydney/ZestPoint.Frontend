import { HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, throwError } from 'rxjs';
import { ApiEnvelope } from '../models/api.model';

/** A failed API call, normalised: a user-presentable message, a stable code and per-field messages. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly fieldErrors: Readonly<Record<string, readonly string[]>>
  ) {
    super(message);
  }

  /** First message for a field, or null. */
  field(name: string): string | null {
    return this.fieldErrors[name]?.[0] ?? null;
  }
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof HttpErrorResponse) {
    const body = err.error as Partial<ApiEnvelope<unknown>> | null;
    if (body && typeof body === 'object') {
      return new ApiError(body.message ?? defaultMessage(err.status), err.status, body.code ?? null, body.errors ?? {});
    }
    return new ApiError(defaultMessage(err.status), err.status, null, {});
  }
  return new ApiError('Something went wrong. Please try again.', 0, null, {});
}

function defaultMessage(status: number): string {
  if (status === 0) return 'Cannot reach the server. Check your connection and try again.';
  if (status === 401) return 'Your session has expired. Sign in again.';
  if (status === 403) return 'You do not have access to this action.';
  if (status === 404) return 'We could not find what you asked for.';
  if (status === 429) return 'Too many attempts. Please wait a moment and try again.';
  return 'Something went wrong. Please try again.';
}

/** Unwraps the response envelope and converts failures into ApiError. */
export function unwrap<T>() {
  return (source: Observable<ApiEnvelope<T>>): Observable<T> =>
    source.pipe(
      map((envelope) => envelope.result),
      catchError((err: unknown) => throwError(() => toApiError(err)))
    );
}
