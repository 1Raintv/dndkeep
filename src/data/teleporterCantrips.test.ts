import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {SPELLS,SPELL_MAP} from './spells';
it('keeps the private Teleporter cantrip catalog aligned with actual one-Action cantrips',()=>{
 const sql=readFileSync('supabase/migrations/20261009192652_teleporter_combat_cantrip_claims.sql','utf8');
 const ids=[...(sql.match(/select p_id=any\(array\[([^\]]+)\]/)?.[1]??'').matchAll(/'([^']+)'/g)].map(m=>m[1]);
 expect(ids).toEqual(SPELLS.filter(s=>s.id!=='produce-flame'&&s.level===0&&/^(?:1\s+)?action$/i.test(s.casting_time.trim())).map(s=>s.id).sort());
 // 2024 Mending: https://www.dndbeyond.com/spells/2619033-mending
 expect(SPELL_MAP.mending.casting_time).toBe('1 minute');expect(ids).not.toContain('mending');
 // Produce Flame is Bonus Action in 2024; exclude its stale catalog metadata.
 expect(ids).not.toContain('produce-flame');
});
