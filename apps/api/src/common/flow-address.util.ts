import { BadRequestException } from "@nestjs/common";

const FLOW_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{1,16}$/;

export const normalizeFlowAddress = (
  value: string,
  field: string = "address"
): string => {
  if (typeof value !== "string") {
    throw new BadRequestException(`${field} is required`);
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new BadRequestException(`${field} must be a non-empty string`);
  }

  const prefixed = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!FLOW_ADDRESS_PATTERN.test(prefixed)) {
    throw new BadRequestException(`${field} must be a valid Flow address`);
  }

  return prefixed.toLowerCase();
};

export const isValidFlowAddress = (value: string): boolean => {
  try {
    normalizeFlowAddress(value);
    return true;
  } catch {
    return false;
  }
};
