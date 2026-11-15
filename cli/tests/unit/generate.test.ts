import { describe, expect, it } from "vitest";
import { renderProject } from "../../src/generate.ts";
import { ARCHITECTURES, ARCHITECTURE_INFO } from "../../src/registry.ts";
import { readTemplate, type Tree } from "../../src/template.ts";

const text = (tree: Tree, path: string): string => {
  const content = tree.get(path);
  if (!content) throw new Error(`${path} is missing`);
  return content.toString("utf8");
};

const render = (architecture: (typeof ARCHITECTURES)[number], overrides = {}) => {
  const tree = renderProject(readTemplate(architecture), {
    name: "shop-api",
    architecture,
    docker: true,
    dbPort: 55440,
    cliVersion: "1.2.3",
    jwtSecret: "s".repeat(64),
    ...overrides,
  });
  return tree;
};

describe.each(ARCHITECTURES)("plantilla %s", (architecture) => {
  const info = ARCHITECTURE_INFO[architecture];
  const original = readTemplate(architecture);

  it("la plantilla trae el proyecto completo de la maqueta", () => {
    expect(original.size).toBeGreaterThan(150);
    for (const path of ["package.json", "package-lock.json", ".scaffold.json", "Dockerfile"]) {
      expect(original.has(path), path).toBe(true);
    }
    expect(original.has(".env"), "no debe traer secretos").toBe(false);
    expect([...original.keys()].some((path) => path.includes("node_modules"))).toBe(false);
  });

  it("no queda ningún rastro de la maqueta en el proyecto generado", () => {
    const leftovers: string[] = [];
    for (const [path, content] of render(architecture)) {
      if (path === "package-lock.json" || content.includes(0)) continue;
      const body = content.toString("utf8");
      for (const token of [
        `${info.prefix}-mockup`,
        `${info.prefix}_mockup`,
        "-mockup",
        "_mockup",
      ]) {
        if (body.includes(token)) leftovers.push(`${path}: ${token}`);
      }
    }

    expect(leftovers).toEqual([]);
  });

  it("renombra el proyecto en el paquete, el lockfile, el manifiesto y los valores por defecto", () => {
    const tree = render(architecture);

    expect(JSON.parse(text(tree, "package.json")).name).toBe("shop-api");
    expect(JSON.parse(text(tree, "package-lock.json")).name).toBe("shop-api");
    expect(JSON.parse(text(tree, ".scaffold.json")).name).toBe("shop-api");
    expect(text(tree, ".env.example")).toContain("JWT_ISSUER=shop-api");
    expect(text(tree, ".env.example")).toContain("JWT_AUDIENCE=shop-api-api");
    expect(text(tree, "src/config/env.ts")).toContain('default("shop-api")');
  });

  it("la base de datos usa el nombre del proyecto y el puerto elegido, en todos los sitios", () => {
    const tree = render(architecture);
    const url = "postgresql://app:app@127.0.0.1:55440/shop_api";

    expect(text(tree, ".env.example")).toContain(`DATABASE_URL="${url}"`);
    expect(text(tree, ".env")).toContain(`DATABASE_URL="${url}"`);
    expect(text(tree, "docker-compose.yml")).toContain('"127.0.0.1:55440:5432"');
    expect(text(tree, "docker-compose.yml")).toContain("POSTGRES_DB: shop_api");
    expect(text(tree, "docker-compose.yml")).toContain("pg_isready -U app -d shop_api");
    expect(text(tree, "README.md")).not.toContain(String(info.port));
  });

  it("el .env generado lleva un secreto propio y el de ejemplo se conserva", () => {
    const tree = render(architecture);

    expect(text(tree, ".env")).toContain(`JWT_ACCESS_SECRET=${"s".repeat(64)}`);
    expect(text(tree, ".env.example")).toContain("JWT_ACCESS_SECRET=change-me");
  });

  it("los hooks de git y el script prepare funcionan con el proyecto como raíz", () => {
    const tree = render(architecture);

    expect(JSON.parse(text(tree, "package.json")).scripts.prepare).toBe("husky");
    for (const hook of [".husky/pre-commit", ".husky/pre-push"]) {
      expect(text(tree, hook)).not.toMatch(/^cd /m);
      expect(text(tree, hook)).toContain("npm run");
    }
  });

  it("el manifiesto registra la versión del CLI y las opciones", () => {
    const manifest = JSON.parse(text(render(architecture), ".scaffold.json"));

    expect(manifest.cliVersion).toBe("1.2.3");
    expect(manifest.deploy.docker).toBe(true);
    expect(manifest.apps[0].architecture).toBe(architecture);
  });

  it("devuelve .gitignore a su nombre", () => {
    const tree = render(architecture);

    expect(tree.has(".gitignore")).toBe(true);
    expect([...tree.keys()].some((path) => path.endsWith("_gitignore"))).toBe(false);
  });

  it("también acepta la plantilla empaquetada, donde .gitignore se llama _gitignore", () => {
    const packaged: Tree = new Map();
    for (const [path, content] of original) {
      packaged.set(path.replace(/(^|\/)\.gitignore$/, "$1_gitignore"), content);
    }

    const tree = renderProject(packaged, {
      name: "shop-api",
      architecture,
      docker: true,
      dbPort: 55440,
      cliVersion: "1.2.3",
      jwtSecret: "s".repeat(64),
    });

    expect(tree.has(".gitignore")).toBe(true);
    expect(tree.has("_gitignore")).toBe(false);
  });

  it("sin Docker quita el Dockerfile y todo lo que lo usa, y deja el Postgres de desarrollo", () => {
    const tree = render(architecture, { docker: false });

    expect(tree.has("Dockerfile")).toBe(false);
    expect(tree.has(".dockerignore")).toBe(false);
    const compose = text(tree, "docker-compose.yml");
    expect(compose).toContain("postgres:");
    expect(compose).toContain("volumes:");
    expect(compose).not.toMatch(/migrate:|api:|profiles/);
    expect(text(tree, ".github/workflows/ci.yml")).not.toMatch(/docker compose --profile app/);
    expect(text(tree, ".github/workflows/ci.yml")).toContain("npm audit");
    expect(text(tree, ".github/dependabot.yml")).not.toContain("package-ecosystem: docker");
    expect(text(tree, ".github/dependabot.yml")).toContain("package-ecosystem: npm");
    expect(text(tree, "README.md")).not.toContain("## Docker\n");
    expect(text(tree, "README.en.md")).not.toContain("## Docker\n");
    expect(JSON.parse(text(tree, ".scaffold.json")).deploy.docker).toBe(false);
  });

  it("falla con un mensaje claro si la plantilla cambió y ya no se puede editar", () => {
    const broken: Tree = new Map(original);
    broken.set("docker-compose.yml", Buffer.from("services: {}\n"));

    expect(() =>
      renderProject(broken, {
        name: "shop-api",
        architecture,
        docker: false,
        dbPort: 55440,
        cliVersion: "1.2.3",
        jwtSecret: "x",
      }),
    ).toThrow("The template changed");
  });

  /**
   * Prueba de oro: generar con el nombre y el puerto de la maqueta debe dar la maqueta, salvo lo que
   * cambia a propósito para que el proyecto sea la raíz de su repositorio.
   */
  it("generar con los valores de la maqueta reproduce la maqueta, salvo lo previsto", () => {
    const tree = renderProject(original, {
      name: info.mockup,
      architecture,
      docker: true,
      dbPort: info.port,
      cliVersion: "0.0.0",
      jwtSecret: "x",
    });

    const different = [...original.keys()].filter((path) => {
      const generated = tree.get(path.replace(/(^|\/)_gitignore$/, "$1.gitignore"));
      return generated === undefined || !generated.equals(original.get(path) ?? Buffer.alloc(0));
    });
    const added = [...tree.keys()].filter((path) => !original.has(path));

    // Lo que cambia a propósito: el usuario de la base de datos (de `hex`/`ddd`/`clean` a `app`: en
    // el .env.example, el compose y las URL de las pruebas de configuración) y los hooks de git,
    // que dejan de apuntar a la carpeta de la maqueta.
    expect(different.sort()).toEqual([
      ".env.example",
      ".husky/pre-commit",
      ".husky/pre-push",
      "docker-compose.yml",
      "package.json",
      "tests/unit/config/env-errors.test.ts",
      "tests/unit/config/env-http.test.ts",
      "tests/unit/config/env-proxy.test.ts",
      "tests/unit/config/env.test.ts",
    ]);
    expect(added).toEqual([".env"]);
  });
});
