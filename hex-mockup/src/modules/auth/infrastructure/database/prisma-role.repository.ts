import { Prisma, type PrismaClient } from "../../../../generated/prisma/client.ts";
import { AppError } from "../../../../shared/errors/app-error.ts";
import { Role, roleNameKey } from "../../domain/entities/role.ts";
import type { RoleRepository } from "../../domain/repositories/role.repository.ts";

interface RoleRow {
  publicId: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  permissions: { permission: string }[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WITH_PERMISSIONS = {
  permissions: { select: { permission: true }, orderBy: { permission: "asc" } },
} as const;
/** Primero los roles de sistema y después el resto por nombre. */
const ORDER = [{ isSystem: "desc" }, { name: "asc" }] as const;

function toDomain(row: RoleRow): Role {
  return Role.restore({
    publicId: row.publicId,
    name: row.name,
    description: row.description,
    isSystem: row.isSystem,
    permissions: row.permissions.map((item) => item.permission),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function isPrismaError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

export class PrismaRoleRepository implements RoleRepository {
  private readonly prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async add(role: Role): Promise<void> {
    try {
      await this.prisma.role.create({
        data: {
          publicId: role.publicId,
          name: role.name,
          nameKey: roleNameKey(role.name),
          description: role.description,
          isSystem: role.isSystem,
          createdAt: role.createdAt,
          updatedAt: role.updatedAt,
          permissions: { create: role.permissions.map((permission) => ({ permission })) },
        },
      });
    } catch (error) {
      if (isPrismaError(error, "P2002")) {
        throw new AppError("conflict", { code: "ROLE_NAME_TAKEN", cause: error });
      }
      throw error;
    }
  }

  /** Los datos del rol y su lista de permisos se sustituyen en una sola transacción. */
  async update(role: Role): Promise<void> {
    try {
      await this.prisma.role.update({
        where: { publicId: role.publicId },
        data: {
          name: role.name,
          nameKey: roleNameKey(role.name),
          description: role.description,
          updatedAt: role.updatedAt,
          permissions: {
            deleteMany: {},
            create: role.permissions.map((permission) => ({ permission })),
          },
        },
      });
    } catch (error) {
      if (isPrismaError(error, "P2002")) {
        throw new AppError("conflict", { code: "ROLE_NAME_TAKEN", cause: error });
      }
      if (isPrismaError(error, "P2025")) {
        throw new AppError("not_found", { code: "ROLE_NOT_FOUND", cause: error });
      }
      throw error;
    }
  }

  async remove(publicId: string): Promise<void> {
    if (!UUID.test(publicId)) return;
    await this.prisma.role.deleteMany({ where: { publicId } });
  }

  async findByPublicId(publicId: string): Promise<Role | null> {
    if (!UUID.test(publicId)) return null;
    const row = await this.prisma.role.findUnique({
      where: { publicId },
      include: WITH_PERMISSIONS,
    });
    return row ? toDomain(row) : null;
  }

  async findByName(name: string): Promise<Role | null> {
    const row = await this.prisma.role.findUnique({
      where: { nameKey: roleNameKey(name) },
      include: WITH_PERMISSIONS,
    });
    return row ? toDomain(row) : null;
  }

  async list(): Promise<Role[]> {
    const rows = await this.prisma.role.findMany({
      include: WITH_PERMISSIONS,
      orderBy: [...ORDER],
    });
    return rows.map(toDomain);
  }

  async findByUser(userPublicId: string): Promise<Role[]> {
    if (!UUID.test(userPublicId)) return [];
    const rows = await this.prisma.role.findMany({
      where: { users: { some: { user: { publicId: userPublicId } } } },
      include: WITH_PERMISSIONS,
      orderBy: [...ORDER],
    });
    return rows.map(toDomain);
  }

  async setUserRoles(userPublicId: string, rolePublicIds: readonly string[]): Promise<void> {
    const ids = rolePublicIds.filter((id) => UUID.test(id));
    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { publicId: userPublicId },
        select: { id: true },
      });
      if (!user) throw new AppError("not_found", { code: "USER_NOT_FOUND" });
      const roles = await tx.role.findMany({
        where: { publicId: { in: ids } },
        select: { id: true },
      });
      await tx.userRole.deleteMany({ where: { userId: user.id } });
      await tx.userRole.createMany({
        data: roles.map((role) => ({ userId: user.id, roleId: role.id })),
      });
    });
  }

  async countActiveUsersWithRole(rolePublicId: string): Promise<number> {
    if (!UUID.test(rolePublicId)) return 0;
    return this.prisma.userRole.count({
      where: { role: { publicId: rolePublicId }, user: { status: "ACTIVE" } },
    });
  }
}
