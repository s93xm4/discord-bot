import { SlashCommandBuilder } from 'discord.js';
import { updateRaidNotification, updateRaidTime } from '../raids/service.js';
import { parseTaipeiDateTime } from '../utils/dateTime.js';

export const manageGroupCommand = {
  name: '管理團',
  data: new SlashCommandBuilder()
    .setName('管理團')
    .setDescription('由開團者修改副本團時間或通知設定')
    .addStringOption((option) => option
      .setName('團號')
      .setDescription('副本團編號')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('功能')
      .setDescription('要修改的項目')
      .setRequired(true)
      .addChoices(
        { name: '修改時間', value: 'time' },
        { name: '修改通知', value: 'notification' }
      ))
    .addStringOption((option) => option
      .setName('日期')
      .setDescription('修改時間時填寫，例如 2026/09/01'))
    .addStringOption((option) => option
      .setName('時間')
      .setDescription('修改時間時填寫，例如 22:00'))
    .addStringOption((option) => option
      .setName('動作')
      .setDescription('修改通知時選擇開啟或停止')
      .addChoices(
        { name: '開啟通知', value: 'start' },
        { name: '停止通知', value: 'stop' }
      ))
    .addIntegerOption((option) => option
      .setName('提醒分鐘')
      .setDescription('開啟通知時，每隔幾分鐘提醒一次')
      .setMinValue(1))
    .addBooleanOption((option) => option
      .setName('通知所有人')
      .setDescription('提醒時是否加上 @everyone')),
  async execute(interaction) {
    const groupCode = interaction.options.getString('團號', true);
    const feature = interaction.options.getString('功能', true);

    if (feature === 'time') {
      const dateValue = interaction.options.getString('日期');
      const timeValue = interaction.options.getString('時間');

      if (!dateValue || !timeValue) {
        return '咕嘎，修改時間需要填「日期」和「時間」，例如：/管理團 團號:20260901001 功能:修改時間 日期:2026/09/01 時間:22:00。';
      }

      const scheduledAt = parseTaipeiDateTime(dateValue, timeValue);

      if (!scheduledAt) {
        return '咕嘎，日期時間格式怪怪的，請用例如：日期 2026/09/01、時間 22:00。';
      }

      return updateRaidTime(interaction, {
        groupCode,
        scheduledAt
      });
    }

    const action = interaction.options.getString('動作');

    if (!action) {
      return '咕嘎，修改通知需要選「動作」，可以選開啟通知或停止通知。';
    }

    return updateRaidNotification(interaction, {
      groupCode,
      action,
      reminderIntervalMinutes: interaction.options.getInteger('提醒分鐘'),
      notifyEveryone: interaction.options.getBoolean('通知所有人')
    });
  }
};
