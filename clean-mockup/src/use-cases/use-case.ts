/**
 * Puerto de entrada de un caso de uso: lo único que conocen de él los controladores y cualquier
 * otro que lo invoque. `Request` y `Response` son modelos de datos propios del caso de uso
 * (tipos primitivos y objetos planos), nunca objetos de HTTP ni de la base de datos.
 */
export interface UseCase<Request, Response> {
  execute(request: Request): Promise<Response>;
}
