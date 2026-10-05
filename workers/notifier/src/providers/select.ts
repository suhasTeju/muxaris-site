import type { NotifierEnv } from "../env.js";
import type { LogFn } from "../log.js";
import { ConsoleProvider } from "./console.js";
import { SesEmailProvider } from "./ses.js";
import { SnsSmsProvider } from "./sns.js";
import type { Providers } from "./types.js";
import { WhatsAppCloudProvider } from "./whatsapp.js";

export function buildProviders(env: NotifierEnv, log: LogFn): Providers {
  const aws = env.providerMode === "aws";
  return {
    email: aws
      ? new SesEmailProvider({ from: env.fromEmail!, region: env.awsRegion })
      : new ConsoleProvider("email", log),
    sms: !env.channels.sms
      ? null
      : aws
        ? new SnsSmsProvider({ region: env.awsRegion })
        : new ConsoleProvider("sms", log),
    whatsapp: !env.channels.whatsapp
      ? null
      : aws
        ? new WhatsAppCloudProvider({ token: env.whatsappToken!, phoneId: env.whatsappPhoneId! })
        : new ConsoleProvider("whatsapp", log),
  };
}
