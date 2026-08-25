// RETIRED 2026-08-25 (v2.683) — DO NOT REDEPLOY. See ../README.md.
//
// Verbatim from production (version 2). Sold obsidian/gold/ice/blood at $2.99
// while the Store page sold crimson/emerald/sapphire at $2. Fulfilment was the
// success_url (?skin_unlocked=<id>), which the client trusted without any
// payment check and which never wrote to dice_skin_unlocks — so a real buyer
// lost the skin on reload anyway.
//
// import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
// import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';
// import { createClient } from 'jsr:@supabase/supabase-js@2';
//
// const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', { apiVersion: '2024-04-10' });
// const SKIN_PRICES: Record<string, number> = { obsidian: 299, gold: 299, ice: 299, blood: 299 };
//
// Deno.serve(async (req: Request) => {
//   if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' } });
//   try {
//     const authHeader = req.headers.get('Authorization');
//     if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
//     const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authHeader } } });
//     const { data: { user } } = await supabase.auth.getUser();
//     if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
//     const { skinId, origin } = await req.json();
//     const priceAmount = SKIN_PRICES[skinId];
//     if (!priceAmount) return new Response(JSON.stringify({ error: 'Invalid skin' }), { status: 400 });
//     const { data: existing } = await supabase.from('dice_skin_unlocks').select('id').eq('user_id', user.id).eq('skin_id', skinId).single();
//     if (existing) return new Response(JSON.stringify({ error: 'Already owned' }), { status: 400 });
//     const session = await stripe.checkout.sessions.create({
//       payment_method_types: ['card'],
//       line_items: [{ price_data: { currency: 'usd', unit_amount: priceAmount, product_data: { name: `DNDKeep Dice Skin: ${skinId}`, description: 'Premium 3D dice skin for DNDKeep' } }, quantity: 1 }],
//       mode: 'payment',
//       success_url: `${origin}/character?skin_unlocked=${skinId}`,
//       cancel_url: `${origin}/character`,
//       metadata: { user_id: user.id, skin_id: skinId },
//     });
//     return new Response(JSON.stringify({ url: session.url }), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
//   } catch (e) {
//     return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
//   }
// });

export {};
