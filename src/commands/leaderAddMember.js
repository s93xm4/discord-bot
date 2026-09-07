import { SlashCommandBuilder } from 'discord.js';
import { addRaidMemberByLeader } from '../raids/service.js';

function getSelectedUserName(interaction, user) {
  const member = interaction.options.getMember('成員');

  return member?.displayName
    ?? user.globalName
    ?? user.username
    ?? user.id;
}

export const leaderAddMemberCommand = {
  name: '加入',
  data: new SlashCommandBuilder()
    .setName('加入')
    .setDescription('由開團者手動加入伺服器成員到副本團')
    .addStringOption((option) => option
      .setName('團號')
      .setDescription('副本團編號')
      .setRequired(true))
    .addUserOption((option) => option
      .setName('成員')
      .setDescription('要加入的伺服器成員')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('職業')
      .setDescription('該成員的職業名稱')
      .setRequired(true)),
  async execute(interaction) {
    const user = interaction.options.getUser('成員', true);

    return addRaidMemberByLeader(interaction, {
      groupCode: interaction.options.getString('團號', true),
      userId: user.id,
      userName: getSelectedUserName(interaction, user),
      className: interaction.options.getString('職業', true)
    });
  }
};
