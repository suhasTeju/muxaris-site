import type { NotificationChannel } from "@muxaris/shared";
import type { LogFn } from "../log.js";
import type { NotificationProvider, OutboundMessage } from "./types.js";

export class ConsoleProvider implements NotificationProvider {
  private n = 0;
  constructor(
    readonly channel: NotificationChannel,
    private readonly log: LogFn,
  ) {}
  async send(msg: OutboundMessage) {
    this.n++;
    this.log("info", "notification (console provider)", {
      channel: this.channel,
      subjectLength: msg.subject.length,
      bodyLength: msg.body.length,
    });
    return { providerId: `console:${this.channel}:${Date.now()}:${this.n}` };
  }
}
