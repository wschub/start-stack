import { describe, expect, it } from "vitest";
import { Email } from "../../../../../../src/contexts/identity/domain/value-objects/email.ts";
import { errorOf } from "../../../../../helpers/app-error.ts";

describe("Email", () => {
  it("se guarda en minúsculas y sin espacios alrededor", () => {
    expect(Email.create("  Ana@Example.COM ").value).toBe("ana@example.com");
  });

  it.each(["", "ana", "ana@", "@example.com", "ana@example", "ana gomez@example.com", "a@b@c.com"])(
    'rechaza "%s"',
    (raw) => {
      expect(errorOf(() => Email.create(raw))).toBe("validation:INVALID_EMAIL");
    },
  );

  it("admite hasta 254 caracteres y rechaza uno más", () => {
    const domain = "@example.com";
    const longest = "a".repeat(254 - domain.length) + domain;

    expect(Email.create(longest).value).toHaveLength(254);
    expect(errorOf(() => Email.create(`a${longest}`))).toBe("validation:INVALID_EMAIL");
  });

  it("dos correos son iguales si coinciden tras normalizarlos", () => {
    const email = Email.create("ana@example.com");

    expect(email.equals(Email.create(" ANA@example.com"))).toBe(true);
    expect(email.equals(Email.create("otra@example.com"))).toBe(false);
  });

  it("normalize prepara un correo para buscarlo sin validarlo", () => {
    expect(Email.normalize("  No-Es-Correo ")).toBe("no-es-correo");
  });

  it("restore confía en el valor guardado y no lo valida ni lo cambia", () => {
    expect(Email.restore("Legacy@Example.com").value).toBe("Legacy@Example.com");
  });

  it("es inmutable y se convierte a texto con su valor", () => {
    const email = Email.create("ana@example.com");

    expect(Object.isFrozen(email)).toBe(true);
    expect(String(email)).toBe("ana@example.com");
  });
});
