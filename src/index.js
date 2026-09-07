import 'dotenv/config';
import { Events, MessageFlags } from 'discord.js';
import { client } from './client.js';
import { registerSlashCommands, slashCommands } from './commands/index.js';
import { initDatabase } from './raids/repository.js';
import { startScheduler } from './scheduler.js';

client.once(Events.ClientReady, async () => {
  await initDatabase();

  try {
    await registerSlashCommands(client, slashCommands);
  } catch (error) {
    console.error('Failed to register slash commands:', error);
  }

  startScheduler(client);
  console.log(`Logged in as ${client.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isAutocomplete()) {
    const command = slashCommands.find((item) => item.name === interaction.commandName);

    if (!command?.autocomplete) {
      await interaction.respond([]);
      return;
    }

    try {
      await command.autocomplete(interaction);
    } catch (error) {
      console.error(error);
      await interaction.respond([]);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) {
    return;
  }

  const command = slashCommands.find((item) => item.name === interaction.commandName);

  if (!command) {
    return;
  }

  try {
    const reply = await command.execute(interaction, client);

    if (reply) {
      const replyPayload = typeof reply === 'string'
        ? { content: reply }
        : reply;

      await interaction.reply({
        ...replyPayload,
        flags: MessageFlags.Ephemeral,
        allowedMentions: {
          parse: []
        }
      });
    }
  } catch (error) {
    console.error(error);

    const errorReply = {
      content: '咕嘎，處理指令時發生錯誤，請稍後再試一次。',
      flags: MessageFlags.Ephemeral
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorReply);
      return;
    }

    await interaction.reply(errorReply);
  }
});

client.login(process.env.DISCORD_TOKEN);
