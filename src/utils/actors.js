export function getActorId(context) {
  return context.author?.id ?? context.user.id;
}

export function getActorDisplayName(context) {
  return context.member?.displayName
    ?? context.author?.globalName
    ?? context.author?.username
    ?? context.user?.globalName
    ?? context.user?.username
    ?? getActorId(context);
}

export async function resolveDisplayName(context, client, userId, storedName) {
  if (storedName) {
    return storedName;
  }

  const guildMember = await context.guild?.members.fetch(userId).catch(() => null);

  if (guildMember?.displayName) {
    return guildMember.displayName;
  }

  const user = await client.users.fetch(userId).catch(() => null);

  return user?.globalName ?? user?.username ?? userId;
}
