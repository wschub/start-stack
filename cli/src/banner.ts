/**
 * Título que se muestra al arrancar el asistente. Es una función aparte para poder sustituirlo por un
 * dibujo en ASCII sin tocar nada más.
 */
export function banner(version: string): string {
  return `start-stack v${version}`;
}
