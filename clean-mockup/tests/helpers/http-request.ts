import type { HttpRequest } from "../../src/interface-adapters/http/http.ts";
import type { PublicUser } from "../../src/use-cases/users/public-user.ts";

/** Petición vacía sobre la que cada prueba indica solo lo que le importa. */
export function httpRequest(overrides: Partial<HttpRequest> = {}): HttpRequest {
  return { body: undefined, query: {}, params: {}, headers: {}, cookies: {}, ...overrides };
}

export const ANA: PublicUser = {
  publicId: "11111111-1111-4111-8111-111111111111",
  email: "ana@example.com",
  firstName: "Ana",
  lastName: "Gómez",
  countryDefault: null,
  mobilePhone: null,
  locale: "es",
  status: "ACTIVE",
  createdAt: "2026-11-15T10:00:00.000Z",
};
