import {expect,it,vi} from 'vitest';
vi.mock('./supabase',()=>({supabase:{}}));
import {CONDITION_MAP} from '../data/conditions';
import {conditionsSpeedZero,conditionsAutoFailSave} from './conditions';
it('2024 Stunned permits movement but retains incapacity and Strength/Dexterity save failures',()=>{
 expect(conditionsSpeedZero(['Stunned','Incapacitated'])).toBe(false);
 expect(CONDITION_MAP.Stunned).toMatchObject({cantAct:true,cantReact:true,concentrationBreaks:true,attackAdvantageReceived:true});
 expect(CONDITION_MAP.Stunned.cantMove).not.toBe(true);expect(CONDITION_MAP.Stunned.effects).not.toContain("Can't move.");
 expect(conditionsAutoFailSave(['Stunned'],'STR')).toBe(true);expect(conditionsAutoFailSave(['Stunned'],'DEX')).toBe(true);expect(conditionsAutoFailSave(['Stunned'],'CON')).toBe(false);
});
it.each(['Grappled','Restrained','Paralyzed','Petrified','Unconscious'])('%s still prevents voluntary movement',condition=>expect(conditionsSpeedZero([condition])).toBe(true));
it('another immobilizing condition still applies to a Stunned creature',()=>expect(conditionsSpeedZero(['Stunned','Grappled'])).toBe(true));
