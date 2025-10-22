import { createHmac } from "crypto";

export const signOraclePayload = (payload: unknown, secret: string): string => {
  if (!secret || secret.length === 0) {
    throw new Error("Oracle signing secret must be provided");
  }
  const serialized = stableStringify(payload);
  return createHmac("sha256", secret).update(serialized).digest("hex");
};

const stableStringify = (input: unknown): string => {
  if (input === null || typeof input !== "object") {
    return JSON.stringify(input);
  }

  if (Array.isArray(input)) {
    return `[${input.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(input as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  const serialized = entries
    .map(([key, value]) => `${JSON.stringify(key)}:${stableStringify(value)}`)
    .join(",");

  return `{${serialized}}`;
};
