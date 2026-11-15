import type { UserRepository } from "../../domain/repositories/user.repository.ts";
import { type PublicUser, toPublicUser } from "../public-user.ts";

export interface ListUsersInput {
  page?: number | undefined;
  pageSize?: number | undefined;
  search?: string | undefined;
}

export interface PublicUserPage {
  items: PublicUser[];
  page: number;
  pageSize: number;
  total: number;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export class ListUsers {
  private readonly users: UserRepository;

  constructor(deps: { users: UserRepository }) {
    this.users = deps.users;
  }

  async execute(input: ListUsersInput = {}): Promise<PublicUserPage> {
    const page = Math.max(1, Math.trunc(input.page ?? 1));
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.trunc(input.pageSize ?? DEFAULT_PAGE_SIZE)),
    );
    const search = input.search?.trim() || undefined;

    const { items, total } = await this.users.list({ page, pageSize, search });
    return { items: items.map(toPublicUser), page, pageSize, total };
  }
}
