import type { Db } from "@muxaris/db";

/** A Db or an open transaction on it. */
export type DbLike = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];
