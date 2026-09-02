import { SlashCommandBuilder } from 'discord.js';
import { viewRaidGroup } from '../raids/service.js';

export const viewGroupCommand = {
  name: '查團',
  data: new SlashCommandBuilder()
    .setName('查團')
    .setDescription('查看副本團目前人數、正式成員與候補成員')
    .addStringOption((option) => option
      .setName('團號')
      .setDescription('副本團編號')
      .setRequired(true)),
  async execute(interaction, client) {
    return viewRaidGroup(interaction, client, {
      groupCode: interaction.options.getString('團號', true)
    });
  }
};
