import type { RequestHandler } from "express";
import { AppError } from "../../../../shared/errors/app-error.ts";
import { parseBody } from "../../../../shared/http/validate.ts";
import { negotiateLocale } from "../../../../shared/i18n/locale.ts";
import type { PermissionRegistry } from "../../../../shared/permissions/permission.ts";
import type { UserRepository } from "../../../users/domain/repositories/user.repository.ts";
import type { AssignUserRoles } from "../../application/use-cases/assign-user-roles.use-case.ts";
import type {
  GetUserAccess,
  UserAccess,
} from "../../application/use-cases/get-user-access.use-case.ts";
import type { ManageRoles } from "../../application/use-cases/manage-roles.use-case.ts";
import { authenticatedUser } from "../middlewares/require-auth.ts";
import { assignRolesSchema, createRoleSchema, updateRoleSchema } from "../schemas/role.schemas.ts";

export interface RolesControllerDeps {
  registry: PermissionRegistry;
  manageRoles: ManageRoles;
  getUserAccess: GetUserAccess;
  assignUserRoles: AssignUserRoles;
  users: UserRepository;
}

function idOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toUserRoles(access: UserAccess) {
  return { roles: access.roles, permissions: access.permissions };
}

export function createRolesController(deps: RolesControllerDeps) {
  /** Catálogo de permisos agrupado por módulo, con el nombre en el idioma de la petición. */
  const listPermissions: RequestHandler = (req, res) => {
    const locale = negotiateLocale(req.get("accept-language"));
    res.json({
      groups: deps.registry.groups().map((group) => ({
        module: group.module,
        permissions: group.permissions.map(({ key, label }) => ({ key, label: label[locale] })),
      })),
    });
  };

  const list: RequestHandler = async (_req, res) => {
    res.json({ roles: await deps.manageRoles.list() });
  };

  const get: RequestHandler = async (req, res) => {
    res.json({ role: await deps.manageRoles.get(idOf(req.params.id)) });
  };

  const create: RequestHandler = async (req, res) => {
    const role = await deps.manageRoles.create(parseBody(createRoleSchema, req.body));
    res.status(201).json({ role });
  };

  const update: RequestHandler = async (req, res) => {
    const changes = parseBody(updateRoleSchema, req.body);
    res.json({ role: await deps.manageRoles.update(idOf(req.params.id), changes) });
  };

  const remove: RequestHandler = async (req, res) => {
    await deps.manageRoles.remove(idOf(req.params.id));
    res.status(204).end();
  };

  const getUserRoles: RequestHandler = async (req, res) => {
    const user = await deps.users.findByPublicId(idOf(req.params.id));
    if (!user) throw new AppError("not_found", { code: "USER_NOT_FOUND" });
    res.json(toUserRoles(await deps.getUserAccess.execute(user.publicId)));
  };

  const setUserRoles: RequestHandler = async (req, res) => {
    const { roleIds } = parseBody(assignRolesSchema, req.body);
    const access = await deps.assignUserRoles.execute({
      actorPublicId: authenticatedUser(res).publicId,
      userPublicId: idOf(req.params.id),
      roleIds,
    });
    res.json(toUserRoles(access));
  };

  return { listPermissions, list, get, create, update, remove, getUserRoles, setUserRoles };
}
