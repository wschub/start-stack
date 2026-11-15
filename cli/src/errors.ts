/** Un error que se explica al usuario tal cual, sin traza. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

/** El usuario canceló el asistente (Ctrl+C o Esc). */
export class CancelError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "CancelError";
  }
}
