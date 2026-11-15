import { describe, expect, it } from "vitest";
import { isValidDuration, parseDuration } from "../../../src/config/duration.ts";

describe("parseDuration", () => {
  it.each([
    ["30s", 30],
    ["50m", 3000],
    ["50M", 3000],
    ["1h", 3600],
    ["1H", 3600],
    ["1d", 86_400],
    ["1D", 86_400],
    ["7d", 604_800],
    ["  60m ", 3600],
  ])("convierte %s en %i segundos", (text, seconds) => {
    expect(parseDuration(text)).toBe(seconds);
    expect(isValidDuration(text)).toBe(true);
  });

  it.each(["", "60", "m", "1.5h", "-5m", "0m", "1h30m", "1w", "5 minutos", "abc"])(
    "rechaza %j",
    (text) => {
      expect(isValidDuration(text)).toBe(false);
      expect(() => parseDuration(text)).toThrow(/duration/i);
    },
  );
});
