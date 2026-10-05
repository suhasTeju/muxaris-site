import { PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import type { NotificationProvider, OutboundMessage } from "./types.js";

/** Transactional SMS via SNS. Indian delivery needs TRAI DLT registration and sandbox exit. */
export class SnsSmsProvider implements NotificationProvider {
  readonly channel = "sms" as const;
  private readonly client: SNSClient;
  constructor(opts: { region: string; client?: SNSClient }) {
    this.client = opts.client ?? new SNSClient({ region: opts.region });
  }
  async send(msg: OutboundMessage) {
    const r = await this.client.send(
      new PublishCommand({
        PhoneNumber: msg.to,
        Message: msg.body,
        MessageAttributes: {
          "AWS.SNS.SMS.SMSType": { DataType: "String", StringValue: "Transactional" },
        },
      }),
    );
    return { providerId: r.MessageId ?? "sns" };
  }
}
