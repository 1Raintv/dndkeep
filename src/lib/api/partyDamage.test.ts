import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),read:vi.fn(),resolve:vi.fn()}));
vi.mock('./psionicTurns',()=>({psionicRpc:m.rpc}));
vi.mock('./concentrationSaves',()=>({readConcentrationResult:m.read,resolveConcentrationSave:m.resolve}));
vi.mock('../hooks/useMagicItems',()=>({getMagicItemById:()=>null}));
import {createPartyDamageRequest,type PartyDamageContext} from '../partyDamageRequest';
import {loadPartyDamageContext,submitPartyDamage,cancelPartyDamage,settlePartyAutomaticSave} from './partyDamage';
const char='11111111-1111-4111-8111-111111111111',campaign='22222222-2222-4222-8222-222222222222',user='33333333-3333-4333-8333-333333333333';
const context=():PartyDamageContext=>({character:{id:char,name:'Hero',species:'Human',strength:10,dexterity:10,constitution:14,intelligence:10,wisdom:10,charisma:10,inventory:[],damage_resistances:['psychic'],damage_vulnerabilities:['psychic'],damage_immunities:[],concentration_spell:'detect-magic',hit_point_revision:0,active_conditions:[],automation_overrides:{},advanced_automations_unlocked:false},campaign:{id:campaign,automation_defaults:{}},participant:null,combatant:null,pools:{current_hp:40,max_hp:50,temp_hp:5}});

beforeEach(()=>vi.resetAllMocks());
it('rejects unreadable previews instead of assuming an unprotected target',async()=>{
 m.rpc.mockResolvedValue(null);await expect(loadPartyDamageContext(campaign,char)).rejects.toThrow('could not be verified');m.rpc.mockResolvedValue(context());expect(await loadPartyDamageContext(campaign,char)).toEqual(context());
});
it('sends the saved identity and rejects malformed confirmations',async()=>{
 const r=createPartyDamageRequest(context(),23,'psychic',false);m.rpc.mockResolvedValue({});await expect(submitPartyDamage(r)).rejects.toThrow('not confirmed');
 expect(m.rpc).toHaveBeenCalledWith('apply_party_damage',expect.objectContaining({p_request_id:r.requestId,p_save_id:r.saveId,p_damage:22,p_expected:r.expected}),true);
});
it('verifies cancellation identity and reports already-applied damage',async()=>{
 const r=createPartyDamageRequest(context(),23,'psychic',false);m.rpc.mockResolvedValue({requestId:r.requestId,characterId:char,canceled:false,replayed:true});expect(await cancelPartyDamage(r)).toBe(false);
 m.rpc.mockResolvedValue({requestId:'other',characterId:char,canceled:true,replayed:true});await expect(cancelPartyDamage(r)).rejects.toThrow('not confirmed');
});
it('does not roll another die for an already-confirmed automatic save',async()=>{
 const r=createPartyDamageRequest(context(),23,'psychic',false),receipt={automation:'auto',checkId:r.saveId} as Parameters<typeof settlePartyAutomaticSave>[1],result={pendingId:r.saveId,outcome:'passed'};
 m.read.mockResolvedValue(result);expect(await settlePartyAutomaticSave(r,receipt)).toEqual(result);expect(m.resolve).not.toHaveBeenCalled();
 m.read.mockResolvedValue(null);m.resolve.mockResolvedValue(result);await settlePartyAutomaticSave(r,receipt);expect(m.resolve).toHaveBeenCalledWith(char,r.saveId,'player');
});
