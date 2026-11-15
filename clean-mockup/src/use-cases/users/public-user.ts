import type { User } from "../../entities/user.ts";

export interface PublicUser {
  publicId: string;
  email: string;
  firstName: string;
  lastName: string;
  countryDefault: string | null;
  mobilePhone: string | null;
  locale: string;
  status: string;
  createdAt: string;
}

export function toPublicUser(user: User): PublicUser {
  return {
    publicId: user.publicId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    countryDefault: user.countryDefault,
    mobilePhone: user.mobilePhone,
    locale: user.locale,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
  };
}
