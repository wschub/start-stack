import type { UseCase } from "../../src/use-cases/use-case.ts";

/**
 * Doble de un caso de uso para probar controladores: anota con qué se le llamó y devuelve la
 * respuesta indicada (o lanza el error indicado).
 */
export class StubUseCase<Request, Response> implements UseCase<Request, Response> {
  readonly calls: Request[] = [];
  private readonly outcome: { response: Response } | { error: unknown };

  private constructor(outcome: { response: Response } | { error: unknown }) {
    this.outcome = outcome;
  }

  static returning<Request, Response>(response: Response): StubUseCase<Request, Response> {
    return new StubUseCase<Request, Response>({ response });
  }

  static failing<Request, Response>(error: unknown): StubUseCase<Request, Response> {
    return new StubUseCase<Request, Response>({ error });
  }

  async execute(request: Request): Promise<Response> {
    this.calls.push(request);
    if ("error" in this.outcome) throw this.outcome.error;
    return this.outcome.response;
  }
}
