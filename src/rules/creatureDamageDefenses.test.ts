import {expect,it} from 'vitest';
import {normalizeCreatureDefenses} from './creatureDamageDefenses';
it('distinguishes unknown from explicitly no defenses',()=>{expect(normalizeCreatureDefenses(null)).toBeNull();expect(normalizeCreatureDefenses(undefined)).toBeNull();expect(normalizeCreatureDefenses([])).toEqual([]);});
it('trims and deduplicates while preserving full conditional wording',()=>{expect(normalizeCreatureDefenses([' Psychic ','psychic','','bludgeoning, piercing, and slashing from nonmagical attacks'])).toEqual(['Psychic','bludgeoning, piercing, and slashing from nonmagical attacks']);});
it('rejects malformed entries instead of silently dropping defenses',()=>{expect(()=>normalizeCreatureDefenses('psychic')).toThrow();expect(()=>normalizeCreatureDefenses(['psychic',null])).toThrow();});
it('does not modify the stored array',()=>{const source=[' psychic '];normalizeCreatureDefenses(source);expect(source).toEqual([' psychic ']);});
