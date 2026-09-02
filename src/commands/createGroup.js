import { SlashCommandBuilder } from 'discord.js';
import { createRaidGroup } from '../raids/service.js';
import { parseTaipeiDateTime } from '../utils/dateTime.js';

export const createGroupCommand = {
  name: '開團',
  data: new SlashCommandBuilder()
    .setName('開團')
    .setDescription('建立一個副本團')
    .addStringOption((option) => option
      .setName('副本')
      .setDescription('副本名稱，例如 243')
      .setRequired(true))
    .addIntegerOption((option) => option
      .setName('人數')
      .setDescription('預定總人數')
      .setMinValue(1)
      .setRequired(true))
    .addStringOption((option) => option
      .setName('日期')
      .setDescription('預定日期，例如 2026/09/01')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('時間')
      .setDescription('預定時間，例如 22:00')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('地點')
      .setDescription('集合地點')
      .setRequired(true))
    .addIntegerOption((option) => option
      .setName('預設人數')
      .setDescription('已經有幾個人，不含透過 bot 加入的人')
      .setMinValue(0))
    .addIntegerOption((option) => option
      .setName('提醒分鐘')
      .setDescription('每隔幾分鐘提醒一次還缺多少人')
      .setMinValue(1))
    .addBooleanOption((option) => option
      .setName('通知所有人')
      .setDescription('提醒時是否加上 @everyone')),
  async execute(interaction) {
    const scheduledAt = parseTaipeiDateTime(
      interaction.options.getString('日期', true),
      interaction.options.getString('時間', true)
    );

    if (!scheduledAt) {
      return '咕嘎，日期時間格式怪怪的，請用例如：日期 2026/09/01、時間 22:00。';
    }

    return createRaidGroup(interaction, {
      dungeonName: interaction.options.getString('副本', true),
      maxMembers: interaction.options.getInteger('人數', true),
      initialMemberCount: interaction.options.getInteger('預設人數') ?? 0,
      locationName: interaction.options.getString('地點', true),
      scheduledAt,
      reminderIntervalMinutes: interaction.options.getInteger('提醒分鐘'),
      notifyEveryone: interaction.options.getBoolean('通知所有人') ?? false
    });
  }
};
