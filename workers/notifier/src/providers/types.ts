import type { NotificationChannel } from "@muxaris/shared";
export interface OutboundMessage {
  to: string;
  subject: string;
  /** Plain text; every channel sends it. */
  body: string;
  /** The designed HTML email, when the outbox rendered one; only email providers use it. */
  html?: string;
}
export interface NotificationProvider {
  readonly channel: NotificationChannel;
  /** Resolves with the provider's message id; throws on rejection (error.name is recorded). */
  send(msg: OutboundMessage): Promise<{ providerId: string }>;
}
export type Providers = Record<NotificationChannel, NotificationProvider | null>;
