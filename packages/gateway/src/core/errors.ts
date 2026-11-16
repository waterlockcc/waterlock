import type { GatewayError } from "./provider.js";

const ERROR_PREFIX = "Error for waterlock proxy: ";

export function gatewayError(
  status: number,
  code: string,
  reason: string,
  action?: string,
  rules?: string[],
): GatewayError {
  return {
    status,
    code,
    message: ERROR_PREFIX + reason,
    ...(action ? { action } : {}),
    ...(rules?.length ? { rules } : {}),
  };
}
