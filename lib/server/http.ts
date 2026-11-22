export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Wraps a route body so every failure becomes a JSON error with a useful status. */
export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await fn());
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 502;
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status });
  }
}
