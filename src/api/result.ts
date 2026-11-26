import type { AppError, Result } from "../bindings";

export function unwrapResult<T>(result: Result<T, AppError>): T {
  if (result.status === "error") {
    throw result.error;
  }
  return result.data;
}

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof (value as { code: unknown }).code === "string"
  );
}
