import { channelFlagsFromEnv, type ChannelFlags } from "@muxaris/shared";

export interface NotifierEnv {
  databaseUrl: string;
  awsRegion: string;
  providerMode: "console" | "aws";
  /** Verified SES sender, e.g. noreply@muxaris.com. Required in aws mode. */
  fromEmail: string | null;
  channels: ChannelFlags;
  whatsappToken: string | null;
  whatsappPhoneId: string | null;
}

export function loadEnv(src: NodeJS.ProcessEnv = process.env): NotifierEnv {
  let databaseUrl = src.DATABASE_URL;
  if (!databaseUrl) {
    if (src.NODE_ENV === "production")
      throw new Error("DATABASE_URL is required (see .env.example)");
    databaseUrl = "postgres://muxaris:muxaris@localhost:5433/muxaris";
    console.warn("DATABASE_URL not set: using local dev default (localhost:5433)");
  }
  const fromEmail = src.NOTIFY_FROM_EMAIL?.trim() || null;
  const requested = src.NOTIFY_PROVIDER?.trim().toLowerCase() || (fromEmail ? "aws" : "console");
  // "ses" is accepted as an alias of "aws" (email goes through SES in aws mode)
  const mode = requested === "ses" ? "aws" : requested;
  if (mode !== "console" && mode !== "aws")
    throw new Error(`NOTIFY_PROVIDER must be "console", "aws" or "ses", got "${requested}"`);
  if (mode === "aws" && !fromEmail)
    throw new Error("NOTIFY_FROM_EMAIL is required when NOTIFY_PROVIDER is aws (or ses)");
  const channels = channelFlagsFromEnv(src);
  const whatsappToken = src.WHATSAPP_TOKEN?.trim() || null;
  const whatsappPhoneId = src.WHATSAPP_PHONE_ID?.trim() || null;
  if (mode === "aws" && channels.whatsapp && (!whatsappToken || !whatsappPhoneId))
    throw new Error("WHATSAPP_TOKEN and WHATSAPP_PHONE_ID are required when WHATSAPP_ENABLED=1");
  return {
    databaseUrl,
    awsRegion: src.AWS_REGION?.trim() || "ap-south-1",
    providerMode: mode,
    fromEmail,
    channels,
    whatsappToken,
    whatsappPhoneId,
  };
}
