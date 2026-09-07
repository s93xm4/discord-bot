import { db } from '../db.js';
import { taipeiOffsetHours } from '../config.js';

export async function initDatabase() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS raid_groups (
      id BIGSERIAL PRIMARY KEY,
      group_code TEXT NOT NULL UNIQUE,
      guild_id TEXT,
      channel_id TEXT NOT NULL,
      leader_id TEXT NOT NULL,
      leader_name TEXT,
      dungeon_name TEXT NOT NULL,
      max_members INTEGER NOT NULL CHECK (max_members > 0),
      initial_member_count INTEGER NOT NULL DEFAULT 0 CHECK (initial_member_count >= 0),
      location_name TEXT NOT NULL,
      scheduled_at TIMESTAMPTZ NOT NULL,
      reminder_interval_minutes INTEGER,
      next_reminder_at TIMESTAMPTZ,
      notify_everyone BOOLEAN NOT NULL DEFAULT FALSE,
      approval_required BOOLEAN NOT NULL DEFAULT FALSE,
      status TEXT NOT NULL DEFAULT 'open',
      due_notified BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS raid_group_members (
      id BIGSERIAL PRIMARY KEY,
      raid_group_id BIGINT NOT NULL REFERENCES raid_groups(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      user_name TEXT,
      class_name TEXT NOT NULL,
      is_waitlist BOOLEAN NOT NULL DEFAULT FALSE,
      member_status TEXT NOT NULL DEFAULT 'joined',
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (raid_group_id, user_id)
    )
  `);

  await db.query(`
    ALTER TABLE raid_groups
    ADD COLUMN IF NOT EXISTS leader_name TEXT
  `);

  await db.query(`
    ALTER TABLE raid_group_members
    ADD COLUMN IF NOT EXISTS user_name TEXT
  `);

  await db.query(`
    ALTER TABLE raid_groups
    ADD COLUMN IF NOT EXISTS approval_required BOOLEAN NOT NULL DEFAULT FALSE
  `);

  await db.query(`
    ALTER TABLE raid_group_members
    ADD COLUMN IF NOT EXISTS member_status TEXT NOT NULL DEFAULT 'joined'
  `);
}

export async function generateGroupCode(scheduledAt) {
  const taipeiDate = new Date(scheduledAt.getTime() + taipeiOffsetHours * 60 * 60 * 1000);
  const datePrefix = [
    taipeiDate.getUTCFullYear(),
    String(taipeiDate.getUTCMonth() + 1).padStart(2, '0'),
    String(taipeiDate.getUTCDate()).padStart(2, '0')
  ].join('');
  const result = await db.query(
    `SELECT COUNT(*)::INT AS count
     FROM raid_groups
     WHERE group_code LIKE $1`,
    [`${datePrefix}%`]
  );
  const sequence = String(result.rows[0].count + 1).padStart(3, '0');

  return `${datePrefix}${sequence}`;
}

export async function createGroup(group) {
  await db.query(
    `INSERT INTO raid_groups (
       group_code, guild_id, channel_id, leader_id, leader_name, dungeon_name, max_members,
       initial_member_count, location_name, scheduled_at, reminder_interval_minutes,
       next_reminder_at, notify_everyone, approval_required
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      group.groupCode,
      group.guildId,
      group.channelId,
      group.leaderId,
      group.leaderName,
      group.dungeonName,
      group.maxMembers,
      group.initialMemberCount,
      group.locationName,
      group.scheduledAt,
      group.reminderIntervalMinutes,
      group.nextReminderAt,
      group.notifyEveryone,
      group.approvalRequired
    ]
  );
}

export async function getGroupSummary(groupCode) {
  const result = await db.query(
    `SELECT rg.*,
            COUNT(rgm.id) FILTER (WHERE rgm.member_status = 'joined' AND rgm.is_waitlist = FALSE)::INT AS member_count,
            COUNT(rgm.id) FILTER (WHERE rgm.member_status = 'joined' AND rgm.is_waitlist = TRUE)::INT AS waitlist_count,
            COUNT(rgm.id) FILTER (WHERE rgm.member_status = 'pending')::INT AS pending_count
     FROM raid_groups rg
     LEFT JOIN raid_group_members rgm ON rgm.raid_group_id = rg.id
     WHERE rg.group_code = $1
     GROUP BY rg.id`,
    [groupCode]
  );

  return result.rows[0] ?? null;
}

export async function getRecruitingGroups(guildId) {
  const result = await db.query(
    `SELECT rg.*,
            COUNT(rgm.id) FILTER (WHERE rgm.member_status = 'joined' AND rgm.is_waitlist = FALSE)::INT AS member_count,
            COUNT(rgm.id) FILTER (WHERE rgm.member_status = 'joined' AND rgm.is_waitlist = TRUE)::INT AS waitlist_count
     FROM raid_groups rg
     LEFT JOIN raid_group_members rgm ON rgm.raid_group_id = rg.id
     WHERE rg.guild_id = $1
       AND rg.status = 'open'
       AND rg.scheduled_at > NOW()
     GROUP BY rg.id
     HAVING rg.max_members - rg.initial_member_count - COUNT(rgm.id) FILTER (WHERE rgm.member_status = 'joined' AND rgm.is_waitlist = FALSE) > 0
     ORDER BY rg.scheduled_at ASC, rg.created_at ASC`,
    [guildId]
  );

  return result.rows;
}

export async function getGroupMembers(raidGroupId, waitlist = false) {
  const result = await db.query(
    `SELECT user_id, user_name, class_name
     FROM raid_group_members
     WHERE raid_group_id = $1 AND is_waitlist = $2 AND member_status = 'joined'
     ORDER BY joined_at ASC`,
    [raidGroupId, waitlist]
  );

  return result.rows;
}

export async function getExistingMember(raidGroupId, userId) {
  const result = await db.query(
    `SELECT id, user_id, user_name, class_name, is_waitlist, member_status
     FROM raid_group_members
     WHERE raid_group_id = $1 AND user_id = $2`,
    [raidGroupId, userId]
  );

  return result.rows[0] ?? null;
}

export async function updateGroupMember(raidGroupId, userId, member) {
  const result = await db.query(
    `UPDATE raid_group_members
     SET class_name = COALESCE($1, class_name),
         is_waitlist = COALESCE($2, is_waitlist),
         updated_at = NOW()
     WHERE raid_group_id = $3
       AND user_id = $4
       AND member_status = 'joined'
     RETURNING user_id, user_name, class_name, is_waitlist`,
    [
      member.className,
      member.isWaitlist,
      raidGroupId,
      userId
    ]
  );

  return result.rows[0] ?? null;
}

export async function upsertGroupMember(member) {
  await db.query(
    `INSERT INTO raid_group_members (raid_group_id, user_id, user_name, class_name, is_waitlist, member_status)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (raid_group_id, user_id)
     DO UPDATE SET class_name = EXCLUDED.class_name,
                   is_waitlist = EXCLUDED.is_waitlist,
                   member_status = EXCLUDED.member_status,
                   user_name = EXCLUDED.user_name,
                   updated_at = NOW()`,
    [
      member.raidGroupId,
      member.userId,
      member.userName,
      member.className,
      member.isWaitlist,
      member.memberStatus
    ]
  );
}

export async function removeGroupMember(raidGroupId, userId) {
  const result = await db.query(
    `DELETE FROM raid_group_members
     WHERE raid_group_id = $1 AND user_id = $2 AND member_status = 'joined'`,
    [raidGroupId, userId]
  );

  return result.rowCount;
}

export async function promoteWaitlistMembers(raidGroupId, count) {
  if (count <= 0) {
    return [];
  }

  const result = await db.query(
    `WITH promoted AS (
       SELECT id
       FROM raid_group_members
       WHERE raid_group_id = $1
         AND member_status = 'joined'
         AND is_waitlist = TRUE
       ORDER BY joined_at ASC
       LIMIT $2
     )
     UPDATE raid_group_members rgm
     SET is_waitlist = FALSE,
         updated_at = NOW()
     FROM promoted
     WHERE rgm.id = promoted.id
     RETURNING rgm.user_id, rgm.user_name, rgm.class_name`,
    [raidGroupId, count]
  );

  return result.rows;
}

export async function getPendingMembers(raidGroupId) {
  const result = await db.query(
    `SELECT user_id, user_name, class_name, is_waitlist
     FROM raid_group_members
     WHERE raid_group_id = $1 AND member_status = 'pending'
     ORDER BY joined_at ASC`,
    [raidGroupId]
  );

  return result.rows;
}

export async function updateMemberApproval(raidGroupId, userId, approval) {
  const result = await db.query(
    `UPDATE raid_group_members
     SET member_status = $1,
         is_waitlist = $2,
         updated_at = NOW()
     WHERE raid_group_id = $3 AND user_id = $4 AND member_status = 'pending'`,
    [
      approval.memberStatus,
      approval.isWaitlist,
      raidGroupId,
      userId
    ]
  );

  return result.rowCount;
}

export async function updateGroupStatus(groupId, status) {
  await db.query(
    `UPDATE raid_groups
     SET status = $1,
         next_reminder_at = CASE
           WHEN $1 = 'full' THEN NULL
           WHEN reminder_interval_minutes IS NOT NULL AND next_reminder_at IS NULL
             THEN NOW() + (reminder_interval_minutes || ' minutes')::INTERVAL
           ELSE next_reminder_at
         END,
         updated_at = NOW()
     WHERE id = $2`,
    [status, groupId]
  );
}

export async function updateGroupTime(groupId, scheduledAt) {
  await db.query(
    `UPDATE raid_groups
     SET scheduled_at = $1,
         due_notified = FALSE,
         status = CASE WHEN status IN ('cancelled', 'completed') THEN 'open' ELSE status END,
         updated_at = NOW()
     WHERE id = $2`,
    [scheduledAt, groupId]
  );
}

export async function cancelGroup(groupId) {
  await db.query(
    `UPDATE raid_groups
     SET status = 'cancelled',
         due_notified = TRUE,
         next_reminder_at = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [groupId]
  );
}

export async function updateGroupNotification(groupId, notification) {
  await db.query(
    `UPDATE raid_groups
     SET reminder_interval_minutes = $1,
         next_reminder_at = $2,
         notify_everyone = $3,
         updated_at = NOW()
     WHERE id = $4`,
    [
      notification.reminderIntervalMinutes,
      notification.nextReminderAt,
      notification.notifyEveryone,
      groupId
    ]
  );
}

export async function getReminderDueGroups() {
  const result = await db.query(
    `SELECT rg.*,
            COUNT(rgm.id) FILTER (WHERE rgm.member_status = 'joined' AND rgm.is_waitlist = FALSE)::INT AS member_count
     FROM raid_groups rg
     LEFT JOIN raid_group_members rgm ON rgm.raid_group_id = rg.id
     WHERE rg.status IN ('open', 'full')
       AND rg.reminder_interval_minutes IS NOT NULL
       AND rg.next_reminder_at <= NOW()
       AND rg.scheduled_at > NOW()
     GROUP BY rg.id`
  );

  return result.rows;
}

export async function getDueGroups() {
  const result = await db.query(
    `SELECT rg.*,
            COUNT(rgm.id) FILTER (WHERE rgm.member_status = 'joined' AND rgm.is_waitlist = FALSE)::INT AS member_count
     FROM raid_groups rg
     LEFT JOIN raid_group_members rgm ON rgm.raid_group_id = rg.id
     WHERE rg.status IN ('open', 'full')
       AND rg.due_notified = FALSE
       AND rg.scheduled_at <= NOW()
     GROUP BY rg.id`
  );

  return result.rows;
}

export async function scheduleNextReminder(groupId) {
  await db.query(
    `UPDATE raid_groups
     SET next_reminder_at = NOW() + (reminder_interval_minutes || ' minutes')::INTERVAL
     WHERE id = $1`,
    [groupId]
  );
}

export async function clearNextReminder(groupId) {
  await db.query(
    `UPDATE raid_groups
     SET next_reminder_at = NULL
     WHERE id = $1`,
    [groupId]
  );
}

export async function finishDueGroup(groupId, status) {
  await db.query(
    `UPDATE raid_groups
     SET status = $1, due_notified = TRUE, updated_at = NOW()
     WHERE id = $2`,
    [status, groupId]
  );
}
