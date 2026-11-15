import { beforeEach, describe, expect, it } from "vitest";
import { revokeSessionsOnPasswordChange } from "../../../../../../src/contexts/identity/application/event-handlers/revoke-sessions-on-password-change.ts";
import { sendPasswordResetNotification } from "../../../../../../src/contexts/identity/application/event-handlers/send-password-reset-notification.ts";
import { subscribeIdentityEventHandlers } from "../../../../../../src/contexts/identity/application/event-handlers/subscribe.ts";
import type { PasswordResetRequested } from "../../../../../../src/contexts/identity/domain/events/password-reset-requested.ts";
import type {
  UserPasswordChanged,
  UserRegistered,
  UserStatusChanged,
} from "../../../../../../src/contexts/identity/domain/events/user-events.ts";
import type { RefreshToken } from "../../../../../../src/contexts/identity/domain/entities/refresh-token.ts";
import { InProcessEventBus } from "../../../../../../src/shared/events/event-bus.ts";
import { RecordingPasswordResetNotifier } from "../../../../../helpers/password-reset-fakes.ts";
import { InMemoryRefreshTokenRepository } from "../../../../../helpers/session-fakes.ts";

const NOW = new Date("2026-11-15T10:00:00Z");
const LATER = new Date("2026-11-15T10:30:00Z");
const ANA = "11111111-1111-4111-8111-111111111111";
const LUIS = "22222222-2222-4222-8222-222222222222";

const requested: PasswordResetRequested = {
  name: "password_reset.requested",
  occurredAt: NOW,
  userId: ANA,
  email: "ana@example.com",
  firstName: "Ana",
  locale: "en",
  method: "code",
  secret: "123456",
  expiresAt: LATER,
};
const passwordChanged: UserPasswordChanged = {
  name: "user.password_changed",
  occurredAt: NOW,
  userId: ANA,
};

const session = (tokenHash: string, userPublicId: string): RefreshToken => ({
  tokenHash,
  familyId: `familia-${tokenHash}`,
  userPublicId,
  expiresAt: LATER,
  usedAt: null,
  revokedAt: null,
  createdAt: NOW,
});

let notifier: RecordingPasswordResetNotifier;
let refreshTokens: InMemoryRefreshTokenRepository;

beforeEach(async () => {
  notifier = new RecordingPasswordResetNotifier();
  refreshTokens = new InMemoryRefreshTokenRepository();
  await refreshTokens.add(session("ana-1", ANA));
  await refreshTokens.add(session("ana-2", ANA));
  await refreshTokens.add(session("luis-1", LUIS));
});

const revokedAt = async (tokenHash: string) =>
  (await refreshTokens.findByHash(tokenHash))?.revokedAt;

describe("sendPasswordResetNotification", () => {
  it("envía al usuario el secreto del evento, en su idioma y con su caducidad", async () => {
    await sendPasswordResetNotification({ notifier })(requested);

    expect(notifier.sent).toEqual([
      {
        email: "ana@example.com",
        firstName: "Ana",
        locale: "en",
        method: "code",
        secret: "123456",
        expiresAt: LATER,
      },
    ]);
  });

  it("no pasa al notificador datos internos del evento", async () => {
    await sendPasswordResetNotification({ notifier })(requested);

    expect(notifier.last()).not.toHaveProperty("userId");
    expect(notifier.last()).not.toHaveProperty("name");
  });

  it("si el envío falla, propaga el error", async () => {
    const failing = {
      notify: async () => {
        throw new Error("proveedor caído");
      },
    };

    await expect(sendPasswordResetNotification({ notifier: failing })(requested)).rejects.toThrow(
      "proveedor caído",
    );
  });
});

describe("revokeSessionsOnPasswordChange", () => {
  it("cierra todas las sesiones del usuario en el instante del cambio", async () => {
    await revokeSessionsOnPasswordChange({ refreshTokens })(passwordChanged);

    expect(await revokedAt("ana-1")).toEqual(NOW);
    expect(await revokedAt("ana-2")).toEqual(NOW);
  });

  it("deja intactas las sesiones de los demás usuarios", async () => {
    await revokeSessionsOnPasswordChange({ refreshTokens })(passwordChanged);

    expect(await revokedAt("luis-1")).toBeNull();
  });
});

describe("subscribeIdentityEventHandlers", () => {
  let bus: InProcessEventBus;

  beforeEach(() => {
    bus = new InProcessEventBus();
    subscribeIdentityEventHandlers(bus, { notifier, refreshTokens });
  });

  it("password_reset.requested dispara la notificación y no toca las sesiones", async () => {
    await bus.publish([requested]);

    expect(notifier.sent).toHaveLength(1);
    expect(await revokedAt("ana-1")).toBeNull();
  });

  it("user.password_changed cierra las sesiones y no notifica", async () => {
    await bus.publish([passwordChanged]);

    expect(await revokedAt("ana-1")).toEqual(NOW);
    expect(notifier.sent).toEqual([]);
  });

  it("user.registered y user.status_changed todavía no tienen reacciones", async () => {
    const registered: UserRegistered = {
      name: "user.registered",
      occurredAt: NOW,
      userId: ANA,
      email: "ana@example.com",
      firstName: "Ana",
      locale: "es",
    };
    const statusChanged: UserStatusChanged = {
      name: "user.status_changed",
      occurredAt: NOW,
      userId: ANA,
      status: "INACTIVE",
    };

    await bus.publish([registered, statusChanged]);

    expect(notifier.sent).toEqual([]);
    expect(await revokedAt("ana-1")).toBeNull();
  });
});
