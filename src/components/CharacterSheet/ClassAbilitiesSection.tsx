import {psionFeatureCharacter} from '../../lib/psionFeatureCharacter';
import {payPsionicEnergy} from './_shared/payPsionicEnergy';
import {useModal} from '../shared/Modal';
import type {EnergyRequest,PsionicEnhancementPersistence} from '../../lib/api/psionicTurns';
import {useOptimisticCharacterRef} from '../../lib/hooks/useOptimisticCharacterRef';
import PsionicDieRollButton from './_shared/PsionicDieRollButton';
import DestructiveThoughtsButton from './_shared/DestructiveThoughtsButton';
import BiofeedbackButton from './_shared/BiofeedbackButton';
import { psionicPoolRemaining } from '../../rules/psionicRestoration';
import ConditionalPsionicButton from './_shared/ConditionalPsionicButton';
import { canUseClassAbility } from '../../rules/classAbilityEligibility';
import { useState, useRef, useEffect, Fragment, Suspense } from 'react';
// Chunk-retry lazy (v2.330) — same swap App.tsx uses; see lazyWithRetry.ts.
import { lazyWithRetry as lazy } from '../../lib/lazyWithRetry';

import type { Character, Campaign } from '../../types';
import { CLASS_COMBAT_ABILITIES, type ClassAbility, type SaveSpec } from '../../data/classAbilities';
import { findDiscipline } from '../../data/psionDisciplines';
import { SPECIES } from '../../data/species';
import { formatRange } from '../../lib/formatRange';
import { logAction } from '../shared/ActionLog';
import { useToast } from '../shared/Toast';
import { computeStats, classSaveDC } from '../../lib/gameUtils';
// v2.443.0 — Lazy-load the resolve modal. The helper (formatOutcomesLog)
// and types come from src/lib/classAbilityOutcomes so the parent
// can call them without dragging the modal into first paint.
const ClassAbilityResolveModal = lazy(() => import('../Combat/ClassAbilityResolveModal'));
import { formatOutcomesLog, type TargetOutcome } from '../../lib/classAbilityOutcomes';
import { supabase } from '../../lib/supabase';
import SlotBoxes, { PALETTE_TEAL, PALETTE_PSI, type SlotBoxesPalette } from './_shared/SlotBoxes';
import PsionicDicePool from './_shared/PsionicDicePool';
import PsionicPowerButton from './_shared/PsionicPowerButton';
import PropelControls from './_shared/PropelControls';
import TeleporterCombatControls from './_shared/TeleporterCombatControls';
import ManualPropelResolution from './_shared/ManualPropelResolution';
import {resolvePsionicPower,type PsionicPowerUse} from '../../rules/psionicPowers';
import PsionicRestorationButton from './_shared/PsionicRestorationButton';
import {psionicDieSides} from '../../rules/psionicRestoration';

interface Props {
 persistence?:PsionicEnhancementPersistence;
 character: Character;
 combatFilter: 'all' | 'action' | 'bonus' | 'reaction' | 'limited';
 onUpdate: (u: Partial<Character>) => void;
 userId?: string;
 campaignId?: string | null;
 // v2.247.0 — full Campaign object enables willing-fail automation
 // resolution in the save resolver modal. Optional so older callers
 // (solo character pages, share view) still compile; the modal just
 // falls back to the registry default when campaign is null.
 campaign?: Campaign | null;
}

const ACTION_LABELS: Record<string, string> = {
 action: ' Action',
 bonus: ' Bonus',
 reaction: ' Reaction',
 special: '⬡ Special',
 free: 'Free',
};

const ACTION_COLORS: Record<string, string> = {
 action: '#60a5fa',
 bonus: '#fbbf24',
 reaction: '#34d399',
 special: '#c084fc',
 free: 'var(--t-3)',
};

// v2.246.0 — Save chip resolver. Returns the numeric DC for an ability
// save spec, falling through to the character's spell save DC when the
// spec sets `dc: 'spell'`. Returns null if the ability is save-less or
// the character isn't a spellcaster (then the chip is hidden — better
// than showing "DC ?"). Pure function so it can be reused by the v2.247
// target picker.
function resolveSaveDC(save: SaveSpec | undefined, character: Character): number | null {
 if (!save) return null;
 if (typeof save.dc === 'number') return save.dc;
 // v2.554.0 — class-feature DC: 8 + PB + ability mod (no spellcasting needed).
 if (typeof save.dc === 'object' && 'classAbility' in save.dc) {
  return classSaveDC(character, save.dc.classAbility);
 }
 // 'spell' — derive from the character's spellcasting class.
 const computed = computeStats(character);
 return computed.spell_save_dc ?? null;
}

// v2.324.0 — T3 limited-use refactor: UseTracker now wraps the shared
// SlotBoxes primitive (purple PSI for psionic uses, teal for once-per-rest,
// gold default). The previous design had two modes (>8 = ±1 stepper, ≤8 =
// raw chiclet rail). T3 spec drops the ±1 stepper entirely — even at 12
// uses, the user clicks individual boxes. SlotBoxes handles size scaling
// (sm 12×12 when max > 8 to keep the row narrow; md 16×16 otherwise for
// thumb-tap comfort).
function UseTracker({ abilityName, max, rest, recovery, character, onUpdate, palette, onUseChange }: {
 abilityName: string; max: number; rest?: 'short' | 'long';
 recovery?: 'movement';
 character: Character; onUpdate: (u: Partial<Character>) => void;
 palette?: SlotBoxesPalette;
 onUseChange?: (isExpending: boolean) => void;
}) {
 const uses = ((character.feature_uses as Record<string, number>) ?? {})[abilityName] ?? 0;

 function handleToggle(_idx: number, isExpending: boolean) {
  if(onUseChange){onUseChange(isExpending);return;}
  const next = isExpending ? uses + 1 : uses - 1;
  const clamped = Math.min(max, Math.max(0, next));
  onUpdate({
   feature_uses: { ...((character.feature_uses as Record<string, number>) ?? {}), [abilityName]: clamped }
  });
 }

 // Default palette for rest-based features is teal; callers may override
 // (e.g. psionic disciplines pass PALETTE_PSI).
 const pal = palette ?? PALETTE_TEAL;
 const size = max > 8 ? 'sm' : 'md';
 // v2.506.0 — recovery label generalized. 'movement'-recovery features
 // (Feline Agility) describe the auto-reset condition; rest features
 // keep their Short/Long Rest wording.
 const recoverWord = recovery === 'movement'
  ? 'moving 0 ft on a turn'
  : rest === 'short' ? 'Short Rest'
  : 'Long Rest';

 return (
  <SlotBoxes
   total={max}
   used={uses}
   onToggle={handleToggle}
   size={size}
   palette={pal}
   ariaLabel={`${abilityName} uses`}
   ariaLabelPrefix={`${abilityName} use`}
   title={(_, available) =>
    available
     ? `Use ${abilityName} (recovers on ${recoverWord})`
     : `Restore use (recovers on ${recoverWord})`
   }
  />
 );
}

function getMaxUses(ability: ClassAbility, character: Character): number | undefined {
 if (ability.maxUsesFn) {
 const val = ability.maxUsesFn(character);
 if (val === 999) return undefined; // unlimited
 return val;
 }
 // v2.376.0 — fall back to flat maxUses (used by species traits like
 // Healing Hands, Large Form). Returns undefined for unlimited.
 if (typeof ability.maxUses === 'number') {
 return ability.maxUses;
 }
 return undefined;
}

// Resolve dynamic values in descriptions
function getPsionicDieSize(level: number): string { return `d${psionicDieSides(level)}`; }


function resolveDesc(desc: string | ((c: Character) => string), character: Character): string {
 const raw = typeof desc === 'function' ? desc(character) : desc;
 return raw.replace('{{sneak_dice}}', String(Math.ceil(character.level / 2)));
}

export default function ClassAbilitiesSection(props:Props) {
 const secondaryPsion=props.character.class_name==='Psion'?null:psionFeatureCharacter(props.character);
 return <><ClassAbilityRows {...props}/>{secondaryPsion&&<ClassAbilityRows {...props} character={secondaryPsion} resourceCharacter={props.character} includeSpecies={false}/>}</>;
}
function ClassAbilityRows({ persistence, character, combatFilter, onUpdate, userId, campaignId, campaign, includeSpecies=true, resourceCharacter=character }: Props & {includeSpecies?:boolean;resourceCharacter?:Character}) {
 const { showToast } = useToast();
 const paymentModal=useModal(),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const [justUsed, setJustUsed] = useState<string | null>(null);
 const [psionicRollHistory, setPsionicRollHistory] = useState<{ value: number; die: string }[]>([]);
 // v2.80.0: which ability card is expanded (click chevron to open detail panel)
 const [expandedAbility, setExpandedAbility] = useState<string | null>(null);
 // v2.247.0 — save resolver modal. Holds the ability + computed DC at
 // the time of the click so the modal renders consistent values even
 // if the character's stats change while it's open. cost is the
 // `cost` argument forwarded into finalizeUse so the existing
 // tracker-deduction path runs identically after the modal confirms.
 const [manualPropel,setManualPropel]=useState<ClassAbility|null>(null);
 // v2.765 — deduplicate the same resolution, not unrelated powers while logs save.
 const settledPowerUses=useRef(new WeakSet<PsionicPowerUse>());
 const livePowerCharacter=useOptimisticCharacterRef(character);
 const [resolveModal, setResolveModal] = useState<{
 ability: ClassAbility; saveDC: number; cost?: number;
 } | null>(null);

 const pendingResourceUses=useRef(new Set<string>());
 async function payResource(operation:EnergyRequest['operation'],count:number,sourceFeature:string){
  const id=livePowerCharacter.current.id,key=id+':'+sourceFeature;
  if(pendingResourceUses.current.has(key))return null;
  pendingResourceUses.current.add(key);
  try{return await payPsionicEnergy(persistence,livePowerCharacter,{requestId:crypto.randomUUID(),operation,count,rolls:[],sourceFeature,recoveryNote:'Resource use recorded. Check History before resolving the feature; do not spend again.'},
   {active:()=>mounted.current&&livePowerCharacter.current.id===id,confirm:paymentModal.confirm,warn:message=>showToast(message,'warn')});}
  finally{pendingResourceUses.current.delete(key);}
 }

 // v2.190.0 — Phase Q.0 pt 31: refresh a depleted once-per-rest feature
 // by spending Psionic Energy Dice. The "Restore (N PED)" button only
 // renders when the feature is depleted AND the pool has enough dice
 // (see button render around the Use button). This handler does both
 // the deduction and the feature_uses decrement in one update, then
 // logs to the action log so the DM + party see it.
 async function restoreUseFromPed(ability: ClassAbility) {
 if (!canUseClassAbility(ability, character)) return;
 const restoreCost = (ability as any).pedRestoreCost as number | undefined;
 if (typeof restoreCost !== 'number' || restoreCost <= 0) return;
 const resources = (character.class_resources as Record<string, number> | null) ?? {};
 // v2.368.0 — When class_resources['psionic-energy-dice'] is undefined
 // (newly-created Psion who hasn't spent yet), the pre-v2.368 fallback
 // `?? 0` made this think the pool was empty even though chiclets
 // showed full from getPsionicDieCount fallback. User-reported bug:
 // "Free Misty Step doesn't refund like it should." Fix: fall back to
 // getPsionicDieCount(level), matching the chiclet display source.
 const currentDice = psionicPoolRemaining(character.level,resources['psionic-energy-dice']) ?? 0;
 if (currentDice < restoreCost) {
 showToast(`Not enough Psionic Energy Dice. Need ${restoreCost}, have ${currentDice}.`, 'warn');
 return;
 }
 const fu = ((character.feature_uses as Record<string, number>) ?? {});
 const used = fu[ability.name] ?? 0;
 if (used <= 0) return; // nothing to restore
 if(!await payResource('refresh-misty-step',restoreCost,ability.name))return;
 setJustUsed(`restore:${ability.name}`);
 setTimeout(() => setJustUsed(curr => curr === `restore:${ability.name}` ? null : curr), 1800);
 }

 // v2.247.0 — Use button entry. For save-bearing abilities (`save?`
 // present) AND an active campaign, we open the save resolver modal
 // first. The modal calls finalizeAbilityUse on confirm, passing the
 // per-target outcomes. Out-of-combat (no encounter) falls through to
 // the existing direct-use path with a warning toast in the modal so
 // the player can still log the cast manually.
 //
 // Non-save abilities (and abilities without an encounter context)
 // skip the modal and run finalizeAbilityUse directly.
 async function handleUseAbility(ability: ClassAbility, cost?: number) {
 if (!canUseClassAbility(ability, character)) return;
 if (ability.save && campaignId) {
 const dc = resolveSaveDC(ability.save, character);
 if (dc != null) {
 // Probe for an active encounter. If none, fall through — class
 // abilities still need to work outside combat (Telekinesis to
 // move an object, etc.). The modal would just show "no targets"
 // which is annoying for the common out-of-combat case.
 const { data: enc } = await supabase
 .from('combat_encounters')
 .select('id')
 .eq('campaign_id', campaignId)
 .eq('status', 'active')
 .maybeSingle();
 if (enc?.id) {
 setResolveModal({ ability, saveDC: dc, cost });
 return;
 }
 }
 }
 if(ability.psionicUse?.kind==='propel'){setManualPropel(ability);return;}
 await finalizeAbilityUse(ability, cost, []);
 }

 /** v2.247.0 — Resource-deduction + log path. Called either directly
  *  by handleUseAbility (no save / no encounter) or by the save
  *  resolver modal's onConfirmed (with per-target outcomes). When
  *  outcomes are present, the log entry summarizes them via
  *  formatOutcomesLog instead of the generic "Used X" line. */
 async function finalizeAbilityUse(
 ability: ClassAbility,
 cost?: number,
 outcomes: TargetOutcome[] = [],
 ) {
 if (!canUseClassAbility(ability, character)) return;
 // v2.748: one resource patch after a resolved save; free powers never hit generic PED deduction.
 if(ability.psionicUse){
   const use=ability.psionicUse;
   if(settledPowerUses.current.has(use))return;
   if(use.kind==='propel'&&(outcomes.length!==1||outcomes[0].outcome==='pending'))return;
   const result=resolvePsionicPower(livePowerCharacter.current,use,use.kind==='propel'?outcomes[0].outcome!=='passed':undefined);
   if(!result){showToast('Resources changed. Choose the power again.','warn');return;}
   settledPowerUses.current.add(use);
   // v2.784 — the free Connection claim and any Energy Die cost settle together.
   // Free/successful Propel has no pool write that could refund a peer's spend.
   if(use.kind==='connection'||result.cost){
    const id=livePowerCharacter.current.id;
    const payment=await payPsionicEnergy(persistence,livePowerCharacter,{requestId:crypto.randomUUID(),operation:use.kind==='connection'?'connection':'spend',count:result.cost,
     rolls:[use.originalRoll??use.roll],sourceFeature:use.kind==='connection'?'Telepathic Connection':'Telekinetic Propel',
     recoveryNote:result.notes.slice(0,1000)},
     {active:()=>mounted.current&&livePowerCharacter.current.id===id,confirm:paymentModal.confirm,warn:message=>showToast(message,'warn')});
    if(!payment)return;
   }
     if(mounted.current)showToast(result.notes,'success');
     const warnLog=()=>showToast(`${ability.name} resolved, but its history could not be saved.`,'warn');
     void logAction({campaignId:campaignId??null,characterId:character.id,characterName:character.name,
       actionType:'roll',actionName:ability.name,total:use.roll,individualResults:use.roll?[use.originalRoll??use.roll,...(use.enkindledRolls??[])]:undefined,
       targetName:outcomes[0]?.participantName,notes:result.notes}).then(result=>{if(result?.error)warnLog();}).catch(warnLog);
   return;
 }
 // v2.189.0 — Phase Q.0 pt 30: explicit Psionic Energy Die cost gate.
 // Abilities with `pedCost: N` (Warp Space=1, Mass Teleport=4, etc.)
 // require N dice in the pool; insufficient pool aborts with an alert
 // rather than silently deducting and going negative. Pool deduction
 // happens here in one shot rather than in the legacy isPool branch
 // below (which always deducted exactly 1, regardless of cost).
 const pedCost = (ability as any).pedCost as number | undefined;
 if (typeof pedCost === 'number' && pedCost > 0) {
 const resources = (character.class_resources as Record<string, number> | null) ?? {};
 // v2.368.0 — same uninit fix as restoreUseFromPed: when the pool
 // hasn't been materialized yet, fall back to getPsionicDieCount
 // (matches the chiclet display source) instead of 0. Pre-v2.368
 // a fresh Psion clicking Cast on Warp Space / Mass Teleport /
 // Duplicitous Target hit "Need N, have 0" toast because the
 // resource key was undefined.
 const currentDice = psionicPoolRemaining(character.level,resources['psionic-energy-dice']) ?? 0;
 if (currentDice < pedCost) {
 // Insufficient pool — bail before logging or flashing.
 showToast(`Not enough Psionic Energy Dice. Need ${pedCost}, have ${currentDice}.`, 'warn');
 return;
 }
 if(!await payResource('spend',pedCost,ability.name))return;
 }

 // Mark as used if it has limited uses
 // v2.370.0 — Skip the feature_uses write for the PED pool row.
 // For pool rows (Psionic Energy Dice itself, plus any future
 // isPool-typed pool tracker), the source of truth is class_resources.
 // Writing feature_uses alongside is dead data — the chiclet display
 // ignores it — and risks downstream confusion (long-rest reset
 // logic, history events, etc.). Pre-v2.370 every Spend Die click
 // wrote feature_uses['Psionic Energy Dice']++ in addition to
 // decrementing the pool, which is the suspected cause of the
 // reported "first die spent gets refunded" bug. Per-feature
 // limited-use rows (Free Misty Step, Action Surge, etc.) still
 // write feature_uses since that IS their tracker.
 if(ability.name==='Free Misty Step (Teleportation)'){
  if(!await payResource('use-misty-step',0,ability.name))return;
 } else if (cost !== undefined && !((ability as any).isPool && (ability as any).psionicDie)) {
 const current = ((character.feature_uses as Record<string, number>) ?? {})[ability.name] ?? 0;
 onUpdate({
 feature_uses: { ...((character.feature_uses as Record<string, number>) ?? {}), [ability.name]: current + 1 }
 });
 }
 // v2.780 — raw Energy Die rolls now live in PsionicDieRollButton.
 // Other classes' ambient pool rows must not deduct Psionic Energy Dice.
 // Resolve description (may be a function)
 const desc = resolveDesc((ability as any).description ?? '', character);
 // v2.247.0 — when outcomes are present, the log notes summarize the
 // per-target save resolution (formatOutcomesLog) instead of the
 // truncated description. The description is still available in the
 // ability card for anyone who wants the full text.
 const saveDC = ability.save ? resolveSaveDC(ability.save, character) : null;
 const outcomeNote = (outcomes.length > 0 && ability.save && saveDC != null)
 ? formatOutcomesLog(ability.name, saveDC, ability.save.ability, outcomes)
 : null;
 // Log to action log
 await logAction({
 campaignId: campaignId ?? null,
 characterId: character.id,
 characterName: character.name,
 actionType: ability.actionType === 'action' ? 'spell' :
 ability.actionType === 'bonus' ? 'spell' :
 ability.actionType === 'reaction' ? 'save' : 'roll',
 actionName: `Used ${ability.name}`,
 notes: outcomeNote ?? (desc.slice(0, 100) + (desc.length > 100 ? '…' : '')),
 });
 // Brief flash feedback
 setJustUsed(ability.name);
 setTimeout(() => setJustUsed(null), 2000);
 }
 const abilities = CLASS_COMBAT_ABILITIES[character.class_name] ?? [];

 // Inject active/both psychic disciplines as usable abilities
 const disciplineAbilities: ClassAbility[] = [];
 if (character.class_name === 'Psion') {
 const chosen: string[] = Array.isArray((character.class_resources as any)?.['psion-disciplines'])
 ? (character.class_resources as any)['psion-disciplines'] as string[]
 : [];
 for (const id of chosen) {
 const disc = findDiscipline(id);
 if (!disc || disc.type === 'passive') continue;
 disciplineAbilities.push({
 name: disc.name,
 actionType: disc.actionType ?? 'action',
 description: disc.description,
 minLevel: 2,
 isPool: true,
 rest: 'long',
 // Mark as psionic die cost
 ...(disc.dieCost ? { psionicDie: true } : {}),
 } as any);
 }
 }
 const allAbilities = [...abilities, ...disciplineAbilities];
 // Warp is a modifier of Propel, not an independent special action. Keep the
 // two choices adjacent even when the source table or action filters change.
 const warpIndex=allAbilities.findIndex(a=>a.name==='Warp Propel');
 if(warpIndex>=0){const [warp]=allAbilities.splice(warpIndex,1);const propelIndex=allAbilities.findIndex(a=>a.name==='Telekinetic Propel');allAbilities.splice(propelIndex<0?allAbilities.length:propelIndex+1,0,warp);}

 // v2.674.0 — disciplines get their own sub-header INSIDE the row list,
 // the same way species traits do. It used to render above the whole
 // list, so it labelled Psionic Energy Dice and Telekinetic Propel
 // instead of the disciplines six rows below — invisible until the
 // id/name fix let a discipline row exist at all.
 const disciplineNameSet = new Set(disciplineAbilities.map(d => d.name));

 // v2.376.0 — Surface species traits with an explicit actionType as
 // clickable rows in the Actions tab. Pre-v2.376 Cat's Claws, Healing
 // Hands, Stone's Endurance, Breath Weapon, Large Form, Feline Agility
 // etc. only existed in the Features tab — players had to track them
 // mentally during combat. Now they render as ClassAbility-shaped rows
 // here. Passive traits (Darkvision, Brave, Fey Ancestry) have no
 // actionType so they're correctly excluded.
 const speciesAbilities: ClassAbility[] = [];
 const speciesData = SPECIES.find(s => s.name === character.species);
 if (includeSpecies && speciesData) {
 for (const trait of speciesData.traits) {
 const t = trait as any;
 // Only traits with explicit actionType get surfaced. Passive
 // traits (Darkvision, Brave, etc.) lack actionType and stay
 // in the Features tab.
 if (!t.actionType) continue;
 speciesAbilities.push({
 name: trait.name,
 actionType: t.actionType,
 description: trait.description,
 // v2.510.0 — most species traits are available from level 1, but a
 // few have RAW level gates. Goliath's Large Form is 5th-level. This
 // gate previously lived in the now-removed duplicate SPECIES block
 // in index.tsx; carrying it here preserves correct behavior now that
 // this is the single species-ability surface.
 minLevel: trait.name === 'Large Form' ? 5 : 1,
 ...(typeof t.maxUses === 'number' ? { maxUses: t.maxUses } : {}),
 ...(t.rest ? { rest: t.rest } : {}),
 ...(t.recovery ? { recovery: t.recovery } : {}),
 ...(t.range ? { range: t.range } : {}),
 } as any);
 }
 }
 const speciesAbilitySet = new Set(speciesAbilities.map(a => a.name));
 const allAbilitiesWithSpecies = [...allAbilities, ...speciesAbilities];

 // Filter by level and action type
 const filtered = allAbilitiesWithSpecies.filter(a => {
 if (!canUseClassAbility(a, character)) return false;
 if (combatFilter === 'limited') return a.maxUsesFn !== undefined || typeof a.maxUses === 'number' || (a as any).isPool === true || (a as any).psionicDie === true;
 if (combatFilter === 'all') return true;
 if (combatFilter === 'action') return a.actionType === 'action';
 if (combatFilter === 'bonus') return a.actionType === 'bonus';
 if (combatFilter === 'reaction') return a.actionType === 'reaction';
 return true;
 });

 if (filtered.length === 0) return null;

 // v2.376.0 — Hide the class section header if only species rows
 // are rendering (e.g. a level-1 Fighter with Cat's Claws and no
 // class abilities surfaced yet). Avoids misleading "Fighter
 // Abilities" header above what are actually species rows.
 const filteredHasClassAbility = filtered.some(a => !speciesAbilitySet.has(a.name));

 return (
 <>
 <div style={{ marginTop: 'var(--sp-3)' }}>
 {filteredHasClassAbility && (
 <div style={{
 fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700,
 letterSpacing: '0.12em', textTransform: 'uppercase' as const,
 color: '#a78bfa', marginBottom: 8,
 }}>
 {character.class_name} Abilities
 </div>
 )}

 {/* v2.501.0 — Column-header strip. Switched from the 11-column
     SpellsTab template to the 8-column Actions-tab spell template
     (`70px 3px 1fr 46px 70px 74px 16px 170px`) so Psion abilities
     line up with the spell rows that sit directly above/below them
     IN THE ACTIONS TAB (where this section renders). Pre-v2.501 this
     used the wider SpellsTab grid, which visually disagreed with the
     Actions-tab spell rows. Headers match the Actions-tab spell
     header at index.tsx:3665 exactly. */}
 {filtered.length > 0 && (
 <div className="arow-grid arow-head" style={{
 padding: '0 10px 4px',
 marginBottom: 2,
 }}>
 {['', '', 'NAME', 'TIME', 'RANGE', 'HIT / DC', '', ''].map((h, i) => (
 <span key={i} style={{
 fontFamily: 'var(--ff-body)', fontSize: 7, fontWeight: 700,
 letterSpacing: '0.12em', textTransform: 'uppercase' as const,
 color: 'var(--t-3)',
 }}>{h}</span>
 ))}
 </div>
 )}
 <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
 {filtered.map((ability, idx) => {
 const maxUses = getMaxUses(ability, character);
 const acColor = ACTION_COLORS[ability.actionType] ?? 'var(--t-3)';
 const descShort = resolveDesc(ability.description, character);
 const descLong = (ability as any).descriptionLong
 ? resolveDesc((ability as any).descriptionLong, character)
 : null;
 const isExpanded = expandedAbility === ability.name;
 const conditionalDiscipline=disciplineNameSet.has(ability.name)?findDiscipline(ability.name):undefined;
 // v2.376.0 — inject a SPECIES sub-header right before the
 // first species-sourced row so they're visually separated from
 // class abilities. speciesAbilitySet is built earlier from the
 // species traits we injected; we only need to detect the
 // FIRST species row in the filtered list (any earlier filtered
 // entries with the same name would be class-sourced, which can't
 // happen because species traits don't share names with class
 // abilities, but the idx === first-species-index check is still
 // the cleanest way to guarantee one header).
 const isFirstSpecies = speciesAbilitySet.has(ability.name) &&
 !filtered.slice(0, idx).some(a => speciesAbilitySet.has(a.name));
 const isFirstDiscipline = disciplineNameSet.has(ability.name) &&
 !filtered.slice(0, idx).some(a => disciplineNameSet.has(a.name));

 return (
 <Fragment key={ability.name}>
 {isFirstDiscipline && (
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
 textTransform: 'uppercase' as const, color: '#c084fc', marginBottom: 2, marginTop: 6 }}>
 Psychic Disciplines
 </div>
 )}
 {isFirstSpecies && (
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
 textTransform: 'uppercase' as const, color: '#fb923c', marginBottom: 2, marginTop: 6 }}>
 Species Abilities
 </div>
 )}
 <div
 style={{
 // v2.238.0 — wrapper now mirrors the regular spell-row wrapper:
 // single thin border that recolors on expand, no left-only accent
 // stripe (the stripe moved INSIDE the row as grid col 1, matching
 // the spell rows below). Background tint flips on expand using
 // the action-type color, the same way spell rows tint by school.
 background: isExpanded ? `${acColor}08` : 'var(--c-surface)',
 border: `1px solid ${isExpanded ? `${acColor}45` : `${acColor}25`}`,
 borderRadius: 'var(--r-md)',
 overflow: 'hidden',
 transition: 'all 0.15s',
 }}
 >
 {/* v2.238.0 — Row converted from flex to the same 8-column grid
     used by the regular spell rows below
     (`70px 3px 1fr 46px 70px 74px 16px 170px`). Mapping:
       Col 0: action-type badge (replaces "Lvl 2" badge)
       Col 1: 3px color stripe (action color, same as school stripe)
       Col 2: name + concentration-style chip + subtitle line
              (recovery + tracker chiclets if any)
       Col 3: empty
       Col 4: empty
       Col 5: PED cost OR last-rolled PED value chip
       Col 6: chevron (when there's an expanded panel)
       Col 7: Use / Spend / Trigger button + optional Restore button
     The whole row is click-to-expand (matching spell rows) when an
     expanded panel exists; otherwise click is a no-op.
     The always-visible short description sits as a slim band BELOW
     the grid row — preserves the v2.86.0 UX where a player can read
     what an ability does without expanding. */}
 {(() => {
 // v2.324.0 — T3: every row is now expandable so the description
 // (moved out of the always-visible band into the expanded panel)
 // is always reachable. Roll history + stats grid still gate on
 // their own data inside the panel.
 const canExpand = true;
 const ped = (ability as any).pedCost as number | undefined;
 // v2.324.0 — T3: button text "Cast" replaces "Use" for the default
 // case. PED-cost abilities become "Cast (N PED)". Reactions remain
 // "Trigger" (semantically distinct — the player isn't initiating).
 // Pure die-spend rows keep "Spend Die (1dN)" since they roll, not cast.
 const restingLabel =
 typeof ped === 'number' && ped > 0 ? `Cast (${ped} PED)` :
 ability.actionType === 'reaction' ? 'Trigger' :
 (ability as any).psionicDie ? `Spend Die (1${getPsionicDieSize(character.level)})` :
 (ability as any).isPool ? 'Spend Die' :
 // v2.506.0 — movement-gated features (Feline Agility) read "Use":
 // you're activating a speed burst, not casting a spell.
 (ability as any).recovery === 'movement' ? 'Use' : 'Cast';
 const isFlashing = justUsed === ability.name;
 const ACTION_BADGE_LABEL: Record<string, string> = {
 action: 'ACTION', bonus: 'BONUS', reaction: 'REACT', special: 'SPECIAL', free: 'FREE',
 };
 const actionBadge = ACTION_BADGE_LABEL[ability.actionType] ?? 'ABLY';
 // v2.501.0 — recoveryLabel + rangeStr removed: they fed the NAME-cell
 // subtitle that was deleted in this ship (recovery is conveyed by the
 // charges tracker, range has its own column). Kept the comments'
 // history but dropped the dead consts to avoid unused-var warnings.
 // v2.324.0 — T3: PED-pool ability gets a dedicated PsionicDicePool
 // tracker (purple SlotBoxes + N/max readout, sourced from the
 // class_resources['psionic-energy-dice'] number rather than
 // feature_uses, since other abilities deduct from class_resources).
 const isPedPoolRow = ability.isPool === true && (ability as any).psionicDie === true;
 // v2.324.0 — T3: psionic disciplines (injected with `psionicDie`)
 // get the purple PSI palette to visually distinguish from regular
 // long-rest features that use TEAL.
 const trackerPalette = (ability as any).psionicDie ? PALETTE_PSI : PALETTE_TEAL;

 // v2.501.0 — Switched from the 11-col SpellsTab template to the
 // 8-col Actions-tab template to match the spell rows this section
 // sits alongside in the Actions tab:
 //   LEAD(70) BAR(3) NAME(1fr) TIME(46) RANGE(70) HIT-DC(74)
 //   CHEVRON(16) BUTTONS(170)
 // The dropped columns vs the old 11-col layout:
 //   - TAGS (36px): removed entirely (the AoE/Pool chips were
 //     noise; pool state is conveyed by the charges tracker).
 //   - EFFECT (80px): PED-cost / roll chip folded into the button
 //     label ("Cast (N PED)") and the charges column.
 //   - dedicated CHARGES (110px): merged into the HIT/DC column
 //     (col 5) per DM feedback — "charges go before the cast
 //     button in the space where the hit DC would be."
 // v2.675.0 — the template itself moved to `.arow-grid` in
 // globals.css (shared verbatim with the Actions-tab spell rows, so
 // the two can't drift) and gained a stacked fallback under 640px,
 // where the 1fr NAME column used to collapse to width 0 and left
 // every ability row nameless on a phone. Each cell below wears the
 // `.arow-*` class that places it in both layouts.
 return (
 <div
 className="arow-grid"
 data-propel={ability.name==='Telekinetic Propel'||ability.name==='Warp Propel'?true:undefined}
 onClick={() => { if (canExpand) setExpandedAbility(isExpanded ? null : ability.name); }}
 style={{
 padding: '7px 10px',
 cursor: canExpand ? 'pointer' : 'default',
 minHeight: 44,
 }}
 >
 {/* Col 0: action-type badge (visual analog to "Lvl N" on spell rows) */}
 <div className="arow-lead" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
 <span style={{
 fontFamily: 'var(--ff-stat)', fontSize: 11, fontWeight: 800,
 color: acColor,
 padding: '3px 8px', borderRadius: 6,
 border: `1px solid ${acColor}45`,
 background: `${acColor}10`,
 whiteSpace: 'nowrap' as const,
 letterSpacing: '0.06em',
 }} title={`Action type: ${ability.actionType}`}>
 {actionBadge}
 </span>
 </div>

 {/* Col 1: 3px color stripe — same visual function as spell row's school bar */}
 <div className="arow-bar" style={{ background: acColor, opacity: 0.75 }} />

 {/* Col 2: name only — v2.501.0 — Subtitle removed to match the
     cleaned-up spell rows. Pre-v2.501 this cell carried a second
     line with the recovery label ("Short Rest" / "At Will" /
     "Psionic Die") plus an optional range echo. Per DM feedback
     that subtitle was congesting the row; recovery is conveyed by
     the charges tracker (col 5) and the range lives in its own
     column (col 4). Class abilities don't carry spell-style
     concentration, so unlike spell rows there's no concentration
     line to keep here — the cell is just the name. */}
 <div className="arow-name" style={{ minWidth: 0 }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'nowrap' as const, overflow: 'hidden' }}>
 <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-1)', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
 {ability.name}
 </span>
 </div>
 </div>

 {/* Col 3: TIME — v2.500.0 — Pre-v2.500 this column was empty
     because the action-type was already shown in Col 0's LEAD
     badge (ACTION / BONUS / REACT / etc.). But leaving Col 3
     blank created a visible "missing data" gap when the row was
     read next to spell rows (which fill it with "1A" / "1BA" /
     "1R"), and DMs reading both surfaces in sequence felt the
     layouts diverged.
     Now both columns render the same info in different forms:
       Col 0 (LEAD): action category as a colored badge — the
                    visual identifier you scan to know "this is a
                    bonus action ability" at a glance.
       Col 3 (TIME): the same info as the compact "1A" / "1BA" /
                    "1R" abbreviation spells use — keeps the
                    column visually populated for grid alignment.
     The short_abbr map mirrors SpellsTab.tsx:558's casting_time
     replacement chain so the abbreviations match exactly. */}
 <div className="arow-time" style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-2)', textAlign: 'center', whiteSpace: 'nowrap' as const }}>
 {(() => {
 const TIME_ABBR: Record<string, string> = {
 action:   '1A',
 bonus:    '1BA',
 reaction: '1R',
 free:     'Free',
 special:  '—',
 };
 return TIME_ABBR[ability.actionType] ?? '';
 })()}
 </div>

 {/* Col 4: RANGE — reads ability.range (e.g. "30 ft", "Self",
     "60 ft"). Empty when the ability has no spatial component
     (e.g. self-targeting Action Surge). Aligns with SpellsTab's
     RANGE column for visual consistency across both tabs. */}
 <div className="arow-range" style={{ fontSize: 10, color: 'var(--t-2)', textAlign: 'center', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
 {formatRange((ability as any).range)}
 </div>

 {/* Col 5: HIT/DC — or CHARGES when the ability has no save.
     v2.501.0 — Per DM feedback the charges tracker moves here, into
     "the space where the hit DC would be," directly before the cast
     button. Resolution for the HIT/DC-vs-charges contention:
       - If the ability forces a SAVE → show the save chip (DC X ·
         ABILITY), exactly as spell rows show their HIT/DC. Rare for
         Psion abilities; disciplines never have their own save.
       - Otherwise → show the charges tracker (PED pool for the PED
         row, UseTracker chiclets for limited-use features). This is
         the common case and is what the DM asked to see in this
         slot.
     The old separate TAGS (P/AoE chips) and EFFECT (PED-cost / roll
     chip) columns are gone — TAGS was noise, and the PED cost is now
     conveyed by the button label ("Cast (N PED)"). The last-rolled
     PED value is still reachable in the expanded panel. */}
 <div className="arow-hit" onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
 {ability.save ? (() => {
 const dc = resolveSaveDC(ability.save, character);
 if (dc == null) return null;
 const tip = [
 `DC ${dc} ${ability.save.ability} save`,
 ability.save.onFailure ? `On fail: ${ability.save.onFailure}` : '',
 ability.save.onSuccess ? `On save: ${ability.save.onSuccess}` : '',
 ].filter(Boolean).join('\n');
 return (
 <span
 title={tip}
 style={{
 display: 'inline-flex', alignItems: 'center', gap: 4,
 // v2.504.0 — font unified with the spell HIT/DC chip
 // (index.tsx Col 5: ff-stat, weight 900, size 12). Was
 // weight 800 / size 11, which read as a visibly different
 // typeface/size next to the spell rows. Now identical.
 fontFamily: 'var(--ff-stat)', fontWeight: 900, fontSize: 12,
 padding: '2px 7px', borderRadius: 999,
 background: 'rgba(167,139,250,0.12)',
 border: '1px solid rgba(167,139,250,0.4)',
 color: '#a78bfa',
 letterSpacing: '0.04em',
 whiteSpace: 'nowrap' as const,
 }}>
 <span style={{ fontSize: 8, fontWeight: 700, opacity: 0.7 }}>DC</span>
 {dc}
 <span style={{ fontSize: 9, opacity: 0.85 }}>{ability.save.ability}</span>
 </span>
 );
 })() : isPedPoolRow && maxUses !== undefined ? (() => {
 const resources = (character.class_resources as Record<string, number> | null) ?? {};
 const remaining = (resources['psionic-energy-dice'] as number | undefined) ?? maxUses;
 const used = Math.max(0, maxUses - remaining);
 return (
 <PsionicDicePool
 character={character}
 total={maxUses}
 used={used}
 persistence={persistence}
 />
 );
 })() : ability.name==='Psionic Restoration' ? <span style={{fontSize:11,color:'var(--t-3)'}}>1 / Long Rest</span> : maxUses !== undefined && (ability.rest || (ability as any).recovery) ? (
 <UseTracker
 abilityName={ability.name}
 max={maxUses}
 rest={ability.rest}
 recovery={(ability as any).recovery}
 character={character}
 onUpdate={onUpdate}
 onUseChange={character.class_name==='Psion'&&ability.name==='Free Misty Step (Teleportation)'
  ? isExpending=>{void payResource(isExpending?'use-misty-step':'recover-misty-step',0,ability.name);}:undefined}
 palette={trackerPalette}
 />
 ) : null}
 </div>

 {/* Col 6: CHEVRON — matches the Actions-tab spell layout where the
     chevron sits between HIT/DC and the button column. Only renders
     content when there's an expanded panel; the cell is always
     present so columns line up regardless. */}
 <div className="arow-chev" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
 {canExpand && (
 <span style={{ fontSize: 9, color: 'var(--t-3)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
 )}
 </div>

 {/* Col 7: BUTTONS — Use/Cast button + optional Restore button.
     Last column (170px fixed), matching the Actions-tab spell row's
     button column so Cast buttons align vertically between spells
     and abilities. v2.501.0 — the dedicated CHARGES column that
     previously sat here was merged into Col 5 (HIT/DC) per DM
     feedback; charges now render before the cast button. Click
     handlers stop propagation so they don't trigger the row-level
     expand toggle. */}
 <div className="arow-act" onClick={e => {
 const target = e.target as HTMLElement;
 if (target.closest('button')) e.stopPropagation();
 }} style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, flexWrap: 'nowrap' as const, alignItems: 'center', width: '100%' }}>
 {ability.name==='Teleporter Combat' ? <TeleporterCombatControls character={resourceCharacter} userId={userId}/> : conditionalDiscipline?.id==='destructive-thoughts' ? <DestructiveThoughtsButton persistence={persistence} character={resourceCharacter} onUpdate={onUpdate}/> : conditionalDiscipline?.id==='biofeedback' ? <BiofeedbackButton persistence={persistence} character={resourceCharacter} onUpdate={onUpdate}/> : conditionalDiscipline?.conditionalOutcome ? <ConditionalPsionicButton persistence={persistence} character={resourceCharacter} discipline={conditionalDiscipline} onUpdate={onUpdate} campaignId={campaignId}/> : (['Telekinetic Propel','Warp Propel'].includes(ability.name)) ? <PropelControls character={resourceCharacter} campaign={campaign} persistence={persistence} warp={ability.name==='Warp Propel'}/> : ability.name==='Telepathic Connection' ? <PsionicPowerButton persistence={persistence} character={character} onUpdate={onUpdate} kind="connection" onUse={async(use:PsionicPowerUse)=>{await handleUseAbility({...ability,psionicUse:use});}}/> : ability.name==='Psionic Restoration' ? <PsionicRestorationButton persistence={persistence} character={character} onUpdate={onUpdate}/> : ability.psionicDie && (conditionalDiscipline || ability.actionType !== 'free') ? <PsionicDieRollButton persistence={persistence} character={resourceCharacter} onUpdate={onUpdate} feature={ability.name} label={conditionalDiscipline?.id==='psionic-guards'?'Activate Guards':conditionalDiscipline?'Use discipline':restingLabel} onRolled={(value,sides)=>setPsionicRollHistory(prev=>[{value,die:`d${sides}`},...prev].slice(0,5))}/> : ability.actionType !== 'free' && (
 <button
 onClick={() => handleUseAbility(ability, maxUses !== undefined ? 1 : undefined)}
 disabled={isPedPoolRow && (psionicPoolRemaining(character.level,character.class_resources?.['psionic-energy-dice'])??0)<1}
 style={{
 padding: '4px 12px', borderRadius: 'var(--r-md)', cursor: 'pointer',
 background: isFlashing ? '#34d399' : acColor + '20',
 border: `1px solid ${isFlashing ? '#34d399' : acColor + '60'}`,
 color: isFlashing ? '#000' : acColor,
 fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 11,
 letterSpacing: '0.04em',
 transition: 'background 0.2s, color 0.2s, border-color 0.2s',
 flexShrink: 0, minHeight: 0,
 textAlign: 'center' as const,
 }}
 >
 {isFlashing ? 'Used!' : restingLabel}
 </button>
 )}
 {/* PED-restore button — only when feature is depleted AND
     player has enough PEDs. Same conditions as v2.190.0. */}
 {(ability as any).pedRestoreCost !== undefined && maxUses !== undefined && (() => {
 const restoreCost = (ability as any).pedRestoreCost as number;
 const used = ((character.feature_uses as Record<string, number>) ?? {})[ability.name] ?? 0;
 if (used < maxUses) return null;
 const resources = (character.class_resources as Record<string, number> | null) ?? {};
 // v2.368.0 — Same uninit fix as restoreUseFromPed handler. The
 // chiclet display falls back to the pool max when the resource
 // is uninitialized; this disable check has to use the same
 // fallback or it leaves the button disabled with full chiclets,
 // which is what the user reported as "doesn't refund."
 const currentDice = psionicPoolRemaining(character.level,resources['psionic-energy-dice']) ?? 0;
 const insufficient = currentDice < restoreCost;
 const flashKey = `restore:${ability.name}`;
 const restoreFlashing = justUsed === flashKey;
 return (
 <button
 onClick={() => restoreUseFromPed(ability)}
 disabled={insufficient}
 title={insufficient
 ? `Need ${restoreCost} Psionic Energy Die${restoreCost === 1 ? '' : 's'} (have ${currentDice})`
 : `Spend ${restoreCost} PED to refresh this feature mid-rest`}
 style={{
 padding: '4px 10px', borderRadius: 'var(--r-md)',
 cursor: insufficient ? 'not-allowed' : 'pointer',
 background: restoreFlashing
 ? '#34d399'
 : insufficient
 ? 'var(--c-raised)'
 : 'rgba(232,121,249,0.12)',
 border: `1px solid ${
 restoreFlashing ? '#34d399' :
 insufficient ? 'var(--c-border)' :
 'rgba(232,121,249,0.45)'
 }`,
 color: restoreFlashing
 ? '#000'
 : insufficient
 ? 'var(--t-3)'
 : '#e879f9',
 fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10,
 letterSpacing: '0.04em',
 transition: 'background 0.2s, color 0.2s, border-color 0.2s',
 flexShrink: 0, minHeight: 0,
 opacity: insufficient ? 0.55 : 1,
 }}
 >
 {restoreFlashing ? 'Restored!' : `+${restoreCost} PED`}
 </button>
 );
 })()}
 </div>
 </div>
 );
 })()}

 {/* v2.324.0 — T3: description moved out of the always-visible band
     into the expanded panel. Short description renders first
     (replaces the band's previous role); long description follows
     when present. Layout still mirrors the regular spell row's
     expanded panel: stats grid on top, prose body below. */}
 {isExpanded && (
 <div style={{
 padding: '10px 14px 12px 14px',
 borderTop: `1px solid ${acColor}20`,
 background: 'rgba(255,255,255,0.015)',
 }}>
 {/* Stats grid — adapted to ability fields rather than spell fields. */}
 <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' as const, marginBottom: 10, alignItems: 'center' }}>
 {(() => {
 const ped = (ability as any).pedCost as number | undefined;
 const rangeStr = (ability as any).range as string | undefined;
 const stats: Array<[string, string | null]> = [
 ['Action', ACTION_LABELS[ability.actionType]?.replace(/^[^A-Za-z]+/, '') ?? ability.actionType],
 ['Range', rangeStr ?? null],
 ['Recovery', ability.rest === 'short' ? 'Short Rest' : ability.rest === 'long' ? 'Long Rest' : 'At Will'],
 ['Uses', maxUses !== undefined ? String(maxUses) : null],
 ['Cost', typeof ped === 'number' && ped > 0 ? `${ped} PED` : null],
 ];
 return stats.filter(([, v]) => v != null).map(([k, v]) => (
 <div key={k}>
 <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: 'var(--t-3)', marginBottom: 2 }}>{k}</div>
 <div style={{ fontSize: 12, color: 'var(--t-1)' }}>{v}</div>
 </div>
 ));
 })()}
 </div>
 {/* Short description first — what was previously the always-visible
     band. Always rendered when the panel is open. */}
 <div style={{
 fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)',
 lineHeight: 1.5, marginBottom: descLong ? 10 : 0,
 }}>
 {descShort}
 </div>
 {descLong && (
 <div style={{
 fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)',
 lineHeight: 1.6, whiteSpace: 'pre-wrap' as const,
 }}>
 {descLong}
 </div>
 )}
 {(ability as any).psionicDie && psionicRollHistory.length > 0 && (
 <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' as const }}>
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-3)', letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginRight: 4 }}>
 Recent Rolls:
 </span>
 {psionicRollHistory.map((r, i) => (
 <span key={i} style={{
 fontFamily: 'var(--ff-stat)', fontWeight: 800, fontSize: i === 0 ? 13 : 11,
 padding: '1px 7px', borderRadius: 999,
 background: i === 0 ? 'rgba(232,121,249,0.2)' : 'rgba(232,121,249,0.07)',
 border: `1px solid rgba(232,121,249,${i === 0 ? '0.5' : '0.2'})`,
 color: '#e879f9',
 flexShrink: 0,
 }}>
 {r.value}
 </span>
 ))}
 </div>
 )}
 </div>
 )}
 </div>
 </Fragment>
 );
 })}
 </div>
 </div>
 {/* v2.247.0 — Save resolver modal. Mounts when handleUseAbility
     detects a save-bearing ability + active encounter and stashes
     the ability + DC into resolveModal. The portal lifts the modal
     out of any nested overflow:hidden so it covers the sheet
     properly. */}
 {manualPropel?.psionicUse?.kind==='propel'&&<ManualPropelResolution use={manualPropel.psionicUse} dc={resolveSaveDC(manualPropel.save!,character)??0} onClose={()=>setManualPropel(null)} onResolve={failed=>{const ability=manualPropel;setManualPropel(null);void finalizeAbilityUse(ability,undefined,[{participantId:'manual',participantName:'Tabletop target',outcome:failed?'failed':'passed'}]);}}/>}
 {resolveModal && campaignId && (
 <Suspense fallback={null}>
 <ClassAbilityResolveModal
 open={!!resolveModal}
 onClose={() => setResolveModal(null)}
 ability={resolveModal.ability}
 saveDC={resolveModal.saveDC}
 character={character}
 campaign={campaign ?? null}
 campaignId={campaignId}
 onConfirmed={(outcomes) => {
 const m = resolveModal;
 // Run the actual deduction + log AFTER the modal's setState
 // settles. setResolveModal(null) is fired by the modal's
 // onClose right after onConfirmed, so we don't need to do it
 // here.
 finalizeAbilityUse(m.ability, m.cost, outcomes);
 }}
 />
 </Suspense>
 )}
 </>
 );
}
