import { SlashCommandBuilder } from 'discord.js';
import { viewRecruitingBoard } from '../raids/service.js';

export const recruitingBoardCommand = {
  name: '招募板',
  data: new SlashCommandBuilder()
    .setName('招募板')
    .setDescription('列出目前正在招募的副本團'),
  async execute(interaction, client) {
    return viewRecruitingBoard(interaction, client);
  }
};
