// @vitest-environment happy-dom
import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('../../../lib/supabase',()=>({supabase:{}}));
import type {Character} from '../../../types';
import type {PsionicEnhancementPersistence} from '../../../lib/api/psionicTurns';
import {prepareDiscipline,beginDiscipline,finishDiscipline} from './disciplinePayment';
import {rememberPsionicPayment} from '../../../lib/psionicPaymentRecovery';
const c={id:'hero',class_name:'Fighter',level:3,secondary_class:'Psion',secondary_level:5,intelligence:10,inventory:[{magic_item_id:'headband-of-intellect',equipped:true,attuned:true}],class_resources:{'psion-disciplines':['biofeedback'],'psionic-energy-dice':6},feature_uses:{},psionic_energy_revision:0} as unknown as Character;
const options=()=>({active:()=>true,confirm:vi.fn(async()=>false),warn:vi.fn()});
function service(){return {getDisciplineTurn:vi.fn(async()=>({turn:{soloTurn:0},uses:[],pending:[]})),beginDiscipline:vi.fn(),finishDiscipline:vi.fn(),energy:vi.fn(),surge:vi.fn(),spend:vi.fn(),getTurn:vi.fn()} as PsionicEnhancementPersistence;}
beforeEach(()=>localStorage.clear());
it('uses the raw multiclass identity and effective attuned Intelligence in the captured request',async()=>{
 const p=service(),latest={current:structuredClone(c)},o=options();const prepared=await prepareDiscipline(p,latest,o);
 vi.mocked(p.beginDiscipline!).mockImplementation(async request=>({...request,conditional:false,energy:null,outcome:{spent:true},replayed:false,character:{...c,psionic_energy_revision:1,class_resources:{...c.class_resources,'psionic-energy-dice':5}}}));
 await beginDiscipline(p,latest,prepared!,'biofeedback',[3],1,o);
 expect(p.beginDiscipline).toHaveBeenCalledWith(expect.objectContaining({modifier:4,expected:expect.objectContaining({class_name:'Fighter',level:3,secondary_class:'Psion',secondary_level:5,intelligence:10})}));
 expect(latest.current.class_resources?.['psionic-energy-dice']).toBe(5);expect(p.energy).not.toHaveBeenCalled();
});
it('retries the original claim without replacing its dice or identity',async()=>{
 const p=service(),o=options(),latest={current:c};o.confirm.mockResolvedValueOnce(true);const prepared=await prepareDiscipline(p,latest,o);
 vi.mocked(p.beginDiscipline!).mockRejectedValueOnce(new Error('lost')).mockImplementationOnce(async r=>({...r,conditional:true,energy:null,outcome:null,character:c,replayed:true}));
 await beginDiscipline(p,latest,prepared!,'inerrant-aim',[3],1,o);
 expect(vi.mocked(p.beginDiscipline!).mock.calls[0]).toEqual(vi.mocked(p.beginDiscipline!).mock.calls[1]);expect(p.energy).not.toHaveBeenCalled();
});
it('blocks a new attempt while an earlier decision is uncertain',async()=>{
 const p=service(),o=options();rememberPsionicPayment('hero',{kind:'discipline-finish',request:{requestId:'saved',discipline:'inerrant-aim',sourceFeature:'Inerrant Aim',rolls:[3],count:1,turn:{soloTurn:0},changedOutcome:true}});
 expect(await prepareDiscipline(p,{current:c},o)).toBeNull();expect(p.getDisciplineTurn).not.toHaveBeenCalled();expect(o.warn).toHaveBeenCalled();
});
it('does not proceed on a failed turn read or unavailable discipline persistence',async()=>{
 const p=service(),o=options();vi.mocked(p.getDisciplineTurn!).mockRejectedValue(new Error('Offline'));
 expect(await prepareDiscipline(p,{current:c},o)).toBeNull();expect(await prepareDiscipline({...p,beginDiscipline:undefined},{current:c},o)).toBeNull();expect(p.beginDiscipline).not.toHaveBeenCalled();
});
it('does not acknowledge a paid result into another character',async()=>{
 const latest={current:c},p=service(),o=options(),prepared=await prepareDiscipline(p,latest,o);
 vi.mocked(p.beginDiscipline!).mockImplementation(async r=>{latest.current={...c,id:'other'};return {...r,conditional:true,energy:null,outcome:null,character:{...c,class_resources:{'psionic-energy-dice':1}},replayed:false};});
 await beginDiscipline(p,latest,prepared!,'inerrant-aim',[3],1,o);expect(latest.current.id).toBe('other');expect(latest.current.class_resources?.['psionic-energy-dice']).toBe(6);
});
it('finish reuses the attempt identity and preserves a keep-die outcome',async()=>{
 const p=service(),o=options(),latest={current:c},use={requestId:'saved',discipline:'inerrant-aim' as const,sourceFeature:'Inerrant Aim',rolls:[3],count:1,turn:{soloTurn:0},conditional:true,energy:null,outcome:null};
 vi.mocked(p.finishDiscipline!).mockResolvedValue({...use,outcome:{spent:false,energy:null},character:c,replayed:false});
 await finishDiscipline(p,latest,use,false,o);expect(p.finishDiscipline).toHaveBeenCalledWith(expect.objectContaining({requestId:'saved',rolls:[3],turn:{soloTurn:0},changedOutcome:false}));expect(p.energy).not.toHaveBeenCalled();
});
