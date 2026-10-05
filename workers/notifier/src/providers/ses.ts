import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import type { NotificationProvider, OutboundMessage } from "./types.js";

export class SesEmailProvider implements NotificationProvider {
  readonly channel = "email" as const;
  private readonly client: SESv2Client;
  constructor(private readonly opts: { from: string; region: string; client?: SESv2Client }) {
    this.client = opts.client ?? new SESv2Client({ region: opts.region });
  }
  async send(msg: OutboundMessage) {
    const r = await this.client.send(
      new SendEmailCommand({
        FromEmailAddress: this.opts.from,
        Destination: { ToAddresses: [msg.to] },
        Content: {
          Simple: {
            Subject: { Data: msg.subject, Charset: "UTF-8" },
            Body: { Text: { Data: msg.body, Charset: "UTF-8" } },
          },
        },
      }),
    );
    return { providerId: r.MessageId ?? "ses" };
  }
}
