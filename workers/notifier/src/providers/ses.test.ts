import { describe, expect, it } from "vitest";
import type { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { SesEmailProvider } from "./ses.js";

function stubClient() {
  const sent: SendEmailCommand[] = [];
  const client = {
    send: async (cmd: SendEmailCommand) => {
      sent.push(cmd);
      return { MessageId: "m-1" };
    },
  } as unknown as SESv2Client;
  return { client, sent };
}

describe("SesEmailProvider", () => {
  it("sends the HTML email alongside the plain-text body", async () => {
    const { client, sent } = stubClient();
    const p = new SesEmailProvider({ from: "clinic@example.com", region: "ap-south-1", client });
    const r = await p.send({
      to: "patient@example.com",
      subject: "Appointment confirmed",
      body: "Namaste.\n\nBooked.",
      html: "<!DOCTYPE html><p>Booked.</p>",
    });
    expect(r.providerId).toBe("m-1");
    const input = sent[0]!.input;
    expect(input.FromEmailAddress).toBe("clinic@example.com");
    expect(input.Destination?.ToAddresses).toEqual(["patient@example.com"]);
    expect(input.Content?.Simple?.Subject?.Data).toBe("Appointment confirmed");
    expect(input.Content?.Simple?.Body?.Text).toEqual({
      Data: "Namaste.\n\nBooked.",
      Charset: "UTF-8",
    });
    expect(input.Content?.Simple?.Body?.Html).toEqual({
      Data: "<!DOCTYPE html><p>Booked.</p>",
      Charset: "UTF-8",
    });
  });

  it("sends text only when there is no HTML", async () => {
    const { client, sent } = stubClient();
    const p = new SesEmailProvider({ from: "clinic@example.com", region: "ap-south-1", client });
    await p.send({ to: "patient@example.com", subject: "s", body: "b" });
    expect(sent[0]!.input.Content?.Simple?.Body?.Html).toBeUndefined();
    expect(sent[0]!.input.Content?.Simple?.Body?.Text?.Data).toBe("b");
  });
});
