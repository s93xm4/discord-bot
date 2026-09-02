import { SlashCommandBuilder } from 'discord.js';
import { updateRaidNotification } from '../raids/service.js';

export const updateNotificationCommand = {
  name: '修改通知',
  data: new SlashCommandBuilder()
    .setName('修改通知')
    .setDescription('由開團者開啟、停止或調整副本團自動提醒')
    .addStringOption((option) => option
      .setName('團號')
      .setDescription('副本團編號')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('動作')
      .setDescription('要開啟或停止通知')
      .setRequired(true)
      .addChoices(
        { name: '開啟', value: 'start' },
        { name: '停止', value: 'stop' }
      ))
    .addIntegerOption((option) => option
      .setName('提醒分鐘')
      .setDescription('開啟通知時，每隔幾分鐘提醒一次')
      .setMinValue(1))
    .addBooleanOption((option) => option
      .setName('通知所有人')
      .setDescription('提醒時是否加上 @everyone')),
  async execute(interaction) {
    return updateRaidNotification(interaction, {
      groupCode: interaction.options.getString('團號', true),
      action: interaction.options.getString('動作', true),
      reminderIntervalMinutes: interaction.options.getInteger('提醒分鐘'),
      notifyEveryone: interaction.options.getBoolean('通知所有人')
    });
  }
};
