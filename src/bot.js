import "dotenv/config";
import { App } from "@slack/bolt";
import { UserResolver } from "./slack/userResolver.js";
import { normalizeSlackTextBase, normalizeSlackText } from "./slack/normalize.js";
import { retrieveContexts } from "./rag/retrieve.js";
import { buildRagPrompt } from "./rag/prompt.js";
import { ollamaChat } from "./rag/ollama.js";

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

function stripLeadingBotMention(text) {
  // Turn "<@BOTID> hello" into "hello" (after base normalization)
  const base = normalizeSlackTextBase(text);
  return base.replace(/^<@([A-Z0-9]+)>\s*/i, "").replace(/^@([A-Z0-9]+)\s*/i, "").trim();
}

app.event("app_mention", async ({ event, client, logger }) => {
  try {
    const channel_id = event.channel;
    const web = client; // Bolt provides WebClient instance here
    const resolver = new UserResolver(web);

    const rawText = event.text || "";
    const stripped = stripLeadingBotMention(rawText);
    const question = await normalizeSlackText(stripped, resolver);

    if (!question) {
      await client.chat.postMessage({
        channel: channel_id,
        thread_ts: event.ts,
        text: "What would you like me to look up?",
      });
      return;
    }

    // Safe v1: retrieve only from same channel.
    const contexts = await retrieveContexts({ channel_id, question });

    const prompt = buildRagPrompt({ question, contexts });
    const answer = await ollamaChat({ prompt });

    await client.chat.postMessage({
      channel: channel_id,
      thread_ts: event.ts,
      text: answer || "I couldn't generate a response. Try rephrasing the question.",
    });
  } catch (err) {
    logger.error(err);
    try {
      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.ts,
        text: "Error while answering (check server logs).",
      });
    } catch {}
  }
});

(async () => {
  const port = process.env.PORT || 3000;
  await app.start(port);
  console.log(`⚡️ Slack RAG bot running on port ${port}`);
})();
