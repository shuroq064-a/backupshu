/**
 * Minimal className utility — joins truthy class strings and object maps
 * (clsx-style). No external deps (no clsx / tailwind-merge) needed.
 */
type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | 0
  | Record<string, boolean | null | undefined>;

export function cn(...classes: ClassValue[]): string {
  const out: string[] = [];
  for (const c of classes) {
    if (!c) continue;
    if (typeof c === "string" || typeof c === "number") {
      out.push(String(c));
    } else if (typeof c === "object") {
      for (const key in c) {
        if (c[key]) out.push(key);
      }
    }
  }
  return out.join(" ");
}
