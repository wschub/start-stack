const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86_400 } as const;
type Unit = keyof typeof UNIT_SECONDS;

const PATTERN = /^(\d{1,6})([a-z])$/i;

export class InvalidDurationError extends Error {
  constructor(value: string) {
    super(
      `Invalid duration "${value}": use a whole number followed by s, m, h or d (e.g. 30s, 50m, 1h, 7d)`,
    );
    this.name = "InvalidDurationError";
  }
}

function isUnit(value: string | undefined): value is Unit {
  return value !== undefined && Object.hasOwn(UNIT_SECONDS, value);
}

function parts(value: string): { amount: number; unit: Unit } | undefined {
  const match = PATTERN.exec(value.trim());
  if (!match) return undefined;
  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  if (amount <= 0 || !isUnit(unit)) return undefined;
  return { amount, unit };
}

export function isValidDuration(value: string): boolean {
  return parts(value) !== undefined;
}

/** Convierte "30s", "50m", "1h" o "7d" (sin distinguir mayúsculas) en segundos. */
export function parseDuration(value: string): number {
  const parsed = parts(value);
  if (!parsed) throw new InvalidDurationError(value);
  return parsed.amount * UNIT_SECONDS[parsed.unit];
}
