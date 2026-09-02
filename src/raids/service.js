import { getActorDisplayName, getActorId, resolveDisplayName } from '../utils/actors.js';
import { formatTaipeiDateTime } from '../utils/dateTime.js';
import {
  cancelGroup,
  clearNextReminder,
  createGroup,
  finishDueGroup,
  generateGroupCode,
  getDueGroups,
  getExistingMember,
  getGroupMembers,
  getGroupSummary,
  getRecruitingGroups,
  getReminderDueGroups,
  scheduleNextReminder,
  updateGroupNotification,
  updateGroupStatus,
  updateGroupTime,
  upsertGroupMember
} from './repository.js';

export function getMissingCount(group) {
  return Math.max(group.max_members - group.initial_member_count - group.member_count, 0);
}

function assertLeader(group, context, actionName) {
  if (group.leader_id !== getActorId(context)) {
    return `只有開團者可以${actionName}副本團編號 ${group.group_code}。`;
  }

  return null;
}

function formatMemberLines(members) {
  return members.length
    ? members.map((member, index) => `${index + 1}. ${member.user_name ?? member.user_id}：${member.class_name}`)
    : ['目前還沒有人透過 bot 加入'];
}

async function sendGroupCreatedNotice(context, groupCode, fields) {
  if (!context.channel?.isTextBased()) {
    return;
  }

  await context.channel.send({
    content: [
      '@everyone 有新的副本團正在找人！',
      `副本團編號：${groupCode}`,
      `副本：${fields.dungeonName}`,
      `時間：${formatTaipeiDateTime(fields.scheduledAt)}`,
      `地點：${fields.locationName}`,
      `想加入請使用：/加入團 團號:${groupCode} 職業:你的職業`
    ].join('\n'),
    allowedMentions: {
      parse: ['everyone']
    }
  });
}

export async function createRaidGroup(context, fields) {
  const initialMemberCount = fields.initialMemberCount ?? 0;
  const leaderName = getActorDisplayName(context);

  if (initialMemberCount >= fields.maxMembers) {
    return '咕嘎，預設人數不能大於或等於預定人數，因為這樣就不需要找人了。請重新設定預設人數。';
  }

  if (fields.scheduledAt <= new Date()) {
    return '咕嘎，預定時間已經過了，請換一個未來的日期時間。';
  }

  const groupCode = await generateGroupCode(fields.scheduledAt);
  const nextReminderAt = fields.reminderIntervalMinutes
    ? new Date(Date.now() + fields.reminderIntervalMinutes * 60 * 1000)
    : null;

  await createGroup({
    groupCode,
    guildId: context.guildId,
    channelId: context.channelId,
    leaderId: getActorId(context),
    leaderName,
    dungeonName: fields.dungeonName,
    maxMembers: fields.maxMembers,
    initialMemberCount,
    locationName: fields.locationName,
    scheduledAt: fields.scheduledAt,
    reminderIntervalMinutes: fields.reminderIntervalMinutes,
    nextReminderAt,
    notifyEveryone: fields.notifyEveryone ?? false
  });

  await sendGroupCreatedNotice(context, groupCode, fields);

  const reminderText = fields.reminderIntervalMinutes
    ? `，每 ${fields.reminderIntervalMinutes} 分鐘提醒一次${fields.notifyEveryone ? '，會通知所有人' : ''}`
    : '';

  return `咕嘎，已為你設定好，副本團編號為 ${groupCode}${reminderText}`;
}

export async function joinRaidGroup(context, fields) {
  const group = await getGroupSummary(fields.groupCode);
  const userId = getActorId(context);
  const userName = getActorDisplayName(context);

  if (!group) {
    return `咕嘎，找不到副本團編號 ${fields.groupCode}。`;
  }

  if (group.status !== 'open' && group.status !== 'full') {
    return `咕嘎，副本團編號 ${fields.groupCode} 已結束，不能加入。`;
  }

  const existingMember = await getExistingMember(group.id, userId);
  const isWaitlist = existingMember ? existingMember.is_waitlist : getMissingCount(group) <= 0;

  await upsertGroupMember({
    raidGroupId: group.id,
    userId,
    userName,
    className: fields.className,
    isWaitlist
  });

  const updatedGroup = await getGroupSummary(fields.groupCode);
  const missingCount = getMissingCount(updatedGroup);
  const status = missingCount === 0 ? 'full' : 'open';

  await updateGroupStatus(group.id, status);

  if (existingMember) {
    return `咕嘎，已幫你把副本團編號 ${fields.groupCode} 的職業改為 ${fields.className}。`;
  }

  if (isWaitlist) {
    return `咕嘎，副本團編號 ${fields.groupCode} 已滿，你已排入候補。`;
  }

  return `咕嘎，已為你設定好，副本團編號為 ${fields.groupCode}，目前還缺少 ${missingCount} 人`;
}

export async function viewRaidGroup(context, client, fields) {
  const group = await getGroupSummary(fields.groupCode);

  if (!group) {
    return `咕嘎，找不到副本團編號 ${fields.groupCode}。`;
  }

  const missingCount = getMissingCount(group);
  const members = await getGroupMembers(group.id);
  const waitlistMembers = await getGroupMembers(group.id, true);
  const leaderName = await resolveDisplayName(context, client, group.leader_id, group.leader_name);
  const memberNames = await Promise.all(
    members.map((member) => resolveDisplayName(context, client, member.user_id, member.user_name))
  );
  const waitlistNames = await Promise.all(
    waitlistMembers.map((member) => resolveDisplayName(context, client, member.user_id, member.user_name))
  );
  const memberLines = members.length
    ? members.map((member, index) => `${index + 1}. ${memberNames[index]}：${member.class_name}`)
    : ['目前還沒有人透過 bot 加入'];
  const waitlistLines = waitlistMembers.length
    ? waitlistMembers.map((member, index) => `${index + 1}. ${waitlistNames[index]}：${member.class_name}`)
    : ['目前沒有候補'];
  const initialMemberText = group.initial_member_count > 0
    ? [`預設人數：${group.initial_member_count} 人（未記錄 Discord 帳號）`]
    : [];

  return [
    '咕嘎嘎，查到這團了：',
    `副本團編號 ${group.group_code}`,
    `副本：${group.dungeon_name}`,
    `團長：${leaderName}`,
    `時間：${formatTaipeiDateTime(group.scheduled_at)}`,
    `地點：${group.location_name}`,
    `目前人數：${group.initial_member_count + group.member_count}/${group.max_members}`,
    `還缺：${missingCount} 人`,
    `候補：${group.waitlist_count} 人`,
    `自動通知：${group.reminder_interval_minutes ? `每 ${group.reminder_interval_minutes} 分鐘` : '未開啟'}`,
    `通知所有人：${group.notify_everyone ? '是' : '否'}`,
    ...initialMemberText,
    '正式成員：',
    ...memberLines,
    '候補成員：',
    ...waitlistLines
  ].join('\n');
}

export async function viewRecruitingBoard(context, client) {
  const groups = await getRecruitingGroups(context.guildId);

  if (!groups.length) {
    return '咕嘎，目前沒有正在招募的副本團。';
  }

  const groupLines = await Promise.all(groups.map(async (group, index) => {
    const leaderName = await resolveDisplayName(context, client, group.leader_id, group.leader_name);
    const missingCount = getMissingCount(group);
    const memberCount = group.initial_member_count + group.member_count;

    return [
      `${index + 1}. 副本團編號 ${group.group_code}`,
      `副本：${group.dungeon_name}`,
      `團長：${leaderName}`,
      `時間：${formatTaipeiDateTime(group.scheduled_at)}`,
      `地點：${group.location_name}`,
      `人數：${memberCount}/${group.max_members}，還缺 ${missingCount} 人，候補 ${group.waitlist_count} 人`,
      `加入方式：/加入團 團號:${group.group_code} 職業:你的職業`
    ].join('\n');
  }));

  return [
    '咕嘎嘎，目前正在招募的副本團：',
    ...groupLines
  ].join('\n\n');
}

export async function cancelRaidGroup(context, fields) {
  const group = await getGroupSummary(fields.groupCode);

  if (!group) {
    return `咕嘎，找不到副本團編號 ${fields.groupCode}。`;
  }

  const leaderError = assertLeader(group, context, '解散');

  if (leaderError) {
    return `咕嘎，${leaderError}`;
  }

  if (group.status === 'cancelled') {
    return `咕嘎，副本團編號 ${fields.groupCode} 已經解散了。`;
  }

  if (group.status === 'completed') {
    return `咕嘎，副本團編號 ${fields.groupCode} 已經結束，不能解散。`;
  }

  await cancelGroup(group.id);

  return `咕嘎，副本團編號 ${fields.groupCode} 已解散。`;
}

export async function updateRaidNotification(context, fields) {
  const group = await getGroupSummary(fields.groupCode);

  if (!group) {
    return `咕嘎，找不到副本團編號 ${fields.groupCode}。`;
  }

  const leaderError = assertLeader(group, context, '修改通知');

  if (leaderError) {
    return `咕嘎，${leaderError}`;
  }

  if (fields.action === 'stop') {
    await updateGroupNotification(group.id, {
      reminderIntervalMinutes: null,
      nextReminderAt: null,
      notifyEveryone: fields.notifyEveryone ?? group.notify_everyone
    });

    return `咕嘎，副本團編號 ${fields.groupCode} 已停止自動通知。`;
  }

  const reminderIntervalMinutes = fields.reminderIntervalMinutes ?? group.reminder_interval_minutes;

  if (!reminderIntervalMinutes) {
    return '咕嘎，開啟通知時需要填「提醒分鐘」，例如 60。';
  }

  await updateGroupNotification(group.id, {
    reminderIntervalMinutes,
    nextReminderAt: new Date(Date.now() + reminderIntervalMinutes * 60 * 1000),
    notifyEveryone: fields.notifyEveryone ?? group.notify_everyone
  });

  return `咕嘎，副本團編號 ${fields.groupCode} 已開啟自動通知，每 ${reminderIntervalMinutes} 分鐘提醒一次。`;
}

export async function updateRaidTime(context, fields) {
  const group = await getGroupSummary(fields.groupCode);

  if (!group) {
    return `咕嘎，找不到副本團編號 ${fields.groupCode}。`;
  }

  const leaderError = assertLeader(group, context, '修改時間');

  if (leaderError) {
    return `咕嘎，${leaderError}`;
  }

  if (fields.scheduledAt <= new Date()) {
    return '咕嘎，新的預定時間已經過了，請換一個未來的日期時間。';
  }

  await updateGroupTime(group.id, fields.scheduledAt);

  return `咕嘎，副本團編號 ${fields.groupCode} 已改到 ${formatTaipeiDateTime(fields.scheduledAt)}。`;
}

export async function sendReminderMessages(client) {
  const groups = await getReminderDueGroups();

  for (const group of groups) {
    const channel = await client.channels.fetch(group.channel_id).catch(() => null);

    if (!channel?.isTextBased()) {
      continue;
    }

    const missingCount = getMissingCount(group);

    if (missingCount <= 0) {
      await clearNextReminder(group.id);
      continue;
    }

    const members = await getGroupMembers(group.id);
    const memberLines = formatMemberLines(members);
    const prefix = group.notify_everyone ? '@everyone ' : '';

    await channel.send({
      content: [
        `${prefix}副本團編號 ${group.group_code}，副本 ${group.dungeon_name}，預定副本時間為 ${formatTaipeiDateTime(group.scheduled_at)}，目前還缺 ${missingCount} 人`,
        '正式成員：',
        ...memberLines
      ].join('\n'),
      allowedMentions: {
        parse: group.notify_everyone ? ['everyone'] : []
      }
    });

    await scheduleNextReminder(group.id);
  }
}

export async function sendDueMessages(client) {
  const groups = await getDueGroups();

  for (const group of groups) {
    const channel = await client.channels.fetch(group.channel_id).catch(() => null);

    if (!channel?.isTextBased()) {
      continue;
    }

    const members = await getGroupMembers(group.id);
    const mentions = members.map((member) => `<@${member.user_id}>`).join(' ');
    const missingCount = getMissingCount(group);

    if (missingCount > 0) {
      await channel.send(`${mentions} 副本團編號 ${group.group_code}，人數未齊，該團解散`);
      await finishDueGroup(group.id, 'cancelled');
      continue;
    }

    await channel.send(`${mentions} 副本團編號 ${group.group_code}，各位要打副本了呦~`);
    await finishDueGroup(group.id, 'completed');
  }
}
