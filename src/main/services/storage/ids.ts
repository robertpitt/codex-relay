import { ulid } from "ulid";

export const newId = (prefix: string): string => `${prefix}_${ulid().toLowerCase()}`;
