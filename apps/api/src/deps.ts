import type { Db } from "@muxaris/db";
import type { TokenVerifier } from "@muxaris/core";

export interface AppDeps {
  version: string;
  corsOrigins?: string[];
  db: Db;
  verifier: TokenVerifier;
}

export type ClinicRole = "owner" | "front_desk";

export interface AppEnv {
  Variables: {
    user: { id: string; email: string; cognitoSub: string };
    clinic: { id: string; role: ClinicRole };
  };
}
