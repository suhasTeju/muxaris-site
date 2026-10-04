import { createServerRunner } from "@aws-amplify/adapter-nextjs";
import { buildAmplifyConfig } from "./amplify";

export const { runWithAmplifyServerContext } = createServerRunner({
  config: buildAmplifyConfig(""),
});
