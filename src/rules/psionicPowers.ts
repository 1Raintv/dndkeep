import {psionicPoolRemaining,psionicDieSides} from './psionicRestoration';
export interface PsionicPowerCharacter {
  class_name:string; level:number; subclass?:string|null;
  class_resources?:Record<string,unknown>|null; feature_uses?:Record<string,number>|null;
}
export type PsionicPowerUse = {kind:'propel';mode:'free'|'powered'|'technique';roll:number} | {kind:'connection';roll:number;free:boolean};
export const CONNECTION_USE='Telepathic Connection';
export function psionicPowerState(c:PsionicPowerCharacter) {
  const raw=c.class_resources?.['psionic-energy-dice'];
  const remaining=psionicPoolRemaining(c.level,raw);
  return {valid:c.class_name==='Psion'&&remaining!==null,dice:remaining??0,
    sides:psionicDieSides(c.level),
    connectionFree:!(c.feature_uses?.[CONNECTION_USE]),
    telepathyRange:c.subclass==='Telepath'&&c.level>=6?60:30,
    technique:c.subclass==='Psykinetic'&&c.level>=3};
}
/** v2.748 — settle against current resources, never a pool captured before a save. */
export function resolvePsionicPower(c:PsionicPowerCharacter,use:PsionicPowerUse,failedSave?:boolean) {
  if(c.class_name!=='Psion'||c.level<1)return null;
  const state=psionicPowerState(c);
  if(!state.valid)return null;
  const isTechnique=use.kind==='propel'&&use.mode==='technique';
  const rolls=use.kind==='connection'||use.mode!=='free';
  if(rolls&&(!Number.isInteger(use.roll)||use.roll<1||use.roll>(isTechnique?4:state.sides)))return null;
  if(isTechnique&&!state.technique)return null;
  if(use.kind==='propel'&&failedSave===undefined)return null;
  // A first-free use cannot become a paid use while its dialog is open.
  if(use.kind==='connection'&&use.free!==state.connectionFree)return null;
  const needsDie=use.kind==='connection'?!use.free:use.mode==='powered';
  if((use.kind==='connection'||needsDie)&&state.dice<1)return null;
  const cost=needsDie&&(use.kind==='connection'||failedSave)?1:0;
  const patch={class_resources:{...c.class_resources,'psionic-energy-dice':state.dice-cost},
    feature_uses:{...c.feature_uses,...(use.kind==='connection'?{[CONNECTION_USE]:(c.feature_uses?.[CONNECTION_USE]??0)+1}:{})}};
  const feet=use.kind==='connection'?state.telepathyRange+10*use.roll:failedSave?(use.mode==='free'?5:5*use.roll):0;
  const notes=use.kind==='connection'?`Telepathy range ${feet} ft for 1 hour. ${cost?'Spent 1 die.':'First extension after Long Rest: no die spent.'}`:
    `${failedSave?'Failed STR save':'Passed STR save'}: ${feet} ft movement. ${cost?'Spent 1 die.':'No die spent.'} Move straight toward or away from you; Large or smaller, within 30 ft.`;
  return {patch,cost,feet,notes};
}
