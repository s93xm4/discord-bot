import { SlashCommandBuilder } from 'discord.js';
import { editRaidMemberByLeader, getKickMemberChoices } from '../raids/service.js';

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

export const editMemberCommand = {
  name: '編輯團員',
  data: new SlashCommandBuilder()
    .setName('編輯團員')
    .setDescription('由開團者修改團員職業或正式/候補狀態')
    .addStringOption((option) => option
      .setName('團號')
      .setDescription('副本團編號')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('成員')
      .setDescription('要編輯的團員')
      .setRequired(true)
      .setAutocomplete(true))
    .addStringOption((option) => option
      .setName('職業')
      .setDescription('新的職業名稱；不填就不修改職業'))
    .addStringOption((option) => option
      .setName('狀態')
      .setDescription('新的團員狀態；不填就不修改狀態')
      .addChoices(
        { name: '正式', value: 'formal' },
        { name: '候補', value: 'waitlist' }
      )),
  async autocomplete(interaction) {
    const choices = await getKickMemberChoices(interaction, {
      groupCode: interaction.options.getString('團號')
    });
    const focusedValue = interaction.options.getFocused();

    await interaction.respond(limitChoices(choices, focusedValue));
  },
  async execute(interaction) {
    const userId = interaction.options.getString('成員', true);
    const status = interaction.options.getString('狀態');
    const choices = await getKickMemberChoices(interaction, {
      groupCode: interaction.options.getString('團號', true)
    });
    const selectedChoice = choices.find((choice) => choice.value === userId);

    return editRaidMemberByLeader(interaction, {
      groupCode: interaction.options.getString('團號', true),
      userId,
      userName: selectedChoice?.name.replace(/（.+）$/, '') ?? userId,
      className: interaction.options.getString('職業'),
      isWaitlist: status ? status === 'waitlist' : null
    });
  }
};
