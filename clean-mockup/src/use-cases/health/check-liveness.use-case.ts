export interface LivenessResult {
  status: "ok";
  uptime: number;
  timestamp: string;
}

export function checkLiveness(
  now: () => Date = () => new Date(),
  uptime: () => number = () => process.uptime(),
): LivenessResult {
  return { status: "ok", uptime: uptime(), timestamp: now().toISOString() };
}
