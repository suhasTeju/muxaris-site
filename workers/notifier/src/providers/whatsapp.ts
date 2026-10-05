import type { NotificationProvider, OutboundMessage } from "./types.js";

/**
 * WhatsApp Cloud API text message. Business-initiated messages outside a 24-hour customer window
 * require an approved message template; v1 sends plain text and documents this limit.
 */
export class WhatsAppCloudProvider implements NotificationProvider {
  readonly channel = "whatsapp" as const;
  constructor(
    private readonly opts: { token: string; phoneId: string; fetchImpl?: typeof fetch },
  ) {}
  async send(msg: OutboundMessage) {
    const f = this.opts.fetchImpl ?? fetch;
    const res = await f(`https://graph.facebook.com/v21.0/${this.opts.phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.opts.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: msg.to.replace(/^\+/, ""),
        type: "text",
        text: { body: `${msg.subject}\n\n${msg.body}` },
      }),
    });
    if (!res.ok) {
      const err = new Error(`whatsapp ${res.status}`);
      err.name = `WhatsAppHttp${res.status}`;
      throw err;
    }
    const data = (await res.json()) as { messages?: Array<{ id?: string }> };
    return { providerId: data.messages?.[0]?.id ?? "whatsapp" };
  }
}
