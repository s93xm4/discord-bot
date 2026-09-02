import { SlashCommandBuilder } from 'discord.js';
import { cancelRaidGroup } from '../raids/service.js';

export const cancelGroupCommand = {
  name: '解散團',
  data: new SlashCommandBuilder()
    .setName('解散團')
    .setDescription('由開團者解散自己的副本團')
    .addStringOption((option) => option
      .setName('團號')
      .setDescription('副本團編號')
      .setRequired(true)),
  async execute(interaction) {
    return cancelRaidGroup(interaction, {
      groupCode: interaction.options.getString('團號', true)
    });
  }
};
