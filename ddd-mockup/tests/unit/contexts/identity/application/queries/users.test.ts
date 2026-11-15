import { beforeEach, describe, expect, it } from "vitest";
import { GetUser } from "../../../../../../src/contexts/identity/application/queries/get-user.query.ts";
import { ListUsers } from "../../../../../../src/contexts/identity/application/queries/list-users.query.ts";
import { User } from "../../../../../../src/contexts/identity/domain/aggregates/user.ts";
import { AppError } from "../../../../../../src/shared/errors/app-error.ts";
import { InMemoryUserRepository } from "../../../../../helpers/fakes.ts";

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return `${error.kind}:${error.code}`;
    throw error;
  }
  return "sin error";
}

let users: InMemoryUserRepository;

const add = async (email: string, firstName = "Ana", lastName = "Gómez") => {
  const user = User.create({ email, passwordHash: "secreto", firstName, lastName });
  await users.add(user);
  return user;
};

beforeEach(() => {
  users = new InMemoryUserRepository();
});

describe("ListUsers", () => {
  beforeEach(async () => {
    await add("carla@example.com", "Carla", "Ruiz");
    await add("ana@example.com", "Ana", "Gómez");
    await add("beto@example.com", "Beto", "Anaya");
  });

  it("devuelve la primera página ordenada por correo, sin datos privados", async () => {
    const page = await new ListUsers({ users }).execute();

    expect(page).toMatchObject({ page: 1, pageSize: 20, total: 3 });
    expect(page.items.map((user) => user.email)).toEqual([
      "ana@example.com",
      "beto@example.com",
      "carla@example.com",
    ]);
    expect(JSON.stringify(page)).not.toMatch(/secreto|passwordHash/);
  });

  it("pagina y conserva el total", async () => {
    const page = await new ListUsers({ users }).execute({ page: 2, pageSize: 2 });

    expect(page.items.map((user) => user.email)).toEqual(["carla@example.com"]);
    expect(page).toMatchObject({ page: 2, pageSize: 2, total: 3 });
  });

  it("busca en correo, nombre y apellido sin distinguir mayúsculas", async () => {
    const page = await new ListUsers({ users }).execute({ search: " ANA " });

    expect(page.items.map((user) => user.email)).toEqual(["ana@example.com", "beto@example.com"]);
    expect(page.total).toBe(2);
  });

  it("corrige páginas y tamaños fuera de rango", async () => {
    const page = await new ListUsers({ users }).execute({ page: 0, pageSize: 5000 });

    expect(page).toMatchObject({ page: 1, pageSize: 100 });
  });
});

describe("GetUser", () => {
  it("devuelve los datos públicos o USER_NOT_FOUND", async () => {
    const ana = await add("ana@example.com");
    const getUser = new GetUser({ users });

    expect(await getUser.execute(ana.publicId)).toMatchObject({ email: "ana@example.com" });
    expect(await codeOf(getUser.execute("no-existe"))).toBe("not_found:USER_NOT_FOUND");
  });
});
