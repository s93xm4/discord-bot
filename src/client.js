import { Client, GatewayIntentBits } from 'discord.js';

if (!process.env.DISCORD_TOKEN) {
  console.error('Missing DISCORD_TOKEN. Copy .env.example to .env and fill in your bot token.');
  process.exit(1);
}

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds
  ]
});
