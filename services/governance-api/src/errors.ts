/** Error with an HTTP status and a stable machine-readable code. Messages are safe to show to users. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** A policy says no. The message explains why, for the assistant to relay to the user. */
export class PolicyRefusal extends HttpError {
  constructor(message: string) {
    super(422, 'policy_refused', message);
  }
}
