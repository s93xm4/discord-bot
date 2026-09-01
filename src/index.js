import 'dotenv/config';
import { Client, GatewayIntentBits } from 'discord.js';
import pg from 'pg';

const token = process.env.DISCORD_TOKEN;
const databaseUrl = process.env.DATABASE_URL;
const taipeiOffsetHours = 8;
const pendingPromptTtlMinutes = 30;
const schedulerIntervalMs = 60 * 1000;

if (!token) {
  console.error('Missing DISCORD_TOKEN. Copy .env.example to .env and fill in your bot token.');
  process.exit(1);
}

if (!databaseUrl) {
  console.error('Missing DATABASE_URL. Add your online database connection string to .env.');
  process.exit(1);
}

const { Pool } = pg;
const db = new Pool({
  connectionString: databaseUrl
});

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toNumber(value) {
  const chineseNumbers = {
    一: 1,
    二: 2,
    兩: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10
  };

  if (!value) {
    return null;
  }

  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  return chineseNumbers[value] ?? null;
}

function parseDateTime(content) {
  const fullDateMatch = content.match(/(?:日期|預計日期|副本日期)?\s*[:：]?\s*(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  const shortDateMatch = !fullDateMatch
    ? content.match(/(?:日期|預計日期|副本日期)\s*[:：]?\s*(\d{1,2})[/-](\d{1,2})/)
    : null;
  const timeMatch = content.match(/(?:時間|預計時間|預定時間)?\s*[:：]?\s*(\d{1,2})[:：](\d{2})/);

  if (!fullDateMatch && !shortDateMatch || !timeMatch) {
    return {
      scheduledAt: null,
      missing: [
        ...(!fullDateMatch && !shortDateMatch ? ['日期'] : []),
        ...(!timeMatch ? ['時間'] : [])
      ]
    };
  }

  const now = new Date();
  const taipeiNow = new Date(now.getTime() + taipeiOffsetHours * 60 * 60 * 1000);
  const year = fullDateMatch ? Number(fullDateMatch[1]) : taipeiNow.getUTCFullYear();
  const month = Number(fullDateMatch ? fullDateMatch[2] : shortDateMatch[1]);
  const day = Number(fullDateMatch ? fullDateMatch[3] : shortDateMatch[2]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return {
      scheduledAt: null,
      missing: ['有效日期時間']
    };
  }

  return {
    scheduledAt: new Date(Date.UTC(year, month - 1, day, hour - taipeiOffsetHours, minute)),
    missing: []
  };
}

function parseReminder(content) {
  if (!/(通知|提醒|找人)/.test(content)) {
    return {
      reminderIntervalMinutes: null,
      notifyEveryone: null
    };
  }

  const hourMatch = content.match(/每\s*([0-9一二兩三四五六七八九十]+)?\s*(?:個)?\s*小時/);
  const minuteMatch = content.match(/每\s*([0-9一二兩三四五六七八九十]+)\s*分鐘/);
  const hours = toNumber(hourMatch?.[1] || '1');
  const minutes = toNumber(minuteMatch?.[1]);

  return {
    reminderIntervalMinutes: minuteMatch ? minutes : hours * 60,
    notifyEveryone: /@everyone|通知所有人|提醒所有人/.test(content)
  };
}

function parseCreateGroup(content) {
  const dungeonMatch = content.match(/([A-Za-z0-9\u4e00-\u9fff_-]+)\s*的?\s*[0-9一二兩三四五六七八九十]+\s*人.*團/)
    ?? content.match(/(?:副本|打)\s*([A-Za-z0-9\u4e00-\u9fff_-]+)/);
  const maxMembersMatch = content.match(/(?:人數|預定人數|預計人數)\s*[:：]?\s*([0-9一二兩三四五六七八九十]+)/)
    ?? content.match(/([0-9一二兩三四五六七八九十]+)\s*人.*團/);
  const initialMembersMatch = content.match(/(?:預設人數|已有|已有人數|目前有|原本人數|本來有)\s*[:：]?\s*([0-9一二兩三四五六七八九十]+)/);
  const locationMatch = content.match(/(?:地點|集合地點|在)\s*[:：]?\s*([^，,。]+?)(?:集合|$|，|,|。)/);
  const parsedDateTime = parseDateTime(content);
  const reminder = parseReminder(content);
  const maxMembers = toNumber(maxMembersMatch?.[1]);
  const initialMemberCount = initialMembersMatch ? toNumber(initialMembersMatch[1]) : null;

  return {
    type: 'create',
    fields: {
      dungeonName: dungeonMatch?.[1]?.trim() ?? null,
      maxMembers,
      initialMemberCount,
      locationName: locationMatch?.[1]?.trim() ?? null,
      scheduledAt: parsedDateTime.scheduledAt,
      reminderIntervalMinutes: reminder.reminderIntervalMinutes,
      notifyEveryone: reminder.notifyEveryone
    }
  };
}

function parseJoinGroup(content) {
  const groupMatch = content.match(/(?:加入|參加)\s*(\d{11})/) ?? content.match(/(\d{11})/);
  const classMatch = content.match(/(?:職業|職業為|職業是)\s*[:：]?\s*([A-Za-z0-9\u4e00-\u9fff_-]+)/);

  return {
    type: 'join',
    fields: {
      groupCode: groupMatch?.[1] ?? null,
      className: classMatch?.[1]?.trim() ?? null
    }
  };
}

function parseViewGroup(content) {
  const groupMatch = content.match(/(?:查團|查看|查詢|目前|缺多少)\s*(\d{11})/) ?? content.match(/(\d{11})/);

  return {
    type: 'view',
    fields: {
      groupCode: groupMatch?.[1] ?? null
    }
  };
}

function parseDelayGroup(content) {
  const groupMatch = content.match(/(?:延後|延期|改時間)\s*(\d{11})/) ?? content.match(/(\d{11})/);
  const parsedDateTime = parseDateTime(content);

  return {
    type: 'delay',
    fields: {
      groupCode: groupMatch?.[1] ?? null,
      scheduledAt: parsedDateTime.scheduledAt
    }
  };
}

function parseCommand(content) {
  if (/(開團|組團|我想組|組一個|組個)/.test(content)) {
    return parseCreateGroup(content);
  }

  if (/(加入|參加)/.test(content)) {
    return parseJoinGroup(content);
  }

  if (/(延後|延期|改時間)/.test(content)) {
    return parseDelayGroup(content);
  }

  if (/(查團|查看|查詢|目前|缺多少)/.test(content)) {
    return parseViewGroup(content);
  }

  return null;
}

function parseCommandForPending(content, pendingCommand) {
  if (!pendingCommand) {
    return parseCommand(content);
  }

  const parsedCommand = parseCommand(content);

  if (parsedCommand) {
    return parsedCommand;
  }

  if (pendingCommand.type === 'create') {
    return parseCreateGroup(content);
  }

  if (pendingCommand.type === 'join') {
    return parseJoinGroup(content);
  }

  if (pendingCommand.type === 'delay') {
    return parseDelayGroup(content);
  }

  if (pendingCommand.type === 'view') {
    return parseViewGroup(content);
  }

  return null;
}

function revivePendingCommand(command) {
  if (command?.fields?.scheduledAt) {
    return {
      ...command,
      fields: {
        ...command.fields,
        scheduledAt: new Date(command.fields.scheduledAt)
      }
    };
  }

  return command;
}

function mergePendingCommand(pendingCommand, nextCommand) {
  if (!nextCommand) {
    return pendingCommand;
  }

  if (pendingCommand.type !== nextCommand.type) {
    return nextCommand;
  }

  return {
    type: pendingCommand.type,
    fields: {
      ...pendingCommand.fields,
      ...Object.fromEntries(
        Object.entries(nextCommand.fields).filter(([, value]) => value !== null && value !== undefined)
      )
    }
  };
}

function getMissingFields(command) {
  if (command.type === 'create') {
    return [
      ...(!command.fields.dungeonName ? ['副本名稱'] : []),
      ...(!command.fields.maxMembers ? ['預定人數'] : []),
      ...(!command.fields.scheduledAt ? ['日期時間'] : []),
      ...(!command.fields.locationName ? ['集合地點'] : [])
    ];
  }

  if (command.type === 'join') {
    return [
      ...(!command.fields.groupCode ? ['副本團編號'] : []),
      ...(!command.fields.className ? ['職業名稱'] : [])
    ];
  }

  if (command.type === 'delay') {
    return [
      ...(!command.fields.groupCode ? ['副本團編號'] : []),
      ...(!command.fields.scheduledAt ? ['日期時間'] : [])
    ];
  }

  if (command.type === 'view') {
    return [
      ...(!command.fields.groupCode ? ['副本團編號'] : [])
    ];
  }

  return [];
}

function formatMissingReply(command) {
  const missing = getMissingFields(command);

  if (!missing.length) {
    return null;
  }

  if (command.type === 'create') {
    return `還缺「${missing.join('、')}」。請補充，例如：副本243 人數6 日期2026/09/01 時間22:00 地點蒙德老家`;
  }

  if (command.type === 'join') {
    return `還缺「${missing.join('、')}」。請補充，例如：加入 20260901001 職業VI`;
  }

  if (command.type === 'delay') {
    return `還缺「${missing.join('、')}」。請補充，例如：延後 20260901001 日期2026/09/01 時間22:30`;
  }

  return `還缺「${missing.join('、')}」。`;
}

function formatTaipeiDateTime(date) {
  const taipeiDate = new Date(date.getTime() + taipeiOffsetHours * 60 * 60 * 1000);
  const year = taipeiDate.getUTCFullYear();
  const month = String(taipeiDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(taipeiDate.getUTCDate()).padStart(2, '0');
  const hour = String(taipeiDate.getUTCHours()).padStart(2, '0');
  const minute = String(taipeiDate.getUTCMinutes()).padStart(2, '0');

  return `${year}/${month}/${day} ${hour}:${minute}`;
}

async function initDatabase() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS mentioned_messages (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT,
      channel_id TEXT NOT NULL,
      message_id TEXT NOT NULL UNIQUE,
      author_id TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS raid_groups (
      id BIGSERIAL PRIMARY KEY,
      group_code TEXT NOT NULL UNIQUE,
      guild_id TEXT,
      channel_id TEXT NOT NULL,
      leader_id TEXT NOT NULL,
      dungeon_name TEXT NOT NULL,
      max_members INTEGER NOT NULL CHECK (max_members > 0),
      initial_member_count INTEGER NOT NULL DEFAULT 0 CHECK (initial_member_count >= 0),
      location_name TEXT NOT NULL,
      scheduled_at TIMESTAMPTZ NOT NULL,
      reminder_interval_minutes INTEGER,
      next_reminder_at TIMESTAMPTZ,
      notify_everyone BOOLEAN NOT NULL DEFAULT FALSE,
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
      class_name TEXT NOT NULL,
      is_waitlist BOOLEAN NOT NULL DEFAULT FALSE,
      joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (raid_group_id, user_id)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS pending_prompts (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      command_type TEXT NOT NULL,
      payload JSONB NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (channel_id, user_id)
    )
  `);
}

async function savePendingCommand(message, command) {
  await db.query(
    `INSERT INTO pending_prompts (guild_id, channel_id, user_id, command_type, payload, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' minutes')::INTERVAL)
     ON CONFLICT (channel_id, user_id)
     DO UPDATE SET command_type = EXCLUDED.command_type,
                   payload = EXCLUDED.payload,
                   expires_at = EXCLUDED.expires_at`,
    [
      message.guildId,
      message.channelId,
      message.author.id,
      command.type,
      JSON.stringify(command),
      pendingPromptTtlMinutes
    ]
  );
}

async function getPendingCommand(message) {
  await db.query(
    `DELETE FROM pending_prompts
     WHERE expires_at <= NOW()`
  );

  const pendingResult = await db.query(
    `SELECT payload
     FROM pending_prompts
     WHERE channel_id = $1 AND user_id = $2`,
    [message.channelId, message.author.id]
  );

  return pendingResult.rows[0]?.payload ?? null;
}

async function clearPendingCommand(message) {
  await db.query(
    `DELETE FROM pending_prompts
     WHERE channel_id = $1 AND user_id = $2`,
    [message.channelId, message.author.id]
  );
}

async function generateGroupCode(scheduledAt) {
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

async function createRaidGroup(message, fields) {
  const initialMemberCount = fields.initialMemberCount ?? 0;

  if (initialMemberCount >= fields.maxMembers) {
    return '預設人數不能大於或等於預定人數，因為這樣就不需要找人了。請重新設定預設人數。';
  }

  if (fields.scheduledAt <= new Date()) {
    return '預定時間已經過了，請換一個未來的日期時間。';
  }

  const groupCode = await generateGroupCode(fields.scheduledAt);
  const nextReminderAt = fields.reminderIntervalMinutes
    ? new Date(Date.now() + fields.reminderIntervalMinutes * 60 * 1000)
    : null;

  await db.query(
    `INSERT INTO raid_groups (
       group_code, guild_id, channel_id, leader_id, dungeon_name, max_members,
       initial_member_count, location_name, scheduled_at, reminder_interval_minutes,
       next_reminder_at, notify_everyone
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      groupCode,
      message.guildId,
      message.channelId,
      message.author.id,
      fields.dungeonName,
      fields.maxMembers,
      initialMemberCount,
      fields.locationName,
      fields.scheduledAt,
      fields.reminderIntervalMinutes,
      nextReminderAt,
      fields.notifyEveryone ?? false
    ]
  );

  const reminderText = fields.reminderIntervalMinutes
    ? `，每 ${fields.reminderIntervalMinutes} 分鐘提醒一次${fields.notifyEveryone ? '，會通知所有人' : ''}`
    : '';

  return `好的，已為你設定好，副本團編號為 ${groupCode}${reminderText}`;
}

async function getGroupSummary(groupCode) {
  const result = await db.query(
    `SELECT rg.*,
            COUNT(rgm.id) FILTER (WHERE rgm.is_waitlist = FALSE)::INT AS member_count,
            COUNT(rgm.id) FILTER (WHERE rgm.is_waitlist = TRUE)::INT AS waitlist_count
     FROM raid_groups rg
     LEFT JOIN raid_group_members rgm ON rgm.raid_group_id = rg.id
     WHERE rg.group_code = $1
     GROUP BY rg.id`,
    [groupCode]
  );

  return result.rows[0] ?? null;
}

function getMissingCount(group) {
  return Math.max(group.max_members - group.initial_member_count - group.member_count, 0);
}

async function joinRaidGroup(message, fields) {
  const group = await getGroupSummary(fields.groupCode);

  if (!group) {
    return `找不到副本團編號 ${fields.groupCode}。`;
  }

  if (group.status !== 'open' && group.status !== 'full') {
    return `副本團編號 ${fields.groupCode} 已結束，不能加入。`;
  }

  const existingResult = await db.query(
    `SELECT id, is_waitlist
     FROM raid_group_members
     WHERE raid_group_id = $1 AND user_id = $2`,
    [group.id, message.author.id]
  );
  const existingMember = existingResult.rows[0];
  const isWaitlist = existingMember ? existingMember.is_waitlist : getMissingCount(group) <= 0;

  await db.query(
    `INSERT INTO raid_group_members (raid_group_id, user_id, class_name, is_waitlist)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (raid_group_id, user_id)
     DO UPDATE SET class_name = EXCLUDED.class_name,
                   updated_at = NOW()`,
    [group.id, message.author.id, fields.className, isWaitlist]
  );

  const updatedGroup = await getGroupSummary(fields.groupCode);
  const missingCount = getMissingCount(updatedGroup);
  const status = missingCount === 0 ? 'full' : 'open';

  await db.query(
    `UPDATE raid_groups
     SET status = $1,
         next_reminder_at = CASE WHEN $1 = 'full' THEN NULL ELSE next_reminder_at END,
         updated_at = NOW()
     WHERE id = $2`,
    [status, group.id]
  );

  if (existingMember) {
    return `好的，已幫你把副本團編號 ${fields.groupCode} 的職業改為 ${fields.className}。`;
  }

  if (isWaitlist) {
    return `好的，副本團編號 ${fields.groupCode} 已滿，你已排入候補。`;
  }

  return `好的，已為你設定好，副本團編號為 ${fields.groupCode}，目前還缺少 ${missingCount} 人`;
}

async function viewRaidGroup(fields) {
  const group = await getGroupSummary(fields.groupCode);

  if (!group) {
    return `找不到副本團編號 ${fields.groupCode}。`;
  }

  const missingCount = getMissingCount(group);

  return [
    `副本團編號 ${group.group_code}`,
    `副本：${group.dungeon_name}`,
    `時間：${formatTaipeiDateTime(group.scheduled_at)}`,
    `地點：${group.location_name}`,
    `目前人數：${group.initial_member_count + group.member_count}/${group.max_members}`,
    `還缺：${missingCount} 人`,
    `候補：${group.waitlist_count} 人`
  ].join('\n');
}

async function delayRaidGroup(message, fields) {
  const group = await getGroupSummary(fields.groupCode);

  if (!group) {
    return `找不到副本團編號 ${fields.groupCode}。`;
  }

  if (group.leader_id !== message.author.id) {
    return `只有開團者可以延後副本團編號 ${fields.groupCode}。`;
  }

  if (fields.scheduledAt <= new Date()) {
    return '新的預定時間已經過了，請換一個未來的日期時間。';
  }

  await db.query(
    `UPDATE raid_groups
     SET scheduled_at = $1,
         due_notified = FALSE,
         status = CASE WHEN status IN ('cancelled', 'completed') THEN 'open' ELSE status END,
         updated_at = NOW()
     WHERE id = $2`,
    [fields.scheduledAt, group.id]
  );

  return `好的，副本團編號 ${fields.groupCode} 已延後到 ${formatTaipeiDateTime(fields.scheduledAt)}。`;
}

async function getGroupMembers(raidGroupId) {
  const result = await db.query(
    `SELECT user_id, class_name
     FROM raid_group_members
     WHERE raid_group_id = $1 AND is_waitlist = FALSE
     ORDER BY joined_at ASC`,
    [raidGroupId]
  );

  return result.rows;
}

async function sendReminderMessages() {
  const result = await db.query(
    `SELECT rg.*,
            COUNT(rgm.id) FILTER (WHERE rgm.is_waitlist = FALSE)::INT AS member_count
     FROM raid_groups rg
     LEFT JOIN raid_group_members rgm ON rgm.raid_group_id = rg.id
     WHERE rg.status IN ('open', 'full')
       AND rg.reminder_interval_minutes IS NOT NULL
       AND rg.next_reminder_at <= NOW()
       AND rg.scheduled_at > NOW()
     GROUP BY rg.id`
  );

  for (const group of result.rows) {
    const channel = await client.channels.fetch(group.channel_id).catch(() => null);

    if (!channel?.isTextBased()) {
      continue;
    }

    const missingCount = getMissingCount(group);
    const prefix = group.notify_everyone ? '@everyone ' : '';

    if (missingCount <= 0) {
      await db.query(
        `UPDATE raid_groups
         SET next_reminder_at = NULL
         WHERE id = $1`,
        [group.id]
      );
      continue;
    }

    await channel.send(
      `${prefix}副本團編號 ${group.group_code}，副本 ${group.dungeon_name}，預定副本時間為 ${formatTaipeiDateTime(group.scheduled_at)}，目前還缺 ${missingCount} 人`
    );

    await db.query(
      `UPDATE raid_groups
       SET next_reminder_at = NOW() + (reminder_interval_minutes || ' minutes')::INTERVAL
       WHERE id = $1`,
      [group.id]
    );
  }
}

async function sendDueMessages() {
  const result = await db.query(
    `SELECT rg.*,
            COUNT(rgm.id) FILTER (WHERE rgm.is_waitlist = FALSE)::INT AS member_count
     FROM raid_groups rg
     LEFT JOIN raid_group_members rgm ON rgm.raid_group_id = rg.id
     WHERE rg.status IN ('open', 'full')
       AND rg.due_notified = FALSE
       AND rg.scheduled_at <= NOW()
     GROUP BY rg.id`
  );

  for (const group of result.rows) {
    const channel = await client.channels.fetch(group.channel_id).catch(() => null);

    if (!channel?.isTextBased()) {
      continue;
    }

    const members = await getGroupMembers(group.id);
    const mentions = members.map((member) => `<@${member.user_id}>`).join(' ');
    const missingCount = getMissingCount(group);

    if (missingCount > 0) {
      await channel.send(`${mentions} 副本團編號 ${group.group_code}，人數未齊，該團解散`);
      await db.query(
        `UPDATE raid_groups
         SET status = 'cancelled', due_notified = TRUE, updated_at = NOW()
         WHERE id = $1`,
        [group.id]
      );
      continue;
    }

    await channel.send(`${mentions} 副本團編號 ${group.group_code}，各位要打副本了呦~`);
    await db.query(
      `UPDATE raid_groups
       SET status = 'completed', due_notified = TRUE, updated_at = NOW()
       WHERE id = $1`,
      [group.id]
    );
  }
}

function startScheduler() {
  setInterval(async () => {
    try {
      await sendReminderMessages();
      await sendDueMessages();
    } catch (error) {
      console.error(error);
    }
  }, schedulerIntervalMs);
}

async function handleCommand(message, content) {
  const pendingCommand = revivePendingCommand(await getPendingCommand(message));
  const parsedCommand = parseCommandForPending(content, pendingCommand);
  const command = pendingCommand
    ? mergePendingCommand(pendingCommand, parsedCommand)
    : parsedCommand;

  if (!command) {
    return '我目前支援：開團、加入、查團、延後。範例：開團 副本243 人數6 日期2026/09/01 時間22:00 地點蒙德老家';
  }

  const missingReply = formatMissingReply(command);

  if (missingReply) {
    await savePendingCommand(message, command);
    return missingReply;
  }

  await clearPendingCommand(message);

  if (command.type === 'create') {
    return createRaidGroup(message, command.fields);
  }

  if (command.type === 'join') {
    return joinRaidGroup(message, command.fields);
  }

  if (command.type === 'view') {
    return viewRaidGroup(command.fields);
  }

  if (command.type === 'delay') {
    return delayRaidGroup(message, command.fields);
  }

  return null;
}

client.once('ready', async () => {
  await initDatabase();
  startScheduler();
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) {
    return;
  }

  if (!message.mentions.users.has(client.user.id)) {
    return;
  }

  const mentionPattern = new RegExp(`<@!?${escapeRegExp(client.user.id)}>`, 'g');
  const content = message.content.replace(mentionPattern, '').trim();

  if (!content) {
    return;
  }

  await db.query(
    `INSERT INTO mentioned_messages (guild_id, channel_id, message_id, author_id, content)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (message_id) DO NOTHING`,
    [
      message.guildId,
      message.channelId,
      message.id,
      message.author.id,
      content
    ]
  );

  const reply = await handleCommand(message, content);

  if (reply) {
    await message.channel.send(reply);
  }
});

client.login(token);
