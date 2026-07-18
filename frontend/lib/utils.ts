/**
 * Minimal className utility — joins truthy class strings.
 * No external deps (no clsx / tailwind-merge) needed.
 */
export function cn(...classes: (string | false | null | undefined | 0)[]): string {
  return classes.filter(Boolean).join(" ");
}
