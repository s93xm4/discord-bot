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
  getMyGroups,
  getPendingMembers,
  getRecruitingGroups,
  getReminderDueGroups,
  promoteWaitlistMembers,
  removeGroupMember,
  scheduleNextReminder,
  updateMemberApproval,
  updateGroupMember,
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

function limitReplyLength(text) {
  if (text.length <= 1900) {
    return text;
  }

  return `${text.slice(0, 1850)}\n\n咕嘎，內容太多，後面先省略。可以用 /查團 團號:副本團編號 查看單一團完整資訊。`;
}

function getGroupJoinStatus(group, missingCount) {
  return missingCount === 0 ? 'full' : 'open';
}

async function refreshGroupStatus(group, groupCode) {
  const updatedGroup = await getGroupSummary(groupCode);
  const missingCount = getMissingCount(updatedGroup);

  await updateGroupStatus(group.id, getGroupJoinStatus(updatedGroup, missingCount));

  return { group: updatedGroup, missingCount };
}

function getMemberStateName(isWaitlist) {
  return isWaitlist ? '候補' : '正式';
}

function shouldBlockFormalMove(group, member, targetWaitlist) {
  return targetWaitlist === false && member.is_waitlist && getMissingCount(group) <= 0;
}

async function getMemberLines(context, client, members, emptyText, includeState = false) {
  if (!members.length) {
    return [emptyText];
  }

  const memberNames = await Promise.all(
    members.map((member) => resolveDisplayName(context, client, member.user_id, member.user_name))
  );

  return members.map((member, index) => {
    const stateText = includeState ? `（${getMemberStateName(member.is_waitlist)}）` : '';

    return `${index + 1}. ${memberNames[index]}：${member.class_name}${stateText}`;
  });
}

async function formatGroupDetail(context, client, group, index = null) {
  const missingCount = getMissingCount(group);
  const members = await getGroupMembers(group.id);
  const waitlistMembers = await getGroupMembers(group.id, true);
  const pendingMembers = await getPendingMembers(group.id);
  const leaderName = await resolveDisplayName(context, client, group.leader_id, group.leader_name);
  const memberLines = await getMemberLines(context, client, members, '目前還沒有人透過 bot 加入');
  const waitlistLines = await getMemberLines(context, client, waitlistMembers, '目前沒有候補');
  const pendingLines = await getMemberLines(context, client, pendingMembers, '目前沒有待審', true);
  const title = index ? `${index}. 副本團編號 ${group.group_code}` : `副本團編號 ${group.group_code}`;
  const initialMemberText = group.initial_member_count > 0
    ? [`預設人數：${group.initial_member_count} 人（未記錄 Discord 帳號）`]
    : [];

  return [
    title,
    `副本：${group.dungeon_name}`,
    `團長：${leaderName}`,
    `時間：${formatTaipeiDateTime(group.scheduled_at)}`,
    `地點：${group.location_name}`,
    `目前人數：${group.initial_member_count + group.member_count}/${group.max_members}`,
    `還缺：${missingCount} 人`,
    `候補：${group.waitlist_count} 人`,
    `待審：${group.pending_count} 人`,
    `加入審核：${group.approval_required ? '需要' : '不需要'}`,
    `自動通知：${group.reminder_interval_minutes ? `每 ${group.reminder_interval_minutes} 分鐘` : '未開啟'}`,
    `通知所有人：${group.notify_everyone ? '是' : '否'}`,
    ...initialMemberText,
    '正式成員：',
    ...memberLines,
    '候補成員：',
    ...waitlistLines,
    '待審成員：',
    ...pendingLines
  ].join('\n');
}

async function notifyGroupMembers(context, group, lines) {
  if (!context.channel?.isTextBased()) {
    return;
  }

  const members = await getGroupMembers(group.id);
  const waitlistMembers = await getGroupMembers(group.id, true);
  const userIds = [...new Set([
    ...members.map((member) => member.user_id),
    ...waitlistMembers.map((member) => member.user_id)
  ])];

  if (!userIds.length) {
    return;
  }

  await context.channel.send({
    content: [
      userIds.map((userId) => `<@${userId}>`).join(' '),
      ...lines
    ].join('\n'),
    allowedMentions: {
      users: userIds
    }
  });
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
      `想加入請使用：/加入團 團號:${groupCode} 職業:你的職業，也可以加上 候補:true 先排候補`
    ].join('\n'),
    allowedMentions: {
      parse: ['everyone']
    }
  });
}

async function notifyLeaderApplication(context, group, applicantName) {
  if (!context.channel?.isTextBased()) {
    return;
  }

  await context.channel.send({
    content: [
      `<@${group.leader_id}> 咕嘎，有新的副本團加入申請需要審核。`,
      `副本團編號：${group.group_code}`,
      `申請者：${applicantName}`,
      `請使用：/核准 團號:${group.group_code} 申請者:申請者 動作:核准`
    ].join('\n'),
    allowedMentions: {
      users: [group.leader_id]
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
    notifyEveryone: fields.notifyEveryone ?? false,
    approvalRequired: fields.approvalRequired ?? false
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

  if (existingMember?.member_status === 'joined') {
    return `咕嘎，你已經在副本團編號 ${fields.groupCode} 裡了。要修改職業、退出或切換正式/候補，請使用 /自行修改。`;
  }

  if (group.approval_required && (!existingMember || existingMember.member_status !== 'joined')) {
    await upsertGroupMember({
      raidGroupId: group.id,
      userId,
      userName,
      className: fields.className,
      isWaitlist: fields.preferWaitlist,
      memberStatus: 'pending'
    });
    await notifyLeaderApplication(context, group, userName);

    return `咕嘎，已送出加入副本團編號 ${fields.groupCode} 的申請，請等待團長審核。`;
  }

  const isWaitlist = fields.preferWaitlist || getMissingCount(group) <= 0;

  await upsertGroupMember({
    raidGroupId: group.id,
    userId,
    userName,
    className: fields.className,
    isWaitlist,
    memberStatus: 'joined'
  });

  const updatedGroup = await getGroupSummary(fields.groupCode);
  const missingCount = getMissingCount(updatedGroup);
  const status = getGroupJoinStatus(updatedGroup, missingCount);

  await updateGroupStatus(group.id, status);

  if (isWaitlist) {
    return fields.preferWaitlist
      ? `咕嘎，已幫你加入副本團編號 ${fields.groupCode} 的候補。`
      : `咕嘎，副本團編號 ${fields.groupCode} 已滿，你已排入候補。`;
  }

  return `咕嘎，已為你設定好，副本團編號為 ${fields.groupCode}，目前還缺少 ${missingCount} 人`;
}

export async function viewRaidGroup(context, client, fields) {
  const group = await getGroupSummary(fields.groupCode);

  if (!group) {
    return `咕嘎，找不到副本團編號 ${fields.groupCode}。`;
  }

  return limitReplyLength([
    '咕嘎嘎，查到這團了：',
    await formatGroupDetail(context, client, group)
  ].join('\n'));
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
    const joinText = missingCount > 0
      ? `加入方式：/加入團 團號:${group.group_code} 職業:你的職業，也可以加上 候補:true 先排候補`
      : `正式團員已滿，可使用 /加入團 團號:${group.group_code} 職業:你的職業 候補:true 排候補`;

    return [
      `${index + 1}. 副本團編號 ${group.group_code}`,
      `副本：${group.dungeon_name}`,
      `團長：${leaderName}`,
      `時間：${formatTaipeiDateTime(group.scheduled_at)}`,
      `地點：${group.location_name}`,
      `人數：${memberCount}/${group.max_members}，還缺 ${missingCount} 人，候補 ${group.waitlist_count} 人，待審 ${group.pending_count} 人`,
      `加入審核：${group.approval_required ? '需要' : '不需要'}`,
      joinText
    ].join('\n');
  }));

  return limitReplyLength([
    '咕嘎嘎，目前正在招募的副本團：',
    ...groupLines
  ].join('\n\n'));
}

function getMyGroupSections(groups, userId) {
  return [
    {
      title: '自己開的團',
      groups: groups.filter((group) => group.leader_id === userId)
    },
    {
      title: '已加入的團',
      groups: groups.filter((group) => group.is_joined_by_me)
    },
    {
      title: '待核准的團',
      groups: groups.filter((group) => group.is_pending_by_me)
    }
  ];
}

export async function viewMyGroups(context, client) {
  const userId = getActorId(context);
  const groups = await getMyGroups(context.guildId, userId);

  if (!groups.length) {
    return '咕嘎，目前沒有找到你開的、已加入或待核准的副本團。';
  }

  const sectionLines = [];

  for (const section of getMyGroupSections(groups, userId)) {
    sectionLines.push(`【${section.title}】`);

    if (!section.groups.length) {
      sectionLines.push('目前沒有');
      continue;
    }

    const groupLines = await Promise.all(
      section.groups.map((group, index) => formatGroupDetail(context, client, group, index + 1))
    );

    sectionLines.push(...groupLines);
  }

  return limitReplyLength([
    '咕嘎嘎，這是你的副本團：',
    ...sectionLines
  ].join('\n\n'));
}

export async function addRaidMemberByLeader(context, fields) {
  const group = await getGroupSummary(fields.groupCode);

  if (!group) {
    return `咕嘎，找不到副本團編號 ${fields.groupCode}。`;
  }

  const leaderError = assertLeader(group, context, '加入成員到');

  if (leaderError) {
    return `咕嘎，${leaderError}`;
  }

  if (group.status !== 'open' && group.status !== 'full') {
    return `咕嘎，副本團編號 ${fields.groupCode} 已結束，不能加入成員。`;
  }

  const isWaitlist = fields.preferWaitlist || getMissingCount(group) <= 0;

  await upsertGroupMember({
    raidGroupId: group.id,
    userId: fields.userId,
    userName: fields.userName,
    className: fields.className,
    isWaitlist,
    memberStatus: 'joined'
  });

  const updatedGroup = await getGroupSummary(fields.groupCode);
  const missingCount = getMissingCount(updatedGroup);

  await updateGroupStatus(group.id, getGroupJoinStatus(updatedGroup, missingCount));

  return isWaitlist
    ? `咕嘎，已將 ${fields.userName} 加入副本團編號 ${fields.groupCode} 的候補，職業為 ${fields.className}。`
    : `咕嘎，已將 ${fields.userName} 加入副本團編號 ${fields.groupCode}，目前還缺少 ${missingCount} 人。`;
}

export async function kickRaidMember(context, fields) {
  const group = await getGroupSummary(fields.groupCode);

  if (!group) {
    return `咕嘎，找不到副本團編號 ${fields.groupCode}。`;
  }

  const leaderError = assertLeader(group, context, '踢出');

  if (leaderError) {
    return `咕嘎，${leaderError}`;
  }

  const removedCount = await removeGroupMember(group.id, fields.userId);

  if (!removedCount) {
    return `咕嘎，找不到這位團員，可能已經不在副本團編號 ${fields.groupCode} 裡了。`;
  }

  const updatedGroup = await getGroupSummary(fields.groupCode);
  const missingCount = getMissingCount(updatedGroup);

  await updateGroupStatus(group.id, getGroupJoinStatus(updatedGroup, missingCount));

  return `咕嘎，已將 ${fields.userName} 從副本團編號 ${fields.groupCode} 移除，目前還缺少 ${missingCount} 人。`;
}

export async function selfManageRaidMember(context, fields) {
  const group = await getGroupSummary(fields.groupCode);
  const userId = getActorId(context);

  if (!group) {
    return `咕嘎，找不到副本團編號 ${fields.groupCode}。`;
  }

  if (group.status !== 'open' && group.status !== 'full') {
    return `咕嘎，副本團編號 ${fields.groupCode} 已結束，不能修改。`;
  }

  const member = await getExistingMember(group.id, userId);

  if (!member || member.member_status !== 'joined') {
    return `咕嘎，你目前不是副本團編號 ${fields.groupCode} 的團員。`;
  }

  if (fields.action === 'leave') {
    await removeGroupMember(group.id, userId);
    const { missingCount } = await refreshGroupStatus(group, fields.groupCode);

    return `咕嘎，已幫你退出副本團編號 ${fields.groupCode}，目前還缺少 ${missingCount} 人。`;
  }

  if (fields.action === 'class') {
    if (!fields.className) {
      return '咕嘎，要修改職業時需要填「職業」。';
    }

    await updateGroupMember(group.id, userId, {
      className: fields.className,
      isWaitlist: null
    });

    return `咕嘎，已幫你把副本團編號 ${fields.groupCode} 的職業改為 ${fields.className}。`;
  }

  const targetWaitlist = fields.action === 'waitlist';

  if (member.is_waitlist === targetWaitlist) {
    return `咕嘎，你已經是副本團編號 ${fields.groupCode} 的${getMemberStateName(targetWaitlist)}團員了。`;
  }

  if (shouldBlockFormalMove(group, member, targetWaitlist)) {
    return `咕嘎，副本團編號 ${fields.groupCode} 的正式名額已滿，暫時不能從候補改成正式。`;
  }

  await updateGroupMember(group.id, userId, {
    className: null,
    isWaitlist: targetWaitlist
  });
  const { missingCount } = await refreshGroupStatus(group, fields.groupCode);

  return `咕嘎，已幫你改成副本團編號 ${fields.groupCode} 的${getMemberStateName(targetWaitlist)}團員，目前還缺少 ${missingCount} 人。`;
}

export async function editRaidMemberByLeader(context, fields) {
  const group = await getGroupSummary(fields.groupCode);

  if (!group) {
    return `咕嘎，找不到副本團編號 ${fields.groupCode}。`;
  }

  const leaderError = assertLeader(group, context, '編輯');

  if (leaderError) {
    return `咕嘎，${leaderError}`;
  }

  if (group.status !== 'open' && group.status !== 'full') {
    return `咕嘎，副本團編號 ${fields.groupCode} 已結束，不能編輯團員。`;
  }

  if (!fields.className && fields.isWaitlist === null) {
    return '咕嘎，請至少填一個要修改的內容：職業，或正式/候補狀態。';
  }

  const member = await getExistingMember(group.id, fields.userId);

  if (!member || member.member_status !== 'joined') {
    return `咕嘎，找不到這位團員，可能不在副本團編號 ${fields.groupCode} 裡。`;
  }

  if (shouldBlockFormalMove(group, member, fields.isWaitlist)) {
    return `咕嘎，副本團編號 ${fields.groupCode} 的正式名額已滿，不能把 ${fields.userName} 從候補改成正式。`;
  }

  const updatedMember = await updateGroupMember(group.id, fields.userId, {
    className: fields.className,
    isWaitlist: fields.isWaitlist
  });

  const { missingCount } = await refreshGroupStatus(group, fields.groupCode);

  return [
    `咕嘎，已更新 ${fields.userName} 在副本團編號 ${fields.groupCode} 的資料。`,
    `職業：${updatedMember.class_name}`,
    `狀態：${getMemberStateName(updatedMember.is_waitlist)}`,
    `目前還缺少 ${missingCount} 人。`
  ].join('\n');
}

export async function manageRaidApplication(context, fields) {
  const group = await getGroupSummary(fields.groupCode);

  if (!group) {
    return `咕嘎，找不到副本團編號 ${fields.groupCode}。`;
  }

  const leaderError = assertLeader(group, context, '管理');

  if (leaderError) {
    return `咕嘎，${leaderError}`;
  }

  const pendingMembers = await getPendingMembers(group.id);
  const pendingMember = pendingMembers.find((member) => member.user_id === fields.userId);

  if (!pendingMember) {
    return `咕嘎，找不到這位成員的待審申請。`;
  }

  if (fields.action === 'reject') {
    await updateMemberApproval(group.id, fields.userId, {
      memberStatus: 'rejected',
      isWaitlist: false
    });

    return `咕嘎，已拒絕 ${pendingMember.user_name ?? fields.userId} 加入副本團編號 ${fields.groupCode}。`;
  }

  const isWaitlist = pendingMember.is_waitlist || getMissingCount(group) <= 0;
  const updatedCount = await updateMemberApproval(group.id, fields.userId, {
    memberStatus: 'joined',
    isWaitlist
  });

  if (!updatedCount) {
    return `咕嘎，審核失敗，這筆申請可能已經被處理過了。`;
  }

  const updatedGroup = await getGroupSummary(fields.groupCode);
  const missingCount = getMissingCount(updatedGroup);

  await updateGroupStatus(group.id, getGroupJoinStatus(updatedGroup, missingCount));

  return isWaitlist
    ? `咕嘎，已核准 ${pendingMember.user_name ?? fields.userId} 加入副本團編號 ${fields.groupCode} 的候補。`
    : `咕嘎，已核准 ${pendingMember.user_name ?? fields.userId} 加入副本團編號 ${fields.groupCode}，目前還缺少 ${missingCount} 人。`;
}

export async function getKickMemberChoices(context, fields) {
  const group = await getGroupSummary(fields.groupCode);

  if (!group || group.leader_id !== getActorId(context)) {
    return [];
  }

  const members = await getGroupMembers(group.id);
  const waitlistMembers = await getGroupMembers(group.id, true);

  return [
    ...members.map((member) => ({ ...member, listLabel: '正式' })),
    ...waitlistMembers.map((member) => ({ ...member, listLabel: '候補' }))
  ].map((member) => ({
    name: `${member.user_name ?? member.user_id}：${member.class_name}（${member.listLabel}）`,
    value: member.user_id
  }));
}

export async function getPendingApplicationChoices(context, fields) {
  const group = await getGroupSummary(fields.groupCode);

  if (!group || group.leader_id !== getActorId(context)) {
    return [];
  }

  const pendingMembers = await getPendingMembers(group.id);

  return pendingMembers.map((member) => ({
    name: `${member.user_name ?? member.user_id}：${member.class_name}（${getMemberStateName(member.is_waitlist)}）`,
    value: member.user_id
  }));
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
  await notifyGroupMembers(context, group, [
    `咕嘎，副本團編號 ${fields.groupCode} 已由團長解散。`,
    `副本：${group.dungeon_name}`,
    `原訂時間：${formatTaipeiDateTime(group.scheduled_at)}`
  ]);

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
  await notifyGroupMembers(context, group, [
    `咕嘎，副本團編號 ${fields.groupCode} 的時間已由團長修改。`,
    `副本：${group.dungeon_name}`,
    `原時間：${formatTaipeiDateTime(group.scheduled_at)}`,
    `新時間：${formatTaipeiDateTime(fields.scheduledAt)}`
  ]);

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

    const missingCount = getMissingCount(group);

    if (missingCount > 0) {
      await promoteWaitlistMembers(group.id, missingCount);
    }

    const updatedGroup = await getGroupSummary(group.group_code);
    const updatedMissingCount = getMissingCount(updatedGroup);
    const members = await getGroupMembers(group.id);
    const mentions = members.map((member) => `<@${member.user_id}>`).join(' ');

    if (updatedMissingCount > 0) {
      await channel.send(`${mentions} 副本團編號 ${group.group_code}，人數未齊，該團解散`);
      await finishDueGroup(group.id, 'cancelled');
      continue;
    }

    await channel.send(`${mentions} 副本團編號 ${group.group_code}，各位要打副本了呦~`);
    await finishDueGroup(group.id, 'completed');
  }
}
