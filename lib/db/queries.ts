import { desc, and, eq, isNull } from 'drizzle-orm';
import { ensureDb } from './drizzle';
import { activityLogs, llmChecks, ssrChecks, teamMembers, teams, users } from './schema';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth/session';

const db = ensureDb();

export async function getUser() {
  const sessionCookie = (await cookies()).get('session');
  if (!sessionCookie || !sessionCookie.value) {
    return null;
  }

  const sessionData = await verifyToken(sessionCookie.value);
  if (
    !sessionData ||
    !sessionData.user ||
    typeof sessionData.user.id !== 'number'
  ) {
    return null;
  }

  if (new Date(sessionData.expires) < new Date()) {
    return null;
  }

  const user = await db
    .select()
    .from(users)
    .where(and(eq(users.id, sessionData.user.id), isNull(users.deletedAt)))
    .limit(1);

  if (user.length === 0) {
    return null;
  }

  return user[0];
}

export async function getTeamByStripeCustomerId(customerId: string) {
  const result = await db
    .select()
    .from(teams)
    .where(eq(teams.stripeCustomerId, customerId))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

export async function updateTeamSubscription(
  teamId: number,
  subscriptionData: {
    stripeSubscriptionId: string | null;
    stripeProductId: string | null;
    planName: string | null;
    subscriptionStatus: string;
  }
) {
  await db
    .update(teams)
    .set({
      ...subscriptionData,
      updatedAt: new Date()
    })
    .where(eq(teams.id, teamId));
}

export async function getUserWithTeam(userId: number) {
  const result = await db
    .select({
      user: users,
      teamId: teamMembers.teamId
    })
    .from(users)
    .leftJoin(teamMembers, eq(users.id, teamMembers.userId))
    .where(eq(users.id, userId))
    .limit(1);

  return result[0];
}

export async function getActivityLogs() {
  const user = await getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  return await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      timestamp: activityLogs.timestamp,
      ipAddress: activityLogs.ipAddress,
      userName: users.name
    })
    .from(activityLogs)
    .leftJoin(users, eq(activityLogs.userId, users.id))
    .where(eq(activityLogs.userId, user.id))
    .orderBy(desc(activityLogs.timestamp))
    .limit(10);
}

export async function getTeamForUser() {
  const user = await getUser();
  if (!user) {
    return null;
  }

  const result = await db
    .select({
      team: teams
    })
    .from(teamMembers)
    .leftJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(eq(teamMembers.userId, user.id))
    .limit(1);

  return result.length > 0 ? result[0].team : null;
}

const ADMIN_EMAIL = 'rudyak.kirill@gmail.com';

export async function getSsrChecksForAdmin(limit = 200) {
  const user = await getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return null;
  }

  return await db
    .select({
      id: ssrChecks.id,
      url: ssrChecks.url,
      verdict: ssrChecks.verdict,
      reasons: ssrChecks.reasons,
      createdAt: ssrChecks.createdAt,
      ipAddress: ssrChecks.ipAddress,
      userAgent: ssrChecks.userAgent,
      userEmail: users.email,
      teamName: teams.name,
    })
    .from(ssrChecks)
    .leftJoin(users, eq(ssrChecks.userId, users.id))
    .leftJoin(teams, eq(ssrChecks.teamId, teams.id))
    .orderBy(desc(ssrChecks.createdAt))
    .limit(limit);
}

export async function getUsersForAdmin(limit = 500) {
  const user = await getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return null;
  }

  return await db
    .select({
      id: users.id,
      email: users.email,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(isNull(users.deletedAt))
    .orderBy(desc(users.createdAt))
    .limit(limit);
}

export async function getLlmChecksForAdmin(limit = 200) {
  const user = await getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return null;
  }

  return await db
    .select({
      id: llmChecks.id,
      url: llmChecks.url,
      verdict: llmChecks.verdict,
      reasons: llmChecks.reasons,
      createdAt: llmChecks.createdAt,
      ipAddress: llmChecks.ipAddress,
      userAgent: llmChecks.userAgent,
      userEmail: users.email,
      teamName: teams.name,
    })
    .from(llmChecks)
    .leftJoin(users, eq(llmChecks.userId, users.id))
    .leftJoin(teams, eq(llmChecks.teamId, teams.id))
    .orderBy(desc(llmChecks.createdAt))
    .limit(limit);
}
