import { Effect } from "effect";

export const fetchUrlEffect = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1]
): Effect.Effect<Response, unknown> =>
  Effect.tryPromise({
    try: () => globalThis.fetch(input, init),
    catch: (error) => error
  });
