export interface SecretsClient {
  get(arn: string): Promise<string | undefined>;
}

/** Secrets Manager client loaded lazily so local runs never import the SDK. */
async function awsClient(): Promise<SecretsClient> {
  const { SecretsManagerClient, GetSecretValueCommand } =
    await import("@aws-sdk/client-secrets-manager");
  const c = new SecretsManagerClient({});
  return {
    get: async (arn) => (await c.send(new GetSecretValueCommand({ SecretId: arn }))).SecretString,
  };
}

/** RDS-generated secret ({username,password,host,port,dbname}) → postgres:// URL. */
export function databaseUrlFromRdsSecret(json: string): string {
  const o = JSON.parse(json) as Record<string, unknown>;
  const missing = ["username", "password", "host", "port", "dbname"].filter(
    (k) => o[k] === undefined || o[k] === "",
  );
  if (missing.length) throw new Error(`RDS secret is missing ${missing.join(", ")}`);
  const u = encodeURIComponent(String(o.username));
  const p = encodeURIComponent(String(o.password));
  return `postgres://${u}:${p}@${String(o.host)}:${String(o.port)}/${String(o.dbname)}`;
}

/**
 * Fills process.env from Secrets Manager at start: DB_SECRET_ARN → DATABASE_URL (unless already
 * set) and APP_SECRET_ARN (JSON key→value) → each key not already set and not empty. Values never
 * appear in errors or logs; only key names are returned.
 */
export async function applySecretsToEnv(
  src: NodeJS.ProcessEnv = process.env,
  client?: SecretsClient,
): Promise<{ applied: string[] }> {
  const dbArn = src.DB_SECRET_ARN?.trim();
  const appArn = src.APP_SECRET_ARN?.trim();
  const applied: string[] = [];
  if (!dbArn && !appArn) return { applied };
  const c = client ?? (await awsClient());
  if (dbArn && !src.DATABASE_URL) {
    const raw = await c.get(dbArn);
    if (!raw) throw new Error("DB_SECRET_ARN could not be read");
    src.DATABASE_URL = databaseUrlFromRdsSecret(raw);
    applied.push("DATABASE_URL");
  }
  if (appArn) {
    const raw = await c.get(appArn);
    if (!raw) throw new Error("APP_SECRET_ARN could not be read");
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new Error("APP_SECRET_ARN is not valid JSON");
    }
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v !== "string" || v === "" || src[k]) continue;
      src[k] = v;
      applied.push(k);
    }
  }
  return { applied };
}
