import { beforeEach, describe, expect, it } from "vitest";
import { createUsersController } from "../../../../src/interface-adapters/controllers/users.controller.ts";
import type { ChangeUserStatusInput } from "../../../../src/use-cases/users/change-user-status.use-case.ts";
import type {
  ListUsersInput,
  PublicUserPage,
} from "../../../../src/use-cases/users/list-users.use-case.ts";
import type { PublicUser } from "../../../../src/use-cases/users/public-user.ts";
import { ANA, httpRequest } from "../../../helpers/http-request.ts";
import { StubUseCase } from "../../../helpers/use-case-fakes.ts";

const TARGET = "22222222-2222-4222-8222-222222222222";
const PAGE: PublicUserPage = { items: [ANA], page: 2, pageSize: 5, total: 6 };

describe("controlador de usuarios", () => {
  let listUsers: StubUseCase<ListUsersInput | undefined, PublicUserPage>;
  let getUser: StubUseCase<string, PublicUser>;
  let changeUserStatus: StubUseCase<ChangeUserStatusInput, PublicUser>;
  let controller: ReturnType<typeof createUsersController>;

  beforeEach(() => {
    listUsers = StubUseCase.returning(PAGE);
    getUser = StubUseCase.returning(ANA);
    changeUserStatus = StubUseCase.returning({ ...ANA, status: "INACTIVE" });
    controller = createUsersController({ listUsers, getUser, changeUserStatus });
  });

  it("list convierte los parámetros de la URL en números y devuelve la página", async () => {
    const response = await controller.list(
      httpRequest({ query: { page: "2", pageSize: "5", search: "ana" } }),
    );

    expect(listUsers.calls).toEqual([{ page: 2, pageSize: 5, search: "ana" }]);
    expect(response).toEqual({ status: 200, body: PAGE });
  });

  it("list rechaza parámetros desconocidos o que no son números", async () => {
    await expect(controller.list(httpRequest({ query: { page: "dos" } }))).rejects.toMatchObject({
      kind: "validation",
    });
    await expect(controller.list(httpRequest({ query: { sort: "email" } }))).rejects.toMatchObject({
      kind: "validation",
    });
    expect(listUsers.calls).toEqual([]);
  });

  it("get devuelve el usuario de la ruta", async () => {
    const response = await controller.get(httpRequest({ params: { id: TARGET } }));

    expect(getUser.calls).toEqual([TARGET]);
    expect(response).toEqual({ status: 200, body: { user: ANA } });
  });

  it("changeStatus indica quién hace el cambio, a quién y el estado nuevo", async () => {
    const response = await controller.changeStatus(
      httpRequest({ user: ANA, params: { id: TARGET }, body: { status: "INACTIVE" } }),
    );

    expect(changeUserStatus.calls).toEqual([
      { actorPublicId: ANA.publicId, userPublicId: TARGET, status: "INACTIVE" },
    ]);
    expect(response).toMatchObject({ status: 200, body: { user: { status: "INACTIVE" } } });
  });

  it("changeStatus rechaza un estado desconocido", async () => {
    const result = controller.changeStatus(
      httpRequest({ user: ANA, params: { id: TARGET }, body: { status: "BANNED" } }),
    );

    await expect(result).rejects.toMatchObject({ kind: "validation" });
    expect(changeUserStatus.calls).toEqual([]);
  });

  it("changeStatus exige un usuario identificado", async () => {
    const result = controller.changeStatus(
      httpRequest({ params: { id: TARGET }, body: { status: "INACTIVE" } }),
    );

    await expect(result).rejects.toMatchObject({ kind: "unauthenticated" });
  });
});
