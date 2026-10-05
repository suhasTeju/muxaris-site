import type { Db } from "@muxaris/db";
import type { TokenVerifier } from "@muxaris/core";
import type { BlobStore } from "@muxaris/storage";
import type { ChannelFlags } from "@muxaris/shared";

export interface AppDeps {
  version: string;
  corsOrigins?: string[];
  db: Db;
  verifier: TokenVerifier;
  /** null/undefined = recording storage unavailable. */
  blobs?: BlobStore | null;
  /** Outbound notification channels enabled in this deployment (default: none). */
  channels?: ChannelFlags;
}

export type ClinicRole = "owner" | "front_desk";

export interface AppEnv {
  Variables: {
    user: { id: string; email: string; cognitoSub: string };
    clinic: { id: string; role: ClinicRole };
  };
}
