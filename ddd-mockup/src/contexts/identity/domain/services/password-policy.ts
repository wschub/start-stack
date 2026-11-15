import { AppError } from "../../../../shared/errors/app-error.ts";

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

export function assertPasswordPolicy(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new AppError("validation", {
      code: "WEAK_PASSWORD",
      details: { field: "password", min: MIN_PASSWORD_LENGTH, max: MAX_PASSWORD_LENGTH },
    });
  }
}
