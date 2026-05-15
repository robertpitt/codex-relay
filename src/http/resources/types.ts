import type { Effect } from "effect";
import type {
  AnyHttpEndpoint,
  HttpEndpoint,
  HttpEndpointRequest,
  HttpEndpointResponse
} from "@shared/http";

export type HttpResourceRoute<Endpoint extends AnyHttpEndpoint = AnyHttpEndpoint> = {
  readonly endpoint: Endpoint;
  readonly handle: (
    request: HttpEndpointRequest<Endpoint>
  ) => Effect.Effect<HttpEndpointResponse<Endpoint>, unknown, unknown>;
};

export const route = <Endpoint extends HttpEndpoint<unknown, unknown>>(
  endpoint: Endpoint,
  handle: (
    request: HttpEndpointRequest<Endpoint>
  ) => Effect.Effect<HttpEndpointResponse<Endpoint>, unknown, unknown>
): HttpResourceRoute<Endpoint> => ({ endpoint, handle });
