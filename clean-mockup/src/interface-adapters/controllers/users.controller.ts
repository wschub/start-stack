import type { UseCase } from "../../use-cases/use-case.ts";
import type { ChangeUserStatusInput } from "../../use-cases/users/change-user-status.use-case.ts";
import type { ListUsersInput, PublicUserPage } from "../../use-cases/users/list-users.use-case.ts";
import type { PublicUser } from "../../use-cases/users/public-user.ts";
import { currentUser } from "../http/current-user.ts";
import { type Controller, ok } from "../http/http.ts";
import { parseBody } from "../http/parse-body.ts";
import { changeStatusSchema, listUsersQuerySchema } from "../schemas/user.schemas.ts";

export interface UsersControllerDeps {
  listUsers: UseCase<ListUsersInput | undefined, PublicUserPage>;
  getUser: UseCase<string, PublicUser>;
  changeUserStatus: UseCase<ChangeUserStatusInput, PublicUser>;
}

export function createUsersController(deps: UsersControllerDeps) {
  const list: Controller = async (request) =>
    ok(await deps.listUsers.execute(parseBody(listUsersQuerySchema, request.query)));

  const get: Controller = async (request) =>
    ok({ user: await deps.getUser.execute(request.params.id ?? "") });

  const changeStatus: Controller = async (request) => {
    const { status } = parseBody(changeStatusSchema, request.body);
    const user = await deps.changeUserStatus.execute({
      actorPublicId: currentUser(request).publicId,
      userPublicId: request.params.id ?? "",
      status,
    });
    return ok({ user });
  };

  return { list, get, changeStatus };
}
