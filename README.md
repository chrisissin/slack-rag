# Slack RAG Bot (Node + Postgres/pgvector + Ollama)

This starter project builds a Slack bot that:
- listens for `@mentions` (`app_mention`)
- retrieves relevant Slack history from a **local Postgres + pgvector** index (RAG)
- answers using a **local LLM via Ollama**
- stays safe by retrieving only from the **same channel** as the mention (v1 default)

It also includes:
- **Backfill**: index **all public channels the bot is a member of**
- **Incremental sync**: updates the index using `slack_channel_cursors` (run once or in a loop)

---

## Why bot token (not your personal user token)?

For the starter: **use a Slack bot token** (`xoxb-...`).
- It's the recommended Slack model and matches event subscriptions (`app_mention`).
- Indexing is limited to channels the bot is in, which is a good safety boundary.

Could you use your own user token? Sometimes in dev you *can* get a user token, but Slack policies and org settings often restrict it, and it's easier to accidentally over-index private data. Start with the bot token. Later, if you need "index what a user can see", you'll build a real permission model.

---

## Requirements

- Node.js 18+
- Docker (for Postgres)
- Ollama installed and running locally

Pull models:
```bash
ollama pull nomic-embed-text
ollama pull llama3.1
```

> This project assumes `nomic-embed-text` embeddings output **768** dims and the DB schema uses `vector(768)`.
> If you change embedding models and the vector length differs, update `sql/schema.sql`.

---

## Setup

### 1) Start Postgres (pgvector)
```bash
docker compose up -d
```

### 2) Create DB schema
```bash
psql "postgres://postgres:postgres@localhost:5432/slack_rag" -f sql/schema.sql
```

### 3) Configure environment
```bash
cp .env.example .env
# edit .env with your Slack bot token + signing secret
```

### 4) Install deps
```bash
npm i
```

---

## Slack App Configuration

Create a Slack app with:
- **Event Subscriptions** enabled
  - subscribe to: `app_mention`
- **Bot token scopes**
  - `app_mentions:read`
  - `channels:read`
  - `channels:history`
  - `chat:write`

Install the app to your workspace.

### Local events URL
You need a tunnel so Slack can hit your local server:
- ngrok: `ngrok http 3000`
- Slack CLI also works if you're using it

Set the Slack Event Request URL to:
```
https://<your-tunnel>/slack/events
```

---

## Run

### Start the bot
```bash
npm run bot
```

In a public channel where the bot is a member, try:
```
@yourbot what did we decide about deploys?
```

---

## Indexing

### Backfill ALL public channels the bot is a member of
This will:
- list all public channels the bot is in (`conversations.list`)
- pull message history
- index thread chunks + message windows
- set a cursor per channel in `slack_channel_cursors`

Run:
```bash
npm run backfill:all
```

> ⚠️ Backfilling big channels can take time and embeddings can be slow. For large workspaces, add caps (e.g. only last 30 days). This starter backfills full history.

### Incremental sync (one shot)
Uses `slack_channel_cursors.latest_ts` to fetch messages since last sync:
```bash
npm run sync:once
```

### Incremental sync "cron" loop
Simple loop that runs sync every `SYNC_INTERVAL_SECONDS`:
```bash
npm run sync:cron
```

For production, prefer system cron / k8s CronJob:
```bash
*/5 * * * * cd /path/to/slack-rag-bot && /usr/bin/node src/indexer/sync_once.js >> sync.log 2>&1
```

---

## Safety model (v1)

Retrieval is filtered to `channel_id == event.channel`.

That means:
- public channel mention -> bot only searches that channel’s indexed chunks
- no cross-channel leakage in v1

If/when you want cross-channel search, you must add a permission check:
- verify the requesting user is a member of the channel you're retrieving from
- do not return content from private channels they can't access

---

## Extending normalization

We resolve `<@U123>` into `@username` using `users.info` with an in-memory cache:
- `src/slack/userResolver.js`
- `src/slack/normalize.js`

You can expand to resolve:
- links
- files
- message attachments
- display_name vs real_name preferences

---

## Troubleshooting

### Embedding dimension mismatch
If inserts fail with vector dimension errors:
- your embedding model output dim != DB schema `vector(N)`
Fix: update `sql/schema.sql` and recreate table (or make a new table).

### Slack rate limits
There is basic retry/backoff in `src/indexer/slackFetch.js`. For large workspaces, you may still need stronger throttling.

---

## License
MIT (do whatever you want).
