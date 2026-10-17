import { verifyWebhook } from '@clerk/nextjs/webhooks';
import { sql } from '@/app/lib/db';

/**
 * POST /api/webhooks/clerk — sync Clerk users into the local `users` table.
 *
 * This route is intentionally public (exempted in middleware.ts) because Clerk
 * calls it server-to-server. Authenticity is established by verifying the Svix
 * signature via verifyWebhook(), which reads CLERK_WEBHOOK_SIGNING_SECRET and
 * throws on any tampering or missing/invalid signature.
 *
 * Handled events:
 *   user.created / user.updated → upsert the users row (idempotent)
 *   user.deleted               → delete the users row (owned data cascades)
 */
export async function POST(req) {
  let evt;
  try {
    evt = await verifyWebhook(req);
  } catch (err) {
    console.error('Clerk webhook verification failed:', err);
    return Response.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    const eventType = evt.type;

    if (eventType === 'user.created' || eventType === 'user.updated') {
      const data = evt.data;
      const clerkUserId = data.id;

      const primaryEmail =
        data.email_addresses?.find(
          (e) => e.id === data.primary_email_address_id
        )?.email_address ??
        data.email_addresses?.[0]?.email_address ??
        null;

      const name =
        [data.first_name, data.last_name].filter(Boolean).join(' ').trim() ||
        data.username ||
        null;

      await sql`
        INSERT INTO users (clerk_user_id, email, name, onboarding_completed)
        VALUES (${clerkUserId}, ${primaryEmail}, ${name}, FALSE)
        ON CONFLICT (clerk_user_id)
        DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name
      `;

      return Response.json({ ok: true }, { status: 200 });
    }

    if (eventType === 'user.deleted') {
      // data.id may be absent for some deletion payloads; guard it.
      const clerkUserId = evt.data?.id;
      if (clerkUserId) {
        await sql`DELETE FROM users WHERE clerk_user_id = ${clerkUserId}`;
      }
      return Response.json({ ok: true }, { status: 200 });
    }

    // Acknowledge unhandled event types so Clerk does not retry them.
    return Response.json({ ok: true, ignored: eventType }, { status: 200 });
  } catch (err) {
    console.error('Clerk webhook processing failed:', err);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
