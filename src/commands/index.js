import { REST, Routes } from 'discord.js';
import { approveApplicationCommand } from './approveApplication.js';
import { cancelGroupCommand } from './cancelGroup.js';
import { createGroupCommand } from './createGroup.js';
import { editMemberCommand } from './editMember.js';
import { kickMemberCommand } from './kickMember.js';
import { leaderAddMemberCommand } from './leaderAddMember.js';
import { joinGroupCommand } from './joinGroup.js';
import { manageGroupCommand } from './manageGroup.js';
import { recruitingBoardCommand } from './recruitingBoard.js';
import { selfManageMemberCommand } from './selfManageMember.js';
import { viewGroupCommand } from './viewGroup.js';

export const slashCommands = [
  createGroupCommand,
  joinGroupCommand,
  selfManageMemberCommand,
  leaderAddMemberCommand,
  editMemberCommand,
  kickMemberCommand,
  approveApplicationCommand,
  manageGroupCommand,
  viewGroupCommand,
  recruitingBoardCommand,
  cancelGroupCommand
];

export async function registerSlashCommands(client, commands) {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  const commandPayload = commands.map((command) => command.data.toJSON());

  for (const guild of client.guilds.cache.values()) {
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, guild.id),
      { body: commandPayload }
    );
  }

  console.log(`Registered ${commands.length} slash commands for ${client.guilds.cache.size} guild(s).`);
}
