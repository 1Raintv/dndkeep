import {expect,it} from 'vitest';
import {validPsychicDamagePreviewMath} from './psychicDamagePreview';
const plan=()=>({context:{attack:{damage_final:13,psionic_damage_dice:{version:1,sides:8,rolls:[1,5,3],originalRolls:[1,5,3],modifier:4}}},choice:{} as {amount?:number;affinity?:string;activationId?:string;dieIndex?:number},activations:[{id:'saved',total:8}],usedThisTurn:false,defensesKnown:true,immune:false,resistant:false,vulnerable:false,bypass:false,damageBefore:13,damageAfter:13 as number|null,replacement:null as {activationId:string;dieIndex:number;original:number;replacement:number}|null});
it('verifies resistance before vulnerability and immunity before both',()=>{
 const p=plan();p.resistant=true;p.vulnerable=true;p.damageAfter=12;expect(validPsychicDamagePreviewMath(p)).toBe(true);
 p.damageAfter=13;expect(validPsychicDamagePreviewMath(p)).toBe(false);
 p.immune=true;p.damageAfter=0;expect(validPsychicDamagePreviewMath(p)).toBe(true);
});
it('applies a reviewed resistance bypass without bypassing vulnerability',()=>{const p=plan();p.resistant=true;p.bypass=true;p.vulnerable=true;p.damageAfter=26;expect(validPsychicDamagePreviewMath(p)).toBe(true);});
it('accepts an explicit reviewed amount but not mismatched before-damage evidence',()=>{const p=plan();p.choice.amount=7;p.damageAfter=7;expect(validPsychicDamagePreviewMath(p)).toBe(true);p.damageBefore=7;expect(validPsychicDamagePreviewMath(p)).toBe(false);});
it('unknown defenses require a null result until reviewed',()=>{const p=plan();p.defensesKnown=false;expect(validPsychicDamagePreviewMath(p)).toBe(false);p.damageAfter=null;expect(validPsychicDamagePreviewMath(p)).toBe(true);p.choice.affinity='normal';p.damageAfter=13;expect(validPsychicDamagePreviewMath(p)).toBe(true);});
const replacement=()=>{const p=plan();p.choice={activationId:'saved',dieIndex:0};p.replacement={activationId:'saved',dieIndex:0,original:1,replacement:8};p.damageAfter=20;return p;};
it('reconstructs a replacement from the saved activation and original die',()=>{expect(validPsychicDamagePreviewMath(replacement())).toBe(true);});
it.each(['spent','wrong die','wrong total','missing selection','unknown activation','zero damage','adjusted damage'])('rejects an unsupported replacement: %s',kind=>{
 const p=replacement();if(kind==='spent')p.usedThisTurn=true;if(kind==='wrong die')p.replacement!.original=2;if(kind==='wrong total')p.replacement!.replacement=7;if(kind==='missing selection')p.choice={};if(kind==='unknown activation')p.activations=[];if(kind==='zero damage')p.immune=true;if(kind==='adjusted damage')p.choice.amount=12;
 expect(validPsychicDamagePreviewMath(p)).toBe(false);
});
it('replaces spell dice before successful-save and resistance rounding',()=>{
 const p=replacement();p.context.attack={damage_final:4,spell_cast_source:'class:Psion',attack_kind:'save',attack_source:'spell',damage_type:'psychic',damage_dice:'3d8',save_result:'passed',save_success_effect:'half',damage_components:{version:1,components:[{key:'base',source:'base',label:'spell',damageType:'psychic',expression:'3d8',rolls:[1,5,3],dieKinds:['rolled','rolled','rolled'],modifier:0,rawTotal:9}]}} as unknown as typeof p.context.attack;
 p.damageBefore=4;p.resistant=true;p.damageAfter=4;expect(validPsychicDamagePreviewMath(p)).toBe(true);p.damageAfter=5;expect(validPsychicDamagePreviewMath(p)).toBe(false);
});
it('rejects overflow and malformed review amounts',()=>{const p=plan();p.choice.amount=2147483647;p.vulnerable=true;p.damageAfter=4294967294;expect(validPsychicDamagePreviewMath(p)).toBe(false);p.choice.amount=NaN;expect(validPsychicDamagePreviewMath(p)).toBe(false);});
