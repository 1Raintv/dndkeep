import {execFileSync} from 'node:child_process';
import {test,expect} from '@playwright/test';
import {gateDbSuite} from './helpers';
const sql=(q:string)=>execFileSync('docker',['exec','-i','supabase_db_dndkeep','psql','-U','postgres','-d','postgres','-qAt','-v','ON_ERROR_STOP=1'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
const encoded=(v:unknown)=>`'${JSON.stringify(v).replaceAll("'","''")}'::jsonb`;
const piece=(id:string)=>({definitionType:'character',definition:{damage_resistances:[],damage_immunities:[],damage_vulnerabilities:[],active_buffs:[]},combatant:{id,temp_hp:10,is_dead:false,active_conditions:[],active_buffs:[] as unknown[]}});
function context(){const attacker=piece('actor'),target=piece('target');target.combatant.active_buffs=[{key:'armor',name:'Armor of Agathys',meleeRetaliation:{damage:15,damageType:'cold',requiresTempHp:true}}];return {attack:{attack_kind:'attack_roll',attack_source:'weapon',attack_mode:'melee' as string|null,hit_result:'hit',attacker_participant_id:'actor',target_participant_id:'target',damage_final:0},attacker,target};}
const preview=(ctx:unknown=context(),choice:unknown={})=>JSON.parse(sql(`select dndkeep_private.pending_retaliation_plan(${encoded(ctx)},${encoded(choice)})`));
const defenses=(part:unknown,type='cold',choice:string|null=null)=>JSON.parse(sql(`select dndkeep_private.pending_damage_defenses(${encoded(part)},'${type}',${choice?`'${choice}'`:'null'})`));
test.describe('Weapon damage composition (local stack)',()=>{
 gateDbSuite();
 test('a melee hit triggers retaliation even when the primary damage is zero',()=>{expect(preview().entries[0]).toMatchObject({raw:15,final:15,damageType:'cold'});});
 test('ranged delivery never becomes melee because its source says weapon',()=>{const ctx=context();ctx.attack.attack_mode='ranged';expect(preview(ctx).entries).toEqual([]);});
 for(const kind of ['save','auto_hit'])test(`${kind} cannot trigger melee retaliation`,()=>{const ctx=context();ctx.attack.attack_kind=kind;expect(preview(ctx).entries).toEqual([]);});
 for(const result of ['miss','fumble'])test(`${result} cannot trigger retaliation`,()=>{const ctx=context();ctx.attack.hit_result=result;expect(preview(ctx).entries).toEqual([]);});
 test('the pre-hit temporary pool is required by Armor of Agathys',()=>{const ctx=context();ctx.target.combatant.temp_hp=0;expect(preview(ctx).entries).toEqual([]);});
 test('self attacks and a second placement of the same combatant do not retaliate',()=>{const ctx=context();ctx.target.combatant.id='actor';expect(preview(ctx).entries).toEqual([]);});
 test('retaliation honors the attacker cold resistance, not the defender defenses',()=>{const ctx=context();ctx.attacker.definition.damage_resistances=['cold'] as never;ctx.target.definition.damage_immunities=['cold'] as never;expect(preview(ctx).entries[0].final).toBe(7);});
 test('resistance rounds before vulnerability rather than canceling',()=>{const ctx=context();ctx.attacker.definition.damage_resistances=['cold'] as never;ctx.attacker.definition.damage_vulnerabilities=['cold'] as never;expect(preview(ctx).entries[0].final).toBe(14);});
 test('immunity prevents retaliation damage despite vulnerability',()=>{const ctx=context();ctx.attacker.definition.damage_immunities=['cold'] as never;ctx.attacker.definition.damage_vulnerabilities=['cold'] as never;expect(preview(ctx).entries[0].final).toBe(0);});
 test('unknown delivery requires a choice instead of treating a spell as melee',()=>{const ctx=context();ctx.attack.attack_mode=null;ctx.attack.attack_source='spell';expect(preview(ctx)).toMatchObject({requiresAttackMode:true,entries:[]});expect(preview(ctx,{mode:'melee'}).entries[0].final).toBe(15);expect(preview(ctx,{mode:'ranged'}).entries).toEqual([]);});
 test('captured ranged delivery cannot be overridden as melee',()=>{const ctx=context();ctx.attack.attack_mode='ranged';expect(()=>preview(ctx,{mode:'melee'})).toThrow(/cannot be changed/);});
 test('conditional defenses require an explicit review',()=>{const ctx=context();ctx.attacker.definition.damage_resistances=['cold while underwater'] as never;expect(preview(ctx).entries[0].final).toBeNull();expect(preview(ctx,{defenses:{armor:'resistant'}}).entries[0].final).toBe(7);});
 test('Petrified resistance survives a normal defense override',()=>{const ctx=context();ctx.attacker.combatant.active_conditions=['Petrified'] as never;expect(preview(ctx,{defenses:{armor:'normal'}}).entries[0].final).toBe(7);});
 test('sheet and encounter wards participate in generic defenses',()=>{const p=piece('actor');p.definition.active_buffs=[{immunities:['COLD']}] as never;p.combatant.active_buffs=[{resistances:['all']}];expect(defenses(p)).toMatchObject({defensesKnown:true,immune:true,resistant:true});expect(defenses(p,'fire')).toMatchObject({immune:false,resistant:true});});
 test('anonymous and authenticated clients cannot call partial composition stages',()=>{expect(sql(`select has_function_privilege('anon','dndkeep_private.pending_retaliation_plan(jsonb,jsonb)','execute') or has_function_privilege('authenticated','dndkeep_private.pending_retaliation_plan(jsonb,jsonb)','execute')`)).toBe('f');});
});
