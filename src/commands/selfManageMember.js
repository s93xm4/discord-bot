import { SlashCommandBuilder } from 'discord.js';
import { selfManageRaidMember } from '../raids/service.js';

export const selfManageMemberCommand = {
  name: '自行修改',
  data: new SlashCommandBuilder()
    .setName('自行修改')
    .setDescription('自行修改職業、退出副本團，或切換正式/候補狀態')
    .addStringOption((option) => option
      .setName('團號')
      .setDescription('副本團編號')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('動作')
      .setDescription('要修改的項目')
      .setRequired(true)
      .addChoices(
        { name: '修改職業', value: 'class' },
        { name: '退出', value: 'leave' },
        { name: '改為正式', value: 'formal' },
        { name: '改為候補', value: 'waitlist' }
      ))
    .addStringOption((option) => option
      .setName('職業')
      .setDescription('修改職業時填寫新的職業名稱')),
  async execute(interaction) {
    return selfManageRaidMember(interaction, {
      groupCode: interaction.options.getString('團號', true),
      action: interaction.options.getString('動作', true),
      className: interaction.options.getString('職業')
    });
  }
};
