import {psionProgression,type PsionicClassState} from './psionProgression';
import {validPsionicRoll,psionicRollNote,type PsionicRollEnhancement} from './psionicEnhancedRoll';
import {psionicPoolRemaining,psionicDieSides} from './psionicRestoration';
export interface PsionicPowerCharacter extends PsionicClassState {
  class_resources?:Record<string,unknown>|null; feature_uses?:Record<string,number>|null;
}
export type PsionicPowerUse = ({kind:'propel';mode:'free'|'powered'|'technique';roll:number} | {kind:'connection';roll:number;free:boolean}) & PsionicRollEnhancement;
export const CONNECTION_USE='Telepathic Connection';
export function psionicPowerState(c:PsionicPowerCharacter) {
  const progression=psionProgression(c),level=progression?.level??0;
  const raw=c.class_resources?.['psionic-energy-dice'];
  const remaining=psionicPoolRemaining(level,raw);
  return {valid:!!progression&&remaining!==null,level,dice:remaining??0,
    sides:psionicDieSides(level),
    connectionFree:!(c.feature_uses?.[CONNECTION_USE]),
    telepathyRange:progression?.subclass==='Telepath'&&level>=6?60:30,
    technique:progression?.subclass==='Psykinetic'&&level>=3};
}
/** v2.748 — settle against current resources, never a pool captured before a save. */
export function resolvePsionicPower(c:PsionicPowerCharacter,use:PsionicPowerUse,failedSave?:boolean) {
  const state=psionicPowerState(c);
  if(!state.valid)return null;
  const isTechnique=use.kind==='propel'&&use.mode==='technique';
  const rolls=use.kind==='connection'||use.mode!=='free';
  if(rolls&&(isTechnique?(!Number.isInteger(use.roll)||use.roll<1||use.roll>4):!validPsionicRoll(state.level,use.roll,use)))return null;
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
  return {patch,cost,feet,notes:notes+' '+psionicRollNote(use.roll,use)};
}
