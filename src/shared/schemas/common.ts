import { Effect, Option, Schema, SchemaGetter } from "effect";
import * as SchemaIssue from "effect/SchemaIssue";

export const RELAY_SCHEMA_VERSION = 1;

export type RelaySchemaTop = Schema.Top & {
  readonly DecodingServices: never;
  readonly EncodingServices: never;
};
export type RelaySchema<T> = Schema.Codec<T, unknown, never, never>;
type RelayStructFields = { readonly [x: PropertyKey]: RelaySchemaTop };

export type MutableSchemaType<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? MutableSchemaType<Item>[]
    : T extends object
      ? { -readonly [Key in keyof T]: MutableSchemaType<T[Key]> }
      : T;

export type SchemaType<S extends { readonly Type: unknown }> = MutableSchemaType<S["Type"]>;

export const nonEmptyString = Schema.String.check(Schema.isMinLength(1));

export const numberSchema = Schema.Number.check(
  Schema.makeFilter((value) => (Number.isNaN(value) ? "Expected number, got NaN" : undefined))
);

export const unknownRecordSchema = Schema.Record(Schema.String, Schema.Unknown) as RelaySchema<Record<string, unknown>>;

export const mutableArray = <S extends Schema.Top>(schema: S) => Schema.mutable(Schema.Array(schema));

export const withDefault = <S extends Schema.Top>(schema: S, getDefault: () => S["Encoded"]) =>
  schema.pipe(Schema.withDecodingDefault(Effect.sync(getDefault)));

const passthroughSchemaFields = new WeakMap<object, ReadonlySet<string>>();
const strictSchemaFields = new WeakMap<object, ReadonlySet<string>>();

export const passthroughFieldNamesFor = (schema: unknown): ReadonlySet<string> | undefined =>
  typeof schema === "object" && schema !== null ? passthroughSchemaFields.get(schema) : undefined;

export const strictFieldNamesFor = (schema: unknown): ReadonlySet<string> | undefined =>
  typeof schema === "object" && schema !== null ? strictSchemaFields.get(schema) : undefined;

export const passthroughStruct = <const Fields extends RelayStructFields>(fields: Fields) => {
  const schema = Schema.Struct(fields) as RelaySchema<Schema.Struct.Type<Fields> & Record<string, unknown>>;
  passthroughSchemaFields.set(schema as object, new Set(Object.keys(fields)));
  return schema;
};

export const strictStruct = <const Fields extends RelayStructFields>(fields: Fields) => {
  const fieldNames = new Set(Object.keys(fields));
  const structSchema = Schema.Struct(fields);
  const schema = Schema.Unknown.pipe(
    Schema.decodeTo(structSchema, {
      decode: SchemaGetter.transformOrFail((input) => {
        if (typeof input !== "object" || input === null || Array.isArray(input)) {
          return Effect.succeed(input as Schema.Struct.Encoded<Fields>);
        }

        const unexpectedKey = Object.keys(input).find((key) => !fieldNames.has(key));
        if (unexpectedKey) {
          return Effect.fail(
            new SchemaIssue.Pointer(
              [unexpectedKey],
              new SchemaIssue.InvalidValue(Option.some((input as Record<string, unknown>)[unexpectedKey]), {
                message: `Unexpected key with value ${String((input as Record<string, unknown>)[unexpectedKey])}`
              })
            )
          );
        }

        return Effect.succeed(input as Schema.Struct.Encoded<Fields>);
      }),
      encode: SchemaGetter.transform((value) => value)
    })
  ) as RelaySchema<Schema.Struct.Type<Fields>>;
  strictSchemaFields.set(schema as object, fieldNames);
  return schema;
};

const dateToIsoString = Schema.Date.pipe(
  Schema.decodeTo(nonEmptyString, {
    decode: SchemaGetter.transform((value: Date) => value.toISOString()),
    encode: SchemaGetter.transform((value: string) => new Date(value))
  })
);

export const isoString = Schema.Union([nonEmptyString, dateToIsoString]) satisfies RelaySchema<string>;

export const defaultStringArray = () => [] as string[];

export const nullableStringWithDefault = () => withDefault(Schema.NullOr(Schema.String), () => null);

export const stringArrayWithDefault = () => withDefault(mutableArray(Schema.String), defaultStringArray);
