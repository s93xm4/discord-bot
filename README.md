# Discord Echo Bot

這是一個最小版 Discord bot：只要有人在伺服器頻道 `@` 它，它就重複同一句話，並把訊息記錄到線上 Postgres 資料庫。

## 需求

- Node.js 20 或更新版本
- Discord Developer Portal 建好的 bot token
- 線上 Postgres 資料庫連線字串

## Discord 設定

1. 到 Discord Developer Portal 建立 Application。
2. 在 `Bot` 頁面新增 bot，複製 token。
3. 在 `Bot` 頁面打開 `MESSAGE CONTENT INTENT`。
4. 到 `OAuth2 > URL Generator`：
   - Scopes 勾 `bot`
   - Bot Permissions 勾 `Send Messages`、`Read Message History`、`View Channels`
5. 用產生的網址把 bot 邀請進你的伺服器。

## 本機執行

```bash
npm install
Copy-Item .env.example .env
npm start
```

把 `.env` 裡面的 `DISCORD_TOKEN` 改成你的 Discord bot token，`DATABASE_URL` 改成你的線上資料庫連線字串。

## 免費線上 DB：Neon Postgres

Neon 的免費方案適合練習 Discord bot：

- 免費方案不需要信用卡。
- 每個 project 有 0.5 GB storage。
- 閒置 5 分鐘後會自動暫停 compute，下次查詢時再喚醒。
- 免費方案每個 project 每月有 100 CU-hours。

### 建立 Neon DB

1. 到 https://neon.com 註冊並登入。
2. 建立新的 Project。
3. 建立完成後，到 `Connection Details`。
4. 選擇 `Node.js` 或 `Postgres` 連線格式。
5. 複製 connection string，格式大概像這樣：

```text
postgresql://user:password@host/database?sslmode=require
```

6. 貼到 `.env`：

```env
DISCORD_TOKEN=你的 Discord bot token
DATABASE_URL=你的 Neon connection string
```

### 目前資料表

程式啟動時會自動建立這張表：

```sql
CREATE TABLE IF NOT EXISTS mentioned_messages (
  id BIGSERIAL PRIMARY KEY,
  guild_id TEXT,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL UNIQUE,
  author_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

每次有人 `@` bot 並輸入文字，bot 會先把訊息存進 `mentioned_messages`，再把文字回覆到頻道。

## 注意

這個版本只會回覆有 `@` bot 的文字訊息。之後可以加上會員資料、點數、抽獎、簽到、指令紀錄等功能。
