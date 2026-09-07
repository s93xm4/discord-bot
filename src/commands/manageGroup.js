import { SlashCommandBuilder } from 'discord.js';
import { getPendingApplicationChoices, manageRaidApplication } from '../raids/service.js';

function limitChoices(choices, focusedValue) {
  const keyword = focusedValue.trim().toLowerCase();
  const filteredChoices = keyword
    ? choices.filter((choice) => choice.name.toLowerCase().includes(keyword) || choice.value.includes(keyword))
    : choices;

  return filteredChoices.slice(0, 25).map((choice) => ({
    name: choice.name.slice(0, 100),
    value: choice.value
  }));
}

export const manageGroupCommand = {
  name: '管理團',
  data: new SlashCommandBuilder()
    .setName('管理團')
    .setDescription('由開團者審核副本團加入申請')
    .addStringOption((option) => option
      .setName('團號')
      .setDescription('副本團編號')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('申請者')
      .setDescription('要審核的申請者')
      .setRequired(true)
      .setAutocomplete(true))
    .addStringOption((option) => option
      .setName('動作')
      .setDescription('核准或拒絕加入申請')
      .setRequired(true)
      .addChoices(
        { name: '核准', value: 'approve' },
        { name: '拒絕', value: 'reject' }
      )),
  async autocomplete(interaction) {
    const choices = await getPendingApplicationChoices(interaction, {
      groupCode: interaction.options.getString('團號')
    });
    const focusedValue = interaction.options.getFocused();

    await interaction.respond(limitChoices(choices, focusedValue));
  },
  async execute(interaction) {
    return manageRaidApplication(interaction, {
      groupCode: interaction.options.getString('團號', true),
      userId: interaction.options.getString('申請者', true),
      action: interaction.options.getString('動作', true)
    });
  }
};
