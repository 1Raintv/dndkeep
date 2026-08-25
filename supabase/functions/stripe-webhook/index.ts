// supabase/functions/stripe-webhook/index.ts
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
// Set secrets: supabase secrets set STRIPE_SECRET_KEY=... STRIPE_WEBHOOK_SECRET=...
//
// NOTE on --no-verify-jwt: Stripe cannot mint a Supabase JWT. Authenticity here
// comes from the signature check below, which is the correct mechanism for a
// webhook and must never be removed.
//
// v2.683.0 — rewritten. As shipped it was broken for every one-time product:
//   - `checkout.session.completed` unconditionally set subscription_tier='pro',
//     so a $2 dice set granted full Pro;
//   - it then called stripe.subscriptions.retrieve(session.subscription), which
//     is null for a one-time payment → throw → 500;
//   - a 500 makes Stripe retry, and with no idempotency each retry re-granted.
// It never read product_key at all.
//
// Now: dedupe on event.id first, then route on product_key through the shared
// catalogue.

import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { productFor, MAX_EXTRA_CHARACTER_SLOTS } from '../_shared/products.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-04-10',
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

/** Claim this event id, or report that someone already has.
 *
 *  Stripe guarantees at-least-once delivery and retries anything non-2xx, so
 *  the same event WILL arrive twice eventually. Without this, a retry credits a
 *  second character slot for one payment. The primary key does the work: the
 *  insert either wins or conflicts, atomically, with no read-then-write race. */
async function claimEvent(event: Stripe.Event): Promise<boolean> {
  const { data, error } = await supabase
    .from('stripe_events')
    .upsert({ id: event.id, type: event.type }, { onConflict: 'id', ignoreDuplicates: true })
    .select('id');

  if (error) {
    // Fail CLOSED: if we cannot tell whether this was already processed, do not
    // process it. Returning 500 makes Stripe retry, which is recoverable; double
    // -granting is not.
    console.error('idempotency check failed:', error);
    throw error;
  }
  return (data?.length ?? 0) > 0;
}

/** Apply a completed one-time purchase. Subscriptions are handled by the
 *  subscription.* events instead, which carry the authoritative status. */
async function fulfilOneTime(userId: string, productKey: string): Promise<void> {
  const product = productFor(productKey);
  if (!product) {
    // Unknown key means the catalogue and Stripe have drifted. Loud, but not a
    // 500 — retrying will not make the key known, and we do not want Stripe
    // hammering us forever over a typo.
    console.error(`unknown product_key on completed checkout: ${productKey}`);
    return;
  }

  switch (product.grant.kind) {
    case 'subscription':
      // Deliberately nothing: customer.subscription.created/updated sets the
      // tier from the real subscription status. Doing it here as well was the
      // old bug that granted Pro for every purchase.
      return;

    case 'character_slot': {
      const { data: p } = await supabase
        .from('profiles').select('extra_character_slots').eq('id', userId).single();
      const next = Math.min(
        MAX_EXTRA_CHARACTER_SLOTS,
        (p?.extra_character_slots ?? 0) + product.grant.amount,
      );
      await supabase.from('profiles').update({ extra_character_slots: next }).eq('id', userId);
      console.log(`granted character slot to ${userId} (now ${next} extra)`);
      return;
    }

    case 'campaign_slot': {
      const { data: p } = await supabase
        .from('profiles').select('extra_campaign_slots').eq('id', userId).single();
      const next = (p?.extra_campaign_slots ?? 0) + product.grant.amount;
      await supabase.from('profiles').update({ extra_campaign_slots: next }).eq('id', userId);
      console.log(`granted campaign slot to ${userId} (now ${next} extra)`);
      return;
    }

    case 'ultimate_campaign':
      await supabase.from('profiles').update({ ultimate_campaign: true }).eq('id', userId);
      console.log(`granted ultimate_campaign to ${userId}`);
      return;

    case 'dice_skin':
      // onConflict on the (user_id, skin_id) unique index: re-buying a skin you
      // already own is a no-op rather than an error.
      await supabase.from('dice_skin_unlocks').upsert(
        { user_id: userId, skin_id: product.grant.skinId },
        { onConflict: 'user_id,skin_id', ignoreDuplicates: true },
      );
      console.log(`granted dice skin ${product.grant.skinId} to ${userId}`);
      return;
  }
}

Deno.serve(async (req: Request) => {
  const signature = req.headers.get('stripe-signature');
  if (!signature) return new Response('Missing stripe-signature header', { status: 400 });

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body, signature, Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return new Response('Invalid signature', { status: 400 });
  }

  try {
    // Dedupe BEFORE doing anything with side effects.
    if (!(await claimEvent(event))) {
      console.log(`duplicate event ${event.id} (${event.type}) — already processed`);
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`Processing event: ${event.type} (${event.id})`);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        const productKey = session.metadata?.product_key;

        if (!userId) {
          console.error('No supabase_user_id in session metadata');
          break;
        }

        // Only credit a one-time purchase once the money is actually there.
        // A 'payment' session can complete unpaid (async methods), and crediting
        // on completion alone would hand out products for free.
        if (session.mode === 'payment') {
          if (session.payment_status !== 'paid') {
            console.log(`session ${session.id} completed but payment_status=${session.payment_status}; not fulfilling`);
            break;
          }
          await fulfilOneTime(userId, productKey ?? '');
          break;
        }

        // Subscription checkout: record the customer link, and let the
        // subscription events own tier/status. Retrieving the subscription here
        // is safe because mode === 'subscription' guarantees it exists — the
        // old code did it unconditionally, which is what threw on one-time buys.
        const subscriptionId = session.subscription as string | null;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const isActive = ['active', 'trialing'].includes(subscription.status);
          await supabase.from('profiles').update({
            subscription_tier: isActive ? 'pro' : 'free',
            subscription_status: subscription.status,
            stripe_subscription_id: subscriptionId,
            stripe_customer_id: session.customer as string,
          }).eq('id', userId);
          console.log(`subscription ${subscription.status} for ${userId}`);
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.supabase_user_id;
        if (!userId) break;

        const isActive = ['active', 'trialing'].includes(subscription.status);
        await supabase.from('profiles').update({
          subscription_tier: isActive ? 'pro' : 'free',
          subscription_status: subscription.status,
          stripe_subscription_id: subscription.id,
        }).eq('id', userId);

        console.log(`Updated subscription for user ${userId}: ${subscription.status}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.supabase_user_id;
        if (!userId) break;

        // Tier drops, but one-time purchases are NOT reversed: extra slots,
        // Ultimate and dice are owned forever. Subscriber-gated things freeze
        // by reading subscription_status, not by being deleted here — see the
        // FREEZE PRINCIPLE in src/lib/entitlements.ts.
        await supabase.from('profiles').update({
          subscription_tier: 'free',
          subscription_status: 'canceled',
          stripe_subscription_id: null,
        }).eq('id', userId);

        console.log(`Downgraded user ${userId} to Free`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;
        await supabase.from('profiles').update({
          subscription_status: 'past_due',
        }).eq('stripe_customer_id', customerId);
        console.log(`Payment failed for customer ${customerId}`);
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error('Error processing webhook:', err);
    // Release the idempotency claim so Stripe's retry can genuinely retry
    // rather than being swallowed as a duplicate.
    await supabase.from('stripe_events').delete().eq('id', event.id);
    return new Response('Internal error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
