export function normalizePath(p: string): string {
  p = p.replace(/\\/g, "/");
  p = p.replace(/^\/+/, "");
  p = p.replace(/\/+$/, "");
  return p;
}

export function joinAndNormalize(...segments: string[]): string {
  const normalized = segments.map(normalizePath).filter(Boolean);
  return normalized.join("/");
}
