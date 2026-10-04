export class DomainError extends Error {
  constructor(
    public code: string,
    public status = 409,
    message = code,
  ) {
    super(message);
  }
}
export function invariant(condition: unknown, code: string, status = 409): asserts condition {
  if (!condition) throw new DomainError(code, status);
}
