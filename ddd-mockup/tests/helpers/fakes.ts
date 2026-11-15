import { AppError } from "../../src/shared/errors/app-error.ts";
import { type EventBus, NULL_EVENT_BUS } from "../../src/shared/events/event-bus.ts";
import type { PasswordHasher } from "../../src/contexts/identity/application/ports/password-hasher.ts";
import type { User } from "../../src/contexts/identity/domain/aggregates/user.ts";
import type {
  UserListQuery,
  UserPage,
  UserRepository,
} from "../../src/contexts/identity/domain/repositories/user.repository.ts";

export class InMemoryUserRepository implements UserRepository {
  readonly byEmail = new Map<string, User>();
  private readonly events: EventBus;

  /** Como el repositorio real, publica los eventos de los agregados que guarda. */
  constructor(events: EventBus = NULL_EVENT_BUS) {
    this.events = events;
  }

  async add(user: User): Promise<void> {
    if (this.byEmail.has(user.email)) {
      throw new AppError("conflict", { code: "EMAIL_ALREADY_EXISTS" });
    }
    this.byEmail.set(user.email, user);
    await this.events.publish(user.pullEvents());
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.byEmail.get(email.trim().toLowerCase()) ?? null;
  }

  async findByPublicId(publicId: string): Promise<User | null> {
    return [...this.byEmail.values()].find((user) => user.publicId === publicId) ?? null;
  }

  async list(query: UserListQuery): Promise<UserPage> {
    const search = query.search?.toLowerCase();
    const matches = [...this.byEmail.values()]
      .filter(
        (user) =>
          !search ||
          [user.email, user.firstName, user.lastName].some((value) =>
            value.toLowerCase().includes(search),
          ),
      )
      .sort((a, b) => a.email.localeCompare(b.email));
    const start = (query.page - 1) * query.pageSize;
    return { items: matches.slice(start, start + query.pageSize), total: matches.length };
  }

  async update(user: User): Promise<void> {
    const current = await this.findByPublicId(user.publicId);
    if (!current) throw new AppError("not_found", { code: "USER_NOT_FOUND" });
    this.byEmail.delete(current.email);
    this.byEmail.set(user.email, user);
    await this.events.publish(user.pullEvents());
  }
}

export class FakePasswordHasher implements PasswordHasher {
  hashCalls = 0;
  verifyCalls = 0;

  async hash(plain: string): Promise<string> {
    this.hashCalls += 1;
    return `hashed:${plain}`;
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    this.verifyCalls += 1;
    return hash === `hashed:${plain}`;
  }
}
