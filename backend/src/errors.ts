export class DomainError extends Error {
  constructor(
    public code: string,
    public status = 409,
    message = code,
    public details?: unknown,
  ) {
    super(message);
  }
}
export function invariant(
  condition: unknown,
  code: string,
  status = 409,
  details?: unknown,
): asserts condition {
  if (!condition) throw new DomainError(code, status, code, details);
}
