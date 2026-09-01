# Discord Echo Bot

這是一個 Discord 組團 bot：只要有人在伺服器頻道 `@` 它，就可以開副本團、加入副本團、查看目前人數，並把資料記錄到線上 Postgres 資料庫。

## 需求

- Node.js 20 或更新版本
- Discord Developer Portal 建好的 bot token
- 線上 Postgres 資料庫連線字串

## Discord 設定

1. 到 Discord Developer Portal 建立 Application。
2. 在 `Bot` 頁面新增 bot，複製 token。
3. 在 `Bot` 頁面打開 `MESSAGE CONTENT INTENT`。
4. 到 `OAuth2 > URL Generator`：
   - Scopes 勾 `bot`、`applications.commands`
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
postgresql://user:password@host/database?sslmode=verify-full
```

6. 貼到 `.env`：

```env
DISCORD_TOKEN=你的 Discord bot token
DATABASE_URL=你的 Neon connection string
```

## 指令

目前第一版使用固定格式，少填欄位時 bot 會記住你的草稿並追問。草稿保留 30 分鐘。
也可以使用 Discord slash command：`/開團`、`/加入團`、`/查團`。

### Slash Commands

```text
/開團 副本:243 人數:6 日期:2026/09/01 時間:22:00 地點:蒙德老家 預設人數:2 提醒分鐘:60 通知所有人:true
/加入團 團號:20260901001 職業:VI
/查團 團號:20260901001
```

### 開團

```text
@機器人 開團 副本243 人數6 日期2026/09/01 時間22:00 地點蒙德老家 預設人數2 每60分鐘通知 通知所有人
```

必填：

- 副本名稱
- 人數
- 日期
- 時間
- 地點

選填：

- `預設人數2`：代表原本就有 2 個人，只再找剩下的人。
- `每60分鐘通知` 或 `每1小時通知`：定時提醒還缺多少人。
- `通知所有人`：提醒時會加上 `@everyone`；沒寫就只發普通訊息。

### 加入或修改職業

```text
@機器人 加入 20260901001 職業VI
```

同一個人不能重複加入同一團；再次加入會視為修改職業。

### 查團

```text
@機器人 查團 20260901001
```

會列出副本、人數、缺額、正式成員職業，以及候補成員職業。

### 延後

```text
@機器人 延後 20260901001 日期2026/09/01 時間22:30
```

只有開團者可以延後。

## 資料表

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

每次有人 `@` bot 並輸入文字，bot 會先把訊息存進 `mentioned_messages`，再依指令更新組團資料。
組團功能另外會自動建立 `raid_groups`、`raid_group_members`、`pending_prompts`。

## 注意

預設人數只會影響缺額計算，因為 bot 不知道那些人的 Discord 帳號，所以到副本時間時只能 `@` 實際加入過的成員。
