import type { AssignUserRolesInput } from "../../use-cases/auth/assign-user-roles.use-case.ts";
import type { CreateRoleInput } from "../../use-cases/auth/create-role.use-case.ts";
import type { UserAccess } from "../../use-cases/auth/get-user-access.use-case.ts";
import type { RoleView } from "../../use-cases/auth/role-view.ts";
import type { UpdateRoleInput } from "../../use-cases/auth/update-role.use-case.ts";
import type { PermissionGroup } from "../../use-cases/permissions/permission.ts";
import type { UseCase } from "../../use-cases/use-case.ts";
import type { PublicUser } from "../../use-cases/users/public-user.ts";
import { currentUser } from "../http/current-user.ts";
import { type Controller, created, noContent, ok } from "../http/http.ts";
import { negotiateLocale } from "../http/negotiate-locale.ts";
import { parseBody } from "../http/parse-body.ts";
import { presentUserRoles } from "../presenters/access.presenter.ts";
import { presentPermissionCatalog } from "../presenters/permissions.presenter.ts";
import { assignRolesSchema, createRoleSchema, updateRoleSchema } from "../schemas/role.schemas.ts";

export interface RolesControllerDeps {
  listPermissions: UseCase<void, PermissionGroup[]>;
  listRoles: UseCase<void, RoleView[]>;
  getRole: UseCase<string, RoleView>;
  createRole: UseCase<CreateRoleInput, RoleView>;
  updateRole: UseCase<UpdateRoleInput, RoleView>;
  deleteRole: UseCase<string, void>;
  getUser: UseCase<string, PublicUser>;
  getUserAccess: UseCase<string, UserAccess>;
  assignUserRoles: UseCase<AssignUserRolesInput, UserAccess>;
}

export function createRolesController(deps: RolesControllerDeps) {
  const listPermissions: Controller = async (request) => {
    const locale = negotiateLocale(request.headers["accept-language"]);
    return ok(presentPermissionCatalog(await deps.listPermissions.execute(), locale));
  };

  const list: Controller = async () => ok({ roles: await deps.listRoles.execute() });

  const get: Controller = async (request) =>
    ok({ role: await deps.getRole.execute(request.params.id ?? "") });

  const create: Controller = async (request) => {
    const role = await deps.createRole.execute(parseBody(createRoleSchema, request.body));
    return created({ role });
  };

  const update: Controller = async (request) => {
    const changes = parseBody(updateRoleSchema, request.body);
    return ok({
      role: await deps.updateRole.execute({ publicId: request.params.id ?? "", changes }),
    });
  };

  const remove: Controller = async (request) => {
    await deps.deleteRole.execute(request.params.id ?? "");
    return noContent();
  };

  const getUserRoles: Controller = async (request) => {
    // Responde USER_NOT_FOUND si el usuario no existe, en vez de una lista de roles vacía.
    const user = await deps.getUser.execute(request.params.id ?? "");
    return ok(presentUserRoles(await deps.getUserAccess.execute(user.publicId)));
  };

  const setUserRoles: Controller = async (request) => {
    const { roleIds } = parseBody(assignRolesSchema, request.body);
    const access = await deps.assignUserRoles.execute({
      actorPublicId: currentUser(request).publicId,
      userPublicId: request.params.id ?? "",
      roleIds,
    });
    return ok(presentUserRoles(access));
  };

  return { listPermissions, list, get, create, update, remove, getUserRoles, setUserRoles };
}
