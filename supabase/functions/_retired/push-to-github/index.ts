// RETIRED 2026-08-25 — DO NOT REDEPLOY. Kept only as the record of what was
// running in production, because it was never in version control and would
// otherwise have vanished without review.
//
// WHAT IT WAS. A "let an agent commit to the repo" mechanism from March 2026,
// superseded by ordinary git. Nothing in the app ever called it.
//
// WHY IT HAD TO GO. It was a third, undocumented deploy path (alongside
// deploy.bat and watch-and-deploy.ps1) and by far the most dangerous:
//   - deployed with `verify_jwt: false` and `Access-Control-Allow-Origin: *`,
//     so it was reachable anonymously from any origin on the internet;
//   - it held a GITHUB_TOKEN with write access to 1Raintv/dndkeep and pushed
//     caller-supplied file contents straight to `main`, which Vercel
//     auto-deploys — i.e. arbitrary code execution on the live site and on
//     every signed-in user's session;
//   - the only guard was a single static DEPLOY_KEY compared with `!==`, and
//     it was accepted in the REQUEST BODY as well as a header, so it leaked
//     into logs and browser history.
//
// Found during the 2026-08 launch audit; owner approved removal the same day.
// The live function was first overwritten with a permanently-refusing stub to
// close the hole immediately, then deleted. Both GITHUB_TOKEN and DEPLOY_KEY
// must be treated as disclosed and rotated — a secret that sat behind an
// anonymous endpoint should never be reused.
//
// The original source follows, verbatim as pulled from production
// (version 10), for the record only.
//
// ---------------------------------------------------------------------------
//
// import "jsr:@supabase/functions-js/edge-runtime.d.ts";
//
// const GITHUB_TOKEN = Deno.env.get('GITHUB_TOKEN') ?? '';
// const DEPLOY_KEY   = Deno.env.get('DEPLOY_KEY') ?? '';
// const OWNER = '1Raintv';
// const REPO  = 'dndkeep';
// const BRANCH = 'main';
//
// const CORS = {
//   'Access-Control-Allow-Origin': '*',
//   'Access-Control-Allow-Headers': 'content-type, x-deploy-key',
//   'Access-Control-Allow-Methods': 'POST, OPTIONS',
// };
//
// Deno.serve(async (req: Request) => {
//   if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
//   try {
//     const body = await req.json();
//     const key = req.headers.get('x-deploy-key') ?? body.deployKey ?? '';
//     if (key !== DEPLOY_KEY) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...CORS, 'Content-Type': 'application/json' } });
//     if (body.ping) return new Response(JSON.stringify({ ok: true, version: 5 }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
//     const { files, message = 'deploy via edge fn' } = body;
//     if (!files) return new Response(JSON.stringify({ error: 'files required' }), { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } });
//     const gh: RequestInit = { headers: { 'Authorization': `Bearer ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' } };
//     const ref = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, gh).then(r => r.json());
//     const mainSHA = ref.object?.sha;
//     if (!mainSHA) throw new Error('No HEAD sha: ' + JSON.stringify(ref));
//     const commit = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/commits/${mainSHA}`, gh).then(r => r.json());
//     const treeSHA = commit.tree?.sha;
//     const treeItems = [];
//     for (const [path, b64] of Object.entries(files as Record<string,string>)) {
//       const blob = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/blobs`, { ...gh, method: 'POST', body: JSON.stringify({ content: b64, encoding: 'base64' }) }).then(r => r.json());
//       if (!blob.sha) throw new Error(`Blob failed ${path}: ${JSON.stringify(blob)}`);
//       treeItems.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
//     }
//     const tree = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/trees`, { ...gh, method: 'POST', body: JSON.stringify({ base_tree: treeSHA, tree: treeItems }) }).then(r => r.json());
//     const newCommit = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/commits`, { ...gh, method: 'POST', body: JSON.stringify({ message, tree: tree.sha, parents: [mainSHA], author: { name: 'Claude', email: 'claude@anthropic.com' } }) }).then(r => r.json());
//     await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, { ...gh, method: 'PATCH', body: JSON.stringify({ sha: newCommit.sha }) });
//     return new Response(JSON.stringify({ ok: true, sha: newCommit.sha, count: treeItems.length }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
//   } catch (err) {
//     return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } });
//   }
// });

export {};
