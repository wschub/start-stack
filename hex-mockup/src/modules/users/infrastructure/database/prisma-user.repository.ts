import { Prisma, type PrismaClient } from "../../../../generated/prisma/client.ts";
import { AppError } from "../../../../shared/errors/app-error.ts";
import { DEFAULT_LOCALE, type Locale, SUPPORTED_LOCALES } from "../../../../shared/i18n/locale.ts";
import { User, type UserStatus } from "../../domain/entities/user.entity.ts";
import type {
  UserListQuery,
  UserPage,
  UserRepository,
} from "../../domain/repositories/user.repository.ts";

interface UserRow {
  publicId: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  countryDefault: string | null;
  mobilePhone: string | null;
  locale: string;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toLocale(value: string): Locale {
  return SUPPORTED_LOCALES.find((locale) => locale === value) ?? DEFAULT_LOCALE;
}

function toDomain(row: UserRow): User {
  return User.restore({
    publicId: row.publicId,
    email: row.email,
    passwordHash: row.passwordHash,
    firstName: row.firstName,
    lastName: row.lastName,
    countryDefault: row.countryDefault,
    mobilePhone: row.mobilePhone,
    locale: toLocale(row.locale),
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class PrismaUserRepository implements UserRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async add(user: User): Promise<void> {
    try {
      await this.prisma.user.create({ data: user.toProps() });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError("conflict", { code: "EMAIL_ALREADY_EXISTS", cause: error });
      }
      throw error;
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    return row ? toDomain(row) : null;
  }

  async findByPublicId(publicId: string): Promise<User | null> {
    if (!UUID.test(publicId)) return null;
    const row = await this.prisma.user.findUnique({ where: { publicId } });
    return row ? toDomain(row) : null;
  }

  async list(query: UserListQuery): Promise<UserPage> {
    const search = query.search?.trim();
    const contains = { contains: search ?? "", mode: "insensitive" } as const;
    const where = search
      ? { OR: [{ email: contains }, { firstName: contains }, { lastName: contains }] }
      : {};
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { email: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return { items: rows.map(toDomain), total };
  }

  async update(user: User): Promise<void> {
    const props = user.toProps();
    const data = {
      email: props.email,
      passwordHash: props.passwordHash,
      firstName: props.firstName,
      lastName: props.lastName,
      countryDefault: props.countryDefault,
      mobilePhone: props.mobilePhone,
      locale: props.locale,
      status: props.status,
      updatedAt: props.updatedAt,
    };
    try {
      await this.prisma.user.update({ where: { publicId: props.publicId }, data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new AppError("not_found", { code: "USER_NOT_FOUND", cause: error });
      }
      throw error;
    }
  }
}
