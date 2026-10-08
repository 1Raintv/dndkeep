import {Suspense,useState} from 'react';
import type {Character,SpellData} from '../../types';
import type {ConcentrationCastSource} from '../../rules/concentrationCasting';
import {lazyWithRetry as lazy} from '../../lib/lazyWithRetry';
import {SUMMON_TOKEN_SPELLS,placeSummonToken} from '../../lib/summonTokens';
import {AURA_SPELLS} from '../../lib/auras';
import {BUFF_SPELL_REGISTRY} from '../../lib/buffs';
import {log} from '../../lib/log';
import SummonFormPickerModal from './SummonFormPickerModal';
const AuraCastModal=lazy(()=>import('./AuraCastModal'));
const BuffTargetPickerModal=lazy(()=>import('../Combat/BuffTargetPickerModal'));
interface Props {spell:SpellData;character:Character;campaignId?:string|null;casting:ConcentrationCastSource;saveDC:number;
 onConcentrationCast?:(slotLevel?:number,source?:ConcentrationCastSource)=>void}
/** v2.804: the ordinary cast and recovered declaration share effect choices.
 * Their host remains mounted independently of the pre-cast status dialog. */
export function useSpellEffects({spell,character,campaignId,casting,saveDC,onConcentrationCast}:Props){
 const isCantrip=spell.level===0;
 // v2.34.2: flash "Cast!" on the button for ~900ms after firing so users see confirmation
 const [recentlyCast, setRecentlyCast] = useState<string | null>(null);
 // v2.115.0 — Phase H pt 6: open target picker after casting a registry
 // buff spell (Bless, Hunter's Mark, Hex, Divine Favor) while in combat.
 const [buffPickerOpen, setBuffPickerOpen] = useState(false);
 // v2.615.0 — creature-summon form picker (Find Familiar): holds the
 // spell id whose spec.creature.forms the modal should list.
 const [summonFormPickerFor, setSummonFormPickerFor] = useState<string | null>(null);
 // v2.607.0 — slot level captured at cast time so the buff picker can
 // scale slot-dependent buffs (Armor of Agathys 5×slot).
 const [buffPickerSlot, setBuffPickerSlot] = useState<number | undefined>(undefined);
 // v2.635.0 — aura cast modal (Spirit Guardians). Holds the slot the
 // spell was cast at so the AuraSpec scales its dice; null = closed.
 const [auraCastSlot, setAuraCastSlot] = useState<number | null>(null);
 function flashCast(slotLevel: number) {
 // v2.84.0: Flash is now more prominent + longer. Was a pastel green tint
 // for 900ms; now solid green background (matches Psion "Used!" styling)
 // for 1800ms so the feedback is unmissable — users were clicking Cast
 // and wondering if anything happened.
 const label = isCantrip ? 'Cast!' : `Cast Lvl ${slotLevel} ✓`;
 setRecentlyCast(label);
 window.setTimeout(() => setRecentlyCast(curr => curr === label ? null : curr), 1800);
 // v2.37.0: if this spell requires concentration, notify the parent so it can
 // set character.concentration_spell. Fires for cantrips + leveled alike.
 if (spell.concentration) {
 onConcentrationCast?.(isCantrip ? undefined : slotLevel,{source:casting.source,ability:casting.ability});
 }
 // v2.115.0 — Phase H pt 6: auto-open the buff target picker if this spell
 // is in the registry AND we have a campaign context. The modal itself
 // checks for active-encounter and resolves caster participant id —
 // silently no-ops if no encounter is active.
 const registryEntry = BUFF_SPELL_REGISTRY[spell.name.trim().toLowerCase()];
 if (registryEntry && campaignId) {
 setBuffPickerSlot(isCantrip ? undefined : slotLevel);
 setBuffPickerOpen(true);
 }
 // v2.599.0 — summon token on cast (automation arc ship 3). For
 // registered summon spells (Flaming Sphere, Spiritual Weapon, ...)
 // with a campaign context, drop a labeled effect token next to the
 // caster on the live battle map. Fire-and-forget: a missing scene
 // or RLS denial degrades silently (result logged), never blocking
 // the cast itself.
 // v2.635.0 — aura spells (Spirit Guardians). Opens the Emanation
 // modal so the player can designate unaffected creatures and pick
 // the damage type, both cast-time choices per RAW. The modal
 // resolves the active encounter itself and closes silently when
 // there isn't one, so no combat check is needed here.
 if (campaignId && AURA_SPELLS[spell.id]) {
 setAuraCastSlot(isCantrip ? spell.level : slotLevel);
 }
 if (campaignId && SUMMON_TOKEN_SPELLS[spell.id]) {
 const summonSpec = SUMMON_TOKEN_SPELLS[spell.id];
 if (summonSpec.creature) {
 // v2.615.0 — Phase B1: creature-backed summons (Find Familiar)
 // need a form choice first. The modal lists ONLY the spell's
 // RAW-allowed forms; placement happens on pick.
 setSummonFormPickerFor(spell.id);
 } else {
 placeSummonToken({
 campaignId,
 casterCharacterId: character.id,
 casterName: character.name,
 spellId: spell.id,
 }).then(res => {
 if (res !== 'placed') log.info('Summon token not placed',{result:res,spellId:spell.id});
 });
 }
 }
 }

 const postCastChoices=<Suspense fallback={null}>
 {summonFormPickerFor && campaignId && SUMMON_TOKEN_SPELLS[summonFormPickerFor]?.creature && (
 <SummonFormPickerModal
 title={`${SUMMON_TOKEN_SPELLS[summonFormPickerFor].label} — choose a form`}
 formIds={SUMMON_TOKEN_SPELLS[summonFormPickerFor]!.creature!.forms}
 onPick={(monsterId) => {
 placeSummonToken({
 campaignId,
 casterCharacterId: character.id,
 casterName: character.name,
 spellId: summonFormPickerFor,
 monsterId,
 }).then(res => {
 if (res !== 'placed') log.info('Creature summon not placed',{result:res,spellId:summonFormPickerFor});
 });
 }}
 onClose={() => setSummonFormPickerFor(null)}
 />
 )}
 {auraCastSlot !== null && campaignId && AURA_SPELLS[spell.id] && (
 <AuraCastModal
 campaignId={campaignId}
 casterCharacterId={character.id}
 spellId={spell.id}
 saveDC={saveDC}
 slotLevel={auraCastSlot}
 onClose={() => setAuraCastSlot(null)}
 />
 )}
 {buffPickerOpen && campaignId && (
 <BuffTargetPickerModal
 campaignId={campaignId}
 casterCharacterId={character.id}
 spellName={spell.name}
 castSlotLevel={buffPickerSlot}
 onClose={() => setBuffPickerOpen(false)}
 />
 )}
 </Suspense>;
 return {flashCast,recentlyCast,postCastChoices,choicesOpen:buffPickerOpen||summonFormPickerFor!==null||auraCastSlot!==null};
}
