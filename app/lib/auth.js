import { auth, currentUser } from '@clerk/nextjs/server';
import { sql } from '@/app/lib/db';

/**
 * Resolve the current application user from Clerk's session.
 *
 * Returns null when there is no authenticated Clerk session, otherwise the
 * matching row from the `users` table keyed by clerk_user_id. Identity is
 * derived server-side from Clerk — never from client-supplied values.
 *
 * If the Clerk session is valid but no `users` row exists yet, the row is
 * created on the fly from Clerk's user data. This is a safety net: the
 * webhook (/api/webhooks/clerk) is the primary provisioning path, but it only
 * fires against the deployed URL and can occasionally be missed, so lazy
 * creation keeps a signed-in user from ever lacking a row (and makes local
 * development work without the webhook).
 */
export async function getDbUser() {
  const { userId } = await auth();
  if (!userId) return null;

  const rows = await sql`
    SELECT * FROM users WHERE clerk_user_id = ${userId}
  `;
  if (rows[0]) return rows[0];

  // No row yet — provision it from Clerk's authoritative user data.
  const clerkUser = await currentUser();
  if (!clerkUser) return null;

  const primaryEmail =
    clerkUser.emailAddresses?.find(
      (e) => e.id === clerkUser.primaryEmailAddressId
    )?.emailAddress ??
    clerkUser.emailAddresses?.[0]?.emailAddress ??
    null;

  const name =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim() ||
    clerkUser.username ||
    null;

  const inserted = await sql`
    INSERT INTO users (clerk_user_id, email, name, onboarding_completed)
    VALUES (${userId}, ${primaryEmail}, ${name}, FALSE)
    ON CONFLICT (clerk_user_id)
    DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name
    RETURNING *
  `;

  return inserted[0] ?? null;
}
