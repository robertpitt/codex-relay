import { Option, Schema } from "effect";
import * as SchemaIssue from "effect/SchemaIssue";
import {
  passthroughFieldNamesFor,
  strictFieldNamesFor,
  type RelaySchema
} from "../schemas";

const isSchemaIssue = (value: unknown): boolean =>
  typeof value === "object" && value !== null && "~effect/SchemaIssue/Issue" in value;

const normalizeSchemaError = (error: unknown): unknown => {
  if (Schema.isSchemaError(error)) return error;
  if (error instanceof Error && isSchemaIssue(error.cause)) {
    return new Schema.SchemaError(error.cause as ConstructorParameters<typeof Schema.SchemaError>[0]);
  }
  return error;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const unexpectedKeyError = (key: string, value: unknown): Schema.SchemaError =>
  new Schema.SchemaError(
    new SchemaIssue.Pointer(
      [key],
      new SchemaIssue.InvalidValue(Option.some(value), { message: `Unexpected key with value ${String(value)}` })
    )
  );

export const decodeHttpPayload = <A>(schema: RelaySchema<A>, input: unknown): A => {
  try {
    const strictFields = strictFieldNamesFor(schema);
    if (strictFields && isRecord(input)) {
      const unexpectedKey = Object.keys(input).find((key) => !strictFields.has(key));
      if (unexpectedKey) throw unexpectedKeyError(unexpectedKey, input[unexpectedKey]);
    }

    const parsed = Schema.decodeUnknownSync(schema as Schema.Decoder<A>)(input);
    const passthroughFields = passthroughFieldNamesFor(schema);
    if (!passthroughFields || !isRecord(input) || !isRecord(parsed)) return parsed;

    const extras = Object.fromEntries(Object.entries(input).filter(([key]) => !passthroughFields.has(key)));
    return { ...extras, ...parsed } as A;
  } catch (error) {
    throw normalizeSchemaError(error);
  }
};

export const isHttpPayloadSchemaError = (error: unknown): error is Schema.SchemaError => Schema.isSchemaError(error);
