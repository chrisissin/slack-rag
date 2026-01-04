import { WebClient } from "@slack/web-api";

export function slackClient() {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("Missing SLACK_BOT_TOKEN");
  return new WebClient(token);
}
