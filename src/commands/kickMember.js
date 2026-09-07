import { SlashCommandBuilder } from 'discord.js';
import { getKickMemberChoices, kickRaidMember } from '../raids/service.js';

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

export const kickMemberCommand = {
  name: '踢出',
  data: new SlashCommandBuilder()
    .setName('踢出')
    .setDescription('由開團者將成員移出副本團')
    .addStringOption((option) => option
      .setName('團號')
      .setDescription('副本團編號')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('成員')
      .setDescription('要踢出的團員')
      .setRequired(true)
      .setAutocomplete(true)),
  async autocomplete(interaction) {
    const choices = await getKickMemberChoices(interaction, {
      groupCode: interaction.options.getString('團號')
    });
    const focusedValue = interaction.options.getFocused();

    await interaction.respond(limitChoices(choices, focusedValue));
  },
  async execute(interaction) {
    const userId = interaction.options.getString('成員', true);
    const choices = await getKickMemberChoices(interaction, {
      groupCode: interaction.options.getString('團號', true)
    });
    const selectedChoice = choices.find((choice) => choice.value === userId);

    return kickRaidMember(interaction, {
      groupCode: interaction.options.getString('團號', true),
      userId,
      userName: selectedChoice?.name.replace(/（.+）$/, '') ?? userId
    });
  }
};
