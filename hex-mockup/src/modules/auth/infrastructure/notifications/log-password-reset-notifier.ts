import type {
  PasswordResetMessage,
  PasswordResetNotifier,
} from "../../application/ports/password-reset-notifier.ts";

interface NotifierLogger {
  info(data: object, message: string): void;
  warn(data: object, message: string): void;
}

export interface LogPasswordResetNotifierOptions {
  logger: NotifierLogger;
  /** Página del front que recibe el token: se le añade `?token=…`. */
  resetUrl: string;
  /**
   * Si es true, escribe el enlace o el código en el log (solo para desarrollo). Con false no se
   * escribe ningún secreto: en producción hay que sustituir este adaptador por uno que envíe correo.
   */
  revealSecret: boolean;
}

/**
 * Adaptador de desarrollo: en vez de enviar un correo, deja el enlace o el código en el log.
 * Para producción, implementa PasswordResetNotifier con tu proveedor (SMTP, Resend, SES…) y
 * conéctalo en composition.ts.
 */
export class LogPasswordResetNotifier implements PasswordResetNotifier {
  private readonly logger: NotifierLogger;
  private readonly resetUrl: string;
  private readonly revealSecret: boolean;

  constructor(options: LogPasswordResetNotifierOptions) {
    this.logger = options.logger;
    this.resetUrl = options.resetUrl;
    this.revealSecret = options.revealSecret;
  }

  async notify(message: PasswordResetMessage): Promise<void> {
    const base = { to: message.email, method: message.method, expiresAt: message.expiresAt };

    if (!this.revealSecret) {
      this.logger.warn(base, "password reset requested but no email provider is configured");
      return;
    }
    const secret =
      message.method === "link" ? { link: this.linkFor(message.secret) } : { code: message.secret };
    this.logger.info({ ...base, ...secret }, "password reset requested (no email was sent)");
  }

  private linkFor(token: string): string {
    const url = new URL(this.resetUrl);
    url.searchParams.set("token", token);
    return url.toString();
  }
}
