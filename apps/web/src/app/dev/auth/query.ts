export type Query = Promise<Record<string, string | string[] | undefined>>;

/** First value of a query parameter, or "". */
export function q(params: Record<string, string | string[] | undefined>, key: string): string {
  const v = params[key];
  return (Array.isArray(v) ? v[0] : v) ?? "";
}
