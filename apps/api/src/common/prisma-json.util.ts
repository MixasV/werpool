import type { Prisma } from "@prisma/client";

export const serializeJson = (value: unknown): Prisma.JsonValue =>
  JSON.parse(JSON.stringify(value)) as Prisma.JsonValue;

export const serializeJsonInput = (
  value: Record<string, unknown> | null | undefined
): Prisma.InputJsonValue | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
};

export const parseJsonObject = <T = Record<string, unknown>>(
  value: Prisma.JsonValue | null | undefined
): T | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as unknown as T;
};
