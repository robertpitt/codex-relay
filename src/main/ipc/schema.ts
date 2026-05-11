import { Schema } from "effect";

export type RelaySchema<A> = Schema.Schema<A>;

export const emptyArgs = <A extends []>(): RelaySchema<A> => Schema.Tuple([]) as unknown as RelaySchema<A>;

export const ipcArgs = <A extends readonly unknown[]>(items: ReadonlyArray<Schema.Top>): RelaySchema<A> =>
  Schema.Tuple(items) as unknown as RelaySchema<A>;

export const ipcString = Schema.String;
export const ipcUnknown = Schema.Unknown;
export const ipcObject = Schema.Record(Schema.String, Schema.Unknown) as RelaySchema<Record<string, unknown>>;
export const ipcOptionalUnknown = Schema.optional(Schema.Unknown) as Schema.Top;

export const ipcVoid = Schema.Void as RelaySchema<void>;

export const ipcResult = <A>(): RelaySchema<A> => Schema.Unknown as RelaySchema<A>;
