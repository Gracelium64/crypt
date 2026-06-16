export const parseOrigins = (raw?: string): string | string[] | undefined => {
  if (!raw) return undefined;
  if (raw.trim() === "*") return "*";
  const origins = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (origins.length === 0) return undefined;
  return origins.length === 1 ? origins[0] : origins;
};
