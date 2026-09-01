import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import pg from 'pg';

const token = process.env.DISCORD_TOKEN;
const databaseUrl = process.env.DATABASE_URL;

if (!token) {
  console.error('Missing DISCORD_TOKEN. Copy .env.example to .env and fill in your bot token.');
  process.exit(1);
}

if (!databaseUrl) {
  console.error('Missing DATABASE_URL. Add your online database connection string to .env.');
  process.exit(1);
}

const { Pool } = pg;
const db = new Pool({
  connectionString: databaseUrl
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

async function initDatabase() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS mentioned_messages (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL UNIQUE,
      author_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

client.once('ready', async () => {
  await initDatabase();
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) {
    return;
  }

  if (!message.mentions.users.has(client.user.id)) {
    return;
  }

  const mentionPattern = new RegExp(`<@!?${client.user.id}>`, 'g');
  const content = message.content.replace(mentionPattern, '').trim();

  if (!content) {
    return;
  }

  await db.query(
    `INSERT INTO mentioned_messages (guild_id, channel_id, message_id, author_id, content)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (message_id) DO NOTHING`,
    [
      message.guildId,
      message.channelId,
      message.id,
      message.author.id,
      content
    ]
  );

  await message.channel.send(content);
});

client.login(token);
