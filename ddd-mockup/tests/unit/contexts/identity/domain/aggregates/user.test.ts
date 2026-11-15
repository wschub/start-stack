import { describe, expect, it } from "vitest";
import { User } from "../../../../../../src/contexts/identity/domain/aggregates/user.ts";
import { AppError } from "../../../../../../src/shared/errors/app-error.ts";

const base = {
  email: "ana@example.com",
  passwordHash: "hash",
  firstName: "Ana",
  lastName: "Gómez",
};
const fixedId = () => "11111111-1111-4111-8111-111111111111";
const january = () => new Date("2026-01-01T00:00:00Z");
const february = () => new Date("2026-02-01T00:00:00Z");

function codeOf(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    return error instanceof AppError ? error.code : "NOT_AN_APP_ERROR";
  }
  return undefined;
}

describe("User", () => {
  it("se crea activo, con idioma por defecto y publicId generado", () => {
    const user = User.create(base, { generateId: fixedId, now: january });
    expect(user.publicId).toBe("11111111-1111-4111-8111-111111111111");
    expect(user.status).toBe("ACTIVE");
    expect(user.isActive()).toBe(true);
    expect(user.locale).toBe("es");
    expect(user.countryDefault).toBeNull();
    expect(user.mobilePhone).toBeNull();
    expect(user.createdAt).toEqual(january());
    expect(user.updatedAt).toEqual(january());
  });

  it("normaliza el email (espacios y mayúsculas)", () => {
    expect(User.create({ ...base, email: "  Ana@Example.COM " }).email).toBe("ana@example.com");
  });

  it("rechaza un email inválido", () => {
    expect(codeOf(() => User.create({ ...base, email: "no-es-email" }))).toBe("INVALID_EMAIL");
  });

  it.each(["firstName", "lastName"] as const)("exige %s no vacío", (field) => {
    expect(codeOf(() => User.create({ ...base, [field]: "   " }))).toBe("INVALID_NAME");
  });

  it("normaliza el país a mayúsculas y rechaza códigos inválidos", () => {
    expect(User.create({ ...base, countryDefault: "co" }).countryDefault).toBe("CO");
    expect(codeOf(() => User.create({ ...base, countryDefault: "COL" }))).toBe("INVALID_COUNTRY");
  });

  it("acepta teléfonos E.164 y rechaza otros formatos", () => {
    expect(User.create({ ...base, mobilePhone: "+573001234567" }).mobilePhone).toBe(
      "+573001234567",
    );
    expect(codeOf(() => User.create({ ...base, mobilePhone: "3001234567" }))).toBe("INVALID_PHONE");
    expect(codeOf(() => User.create({ ...base, mobilePhone: "+57 300 123" }))).toBe(
      "INVALID_PHONE",
    );
  });

  it("acepta idiomas soportados y rechaza el resto", () => {
    expect(User.create({ ...base, locale: "en" }).locale).toBe("en");
    expect(codeOf(() => User.create({ ...base, locale: "fr" }))).toBe("INVALID_LOCALE");
  });

  it("no permite modificar el publicId", () => {
    const user = User.create(base);
    expect(() => {
      (user as { publicId: string }).publicId = "otro";
    }).toThrow(TypeError);
  });

  it("se desactiva y se reactiva sin cambiar su identidad ni mutar el original", () => {
    const user = User.create(base, { generateId: fixedId, now: january });
    const inactive = user.deactivate(february);
    expect(inactive.status).toBe("INACTIVE");
    expect(inactive.isActive()).toBe(false);
    expect(inactive.publicId).toBe(user.publicId);
    expect(inactive.createdAt).toEqual(january());
    expect(inactive.updatedAt).toEqual(february());
    expect(user.status).toBe("ACTIVE");
    expect(inactive.activate(february).status).toBe("ACTIVE");
  });

  it("se reconstruye desde persistencia sin cambiar sus datos", () => {
    const user = User.create(
      { ...base, countryDefault: "CO", mobilePhone: "+573001234567", locale: "en" },
      { generateId: fixedId, now: january },
    );
    const restored = User.restore(user.toProps());
    expect(restored.toProps()).toEqual(user.toProps());
  });

  describe("eventos de dominio", () => {
    it("al crearse anota user.registered con los datos ya normalizados", () => {
      const user = User.create(
        { ...base, email: " Ana@Example.COM ", firstName: " Ana ", locale: "en" },
        { generateId: fixedId, now: january },
      );

      expect(user.pullEvents()).toEqual([
        {
          name: "user.registered",
          occurredAt: january(),
          userId: "11111111-1111-4111-8111-111111111111",
          email: "ana@example.com",
          firstName: "Ana",
          locale: "en",
        },
      ]);
    });

    it("al reconstruirse desde persistencia no anota eventos", () => {
      const user = User.create(base, { generateId: fixedId, now: january });

      expect(User.restore(user.toProps()).pullEvents()).toEqual([]);
    });

    it("desactivar y activar anotan user.status_changed con el estado nuevo", () => {
      const user = User.restore(User.create(base, { generateId: fixedId }).toProps());

      expect(user.deactivate(february).pullEvents()).toEqual([
        {
          name: "user.status_changed",
          occurredAt: february(),
          userId: user.publicId,
          status: "INACTIVE",
        },
      ]);
      expect(user.deactivate(january).activate(february).pullEvents()).toMatchObject([
        { name: "user.status_changed", status: "INACTIVE", occurredAt: january() },
        { name: "user.status_changed", status: "ACTIVE", occurredAt: february() },
      ]);
    });

    it("cambiar la contraseña guarda el hash nuevo y anota user.password_changed", () => {
      const user = User.restore(User.create(base, { generateId: fixedId, now: january }).toProps());

      const changed = user.changePassword("otro-hash", february);

      expect(changed.passwordHash).toBe("otro-hash");
      expect(changed.updatedAt).toEqual(february());
      expect(user.passwordHash).toBe("hash");
      expect(changed.pullEvents()).toEqual([
        { name: "user.password_changed", occurredAt: february(), userId: user.publicId },
      ]);
    });

    it("cada cambio hereda los eventos pendientes, en el orden en que ocurrieron", () => {
      const user = User.create(base, { generateId: fixedId, now: january })
        .changePassword("otro-hash", february)
        .deactivate(february);

      expect(user.pullEvents().map((event) => event.name)).toEqual([
        "user.registered",
        "user.password_changed",
        "user.status_changed",
      ]);
    });

    it("los eventos se entregan una sola vez", () => {
      const user = User.create(base);

      expect(user.pullEvents()).toHaveLength(1);
      expect(user.pullEvents()).toEqual([]);
    });
  });
});
