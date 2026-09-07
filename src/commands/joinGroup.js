import { SlashCommandBuilder } from 'discord.js';
import { joinRaidGroup } from '../raids/service.js';
import { addYesNoChoices, parseYesNoChoice } from '../utils/yesNoOption.js';

export const joinGroupCommand = {
  name: '加入團',
  data: new SlashCommandBuilder()
    .setName('加入團')
    .setDescription('加入副本團')
    .addStringOption((option) => option
      .setName('團號')
      .setDescription('副本團編號')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('職業')
      .setDescription('你的職業名稱')
      .setRequired(true))
    .addStringOption((option) => addYesNoChoices(option
      .setName('候補')
      .setDescription('是否先加入候補；沒選就是正式團員'))),
  async execute(interaction) {
    return joinRaidGroup(interaction, {
      groupCode: interaction.options.getString('團號', true),
      className: interaction.options.getString('職業', true),
      preferWaitlist: parseYesNoChoice(interaction.options.getString('候補'), false)
    });
  }
};
