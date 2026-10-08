import type {Character,SpellData} from '../types';
import type {ConcentrationCastSource} from '../rules/concentrationCasting';
export interface SpellDeclarationRequest {
 castId:string;characterId:string;userId:string;participantId:string;campaignId:string;
 spellId:string;spellName:string;slotLevel:number;
 expectedSlot:{total:number;used:number}|null;
 context:{spellLevel:number;source:string;ability:ConcentrationCastSource['ability'];target:string;isBonusAction:boolean;range:string;duration:string};
}
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const text=(value:unknown,max:number):value is string=>typeof value==='string'&&value.length<=max;
/** Validate disk data before using it as an action. Corrupt requests stay visible
 * as an error; they must not silently disappear and unlock a second payment. */
export function isSpellDeclarationRequest(value:unknown):value is SpellDeclarationRequest{
 if(!value||typeof value!=='object')return false;
 const r=value as Partial<SpellDeclarationRequest>,c=r.context;
 if(!uuid(r.castId)||!uuid(r.characterId)||!uuid(r.userId)||!uuid(r.participantId)||!uuid(r.campaignId)
  ||!text(r.spellId,160)||!r.spellId||!text(r.spellName,160)||!r.spellName
  ||!Number.isInteger(r.slotLevel)||r.slotLevel!<0||r.slotLevel!>9||!c||typeof c!=='object'
  ||!Number.isInteger(c.spellLevel)||c.spellLevel<0||c.spellLevel>9||r.slotLevel!<c.spellLevel
  ||!text(c.source,160)||!(/^(grant:)?class:[A-Za-z][A-Za-z -]*$/.test(c.source)||['species','grant:species','feat','other'].includes(c.source))
  ||!['intelligence','wisdom','charisma'].includes(c.ability)||!text(c.target,300)||typeof c.isBonusAction!=='boolean'
  ||!text(c.range,500)||!text(c.duration,500))return false;
 if(c.spellLevel===0)return r.slotLevel===0&&r.expectedSlot===null;
 const slot=r.expectedSlot;
 return !!slot&&Number.isInteger(slot.total)&&Number.isInteger(slot.used)&&slot.total>0&&slot.used>=0&&slot.used<slot.total;
}
/** v2.804 — capture the exact paid intent, including the selected source, before
 * awaiting saves/network. JSON cloning prevents a later optimistic edit rebasing it. */
export function createSpellDeclarationRequest(character:Character,spell:SpellData,participantId:string,userId:string,slotLevel:number,source:ConcentrationCastSource,target:string,castId=crypto.randomUUID()):SpellDeclarationRequest{
 const request:SpellDeclarationRequest={castId,characterId:character.id,userId,participantId,campaignId:character.campaign_id??'',
  spellId:spell.id,spellName:spell.name,slotLevel,expectedSlot:slotLevel===0?null:character.spell_slots[slotLevel]??null,
  context:{spellLevel:spell.level,source:source.source,ability:source.ability,target,isBonusAction:/bonus action/i.test(spell.casting_time),range:spell.range,duration:spell.duration}};
 if(!isSpellDeclarationRequest(request))throw new Error('Review the casting source and available spell slot before declaring.');
 return JSON.parse(JSON.stringify(request)) as SpellDeclarationRequest;
}
