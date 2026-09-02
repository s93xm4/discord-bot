import { SlashCommandBuilder } from 'discord.js';
import { joinRaidGroup } from '../raids/service.js';

export const joinGroupCommand = {
  name: '加入團',
  data: new SlashCommandBuilder()
    .setName('加入團')
    .setDescription('加入副本團，或修改自己在該團的職業')
    .addStringOption((option) => option
      .setName('團號')
      .setDescription('副本團編號')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('職業')
      .setDescription('你的職業名稱')
      .setRequired(true)),
  async execute(interaction) {
    return joinRaidGroup(interaction, {
      groupCode: interaction.options.getString('團號', true),
      className: interaction.options.getString('職業', true)
    });
  }
};
