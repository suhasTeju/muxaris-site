import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { assertDateString } from "@muxaris/core";

/** zValidator with the API's error envelope. */
export const v = <T extends "json" | "query", S extends z.ZodType>(target: T, schema: S) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json({ error: { code: "validation", issues: result.error.issues } }, 400);
    }
  });

/** Strict YYYY-MM-DD calendar date. */
export const dateParam = z.string().superRefine((val, ctx) => {
  try {
    assertDateString(val);
  } catch (e) {
    ctx.addIssue({ code: "custom", message: e instanceof Error ? e.message : "invalid date" });
  }
});

export const isoOffset = z.iso.datetime({ offset: true });
