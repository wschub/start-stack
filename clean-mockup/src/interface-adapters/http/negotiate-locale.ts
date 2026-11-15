import { DEFAULT_LOCALE, type Locale, SUPPORTED_LOCALES } from "../../entities/locale.ts";

/** Elige el idioma de la respuesta a partir de la cabecera Accept-Language. */
export function negotiateLocale(
  header: string | undefined,
  supported: readonly Locale[] = SUPPORTED_LOCALES,
  fallback: Locale = DEFAULT_LOCALE,
): Locale {
  if (!header) return fallback;

  const candidates = header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = q ? Number(q.slice(2)) : 1;
      return {
        language: tag.trim().toLowerCase().split("-")[0] ?? "",
        quality: Number.isNaN(quality) ? 0 : quality,
        index,
      };
    })
    .filter((candidate) => candidate.quality > 0)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);

  for (const { language } of candidates) {
    const match = supported.find((locale) => locale === language);
    if (match) return match;
  }
  return fallback;
}
