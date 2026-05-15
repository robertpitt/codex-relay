import { Schema } from "effect";
import type { RelaySchema } from "../schemas";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";
export type HttpRequestLocation = "query" | "body";

export type HttpRequestRule<Request> = {
  readonly location: HttpRequestLocation;
  readonly schema: RelaySchema<Request>;
};

export type HttpEndpoint<Request, Response> = {
  readonly method: HttpMethod;
  readonly path: `/api/${string}`;
  readonly request?: HttpRequestRule<Request>;
  readonly response?: RelaySchema<Response>;
};

export type AnyHttpEndpoint = HttpEndpoint<unknown, unknown>;
export type HttpEndpointRequest<Endpoint> = Endpoint extends HttpEndpoint<infer Request, unknown> ? Request : never;
export type HttpEndpointResponse<Endpoint> = Endpoint extends HttpEndpoint<unknown, infer Response> ? Response : never;

export const defineEndpoint = <Request, Response>(endpoint: HttpEndpoint<Request, Response>): HttpEndpoint<Request, Response> => endpoint;

export const arrayOf = <A>(schema: RelaySchema<A>): RelaySchema<A[]> =>
  Schema.mutable(Schema.Array(schema)) as RelaySchema<A[]>;

export const apiErrorSchema = Schema.Struct({
  code: Schema.String,
  message: Schema.String
});
export type ApiErrorPayload = typeof apiErrorSchema.Type;

export const apiErrorResponseSchema = Schema.Struct({
  error: apiErrorSchema
});
export type ApiErrorResponse = typeof apiErrorResponseSchema.Type;
