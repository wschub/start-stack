import type { RequestHandler, Response } from "express";
import { parseBody } from "../../../../shared/http/validate.ts";
import type { ChangeUserStatus } from "../../application/use-cases/change-user-status.use-case.ts";
import type { GetUser } from "../../application/use-cases/get-user.use-case.ts";
import type { ListUsers } from "../../application/use-cases/list-users.use-case.ts";
import { changeStatusSchema, listUsersQuerySchema } from "../schemas/user.schemas.ts";

export interface UsersControllerDeps {
  listUsers: ListUsers;
  getUser: GetUser;
  changeUserStatus: ChangeUserStatus;
  /** Identificador público de quien hace la petición (lo deja el middleware de autenticación). */
  currentUserId: (res: Response) => string;
}

function idOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function createUsersController(deps: UsersControllerDeps) {
  const list: RequestHandler = async (req, res) => {
    res.json(await deps.listUsers.execute(parseBody(listUsersQuerySchema, req.query)));
  };

  const get: RequestHandler = async (req, res) => {
    res.json({ user: await deps.getUser.execute(idOf(req.params.id)) });
  };

  const changeStatus: RequestHandler = async (req, res) => {
    const { status } = parseBody(changeStatusSchema, req.body);
    const user = await deps.changeUserStatus.execute({
      actorPublicId: deps.currentUserId(res),
      userPublicId: idOf(req.params.id),
      status,
    });
    res.json({ user });
  };

  return { list, get, changeStatus };
}
