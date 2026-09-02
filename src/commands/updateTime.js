import { SlashCommandBuilder } from 'discord.js';
import { updateRaidTime } from '../raids/service.js';
import { parseTaipeiDateTime } from '../utils/dateTime.js';

export const updateTimeCommand = {
  name: '修改時間',
  data: new SlashCommandBuilder()
    .setName('修改時間')
    .setDescription('由開團者修改副本團預定時間')
    .addStringOption((option) => option
      .setName('團號')
      .setDescription('副本團編號')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('日期')
      .setDescription('新的預定日期，例如 2026/09/01')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('時間')
      .setDescription('新的預定時間，例如 22:00')
      .setRequired(true)),
  async execute(interaction) {
    const scheduledAt = parseTaipeiDateTime(
      interaction.options.getString('日期', true),
      interaction.options.getString('時間', true)
    );

    if (!scheduledAt) {
      return '咕嘎，日期時間格式怪怪的，請用例如：日期 2026/09/01、時間 22:00。';
    }

    return updateRaidTime(interaction, {
      groupCode: interaction.options.getString('團號', true),
      scheduledAt
    });
  }
};
