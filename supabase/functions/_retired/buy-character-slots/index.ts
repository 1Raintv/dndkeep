// RETIRED 2026-08-25 (v2.683) — DO NOT REDEPLOY. See ../README.md.
//
// Verbatim from production (version 2), kept for the record: this was never in
// version control. Auth was correct (anon client + getUser). The problems were
// that it sold a 5-slot pack no other part of the app modelled, and that its
// fulfilment was the success_url — the browser arriving at
// /settings?slots_purchased=5 WAS the grant, so paying and closing the tab
// granted nothing while visiting the URL without paying granted everything.
//
// import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
// import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
// import { createClient } from 'jsr:@supabase/supabase-js@2';
//
// const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-04-10' });
// const SLOT_PACK = { slots: 5, amount: 500, label: '5 Character Slots' };
//
// Deno.serve(async (req: Request) => {
//   if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } });
//   try {
//     const authHeader = req.headers.get('Authorization');
//     if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
//     const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authHeader } } });
//     const { data: { user } } = await supabase.auth.getUser();
//     if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
//     const { origin } = await req.json();
//     const session = await stripe.checkout.sessions.create({
//       payment_method_types: ['card'],
//       line_items: [{ price_data: { currency: 'usd', unit_amount: SLOT_PACK.amount, product_data: { name: `DNDKeep: ${SLOT_PACK.label}`, description: `Add ${SLOT_PACK.slots} character slots to your account` } }, quantity: 1 }],
//       mode: 'payment',
//       success_url: `${origin}/settings?slots_purchased=5`,
//       cancel_url: `${origin}/settings`,
//       metadata: { user_id: user.id, slots: String(SLOT_PACK.slots) },
//     });
//     return new Response(JSON.stringify({ url: session.url }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
//   } catch(e) {
//     return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
//   }
// });

export {};
