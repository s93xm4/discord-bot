import { SlashCommandBuilder } from 'discord.js';
import { viewMyGroups } from '../raids/service.js';

export const myGroupsCommand = {
  name: '我的團',
  data: new SlashCommandBuilder()
    .setName('我的團')
    .setDescription('查看自己開的、已加入與待核准的副本團'),
  async execute(interaction, client) {
    return viewMyGroups(interaction, client);
  }
};
