import { describe, expect, it } from "vitest";
import { gatewayEventSchema, LANGUAGE_CODES } from "@muxaris/shared";
import { allFixtureEvents } from "./fixture-voice";

describe("fixture voice client", () => {
  it.each(LANGUAGE_CODES)("sends only events the voice SDK accepts (%s)", (language) => {
    const events = allFixtureEvents(language);
    expect(events.length).toBeGreaterThan(20);
    for (const e of events) expect(gatewayEventSchema.safeParse(e).success, e.type).toBe(true);
  });
});
