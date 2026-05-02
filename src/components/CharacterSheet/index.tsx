import { useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import type { Character, ConditionName, InventoryItem, SpellSlots, NoteField, SpellData } from '../../types';
import { computeStats, abilityModifier, rollDie } from '../../lib/gameUtils';
import { updateCharacter, supabase } from '../../lib/supabase';
import { useDebouncedCallback } from '../../lib/useDebounce';
import { useSpells } from '../../lib/hooks/useSpells';
import { rechargeOnLongRest } from '../../lib/charges';
import { CombatProvider, useCombat } from '../../context/CombatContext';
import InitiativeStrip from '../Combat/InitiativeStrip';
import ReactionPromptModal from '../Combat/ReactionPromptModal';
import ConcentrationSavePromptModal from '../Combat/ConcentrationSavePromptModal';
import DeathSavePromptModal from '../Combat/DeathSavePromptModal';
import { FEATS } from '../../data/feats';
import { SPECIES } from '../../data/species';
import { TIEFLING_LEGACIES, getTieflingLegacy, getActiveLegacySpells, getSpeciesGrantedSpellIds, getAllPossibleSpeciesSpellIds, legacySpellFeatureKey, type TieflingLegacy } from '../../data/speciesChoices';
import { STANDARD_ACTIONS } from '../../data/standardActions';
import { BACKGROUNDS } from '../../data/backgrounds';
import { CLASS_MAP, getSubclassSpellIds } from '../../data/classes';
import { CONDITION_MAP } from '../../data/conditions';
import { getCharacterResources, buildDefaultResources } from '../../data/classResources';
import { canAddKnownSpell, canPrepareSpell, getSpellCounts, getMaxPrepared } from '../../lib/spellLimits';
import { resolveResistances, resolveImmunities, resolveVulnerabilities, labelForDamageType, DAMAGE_TYPE_COLORS } from '../../lib/damageModifiers';
import { parseSpellMechanics, parseDurationToRounds, formatRoundsRemaining, canUpcastSpell } from '../../lib/spellParser';
import { describeCharacterChanges, logHistoryEvents, logHistoryEvent } from '../../lib/characterHistory';
import { emitCombatEvent } from '../../lib/combatEvents';
import { itemRequiresAttunement } from '../../lib/attunement';
import { isStrikeableInventoryWeapon, inventoryItemToWeapon } from '../../lib/inventoryWeapon';
import { getMagicItemById } from '../../lib/hooks/useMagicItems';

import CharacterHeader from './CharacterHeader';
import AbilityScores from './AbilityScores';
import HPStatsPanel from './HPStatsPanel';
import DeathSaves from './DeathSaves';
import CampaignBar from './CampaignBar';
import SkillsList from './SkillsList';
import SpellCastButton from './SpellCastButton';
import Inventory from './Inventory';
import Notes from './Notes';
import ActionEconomy from './ActionEconomy';
import CharacterSettings from './CharacterSettings';
import FeaturesPanel from './FeaturesPanel';
import FeatsPanel from './FeatsPanel';
import FeaturesAndTraitsPanel from './FeaturesAndTraitsPanel';
import ClassAbilitiesSection from './ClassAbilitiesSection';
import SpellCompletionBanner from './SpellCompletionBanner';
import PendingChoicesAlert from './PendingChoicesAlert';
import AvatarPicker from '../shared/AvatarPicker';
import ModalPortal from '../shared/ModalPortal';
import { useToast } from '../shared/Toast';
import WeaponsTracker from './WeaponsTracker';
import UnifiedHistory from './UnifiedHistory';
import LevelUpWizard from './LevelUpWizard';
import LevelUpBanner from './LevelUpBanner';
import SpellsTab from './SpellsTab';
import ErrorBoundary from '../ErrorBoundary';
import DamageEffect from './DamageEffect';
import { PlayerRollPrompt } from '../Campaign/RollRequest';
import LevelTab from './_shared/LevelTab';
import { useKeyboardShortcuts } from '../../lib/useKeyboardShortcuts';
import { useCampaign } from '../../context/CampaignContext';
import { useDiceRoll } from '../../context/DiceRollContext';
import { SKILLS as SKILL_LIST_STATIC } from '../../data/skills';
import { useScreenFlash } from '../../context/ScreenFlashContext';
import { resolveAutomation } from '../../lib/automations';

type Tab = 'actions' | 'abilities' | 'features' | 'spells' | 'inventory' | 'bio' | 'history';

const TABS: { id: Tab; label: string }[] = [
 { id: 'actions', label: ' Actions' },
 // v2.183.0 — Phase Q.0 pt 24: the 'abilities' tab has always shown
 // the skills grid (Acrobatics, Arcana, Athletics, etc.). Renamed
 // the user-facing label to match what the tab actually contains.
 // The internal id stays 'abilities' because renaming it would
 // touch ~20 `activeTab === 'abilities'` checks for no gain.
 { id: 'abilities', label: 'Skills' },
 { id: 'features', label: 'Features' },
 { id: 'spells', label: 'Spells' },
 { id: 'inventory', label: 'Inventory' },
 // v2.264.0 — Notes tab (`bio`) hidden per user request. The tab
 // contained a duplicate FeaturesPanel surface (already covered by
 // the Features tab) plus a Notes panel for personality/bonds/
 // ideals/flaws. The data fields stay populated in the DB and can
 // still be edited via character settings; if the tab is wanted
 // back later, just re-add this entry. The render block at
 // `activeTab === 'bio'` below is left in place as dead code so a
 // re-add is one-line.
 //   { id: 'bio', label: 'Notes' },
 { id: 'history', label: 'History' },
];

const LEVEL_LABELS: Record<number, string> = {
 0: 'Cantrip', 1: '1st', 2: '2nd', 3: '3rd', 4: '4th',
 5: '5th', 6: '6th', 7: '7th', 8: '8th', 9: '9th',
};

interface CharacterSheetProps {
 initialCharacter: Character;
 realtimeEnabled?: boolean;
 isPro?: boolean;
 userId?: string;
 /**
  * v2.169.0 — optional callback to push a transient toast to the
  * parent's NotificationToast stack. Used by the realtime handler
  * to surface DM-driven HP / inspiration changes so the player
  * actually notices. If unset (standalone usage), the detection
  * still runs but no toast appears.
  */
 onLocalToast?: (toast: { id: string; message_type: string; message: string; character_name: string | null }) => void;
}

export default function CharacterSheet({ initialCharacter, realtimeEnabled: _realtimeEnabled = false, isPro = false, userId = '', onLocalToast }: CharacterSheetProps) {
 // Bundle props into a single ref we can read inside the realtime
 // closure below without re-subscribing every time the callback
 // identity shifts.
 const props = { onLocalToast };
 // v2.263.0 — toast surface for surfacing previously-silent failures
 // (most importantly the "can't prepare this spell" block which used
 // to console.warn only, leaving the user thinking the toggle was
 // broken).
 const toast = useToast();
 const [character, setCharacter] = useState<Character>(initialCharacter);
 const [activeTab, setActiveTab] = useState<Tab>('actions');

 // Listen for tab-switch events from banners/alerts
 useEffect(() => {
 const handler = (e: Event) => setActiveTab((e as CustomEvent).detail as Tab);
 window.addEventListener('dndkeep:gototab', handler);
 return () => window.removeEventListener('dndkeep:gototab', handler);
 }, []);
 const [saving, setSaving] = useState(false);
 const [saveError, setSaveError] = useState<string | null>(null);
 const [showSettings, setShowSettings] = useState(false);
 const [lastDamageNotes, setLastDamageNotes] = useState('');
 const navigate = useNavigate();
 const [showRest, setShowRest] = useState(false);
 const [showAvatarPicker, setShowAvatarPicker] = useState(false);
 const [showLevelUp, setShowLevelUp] = useState(false);

 // v2.294.0 — The combat-status useStates that used to live here
 // (isMyTurn / combatActive / currentTurnName / combatRound) are
 // gone. They were driven by a now-dead legacy session_states
 // realtime sub; the v2.286+ combat unification moved combat off
 // those columns and the banner had been silently broken in
 // production since (combat_active never flipped true). The
 // <YourTurnBanner /> sub-component below subscribes to the
 // existing CombatProvider and renders the banner directly via
 // useCombat() — no parent state needed.

 // ── DM Announcements & Save Prompts ────────────────────────────
 const [dmAnnouncement, setDmAnnouncement] = useState<string | null>(null);
 const [savePrompt, setSavePrompt] = useState<{ ability: string; dc: number } | null>(null);
 // v2.163.0 — Phase Q.0 pt 4: ability check prompts. Mirrors save_prompt
 // but for skill / ability checks. Player can dismiss; the entry also
 // lives in the notifications inbox.
 const [checkPrompt, setCheckPrompt] = useState<{
   target: string; kind: 'skill' | 'ability'; dc?: number;
   advantage?: boolean; disadvantage?: boolean;
 } | null>(null);
 // v2.167.0 — Phase Q.0 pt 8: DM-initiated rest signals.
 // shortRestPromptedByDM tags the rest modal as DM-initiated so the
 // header reads "DM called a Short Rest" instead of generic.
 // longRestCompleted shows a transient banner after the DM applies
 // a party long rest server-side.
 const [shortRestPromptedByDM, setShortRestPromptedByDM] = useState(false);
 const [longRestCompleted, setLongRestCompleted] = useState(false);

 useEffect(() => {
 if (!character.campaign_id) return;
 // v2.192.0 — Phase Q.0 pt 33: targeted prompt filter. A DM can now
 // restrict save_prompt / check_prompt to specific characters by
 // including `targets: string[]` in the payload. We must drop the
 // popup trigger for characters not in the list — otherwise EVERY
 // player sees a popup the DM intended only for one. Same shape as
 // the announcement targets filter (v2.173). Empty/missing targets
 // = broadcast to all (legacy behavior preserved).
 function isTargetedAtMe(rawMessage: string): boolean {
 try {
 const p = JSON.parse(rawMessage);
 if (p && Array.isArray(p.targets) && p.targets.length > 0) {
 return p.targets.includes(character.id);
 }
 } catch { /* legacy plain-text payload, fall through to "all" */ }
 return true;
 }
 const ch = supabase
 .channel(`dm-broadcast-${character.campaign_id}`)
 .on('postgres_changes', {
 event: 'INSERT', schema: 'public', table: 'campaign_chat',
 filter: `campaign_id=eq.${character.campaign_id}`,
 }, payload => {
 const row = payload.new as any;
 if (row.message_type === 'announcement') {
 if (!isTargetedAtMe(row.message)) return;
 setDmAnnouncement(row.message);
 // v2.161.0 — Phase Q.0 pt 2: shortened from 30s → 5s. The new
 // NotificationsButton inbox preserves history, so the in-content
 // banner only needs to flash long enough to grab attention.
 setTimeout(() => setDmAnnouncement(null), 5000);
 } else if (row.message_type === 'save_prompt') {
 if (!isTargetedAtMe(row.message)) return;
 try { setSavePrompt(JSON.parse(row.message)); } catch {}
 } else if (row.message_type === 'check_prompt') {
 // v2.163.0 — Phase Q.0 pt 4: DM-requested ability check.
 if (!isTargetedAtMe(row.message)) return;
 try { setCheckPrompt(JSON.parse(row.message)); } catch {}
 } else if (row.message_type === 'short_rest_prompt') {
 // v2.167.0 — Phase Q.0 pt 8: DM called for a short rest.
 // Auto-open the existing rest modal so the player can spend
 // hit dice individually. Also flag the prompt so the modal
 // header can show a "DM-initiated" badge.
 setShortRestPromptedByDM(true);
 setShowRest(true);
 } else if (row.message_type === 'long_rest_completed') {
 // v2.167.0 — Phase Q.0 pt 8: DM applied a party long rest.
 // The character's row was already updated server-side; the
 // realtime character subscription will refresh state. We
 // surface a banner so the player notices.
 setLongRestCompleted(true);
 setTimeout(() => setLongRestCompleted(false), 8000);
 }
 })
 .subscribe();
 return () => { supabase.removeChannel(ch); };
 }, [character.campaign_id, character.id]);

 // ── Track last damage type from action log for sound/flash effect ──
 useEffect(() => {
 if (!character.campaign_id) return;
 const ch = supabase.channel(`dmg-notes-${character.id}`)
 .on('postgres_changes', {
 event: 'INSERT', schema: 'public', table: 'action_logs',
 filter: `campaign_id=eq.${character.campaign_id}`,
 }, payload => {
 const row = payload.new as any;
 if (row.action_type === 'damage' && (row.character_id === character.id || !row.character_id)) {
 setLastDamageNotes(row.notes ?? row.action_name ?? '');
 }
 })
 .subscribe();
 return () => { supabase.removeChannel(ch); };
 }, [character.campaign_id, character.id]);

 // ── Sync external HP/condition changes (e.g. from BattleMap) ──────
 // Uses a ref to avoid stale closure — always reads current character value
 const characterRef = useRef(character);
 useEffect(() => { characterRef.current = character; });

 // Auto-add AND auto-prepare subclass always-prepared spells + class granted spells
 useEffect(() => {
 if (!character.class_name) return;
 const updates: Partial<typeof character> = {};

 // Subclass always-prepared spells accessible at THIS character's level.
 // Previously this returned the entire subclass spell_list unconditionally,
 // which caused level-4 Psions to be granted level-5/7/9 spells they
 // shouldn't have. v2.18.7+ filters by the standard full-caster progression.
 const subSpellIds = character.subclass
 ? getSubclassSpellIds(character.subclass, character.class_name, character.level)
 : [];

 // The FULL subclass list (regardless of level) — used to detect which of
 // the character's stored spells came from auto-granting but are now
 // above what their level should allow. We prune only those; anything the
 // player manually added via "Add Spells" is left alone.
 const fullSubList = character.subclass
 ? getSubclassSpellIds(character.subclass, character.class_name)
 : [];
 const stale = fullSubList.filter(id => !subSpellIds.includes(id));

 // Class auto-granted cantrips (e.g. Psion Mage Hand)
 const classGranted = character.class_name === 'Psion' ? ['mage-hand'] : [];

 // v2.191.0 — Phase Q.0 pt 32: species auto-granted spells.
 // Today only Tiefling Fiendish Legacy contributes (Fire Bolt /
 // Hellish Rebuke / Darkness for Infernal, etc.) — these are
 // computed by getSpeciesGrantedSpellIds based on the chosen legacy
 // + character level. The "stale" detection mirrors the subclass
 // pattern: getAllPossibleSpeciesSpellIds returns every spell that
 // COULD be granted (across all legacies), and we strip any that
 // aren't currently granted. This handles legacy switches cleanly:
 // if a player picks Infernal, gets Fire Bolt+Hellish Rebuke+Darkness,
 // then switches to Chthonic, the Infernal spells are removed and
 // Chill Touch/False Life/Ray of Enfeeblement are added.
 const speciesGranted = getSpeciesGrantedSpellIds(
 character.species,
 character.species_choices,
 character.level,
 );
 const allPossibleSpeciesIds = getAllPossibleSpeciesSpellIds(character.species);
 const speciesStale = allPossibleSpeciesIds.filter(id => !speciesGranted.includes(id));

 const allGranted = [...new Set([...subSpellIds, ...classGranted, ...speciesGranted])];
 const allStale = [...stale, ...speciesStale];

 // Known spells: add missing granted, strip stale auto-grants
 const desiredKnown = character.known_spells.filter(id => !allStale.includes(id));
 const missingKnown = allGranted.filter(id => !desiredKnown.includes(id));
 if (missingKnown.length > 0 || desiredKnown.length !== character.known_spells.length) {
 updates.known_spells = [...desiredKnown, ...missingKnown];
 }

 // Prepared spells: same — auto-prepare what's currently granted, drop stale.
 // v2.191.0 — species-granted spells go in prepared_spells too so they're
 // immediately castable without a manual "prepare" step. RAW says these
 // legacy spells are always prepared and don't count against the
 // character's prepared spell count.
 const desiredPrepared = character.prepared_spells.filter(id => !allStale.includes(id));
 const missingPrepared = [...subSpellIds, ...speciesGranted].filter(id => !desiredPrepared.includes(id));
 if (missingPrepared.length > 0 || desiredPrepared.length !== character.prepared_spells.length) {
 updates.prepared_spells = [...desiredPrepared, ...missingPrepared];
 }

 if (Object.keys(updates).length > 0) {
 applyUpdate(updates, true);
 }
 }, [character.subclass, character.class_name, character.level, character.species, character.species_choices]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => {
 if (!character.id) return;
 const charId = character.id; // capture stable id
 const ch = supabase
 .channel(`char-self-${charId}`)
 .on('postgres_changes', {
 event: 'UPDATE', schema: 'public', table: 'characters',
 filter: `id=eq.${charId}`,
 }, payload => {
 const updated = payload.new as Record<string, unknown>;
 if (!updated) return;
 // v2.169.0 — Phase Q.0 pt 10: added inspiration + several resource
 // fields to the realtime-syncable allowlist. Previously these were
 // excluded, so DM-side updates like "Give Inspiration" or awarding
 // XP silently landed in the DB but never surfaced on the character
 // sheet until the player reloaded. This caused the inspiration
 // button to appear broken — it was a client-sync gap, not a write
 // failure.
 const externalFields = [
 'current_hp', 'temp_hp', 'active_conditions', 'concentration_spell',
 'concentration_rounds_remaining',
 'spell_slots', 'death_saves_successes', 'death_saves_failures',
 // v2.169.0:
 'inspiration',
 'hit_dice_spent', 'class_resources', 'feature_uses',
 'currency', 'inventory', 'experience_points',
 ] as const;
 const patch: Partial<Character> = {};
 const current = characterRef.current as Record<string, unknown>;
 for (const field of externalFields) {
 const newVal = updated[field];
 const curVal = current[field];
 // Apply if value actually changed (deep compare for arrays/objects)
 if (newVal !== undefined && JSON.stringify(newVal) !== JSON.stringify(curVal)) {
 (patch as Record<string, unknown>)[field] = newVal;
 }
 }
 if (Object.keys(patch).length > 0) {
 // v2.47.0: Detect external concentration clear (DM-driven round tick,
 // BattleMap damage auto-drop, etc.). If the realtime patch clears
 // concentration_spell and we WERE concentrating, fire a toast.
 const oldConcSpell = current['concentration_spell'] as string;
 const newConcSpell = (patch as any).concentration_spell as string | undefined;
 if (oldConcSpell && newConcSpell === '' && newConcSpell !== oldConcSpell) {
 // Most common cause from external sync = round timer ran out via DM tick
 showConcentrationLossToast(oldConcSpell, 'duration timer expired');
 }
 // v2.169.0 — Phase Q.0 pt 10: externally-driven HP / inspiration
 // toasts. When the DM applies damage / heal / gives inspiration
 // from the Party panel, realtime pushes the change here. Detect
 // the delta and fire a local toast so the player actually notices
 // something happened (previously the sheet silently re-rendered
 // to new numbers with zero acknowledgement).
 //
 // Not routed through campaign_chat because:
 //   (a) every player would see every player's damage, which is
 //       too noisy
 //   (b) the ground truth IS the HP delta on this row
 //   (c) no new message_type / RLS surface needed
 //
 // The toast pushes a synthetic ToastItem up to CharacterPage via
 // onLocalToast so it renders in the same top-center stack as
 // real notifications. Unique id per event to dedupe re-renders.
 const emit = props.onLocalToast;
 if (emit) {
 const oldHP = (current['current_hp'] as number) ?? 0;
 const oldTemp = (current['temp_hp'] as number) ?? 0;
 const newHP = (patch['current_hp'] !== undefined ? (patch['current_hp'] as number) : oldHP);
 const newTemp = (patch['temp_hp'] !== undefined ? (patch['temp_hp'] as number) : oldTemp);
 // Total change = (HP lost + temp lost) vs (HP gained + temp gained).
 // We report the NET change, signed, with unique text per direction.
 const hpDelta = newHP - oldHP;
 const tempDelta = newTemp - oldTemp;
 const totalDamage = Math.max(0, -hpDelta) + Math.max(0, -tempDelta);
 const totalHeal = Math.max(0, hpDelta);
 const tempGained = Math.max(0, tempDelta);
 if (totalDamage > 0) {
 emit({
 id: `hp-dmg-${Date.now()}`,
 message_type: 'damage_applied',
 message: `Took ${totalDamage} damage`,
 character_name: 'DM',
 });
 } else if (totalHeal > 0) {
 emit({
 id: `hp-heal-${Date.now()}`,
 message_type: 'healing_applied',
 message: `Healed ${totalHeal} HP`,
 character_name: 'DM',
 });
 } else if (tempGained > 0) {
 emit({
 id: `hp-temp-${Date.now()}`,
 message_type: 'temp_hp_granted',
 message: `Gained ${tempGained} temp HP`,
 character_name: 'DM',
 });
 }
 // Inspiration: toggled externally. RAW 2024 inspiration is a
 // binary flag; fire a message distinguishing gain vs use/clear.
 const oldInsp = !!current['inspiration'];
 const newInsp = patch['inspiration'] !== undefined ? !!patch['inspiration'] : oldInsp;
 if (!oldInsp && newInsp) {
 emit({
 id: `insp-gained-${Date.now()}`,
 message_type: 'inspiration_granted',
 message: 'You gained Inspiration!',
 character_name: 'DM',
 });
 } else if (oldInsp && !newInsp) {
 emit({
 id: `insp-used-${Date.now()}`,
 message_type: 'inspiration_used',
 message: 'Inspiration used or cleared',
 character_name: 'DM',
 });
 }
 }
 // v2.56.0: External damage trigger — when the DM (or BattleMap) reduces
 // our HP via realtime sync, the local handleUpdateHP path is bypassed
 // and the concentration save was silently skipped. Detect total damage
 // (current_hp delta + temp_hp delta) and fire the save here too.
 const currentConcSpell = (newConcSpell !== undefined ? newConcSpell : oldConcSpell) as string;
 if (currentConcSpell && currentConcSpell !== '') {
 const oldHP = (current['current_hp'] as number) ?? 0;
 const newHP = (patch['current_hp'] !== undefined ? (patch['current_hp'] as number) : oldHP);
 const oldTemp = (current['temp_hp'] as number) ?? 0;
 const newTemp = (patch['temp_hp'] !== undefined ? (patch['temp_hp'] as number) : oldTemp);
 const hpDrop = Math.max(0, oldHP - newHP);
 const tempDrop = Math.max(0, oldTemp - newTemp);
 // Total damage = HP lost + temp HP consumed. Per RAW, both count.
 const totalDamage = hpDrop + tempDrop;
 if (totalDamage > 0) {
 const dc = Math.min(30, Math.max(10, Math.floor(totalDamage / 2)));
 const mode = resolveAutomation(
 'concentration_on_damage',
 { ...characterRef.current, ...patch } as Character,
 activeCampaignRef.current,
 );
 if (mode === 'prompt') {
 setConcentrationSaveDC(dc);
 setConcentrationSaveDamage(totalDamage);
 } else if (mode === 'auto') {
 // Note: rollConcentrationSave reads from the latest character state via closure;
 // queue with rAF so the patch lands first.
 requestAnimationFrame(() => rollConcentrationSave(dc));
 }
 // 'off' → no action
 }
 }
 setCharacter(prev => ({ ...prev, ...patch }));
 }
 })
 .subscribe();
 return () => { supabase.removeChannel(ch); };
 }, [character.id]); // eslint-disable-line react-hooks/exhaustive-deps

 useEffect(() => {
 if (!character.campaign_id) return;

 // Check if current user is DM of this campaign
 supabase.from('campaigns').select('owner_id').eq('id', character.campaign_id).single()
 .then(({ data }) => { if (data && userId) setIsDM(data.owner_id === userId); });

 // v2.294.0 — session_states fetch + realtime sub removed. The
 // legacy applySessionState() function fed combat-banner state
 // (combat_active / round / current_turn → isMyTurn etc.) but
 // that table stopped being written to combat-actively after the
 // v2.286+ migrations retired the legacy Start Combat path.
 // Combat status now flows through CombatProvider (mounted
 // inside this component, see the JSX below) and the
 // <YourTurnBanner /> sub-component reads it via useCombat().
 // No realtime channel needed at this hook level — the provider
 // owns its own subscription.
 }, [character.campaign_id, character.id, userId]);

 // v2.294.0 — applySessionState() function removed. It was the only
 // consumer of the four useStates dropped above, all now derived
 // inside <YourTurnBanner />.
 // Concentration: derived from character.concentration_spell (persisted in DB).
 // Empty string means "not concentrating" — same as null at the React layer.
 // Writes go through setConcentration(), which persists immediately so a refresh
 // mid-combat won't silently drop the spell.
 const concentrationSpellId = character.concentration_spell || null;
 const [concentrationSaveDC, setConcentrationSaveDC] = useState<number | null>(null);
 // v2.56.0: Track the actual damage that triggered the prompt so the UI can
 // show users exactly which formula path produced the DC.
 const [concentrationSaveDamage, setConcentrationSaveDamage] = useState<number | null>(null);
 // v2.47.0: Concentration-loss toast — fires whenever concentration drops via:
 // failed CON save, incapacitating condition, round timer expiry, or DM-driven
 // tick from the realtime channel. Manual drops via the banner button are silent.
 const [concentrationLossToast, setConcentrationLossToast] = useState<string | null>(null);

 // v2.55.0: condition info modal — clicking a chip in the active conditions
 // banner opens a small popup with the condition's name, mechanical effects,
 // and full RAW description. Replaces the unreliable hover-tooltip approach.
 const [conditionInfoOpen, setConditionInfoOpen] = useState<ConditionName | null>(null);

 // Keyboard shortcuts: R = rest, I = inspiration
 useKeyboardShortcuts({
 onRest: () => setShowRest(v => !v),
 onInspiration: () => applyUpdate({ inspiration: !character.inspiration }, true),
 });

 const computed = useMemo(() => computeStats(character), [character]);

 // ------------------------------------------------------------------
 // Debounced Supabase persist — accumulate patches, flush after 800ms
 // ------------------------------------------------------------------
 const pendingRef = useRef<Partial<Character>>({});
 const isSavingRef = useRef(false);

 const flushToSupabase = useCallback(async () => {
 if (isSavingRef.current) return;
 const patch = { ...pendingRef.current };
 if (Object.keys(patch).length === 0) return;
 pendingRef.current = {};
 isSavingRef.current = true;
 setSaving(true);
 setSaveError(null);
 try {
 const { error } = await updateCharacter(character.id, patch);
 if (error) setSaveError(error.message);
 } catch {
 setSaveError('Save failed — check your connection.');
 } finally {
 isSavingRef.current = false;
 setSaving(false);
 }
 }, [character.id]);

 const debouncedFlush = useDebouncedCallback(flushToSupabase, 800);

 // Flush any pending writes on unmount
 useEffect(() => () => { flushToSupabase(); }, [flushToSupabase]);

 function applyUpdate(partial: Partial<Character>, immediate = false) {
  // v2.75.0: Append events to character_history for each meaningful change.
  // Fire-and-forget — the helper swallows all errors, so logging can never
  // break the UI or a mutation. Realtime-echoed remote changes bypass
  // applyUpdate (they write straight to setCharacter via the channel hook),
  // so we don't double-log mirrors of already-logged events.
  try {
    const events = describeCharacterChanges(character, partial, character.id, userId ?? '');
    if (events.length) logHistoryEvents(events);
  } catch { /* logging must never break the update path */ }
  setCharacter(prev => ({ ...prev, ...partial }));
  pendingRef.current = { ...pendingRef.current, ...partial };
  if (immediate) flushToSupabase();
  else debouncedFlush();

  // v2.135.0 — Phase L pt 3: if carried weight or Strength changed, bridge
  // to the condition pipeline so Encumbered auto-applies/clears. No-op
  // out of combat (no participant row) and no-op when campaign has
  // encumbrance_variant='off' (the default). Fire-and-forget — like
  // history logging, this must never break the update path.
  if ('inventory' in partial || 'currency' in partial || 'strength' in partial) {
    if (character.campaign_id) {
      const merged: Character = { ...character, ...partial };
      import('../../lib/encumbrance').then(({ syncEncumbranceCondition }) => {
        syncEncumbranceCondition({
          characterId: character.id,
          character: merged,
          campaignId: character.campaign_id!,
        }).catch(() => { /* swallow — encumbrance sync never blocks the save path */ });
      });
    }
  }
 }

 /** Persist concentration spell ID immediately to DB so it survives refresh.
 * v2.38.0: Also parses the spell's duration and starts a round countdown. */
 function setConcentration(spellId: string | null) {
 if (!spellId) {
 applyUpdate({ concentration_spell: '', concentration_rounds_remaining: null }, true);
 return;
 }
 const spell = spellMap[spellId];
 const rounds = spell ? parseDurationToRounds(spell.duration) : null;
 applyUpdate({ concentration_spell: spellId, concentration_rounds_remaining: rounds }, true);
 }

 // v2.47.0: Fire a toast notifying the player they lost concentration.
 // `reason` is a short phrase explaining why (e.g. "CON save failed", "timer expired").
 // The spell name is looked up from the previously-concentrated spell ID.
 function showConcentrationLossToast(spellId: string | null, reason: string) {
 const spellName = spellId ? (spellMap[spellId]?.name ?? 'your spell') : 'your spell';
 setConcentrationLossToast(`Lost concentration on ${spellName} — ${reason}`);
 // Auto-dismiss after 6 seconds
 setTimeout(() => setConcentrationLossToast(null), 6000);
 }

 // ------------------------------------------------------------------
 // Automation framework — resolve campaign + character settings
 // ------------------------------------------------------------------
 const { campaigns } = useCampaign();
 // v2.48.0: 3D dice roller — used to visualize concentration saves so user
 // sees the d20 land vs the DC in real time.
 const { triggerRoll } = useDiceRoll();
 // v2.85.0: Screen-edge flash primitive for HP-change feedback (green heal,
 // red damage). Used in the potion flow; future damage/healing wiring will
 // call the same hook.
 const { flashEdge } = useScreenFlash();
 const activeCampaign = useMemo(
 () => campaigns.find(c => c.id === character.campaign_id) ?? null,
 [campaigns, character.campaign_id]
 );
 // v2.56.0: Mirror activeCampaign into a ref so the realtime channel closure
 // (set up once in a useEffect with empty deps) can read the latest value.
 const activeCampaignRef = useRef(activeCampaign);
 useEffect(() => { activeCampaignRef.current = activeCampaign; });

 /**
 * Shared concentration-save roll. Used by both the Prompt popup's Roll
 * button and the Auto path in handleUpdateHP. Rolls 1d20 + CON save
 * bonus vs the DC, logs to the action log, and drops concentration on
 * a failed save. Returns the roll result for callers that want it.
 *
 * v2.74.0: the "concentration broken" toast + the actual drop of
 * concentration now wait until the 3D dice roller fires onResult (dice
 * have physically settled). Previously the toast flashed up before the
 * animation finished, which looked broken. A 3.5s fallback ensures the
 * handler still fires even if onResult never does (e.g. physics error).
 */
 function rollConcentrationSave(dc: number): { passed: boolean; total: number; d20: number } {
 const conScore = character.constitution ?? 10;
 const conMod = Math.floor((conScore - 10) / 2);
 const pb = Math.ceil(character.level / 4) + 1;
 const hasSaveProf = character.saving_throw_proficiencies?.includes('constitution');
 const saveBonus = conMod + (hasSaveProf ? pb : 0);
 const d20 = Math.floor(Math.random() * 20) + 1;
 const total = d20 + saveBonus;
 // v2.49.0: NAT 1/20 house rule — overrides total comparison if enabled.
 // RAW: saving throws don't crit; only attacks + death saves do. Many tables
 // play with the house rule that NAT 1 = auto-fail, NAT 20 = auto-success on
 // ALL d20 rolls. The character can opt in via Settings.
 // v2.63.0: ON BY DEFAULT — only false when the user explicitly disables it.
 const useNat = character.nat_1_20_saves !== false;
 let passed: boolean;
 let verdict: string;
 if (useNat && d20 === 20) {
 passed = true;
 verdict = '✓ Maintained (NAT 20 — auto-success)';
 } else if (useNat && d20 === 1) {
 passed = false;
 verdict = '✗ Broken (NAT 1 — auto-fail)';
 } else {
 passed = total >= dc;
 verdict = passed ? '✓ Maintained' : '✗ Broken';
 }
 // v2.74.0: gather deferred actions — fire only after dice settle.
 const spellName = concentrationSpellId ? (spellMap[concentrationSpellId]?.name ?? 'Concentration') : 'Concentration';
 const concSpellIdAtRoll = concentrationSpellId; // capture for the callback
 let resolved = false;
 const resolveVerdict = () => {
 if (resolved) return;
 resolved = true;
 if (!passed) {
 showConcentrationLossToast(
 concSpellIdAtRoll,
 useNat && d20 === 1 ? 'NAT 1 — auto-fail' : `CON save failed (${total} vs DC ${dc})`
 );
 setConcentration(null);
 }
 };
 // v2.48.0: Fire the 3D dice roller so the user sees the d20 land and the
 // total vs DC verdict. Same pattern used for ability/skill checks elsewhere.
 triggerRoll({
 result: d20,
 dieType: 20,
 modifier: saveBonus,
 total,
 label: `${spellName} — Concentration Save (DC ${dc}) · ${verdict}`,
 onResult: resolveVerdict, // fires when physics dice settle
 });
 // Fallback: if for any reason onResult never fires, resolve after 3.5s
 // so the toast + concentration-drop still happens.
 setTimeout(resolveVerdict, 3500);
 // Action log can write immediately — it's a separate surface and doesn't
 // conflict with the dice animation.
 import('../shared/ActionLog').then(({ logAction }) => {
 logAction({
 campaignId: character.campaign_id,
 characterId: userId ?? '',
 characterName: character.name,
 actionType: 'save',
 actionName: 'Concentration Check',
 diceExpression: '1d20',
 individualResults: [d20],
 total,
 notes: `DC ${dc} · ${verdict} · CON ${conMod >= 0 ? '+' : ''}${conMod}${hasSaveProf ? ` + Prof +${pb}` : ''}`,
 });
 });
 return { passed, total, d20 };
 }

 // ------------------------------------------------------------------
 // Handlers
 // ------------------------------------------------------------------
 /**
  * v2.54.0: handleUpdateHP now accepts an optional explicit `damageDealt`
  * parameter. RAW: temp HP doesn't prevent the concentration save — you still
  * took damage. The previous `current_hp < character.current_hp` heuristic
  * missed cases where damage was fully absorbed by temp HP. Callers that
  * compute damage explicitly (the damage path in onUpdateHP) now pass it
  * through so the save fires correctly.
  */
 function handleUpdateHP(current_hp: number, temp_hp: number, damageDealt?: number) {
 // Concentration save check — fires when damage was actually taken,
 // regardless of whether it landed on temp HP or current HP.
 const inferredDamage = Math.max(0, character.current_hp - current_hp);
 const totalDamage = damageDealt ?? inferredDamage;
 if (totalDamage > 0 && concentrationSpellId) {
 // RAW: DC = max(10, floor(damage / 2)), capped at 30
 const dc = Math.min(30, Math.max(10, Math.floor(totalDamage / 2)));
 const mode = resolveAutomation('concentration_on_damage', character, activeCampaign);
 if (mode === 'prompt') {
 setConcentrationSaveDC(dc);
 setConcentrationSaveDamage(totalDamage);
 } else if (mode === 'auto') {
 rollConcentrationSave(dc);
 }
 // 'off' → no action
 }
 applyUpdate({ current_hp, temp_hp }, true);
 }
 function handleUpdateSlots(spell_slots: SpellSlots) {
 applyUpdate({ spell_slots }, true);
 }
 function handleUpdateConditions(active_conditions: ConditionName[]) {
 // Auto-drop concentration if an incapacitating condition is applied
 const breaksConc = active_conditions.some(c => CONDITION_MAP[c]?.concentrationBreaks);
 if (breaksConc && concentrationSpellId) {
 // v2.47.0: also clear timer + notify the player
 const breakingConditions = active_conditions.filter(c => CONDITION_MAP[c]?.concentrationBreaks);
 const reason = `gained ${breakingConditions[0] ?? 'an incapacitating'} condition`;
 showConcentrationLossToast(concentrationSpellId, reason);
 applyUpdate({ active_conditions, concentration_spell: '', concentration_rounds_remaining: null }, true);
 } else {
 applyUpdate({ active_conditions }, true);
 }
 }
 function handleUpdateInventory(inventory: InventoryItem[]) {
 applyUpdate({ inventory });
 }
 function handleUpdateNote(field: NoteField, value: string) {
 applyUpdate({ [field]: value }); // debounced — user is typing
 }
 function handleLevelUp(updates: Partial<Character>) {
 applyUpdate(updates, true);
 }

 // Short rest: roll hit dice to recover HP
 const [shortRestHpGained, setShortRestHpGained] = useState(0);
 // v2.170.0 — how many hit dice the player wants to spend this cycle.
 // Empty string = default 1 when roll fires.
 const [hitDiceToSpend, setHitDiceToSpend] = useState<string>('');
 const [combatFilter, setCombatFilter] = useState<'all'|'action'|'bonus'|'reaction'|'limited'>('all');
 // v2.34.1: Content-type filter for Actions tab. Empty set = show all categories.
 type ContentKind = 'weapon' | 'spell' | 'ability' | 'item';
 const [contentFilters, setContentFilters] = useState<Set<ContentKind>>(new Set());
 // v2.34.1: Upcast toggle lives on Actions tab too (mirrors SpellsTab behavior)
 const [actionsShowUpcasts, setActionsShowUpcasts] = useState(false);
 // v2.35.0: Actions-tab row expansion — holds the row key (spell.id-effectiveLevel) of
 // the currently-expanded spell so users can read the full description inline.
 const [expandedActionsSpell, setExpandedActionsSpell] = useState<string | null>(null);
 // v2.36.0: Actions-tab level filter — 'all' | number. Mirrors SpellsTab level tabs.
 const [actionsLevelFilter, setActionsLevelFilter] = useState<number | 'all'>('all');
 const [spellCastThisTurn, setSpellCastThisTurn] = useState(false);
 // Per 2024 rules: if you cast a leveled BONUS ACTION spell, main action = cantrip only
 const [bonusActionSpellCast, setBonusActionSpellCast] = useState(false);
 // v2.76.0: Reaction state lifted so the Actions-tab filter chiclet and the
 // ActionEconomy panel share one source of truth. Reset on New Turn.
 const [reactionUsedThisTurn, setReactionUsedThisTurn] = useState(false);
 const [isDM, setIsDM] = useState(false);
 // v2.82.0: potion-use modal state. When set, shows a Self/Other chooser;
 // picking Self rolls the heal dice and applies HP to this character, picking
 // Other rolls and logs but leaves HP untouched (the other character's sheet
 // handles their own HP update).
 const [potionToUse, setPotionToUse] = useState<any | null>(null);
 // v2.85.0: Heal success modal state. When set, shows a confirmation modal
 // after dice settle with the healed amount + new HP. Style mirrors the
 // concentration-break prompt so the pattern is consistent across
 // HP-changing events. Damage-taken confirmation will use the same state
 // shape in a future ship.
 const [healSuccess, setHealSuccess] = useState<{
 sourceName: string;
 expr: string;
 amount: number;
 newHp: number;
 maxHp: number;
 } | null>(null);
 // v2.86.0: Standard Actions state — tracks which action is currently
 // flashing "Used!" (cleared after 1.8s) and which is expanded to show
 // the full RAW description text.
 const [justUsedStandardAction, setJustUsedStandardAction] = useState<string | null>(null);
 const [expandedStandardAction, setExpandedStandardAction] = useState<string | null>(null);
 // v2.326.0 — T4: row expansion state for Actions-tab item rows (potions
 // and other inventory items rendered with a description). Collapsed by
 // default so the row stays at single-line height even when the item has
 // a long flavor blurb; click to reveal the full description.
 const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
 // v2.88.0: Turn-scoped effects from Standard Actions that actually change
 // character behavior while active:
 //  - dashing: doubles your effective Speed in Turn Economy (2024 PHB Dash)
 //  - dodging: shows a visible DODGING badge + reminds DM that attackers
 //    have Disadvantage (2024 PHB Dodge). Cleared on New Turn.
 const [dashingThisTurn, setDashingThisTurn] = useState(false);
 const [dodgingThisTurn, setDodgingThisTurn] = useState(false);
 // v2.88.0: Standard Actions section was collapsed by default and gated
 // by a `standardActionsOpen` toggle. v2.198.0 removed the toggle (the
 // pill-grid layout from v2.182.0 was compact enough to always show).
 // v2.206.0 — Phase Q.0 pt 46: removed the now-dead useState declaration
 // (no readers, no setters anywhere in the file). Pure hygiene cleanup.

 // v2.170.0 — Phase Q.0 pt 11: roll multiple hit dice at once.
 // Previously only rolled one die per click, which is fine RAW but
 // slow at the table (a level-10 fighter recovering from near-zero
 // might spend all 10 hit dice — 10 clicks). New UX: DM or player
 // picks how many to spend, then clicks once and all rolls animate
 // together in the 3D tray (via allDice). The strategic element
 // (gamble fewer dice hoping for high rolls vs bank all your dice)
 // is preserved — the count input is user-controlled.
 function rollHitDice(count: number) {
 const cls = CLASS_MAP[character.class_name];
 if (!cls) return;
 const hitDie = cls.hit_die;
 const conMod = abilityModifier(character.constitution);
 const spent = character.hit_dice_spent ?? 0;
 const available = Math.max(0, character.level - spent);
 const useCount = Math.max(1, Math.min(count, available));
 if (useCount === 0) return;
 // Roll `useCount` physical dice
 const dice: { die: number; value: number }[] = [];
 let diceSum = 0;
 for (let i = 0; i < useCount; i++) {
 const r = rollDie(hitDie);
 dice.push({ die: hitDie, value: r });
 diceSum += r;
 }
 // RAW: CON mod applies per die spent, not once per rest. Minimum
 // total HP recovered is 1 per die even if dice + CON would round
 // below zero (important for low-CON characters).
 const total = Math.max(useCount, diceSum + conMod * useCount);
 const newHp = Math.min(character.max_hp, character.current_hp + total);
 const gained = newHp - character.current_hp;
 const newSpent = spent + useCount;
 setShortRestHpGained(prev => prev + gained);
 applyUpdate({ current_hp: newHp, hit_dice_spent: newSpent }, true);
 // Animate via 3D tray
 triggerRoll({
 result: diceSum, dieType: hitDie,
 allDice: dice,
 flatBonus: conMod * useCount,
 total,
 expression: `${useCount}d${hitDie}${conMod >= 0 ? '+' : ''}${conMod * useCount}`,
 label: `Hit Dice — ${useCount}d${hitDie}`,
 logHistory: { characterId: character.id, userId },
 });
 }
 // Back-compat shim: anything still calling rollHitDie() rolls one.
 function rollHitDie() { rollHitDice(1); }

 function finishShortRest() {
 const newSlots = character.class_name === 'Warlock'
 ? Object.fromEntries(Object.entries(character.spell_slots).map(([k, s]) => [k, { ...(s as object), used: 0 }]))
 : character.spell_slots;

 // Recover short-rest class resources
 const abilityScores = { strength: character.strength, dexterity: character.dexterity, constitution: character.constitution, intelligence: character.intelligence, wisdom: character.wisdom, charisma: character.charisma };
 const allResources = getCharacterResources(character.class_name, character.level, abilityScores);
 const shortRestIds = allResources.filter(r => r.recovery === 'short').map(r => r.id);
 const newResources = { ...(character.class_resources ?? {}) };
 for (const id of shortRestIds) {
 const def = allResources.find(r => r.id === id);
 if (def) newResources[id] = def.getMax(character.level, abilityScores);
 }

 // Psion: regain 1 Psionic Energy Die on Short Rest
 if (character.class_name === 'Psion') {
 const maxDice = allResources.find(r => r.id === 'psionic-energy-dice')?.getMax(character.level, abilityScores) ?? 4;
 const current = (newResources['psionic-energy-dice'] as number) ?? maxDice;
 newResources['psionic-energy-dice'] = Math.min(maxDice, current + 1);
 }

 // Reset short-rest feature_uses
 const shortRestFeatures = ['Second Wind', 'Action Surge', 'Wild Shape', 'Channel Divinity', 'Bardic Inspiration'];
 const newFeatureUses = { ...(character.feature_uses as Record<string, number> ?? {}) };
 for (const name of shortRestFeatures) {
 if (newFeatureUses[name] !== undefined) delete newFeatureUses[name];
 }

 applyUpdate({ spell_slots: newSlots, class_resources: newResources, feature_uses: newFeatureUses }, true);
 setShortRestHpGained(0);
 setShowRest(false);
 setShortRestPromptedByDM(false);

 // v2.193.0 — Phase Q.0 pt 34: emit rest_taken for the unified
 // History tab. Short rests recover SR features + Warlock slots
 // (and Psion gains 1 PED). The payload carries the kind so the
 // History row can label it correctly.
 emitCombatEvent({
 campaignId: character.campaign_id ?? null,
 actorType: 'player',
 actorId: character.id,
 actorName: character.name,
 eventType: 'rest_taken',
 payload: {
 rest_kind: 'short',
 hp_gained: shortRestHpGained,
 dm_initiated: shortRestPromptedByDM,
 },
 }).catch(() => {});
 }

 function doLongRest() {
 const recoveredSlots = Object.fromEntries(
 Object.entries(character.spell_slots).map(([k, s]) => [k, { ...(s as object), used: 0 }])
 ) as typeof character.spell_slots;
 const recoveredHD = Math.max(1, Math.floor(character.level / 2));
 const newSpent = Math.max(0, (character.hit_dice_spent ?? 0) - recoveredHD);

 // Recover ALL class resources on long rest
 const abilityScores = { strength: character.strength, dexterity: character.dexterity, constitution: character.constitution, intelligence: character.intelligence, wisdom: character.wisdom, charisma: character.charisma };
 const newResources = buildDefaultResources(character.class_name, character.level, abilityScores);
 // Preserve non-numeric resources (e.g. psion-disciplines array, subclass-spells)
 const existing = (character.class_resources ?? {}) as Record<string, unknown>;
 for (const [key, val] of Object.entries(existing)) {
 if (typeof val !== 'number') newResources[key] = val as any;
 }

 // Reset ALL feature_uses on long rest
 // v2.63.0: 2024 PHB long rest behavior:
 //   - Exhaustion level reduces by 1 (was: full removal of binary 'Exhaustion' condition)
 //   - Unconscious ends when HP > 0 (long rest sets HP to max → always ends)
 //   - Other conditions persist per RAW unless their source duration expired
 //     (Charmed/Frightened/Poisoned/etc. all have specific durations from their
 //     source spell or effect — they don't auto-clear on rest)
 // v2.66.0: Optional house rule — when long_rest_clears_combat_conditions is ON,
 //   we also clear short-duration combat conditions that would naturally have
 //   expired during 8 hours of rest. Petrified + Invisible stay since they're
 //   typically tied to a specific spell.
 const newExhaustion = Math.max(0, (character.exhaustion_level ?? 0) - 1);
 const conditionsToRemove = new Set<string>(['Exhaustion', 'Unconscious']);
 if (character.long_rest_clears_combat_conditions) {
 ['Charmed', 'Frightened', 'Poisoned', 'Stunned', 'Paralyzed', 'Restrained', 'Blinded', 'Deafened', 'Grappled', 'Prone', 'Incapacitated']
 .forEach(c => conditionsToRemove.add(c));
 }
 const newConditions = (character.active_conditions ?? []).filter(c => !conditionsToRemove.has(c));

 // v2.157.0 — Phase P pt 5: magic-item charge recharge.
 // Wands, staves, and daily-use items regain charges on a long rest
 // per their recharge schedule. We log individual recharge events so
 // the player can see, e.g., "Wand of Fireballs: +4 charges (rolled
 // 1d6+1) → 7/7" in the rest summary.
 const { inventory: rechargedInventory, events: chargeEvents } =
   rechargeOnLongRest(character.inventory ?? []);
 if (chargeEvents.length > 0) {
   // eslint-disable-next-line no-console
   console.log('[long rest] item recharge:\n  ' + chargeEvents.join('\n  '));
 }

 applyUpdate({
 current_hp: character.max_hp,
 temp_hp: 0,
 spell_slots: recoveredSlots,
 active_conditions: newConditions,
 exhaustion_level: newExhaustion,
 death_saves_successes: 0,
 death_saves_failures: 0,
 hit_dice_spent: newSpent,
 class_resources: newResources,
 feature_uses: {}, // All per-rest feature uses reset on long rest
 inventory: rechargedInventory,
 }, true);
 setConcentration(null);
 setShortRestHpGained(0);
 setShowRest(false);

 // v2.193.0 — Phase Q.0 pt 34: emit rest_taken (long). Includes
 // exhaustion change in the payload since RAW long rest reduces
 // exhaustion by 1, which is a meaningful state delta to surface
 // in the History tab.
 // v2.204.0 — Phase Q.0 pt 44: per-item charge recharge events.
 // Previously chargeEvents only went to console.log so a wand
 // regaining 4 charges on long rest was invisible in the History
 // tab. Now we diff the inventory before/after rechargeOnLongRest
 // and emit one item_used event per recharged item with sub_type
 // 'charge_recharged'. UnifiedHistory's existing item_used switch
 // case (added in v2.193) will need an extension to render these,
 // but the events themselves are valuable for audit even before
 // pretty rendering lands.
 emitCombatEvent({
 campaignId: character.campaign_id ?? null,
 actorType: 'player',
 actorId: character.id,
 actorName: character.name,
 eventType: 'rest_taken',
 payload: {
 rest_kind: 'long',
 hp_restored_to_max: true,
 hd_recovered: recoveredHD,
 exhaustion_before: character.exhaustion_level ?? 0,
 exhaustion_after: newExhaustion,
 charge_events_count: chargeEvents.length,
 },
 }).catch(() => {});

 // Per-item recharge events (one per item that gained charges).
 const beforeInventory = character.inventory ?? [];
 const beforeMap = new Map(beforeInventory.map((it: any) => [it.id, it]));
 for (const after of rechargedInventory) {
 const afterAny = after as any;
 if (typeof afterAny.charges_max !== 'number') continue;
 const before = beforeMap.get(afterAny.id) as any;
 const beforeCurrent = before ? (before.charges_current ?? 0) : 0;
 const afterCurrent = afterAny.charges_current ?? 0;
 const regained = afterCurrent - beforeCurrent;
 if (regained <= 0) continue;
 emitCombatEvent({
 campaignId: character.campaign_id ?? null,
 actorType: 'system',
 actorId: character.id,
 actorName: character.name,
 eventType: 'item_used',
 payload: {
 sub_type: 'charge_recharged',
 item_name: afterAny.name,
 item_id: afterAny.id,
 magic_item_id: afterAny.magic_item_id ?? null,
 charges_before: beforeCurrent,
 charges_after: afterCurrent,
 charges_max: afterAny.charges_max,
 charges_regained: regained,
 recharge_dice: afterAny.recharge_dice ?? null,
 recharge_trigger: 'long_rest',
 },
 }).catch(() => {});
 }
 }

 // ------------------------------------------------------------------
 // Derived
 // ------------------------------------------------------------------
 const { spells: allSpells, spellMap } = useSpells();
 const hasSpellSlots = Object.values(character.spell_slots).some((s: any) => s.total > 0);
 const allSpellIds = [...new Set([...character.known_spells, ...character.prepared_spells])];
 const knownSpellData = allSpellIds
 .map(id => spellMap[id])
 .filter(Boolean)
 .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

 // Max spell level this character can cast based on their slots
 const maxSpellLevel = Object.keys(character.spell_slots).reduce((max, k) => {
 const lvl = parseInt(k, 10);
 return character.spell_slots[k].total > 0 ? Math.max(max, lvl) : max;
 }, 0);

 // All spells available to this class at this level (not yet added)
 const availableSpells = allSpells.filter(spell =>
 spell.classes.includes(character.class_name) &&
 (spell.level === 0 || spell.level <= maxSpellLevel) &&
 !allSpellIds.includes(spell.id)
 ).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

 // ------------------------------------------------------------------
 // Render
 // ------------------------------------------------------------------
 return (
 <CombatProvider campaignId={character.campaign_id}>
 <div className="animate-fade-in cs-shell">

 <CharacterHeader
 character={character}
 computed={computed}
 onOpenSettings={() => setShowSettings(true)}
 onOpenMap={character.campaign_id ? () => navigate(`/campaigns/${character.campaign_id}?tab=map`) : undefined}
 onUpdateXP={xp => applyUpdate({ experience_points: xp })}
 onOpenAvatarPicker={() => setShowAvatarPicker(true)}
 onToggleInspiration={() => applyUpdate({ inspiration: !character.inspiration }, true)}
 onOpenRest={() => setShowRest(true)}
 onUpdateAC={ac => applyUpdate({ armor_class: ac }, true)}
 onUpdateSpeed={speed => applyUpdate({ speed }, true)}
 onShare={character.share_token && character.share_enabled ? () => {
 navigator.clipboard.writeText(window.location.origin + '/share/' + character.share_token);
 } : undefined}
 onUpdateHP={(delta, tempHP) => {
 if (tempHP !== undefined) {
 // Setting temp HP directly (Aid, Armor of Agathys, etc.). RAW: temp HP
 // doesn't stack — taking the higher value is up to the player; we just set.
 handleUpdateHP(character.current_hp, tempHP);
 } else if (delta < 0) {
 // v2.54.0: Damage path — absorb temp HP FIRST per RAW.
 // Temp HP is depleted before current HP. Concentration save is required
 // for ANY damage taken (even if fully absorbed by temp HP).
 const damage = -delta;
 const tempBefore = character.temp_hp ?? 0;
 const tempAfter = Math.max(0, tempBefore - damage);
 const damageThroughTemp = tempBefore - tempAfter;
 const damageToHP = damage - damageThroughTemp;
 const newHP = Math.max(0, character.current_hp - damageToHP);
 handleUpdateHP(newHP, tempAfter, damage);
 } else {
 // Heal path — heal current HP only, never overflows max.
 const newHP = Math.max(0, Math.min(character.max_hp, character.current_hp + delta));
 handleUpdateHP(newHP, character.temp_hp);
 }
 }}
 />

 {/* v2.31: Pending level-up notification — only renders when XP has crossed the next threshold */}
 <LevelUpBanner character={character} onOpen={() => setShowLevelUp(true)} />

{/* HP Stats — stat chips + conditions strip + defense chips (v2.45.0: defenses
    now render INLINE in the stats row alongside INSP/AC/INIT/SPEED/PROF/COND
    instead of as a separate strip below) */}
 {(() => {
   const buffsForDef: any[] = (character as any).active_buffs ?? [];
   const buffResForDef: string[] = [];
   buffsForDef.forEach((b: any) => { (b.resistances ?? []).forEach((r: string) => { if (!buffResForDef.includes(r)) buffResForDef.push(r); }); });
   const defResistances = Array.from(new Set([...resolveResistances(character), ...buffResForDef]));
   const defImmunities = resolveImmunities(character);
   const defVulnerabilities = resolveVulnerabilities(character);
   const defenseChips: Array<{ label: string; color: string; kind: 'res' | 'imm' | 'vul' }> = [
     ...defResistances.map(t => ({ label: labelForDamageType(t), color: DAMAGE_TYPE_COLORS[t.toLowerCase()] ?? '#94a3b8', kind: 'res' as const })),
     ...defImmunities.map(t => ({ label: labelForDamageType(t), color: DAMAGE_TYPE_COLORS[t.toLowerCase()] ?? '#94a3b8', kind: 'imm' as const })),
     ...defVulnerabilities.map(t => ({ label: labelForDamageType(t), color: DAMAGE_TYPE_COLORS[t.toLowerCase()] ?? '#94a3b8', kind: 'vul' as const })),
   ];
   return (
     <HPStatsPanel
       character={character}
       computed={computed}
       onUpdateAC={ac => applyUpdate({ armor_class: ac }, true)}
       onUpdateSpeed={speed => applyUpdate({ speed }, true)}
       onToggleInspiration={() => applyUpdate({ inspiration: !character.inspiration }, true)}
       onUpdateConditions={handleUpdateConditions}
       onUpdateExhaustionLevel={lvl => applyUpdate({ exhaustion_level: lvl }, true)}
       defenseChips={defenseChips}
       onOpenSettings={() => setShowSettings(true)}
       dashingThisTurn={dashingThisTurn}
       dodgingThisTurn={dodgingThisTurn}
     />
   );
 })()}

 {/* Death Saves — shown when HP = 0 */}
 {character.current_hp <= 0 && !character.wildshape_active && (
 <DeathSaves
 character={character}
 onUpdate={u => applyUpdate(u, true)}
 />
 )}

 {/* Avatar picker */}
 {showAvatarPicker && (
 <AvatarPicker
 currentSeed={null}
 characterName={character.name}
 onSelect={url => applyUpdate({ avatar_url: url }, true)}
 onClose={() => setShowAvatarPicker(false)}
 />
 )}

 {/* Character settings modal — level up, edit stats, delete */}
 {showSettings && (
 <CharacterSettings
 character={character}
 onUpdate={u => applyUpdate(u, true)}
 onClose={() => setShowSettings(false)}
 />
 )}

 {/* v2.55.0: Condition info popup — opens when a chip in the active conditions
     banner is clicked. Shows the condition's name, mechanical effects, and full
     RAW description in a clean modal. */}
 {conditionInfoOpen && (() => {
 const m = CONDITION_MAP[conditionInfoOpen];
 if (!m) { setConditionInfoOpen(null); return null; }
 const effects: string[] = [];
 if (m.attackDisadvantage) effects.push('Disadvantage on attacks');
 if (m.attackAdvantageReceived) effects.push('Attackers have advantage against you');
 if (m.abilityCheckDisadvantage) effects.push('Disadvantage on ability checks');
 if (m.cantAct) effects.push("Can't take actions");
 if (m.cantReact) effects.push("Can't take reactions");
 if (m.cantMove) effects.push("Can't move");
 if (m.speedZero) effects.push('Speed becomes 0');
 if (m.autoFailSaves?.length) effects.push(`Auto-fail ${m.autoFailSaves.map(s => s.toUpperCase()).join('/')} saving throws`);
 if (m.concentrationBreaks) effects.push('Concentration on spells breaks');
 if (m.critWithin5ft) effects.push('Hits against you within 5 ft are critical hits');
 if (m.resistanceAll) effects.push('Resistance to all damage');
 const accent = m.color ?? '#94a3b8';
 return (
 <ModalPortal>
 <div className="modal-overlay" onClick={() => setConditionInfoOpen(null)}>
 <div
 className="modal"
 style={{
 maxWidth: 480, width: 'calc(100vw - 24px)',
 maxHeight: 'calc(100vh - 48px)',
 display: 'flex', flexDirection: 'column' as const,
 padding: 24, borderTop: `4px solid ${accent}`,
 }}
 onClick={e => e.stopPropagation()}
 >
 <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--c-border)' }}>
 <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: accent, marginBottom: 4 }}>
 Condition
 </div>
 <h3 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--t-1)', wordBreak: 'break-word' as const, lineHeight: 1.2 }}>
 {m.icon ? `${m.icon} ` : ''}{conditionInfoOpen}
 </h3>
 </div>
 <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' as const, marginRight: -8, paddingRight: 8 }}>
 {m.description && (
 <div style={{ marginBottom: 16 }}>
 <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--t-2)', marginBottom: 6 }}>
 Description
 </div>
 <p style={{ margin: 0, fontSize: 13, color: 'var(--t-2)', lineHeight: 1.6 }}>
 {m.description}
 </p>
 </div>
 )}
 {effects.length > 0 && (
 <div>
 <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--t-2)', marginBottom: 8 }}>
 Mechanical Effects
 </div>
 <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
 {effects.map((e, i) => (
 <li key={i} style={{ fontSize: 13, color: 'var(--t-2)', lineHeight: 1.5 }}>{e}</li>
 ))}
 </ul>
 </div>
 )}
 {(m as any).effects && Array.isArray((m as any).effects) && (m as any).effects.length > 0 && (
 <div style={{ marginTop: 16 }}>
 <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--t-2)', marginBottom: 8 }}>
 Additional Notes
 </div>
 <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
 {((m as any).effects as string[]).map((e: string, i: number) => (
 <li key={i} style={{ fontSize: 12, color: 'var(--t-3)', lineHeight: 1.5 }}>{e}</li>
 ))}
 </ul>
 </div>
 )}
 </div>
 <div style={{ display: 'flex', gap: 10, paddingTop: 14, borderTop: '1px solid var(--c-border)', marginTop: 12 }}>
 <button
 className="btn-secondary"
 onClick={() => {
 // Remove this condition from the character
 const next = (character.active_conditions ?? []).filter(c => c !== conditionInfoOpen);
 handleUpdateConditions(next);
 setConditionInfoOpen(null);
 }}
 style={{ flex: '0 1 auto', minWidth: 100, justifyContent: 'center' }}
 >
 Remove
 </button>
 <button
 onClick={() => setConditionInfoOpen(null)}
 style={{
 flex: 1, justifyContent: 'center',
 fontFamily: 'var(--ff-body)', fontWeight: 800, fontSize: 13,
 padding: '10px 16px', borderRadius: 'var(--r-md)', cursor: 'pointer',
 border: `1px solid ${accent}`, background: `${accent}28`, color: accent,
 }}
 >
 Close
 </button>
 </div>
 </div>
 </div>
 </ModalPortal>
 );
 })()}

 {/* v2.47.0: Concentration-loss toast — fires when concentration drops via
     CON save fail / incapacitation / timer expiry / DM-driven sync. Manual
     drops via the banner Drop button stay silent (the user knows they did it). */}
 {concentrationLossToast && (
 <div
 role="alert"
 style={{
 position: 'fixed', top: 70, right: 20, zIndex: 1000,
 padding: '12px 18px', borderRadius: 'var(--r-md)',
 background: 'rgba(239,68,68,0.18)',
 border: '1px solid rgba(239,68,68,0.5)',
 color: '#fca5a5',
 fontFamily: 'var(--ff-body)', fontSize: 13, fontWeight: 600,
 maxWidth: 420,
 boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
 display: 'flex', alignItems: 'flex-start', gap: 10,
 animation: 'pulse-gold 0.4s ease-out',
 }}
 >
 <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>⚠</span>
 <span style={{ flex: 1, lineHeight: 1.4 }}>{concentrationLossToast}</span>
 <button
 onClick={() => setConcentrationLossToast(null)}
 aria-label="Dismiss"
 style={{
 background: 'none', border: 'none', color: '#fca5a5',
 cursor: 'pointer', padding: 0, fontSize: 16, lineHeight: 1,
 flexShrink: 0, opacity: 0.7,
 }}
 onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
 onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.7'; }}
 >
 ✕
 </button>
 </div>
 )}

 {/* v2.377.0 — Persistent concentration banner. Renders whenever
     concentration is active (character.concentration_spell set);
     gives the player a constant visual anchor for "I'm concentrating
     on X" plus a one-click Drop button. Distinct from the transient
     "Concentration Check Required" prompt below, which fires only
     after damage and demands a save roll. Banner stays calm/static;
     the save prompt pulses for attention. */}
 {character.concentration_spell && (() => {
 const concSpell = spellMap[character.concentration_spell];
 const spellName = concSpell?.name ?? 'Unknown spell';
 const roundsLeft = (character as any).concentration_rounds_remaining as number | null;
 return (
 <div style={{
 padding: '8px 14px', borderRadius: 10,
 display: 'flex', alignItems: 'center', gap: 10,
 background: 'rgba(167,139,250,0.06)',
 border: '1px solid rgba(167,139,250,0.35)',
 }}>
 <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>◉</span>
 <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' as const }}>
 <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 800, fontSize: 10, color: '#a78bfa', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>
 Concentrating
 </span>
 <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13, color: 'var(--t-1)' }}>
 {spellName}
 </span>
 {typeof roundsLeft === 'number' && roundsLeft > 0 && (
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-3)' }}>
 · {roundsLeft} {roundsLeft === 1 ? 'round' : 'rounds'} left
 </span>
 )}
 </div>
 <button
 onClick={() => setConcentration(null)}
 title="Drop concentration on this spell"
 style={{
 fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 11,
 padding: '4px 10px', borderRadius: 'var(--r-md)', cursor: 'pointer',
 background: 'rgba(239,68,68,0.1)',
 border: '1px solid rgba(239,68,68,0.4)',
 color: '#fca5a5',
 letterSpacing: '0.04em',
 minHeight: 0, flexShrink: 0,
 }}
 >
 Drop
 </button>
 </div>
 );
 })()}

 {/* Concentration Save Prompt — shown when taking damage while concentrating
     v2.56.0: Now shows the actual damage that triggered the prompt + the formula
     breakdown so users can see why the DC is what it is. RAW: DC = max(10, floor(damage/2)),
     capped at 30. */}
 {concentrationSaveDC !== null && concentrationSpellId && (() => {
 const conScore = character.constitution ?? 10;
 const conMod = Math.floor((conScore - 10) / 2);
 const pb = Math.ceil(character.level / 4) + 1;
 const hasSaveProf = character.saving_throw_proficiencies?.includes('constitution');
 const saveBonus = conMod + (hasSaveProf ? pb : 0);
 const spellName = spellMap[concentrationSpellId]?.name ?? 'Concentration';
 const dmg = concentrationSaveDamage ?? 0;
 const halfDmg = Math.floor(dmg / 2);
 const dcReason = halfDmg >= 30
 ? `capped at 30 (half of ${dmg} = ${halfDmg})`
 : halfDmg > 10
 ? `half of ${dmg} damage = ${halfDmg}`
 : `floor of 10 (half of ${dmg} = ${halfDmg}, below floor)`;
 return (
 <div style={{
 padding: '12px 16px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
 background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.4)',
 animation: 'pulse-gold 1s ease-out 1',
 }}>
 <div style={{ flex: 1, minWidth: 0 }}>
 <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 800, fontSize: 11, color: '#a78bfa', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 3 }}>
 Concentration Check Required
 </div>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 13, color: 'var(--t-1)', fontWeight: 600 }}>
 {spellName} — took {dmg} damage → CON save DC {concentrationSaveDC}
 </div>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)', marginTop: 2 }}>
 DC = {dcReason} · need a {concentrationSaveDC - saveBonus} or higher on the d20
 </div>
 </div>
 <button
 onClick={() => {
 rollConcentrationSave(concentrationSaveDC!);
 setConcentrationSaveDC(null);
 setConcentrationSaveDamage(null);
 }}
 style={{ fontFamily: 'var(--ff-body)', fontWeight: 800, fontSize: 12, padding: '6px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer',
 background: 'rgba(167,139,250,0.2)', border: '1px solid rgba(167,139,250,0.5)', color: '#a78bfa' }}
 >
 Roll CON Save ({saveBonus >= 0 ? '+' : ''}{saveBonus})
 </button>
 <button onClick={() => { setConcentrationSaveDC(null); setConcentrationSaveDamage(null); }}
 style={{ fontFamily: 'var(--ff-body)', fontSize: 11, padding: '4px 8px', borderRadius: 'var(--r-sm)', cursor: 'pointer', background: 'transparent', border: '1px solid var(--c-border)', color: 'var(--t-3)' }}>
 Dismiss
 </button>
 </div>
 );
 })()}

 {concentrationSpellId && (() => {
 const spell = spellMap[concentrationSpellId];
 return spell ? (
 <div className="animate-fade-in" style={{
 display: 'flex', alignItems: 'center', justifyContent: 'space-between',
 padding: '14px 18px',
 background: 'linear-gradient(90deg, rgba(167,139,250,0.14), rgba(167,139,250,0.06))',
 border: '2px solid rgba(167,139,250,0.55)',
 borderRadius: 'var(--r-lg)',
 gap: 'var(--sp-3)',
 boxShadow: '0 0 0 4px rgba(167,139,250,0.08), 0 2px 8px rgba(167,139,250,0.12)',
 position: 'relative' as const,
 }}>
 {/* Pulsing indicator dot */}
 <span
 aria-hidden
 style={{
 position: 'absolute', top: 12, left: 10,
 width: 8, height: 8, borderRadius: '50%',
 background: '#a78bfa',
 boxShadow: '0 0 8px #a78bfa, 0 0 4px #a78bfa',
 animation: 'pulse-gold 1.5s ease-in-out infinite',
 }}
 />
 <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', paddingLeft: 14, flex: 1, minWidth: 0 }}>
 <div style={{ minWidth: 0, flex: 1 }}>
 <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 800, fontSize: 10, color: '#a78bfa', letterSpacing: '0.14em', textTransform: 'uppercase' as const, marginBottom: 3 }}>
 Concentrating
 </div>
 <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 15, color: 'var(--t-1)', marginBottom: 2 }}>
 {spell.name}
 </div>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)' }}>
 {spell.duration} · CON save on damage (DC 10 or half damage)
 </div>
 </div>
 </div>

 {/* v2.38.0: Round timer + "End Round" button.
 - Timer shows formatted remaining time (e.g. "1 min 30s" or "18s (3 rounds)")
 - End Round button decrements the round counter
 - At 0 rounds, concentration auto-drops with a notification.
 - Spells without a round-denominated duration (null) show "—" and no button. */}
 {(() => {
 const rounds = character.concentration_rounds_remaining;
 if (rounds === null || rounds === undefined) return (
 <div style={{ flexShrink: 0, fontSize: 10, color: 'var(--t-3)', textAlign: 'center', minWidth: 110 }}>
 No round timer
 </div>
 );
 const isLow = rounds <= 3;
 const isExpired = rounds <= 0;
 return (
 <div style={{
 display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
 flexShrink: 0, minWidth: 110,
 padding: '6px 10px', borderRadius: 'var(--r-md)',
 background: isExpired ? 'rgba(239,68,68,0.12)' : isLow ? 'rgba(251,191,36,0.10)' : 'rgba(167,139,250,0.10)',
 border: `1px solid ${isExpired ? 'rgba(239,68,68,0.4)' : isLow ? 'rgba(251,191,36,0.35)' : 'rgba(167,139,250,0.3)'}`,
 }}>
 <div style={{ fontFamily: 'var(--ff-stat)', fontWeight: 900, fontSize: 14,
 color: isExpired ? '#ef4444' : isLow ? '#fbbf24' : '#c4b5fd', lineHeight: 1 }}>
 {formatRoundsRemaining(rounds)}
 </div>
 <button
 onClick={() => {
 const next = Math.max(0, rounds - 1);
 if (next === 0) {
 // v2.47.0: Auto-drop + notify the player
 showConcentrationLossToast(concentrationSpellId, 'duration timer expired');
 applyUpdate({ concentration_spell: '', concentration_rounds_remaining: null }, true);
 } else {
 applyUpdate({ concentration_rounds_remaining: next }, true);
 }
 }}
 disabled={isExpired}
 style={{
 fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10, letterSpacing: '0.04em',
 padding: '3px 8px', borderRadius: 'var(--r-sm)', cursor: isExpired ? 'not-allowed' : 'pointer', minHeight: 0,
 background: 'rgba(167,139,250,0.15)',
 border: '1px solid rgba(167,139,250,0.4)',
 color: '#c4b5fd',
 opacity: isExpired ? 0.5 : 1,
 }}
 title="Advance combat one round (−6 seconds). Concentration drops automatically at 0."
 >
 − Round
 </button>
 </div>
 );
 })()}
 <button
 onClick={() => setConcentration(null)}
 style={{
 flexShrink: 0,
 fontFamily: 'var(--ff-body)', fontWeight: 800, fontSize: 12, letterSpacing: '0.04em',
 padding: '8px 16px', borderRadius: 'var(--r-md)', cursor: 'pointer', minHeight: 0,
 background: 'rgba(167,139,250,0.15)',
 border: '1px solid rgba(167,139,250,0.5)',
 color: '#c4b5fd',
 transition: 'all 0.15s',
 }}
 onMouseEnter={e => {
 (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.18)';
 (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(239,68,68,0.5)';
 (e.currentTarget as HTMLButtonElement).style.color = '#fca5a5';
 }}
 onMouseLeave={e => {
 (e.currentTarget as HTMLButtonElement).style.background = 'rgba(167,139,250,0.15)';
 (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(167,139,250,0.5)';
 (e.currentTarget as HTMLButtonElement).style.color = '#c4b5fd';
 }}
 title="Drop concentration on this spell"
 >
 ✕ Drop Concentration
 </button>
 </div>
 ) : null;
 })()}

 {/* Wildshape banner (Druids only) */}
 {character.class_name === 'Druid' && character.wildshape_active && (() => {
 // v2.260.0 — wildshape_max_hp is DB-nullable; treat null as 0.
 const wsMax = character.wildshape_max_hp ?? 0;
 const hpPct = wsMax > 0 ? (character.wildshape_current_hp ?? 0) / wsMax : 0;
 const hpColor = hpPct > 0.5 ? 'var(--hp-full)' : hpPct > 0.25 ? 'var(--hp-mid)' : 'var(--hp-low)';
 return (
 <div className="animate-fade-in" style={{
 display: 'flex', alignItems: 'center', justifyContent: 'space-between',
 padding: 'var(--sp-3) var(--sp-4)',
 background: 'rgba(22,163,74,0.08)',
 border: '1px solid rgba(22,163,74,0.4)',
 borderRadius: 'var(--r-md)',
 gap: 'var(--sp-3)',
 }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flex: 1, minWidth: 0 }}>
 
 <div style={{ flex: 1, minWidth: 0 }}>
 <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--hp-full)', marginBottom: 4 }}>
 Wildshape: {character.wildshape_beast_name}
 </div>
 <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
 <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-md)', color: hpColor }}>
 {character.wildshape_current_hp ?? 0}/{character.wildshape_max_hp} HP
 </span>
 <div style={{ flex: 1 }}>
 <div className="hp-bar-container" style={{ height: 4 }}>
 <div className="hp-bar-fill" style={{ width: `${Math.max(0, hpPct * 100)}%`, background: hpColor }} />
 </div>
 </div>
 </div>
 </div>
 </div>
 <button
 onClick={() => applyUpdate({ wildshape_active: false, wildshape_beast_name: '', wildshape_current_hp: 0, wildshape_max_hp: 0 }, true)}
 className="btn-secondary btn-sm"
 style={{ flexShrink: 0, borderColor: 'rgba(22,163,74,0.4)', color: 'var(--hp-full)' }}
 >
 Drop Form
 </button>
 </div>
 );
 })()}

 {/* Rest modal */}
 {showRest && (
 <ModalPortal>
 <div className="modal-overlay" onClick={() => { setShortRestHpGained(0); setShowRest(false); setShortRestPromptedByDM(false); }}>
 {/* v2.170.0 — Phase Q.0 pt 11: bumped 420→600 and added inline
     padding (same fix as Campaign Settings v2.168). Title was
     previously truncating against the left edge. */}
 <div className="modal" style={{ maxWidth: 600, width: '92vw', padding: '20px 24px' }} onClick={e => e.stopPropagation()}>
 <h2 style={{ marginBottom: 'var(--sp-2)' }}>
 Take a Rest
 {shortRestPromptedByDM && (
 <span style={{
 marginLeft: 8, fontSize: 10, fontWeight: 800,
 padding: '3px 9px', borderRadius: 999,
 background: 'rgba(96,165,250,0.15)', color: '#60a5fa',
 border: '1px solid rgba(96,165,250,0.4)',
 textTransform: 'uppercase' as const, letterSpacing: '0.08em',
 verticalAlign: 'middle',
 }}>
 DM called Short Rest
 </span>
 )}
 </h2>
 <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>

 {/* Short rest panel */}
 <div className="panel">
 <h4 style={{ marginBottom: 'var(--sp-3)' }}>Short Rest</h4>

 {/* Hit dice status */}
 {(() => {
 const cls = CLASS_MAP[character.class_name];
 const hitDie = cls?.hit_die ?? 8;
 const spent = character.hit_dice_spent ?? 0;
 const available = Math.max(0, character.level - spent);
 const conMod = abilityModifier(character.constitution);
 const atMax = character.current_hp >= character.max_hp;

 return (
 <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
 <div>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-2)', marginBottom: 2 }}>
 Hit Dice Available
 </div>
 <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-lg)', color: available > 0 ? 'var(--c-gold-l)' : 'var(--t-2)' }}>
 {available} / {character.level} d{hitDie}
 </div>
 </div>
 <div style={{ textAlign: 'right' }}>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-2)', marginBottom: 2 }}>
 Current HP
 </div>
 <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-lg)', color: 'var(--t-1)' }}>
 {character.current_hp} / {character.max_hp}
 </div>
 </div>
 </div>

 {shortRestHpGained > 0 && (
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: 'var(--hp-full)', textAlign: 'center' }}>
 +{shortRestHpGained} HP recovered this rest
 </div>
 )}

 {/* v2.170.0 — Phase Q.0 pt 11: pick how many dice to spend, then
     roll them all at once. Lets players gamble fewer dice hoping
     for high rolls, or burn more to guarantee recovery. Input is
     clamped 1..available. Rolls all dice in a single 3D animation
     via allDice / flatBonus for the CON modifier. */}
 <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexWrap: 'wrap' as const }}>
 <label style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--t-2)' }}>
 Spend
 </label>
 <input
 type="number"
 min={1}
 max={available}
 value={hitDiceToSpend}
 onChange={e => setHitDiceToSpend(e.target.value)}
 placeholder="1"
 disabled={available === 0 || atMax}
 style={{ width: 50, fontSize: 14, fontFamily: 'var(--ff-stat)', fontWeight: 700, textAlign: 'center', padding: '6px', borderRadius: 6, border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', color: 'var(--t-1)' }}
 />
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-3)' }}>
 / {available}
 </span>
 <button
 className="btn-gold"
 onClick={() => {
 const n = Math.max(1, Math.min(parseInt(hitDiceToSpend) || 1, available));
 rollHitDice(n);
 setHitDiceToSpend('');
 }}
 disabled={available === 0 || atMax}
 style={{ flex: 1, justifyContent: 'center', minWidth: 180 }}
 title={available === 0 ? 'No hit dice remaining' : atMax ? 'Already at max HP' : 'Rolls all selected dice in one go'}
 >
 Roll Hit Dice (d{hitDie}{conMod >= 0 ? '+' : ''}{conMod})
 </button>
 <button
 className="btn-secondary"
 onClick={finishShortRest}
 title="End short rest"
 >
 Done
 </button>
 </div>

 {character.class_name === 'Warlock' && (
 <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--c-gold-l)', fontFamily: 'var(--ff-body)' }}>
 Pact Magic slots will be recovered when you finish this rest.
 </p>
 )}

 {available === 0 && (
 <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)' }}>
 No hit dice remaining. Take a long rest to recover them.
 </p>
 )}
 </div>
 );
 })()}
 </div>

 {/* Long rest panel */}
 <div className="panel">
 <h4 style={{ marginBottom: 'var(--sp-2)' }}>Long Rest</h4>
 <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', marginBottom: 'var(--sp-3)', lineHeight: 1.5 }}>
 8+ hours. Regain all HP, all spell slots, and half your spent hit dice (min 1).
 Removes one level of Exhaustion.
 </p>
 <button className="btn-gold" onClick={doLongRest} style={{ width: '100%', justifyContent: 'center' }}>
 Take Long Rest
 </button>
 </div>
 </div>

 <button
 className="btn-ghost btn-sm"
 onClick={() => { setShortRestHpGained(0); setShowRest(false); setShortRestPromptedByDM(false); }}
 style={{ marginTop: 'var(--sp-4)' }}
 >
 Cancel
 </button>
 </div>
 </div>
 </ModalPortal>
 )}

 {/* v2.39.0: Removed the "Saving..." spinner that caused layout shift on every
 keystroke / state change. Saves happen silently in the background. Errors still
 show here so the user knows if something didn't persist. */}
 {saveError && !saving && (
 <div style={{ height: 20, display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--c-red-l)' }}>
 {saveError}
 </span>
 </div>
 )}



 {/* Concentration banner */}
 {/* v2.38.0: removed duplicate yellow "Concentrating: X / End" banner.
 The purple banner higher on the page already shows concentration state
 with a full-featured "Drop Concentration" button and duration countdown. */}

 {/* Active condition warning banner — v2.55.0: chips are CLICKABLE buttons
     that open a popup with the full condition info. Hover tooltip stays as
     a quick preview, but the click reveals everything (mechanical effects +
     RAW description) in a more reliable surface than a browser title tooltip. */}
 {(() => {
 const allConditions = character.active_conditions ?? [];
 if (!allConditions.length) return null;
 return (
 <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-2) var(--sp-4)', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 'var(--r-md)', flexWrap: 'wrap' }}>
 <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--c-red-l)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Active Conditions:</span>
 {allConditions.map(c => {
 const m = CONDITION_MAP[c];
 return (
 <button
 key={c}
 onClick={() => setConditionInfoOpen(c)}
 title={`${c} — click for details`}
 style={{
 fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700,
 color: m?.color ?? 'var(--t-2)',
 background: `${m?.color ?? '#64748b'}18`,
 border: `1px solid ${m?.color ?? '#64748b'}45`,
 padding: '3px 12px', borderRadius: 999,
 cursor: 'pointer', userSelect: 'none' as const,
 transition: 'background 0.15s, border-color 0.15s, transform 0.1s',
 minHeight: 0,
 }}
 onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = `${m?.color ?? '#64748b'}30`; }}
 onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = `${m?.color ?? '#64748b'}18`; }}
 onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.97)'; }}
 onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
 >
 {m?.icon ? `${m.icon} ` : ''}{c}
 </button>
 );
 })}
 </div>
 );
 })()}

 {/* ── HUD TWO-COLUMN LAYOUT ── */}
 <div className="cs-hud-layout">
 {/* ── LEFT VITALS COLUMN — sticky on desktop ── */}
 <aside className="cs-vitals-col">
 {/* v2.77.0: Turn Economy relocated here, ABOVE Saving Throws per user
     request. On mobile the vitals column renders first in the flow, so
     this places Turn Economy near the top of the sheet where it's most
     useful during combat. On desktop it sits at the top of the sticky
     left rail so the player doesn't have to scroll to reach it.
     v2.53.0 note still applies: immobilizing conditions zero out
     effective speed. */}
 {(() => {
 const baseSpeed = character.speed ?? 30;
 const immobilized = (character.active_conditions ?? []).some(
 c => CONDITION_MAP[c]?.speedZero || CONDITION_MAP[c]?.cantMove
 );
 // v2.143.0 — Phase N pt 1: full canonical math mirror, matching
 // lib/movement.ts canMove() order: zero check (wins) → exhaustion
 // (−5ft per level, clamped at 0) → halve if Encumbered → double if
 // Dashing. Prior v2.136 version skipped exhaustion per a stale
 // comment; character.exhaustion_level has always been on the
 // Character type (types/index.ts line 233).
 const exhaustionLvl = character.exhaustion_level ?? 0;
 const speedAfterExhaustion = Math.max(0, baseSpeed - 5 * exhaustionLvl);
 const halved = (character.active_conditions ?? []).some(
 c => CONDITION_MAP[c]?.speedHalved
 );
 const speedAfterHalving = halved ? Math.floor(speedAfterExhaustion / 2) : speedAfterExhaustion;
 // v2.88.0: Dashing doubles your effective Speed for the turn per 2024 PHB
 // ("you gain extra Movement equal to your Speed for the current turn").
 // Applied after the immobilized check so a paralyzed character can't Dash
 // out of 0 speed.
 const effectiveSpeed = immobilized ? 0 : (dashingThisTurn ? speedAfterHalving * 2 : speedAfterHalving);
 return (
 <div style={{ marginBottom: 'var(--sp-3)' }}>
 <ActionEconomy
 speedFeet={effectiveSpeed}
 actionUsedExternal={spellCastThisTurn}
 bonusActionUsedExternal={bonusActionSpellCast}
 reactionUsedExternal={reactionUsedThisTurn}
 onActionUsed={(action: string, used: boolean) => {
 if (action === 'action') setSpellCastThisTurn(used);
 if (action === 'bonusAction') setBonusActionSpellCast(used);
 if (action === 'reaction') setReactionUsedThisTurn(used);
 if (action === 'action' && used && (combatFilter === 'all')) setCombatFilter('bonus');
 if (action === 'action' && !used) setCombatFilter('all');
 }}
 onNewTurn={() => {
 setSpellCastThisTurn(false);
 setBonusActionSpellCast(false);
 setReactionUsedThisTurn(false);
 // v2.88.0: Dash / Dodge effects end when your turn ends.
 setDashingThisTurn(false);
 setDodgingThisTurn(false);
 }}
 />
 </div>
 );
 })()}

 {/* Ability scores in the vitals column on desktop */}
 <div className="cs-vitals-ability-scores">
 <AbilityScores character={character} computed={computed} />
 </div>
 </aside>

 {/* ── RIGHT CONTENT COLUMN — scrollable ── */}
 <div className="cs-content-col">

 {/* ── DM Announcement banner ── */}
 {dmAnnouncement && (
 <div style={{
 padding: '12px 16px', borderRadius: 10,
 background: 'linear-gradient(135deg, rgba(212,160,23,0.18), rgba(212,160,23,0.08))',
 border: '1px solid var(--c-gold-bdr)',
 display: 'flex', alignItems: 'flex-start', gap: 12,
 animation: 'pulse-gold 2s ease-out 1',
 }}>
 <span style={{ fontSize: 16, flexShrink: 0 }}></span>
 <div style={{ flex: 1 }}>
 <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--c-gold-l)', marginBottom: 4 }}>
 DM Announcement
 </div>
 <div style={{ fontSize: 13, color: 'var(--t-1)', lineHeight: 1.6 }}>{dmAnnouncement}</div>
 </div>
 <button onClick={() => setDmAnnouncement(null)}
 style={{ fontSize: 11, color: 'var(--t-3)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: '0 4px' }}>
 
 </button>
 </div>
 )}

 {/* ── Save Prompt banner ── */}
 {savePrompt && (() => {
 const abilityKey = savePrompt.ability.toLowerCase() as keyof typeof character;
 // v2.327.0 — T5: read the effective score from computed.ability_scores
 // so an attuned Headband of Intellect / Gauntlets of Ogre Power
 // actually changes the save modifier the player sees.
 const score = (computed.ability_scores as any)[abilityKey] ?? (character[abilityKey] as number) ?? 10;
 const mod = Math.floor((score - 10) / 2);
 // v2.260.0 — was reading computed.proficiencyBonus (camelCase),
 // but the ComputedStats field is proficiency_bonus (snake_case).
 // The ?? 2 fallback was masking the bug — every save prompt
 // computed PB=2 regardless of level.
 const pb = computed.proficiency_bonus;
 const hasSaveProf = character.saving_throw_proficiencies?.includes(savePrompt.ability.toLowerCase());
 const total = mod + (hasSaveProf ? pb : 0);
 const needsToRoll = savePrompt.dc - total;
 return (
 <div style={{
 padding: '12px 16px', borderRadius: 10,
 background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.4)',
 display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
 }}>
 <div style={{ flex: 1 }}>
 <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#60a5fa', marginBottom: 4 }}>
 Saving Throw Required
 </div>
 <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-1)' }}>
 {savePrompt.ability} Save — DC {savePrompt.dc}
 </div>
 <div style={{ fontSize: 11, color: 'var(--t-3)', marginTop: 2 }}>
 Your modifier: {total >= 0 ? '+' : ''}{total}{hasSaveProf ? ' (proficient)' : ''}
 {' · '}Need to roll {Math.max(1, Math.min(20, needsToRoll))}+ on d20
 </div>
 </div>
 {/* v2.170.0 — Phase Q.0 pt 11: Dismiss button removed per playtest
     feedback. A DM-required save is not optional; the player must
     roll it. Roll button synthesizes 2d20 if adv/dis is set in the
     future (save_prompt schema doesn't carry adv/dis today, but the
     structure is ready). Pass/fail is surfaced via the Character
     History log on settle (RAW result = d20 + mod vs DC). */}
 <div style={{ display: 'flex', gap: 6 }}>
 <button
 onClick={() => {
 const dc = savePrompt.dc;
 triggerRoll({
 result: 0, dieType: 20, modifier: total,
 label: `${savePrompt.ability} Save (DC ${dc})`,
 logHistory: { characterId: character.id, userId },
 onResult: (dice, rolledTotal) => {
 const pass = rolledTotal >= dc;
 // Fire a persistent history row so the Roll & Action
 // log shows whether the save succeeded.
 logHistoryEvent({
 characterId: character.id,
 userId,
 eventType: 'save',
 description: `${savePrompt.ability} save DC ${dc}: ${dice.map(d=>d.value).join(',')} + ${total >= 0 ? '+' : ''}${total} = ${rolledTotal} — ${pass ? 'SUCCESS' : 'FAIL'}`,
 newValue: rolledTotal,
 }).catch(() => {});
 },
 });
 setSavePrompt(null);
 }}
 style={{ fontSize: 12, fontWeight: 700, padding: '7px 16px', borderRadius: 7, cursor: 'pointer', minHeight: 0, border: '1px solid #60a5fa', background: '#60a5fa', color: '#fff' }}>
 🎲 Roll Save
 </button>
 </div>
 </div>
 );
 })()}

 {/* v2.163.0 — Phase Q.0 pt 4: ability check prompt from DM.
     Mirrors save_prompt visually but uses purple accent so it's
     visually distinct. Includes a Roll button that triggers the
     3D dice roller with the appropriate modifier baked in. */}
 {checkPrompt && (() => {
 const isSkill = checkPrompt.kind === 'skill';
 // Map the abbreviated ability code back to the AbilityKey if needed
 const abilityMap: Record<string, keyof typeof character> = {
   STR: 'strength', DEX: 'dexterity', CON: 'constitution',
   INT: 'intelligence', WIS: 'wisdom', CHA: 'charisma',
 };
 let mod = 0;
 let proficient = false;
 if (isSkill) {
   const skillTarget = SKILL_LIST_STATIC.find(s => s.name === checkPrompt.target);
   if (skillTarget) {
     const score = (character[skillTarget.ability as keyof typeof character] as number) ?? 10;
     mod = Math.floor((score - 10) / 2);
     proficient = (character.skill_proficiencies ?? []).includes(checkPrompt.target);
     // v2.260.0 — same camelCase→snake_case fix; was silently using
     // PB=2 for every skill check regardless of level.
     if (proficient) mod += computed.proficiency_bonus;
     const expert = (character.skill_expertises ?? []).includes(checkPrompt.target);
     if (expert) mod += computed.proficiency_bonus;
   }
 } else {
   const ability = abilityMap[checkPrompt.target];
   if (ability) {
     // v2.327.0 — T5: prefer computed.ability_scores so attunement
     // overrides flow into ability-check prompts the same way they
     // do for skills (which already route through computed.skills).
     const score = (computed.ability_scores as any)[ability] ?? (character[ability] as number) ?? 10;
     mod = Math.floor((score - 10) / 2);
   }
 }
 const accent = '#a78bfa';
 const rollLabel = isSkill ? checkPrompt.target : `${checkPrompt.target} check`;
 return (
 <div style={{
 padding: '12px 16px', borderRadius: 10,
 background: 'rgba(167,139,250,0.08)', border: `1px solid ${accent}`,
 display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
 }}>
 <div style={{ flex: 1 }}>
 <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: accent, marginBottom: 4 }}>
 Ability Check Requested
 </div>
 <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-1)' }}>
 {rollLabel}{checkPrompt.dc != null ? ` — DC ${checkPrompt.dc}` : ''}
 {checkPrompt.advantage && <span style={{ color: '#4ade80', marginLeft: 6, fontSize: 10 }}>ADV</span>}
 {checkPrompt.disadvantage && <span style={{ color: '#f87171', marginLeft: 6, fontSize: 10 }}>DIS</span>}
 </div>
 <div style={{ fontSize: 11, color: 'var(--t-3)', marginTop: 2 }}>
 Your modifier: {mod >= 0 ? '+' : ''}{mod}{proficient ? ' (proficient)' : ''}
 </div>
 </div>
 <div style={{ display: 'flex', gap: 6 }}>
 <button
 onClick={() => {
 // v2.170.0 — Phase Q.0 pt 11: when adv or dis is set, pre-roll
 // 2d20 programmatically and hand both to the 3D tray via
 // allDice. The tray then animates TWO physical dice and
 // visually dims the one NOT used (dropped flag). Fixes the
 // "advantage isn't rolling twice" bug — previously only a
 // single die appeared even with adv/dis marked.
 const advantage = !!checkPrompt.advantage && !checkPrompt.disadvantage;
 const disadvantage = !!checkPrompt.disadvantage && !checkPrompt.advantage;
 const hasAdvDis = advantage || disadvantage;
 if (hasAdvDis) {
 const r1 = Math.floor(Math.random() * 20) + 1;
 const r2 = Math.floor(Math.random() * 20) + 1;
 const keep = advantage ? Math.max(r1, r2) : Math.min(r1, r2);
 const dice = [
 { die: 20, value: r1, dropped: advantage ? r1 < r2 : r1 > r2 },
 { die: 20, value: r2, dropped: advantage ? r2 < r1 : r2 > r1 },
 ] as any[];
 // If r1 === r2, neither is dropped (tie).
 if (r1 === r2) { dice[0].dropped = false; dice[1].dropped = false; }
 const total = keep + mod;
 triggerRoll({
 result: keep, dieType: 20, modifier: mod,
 allDice: dice, flatBonus: mod, total,
 expression: `2d20${advantage ? 'kh1' : 'kl1'}${mod >= 0 ? '+' : ''}${mod}`,
 label: `${rollLabel} · ${advantage ? 'ADV' : 'DIS'}`,
 logHistory: { characterId: character.id, userId },
 onResult: (_d, rolledTotal) => {
 if (checkPrompt.dc != null) {
 const pass = rolledTotal >= checkPrompt.dc;
 logHistoryEvent({
 characterId: character.id, userId,
 eventType: 'check',
 description: `${rollLabel} DC ${checkPrompt.dc}: 2d20 ${advantage ? 'kh1' : 'kl1'} (${r1}, ${r2}) → kept ${keep} ${mod >= 0 ? '+' : ''}${mod} = ${rolledTotal} — ${pass ? 'SUCCESS' : 'FAIL'}`,
 newValue: rolledTotal,
 }).catch(() => {});
 }
 },
 });
 } else {
 triggerRoll({
 result: 0, dieType: 20, modifier: mod, label: rollLabel,
 advantage: false, disadvantage: false,
 logHistory: { characterId: character.id, userId },
 onResult: (dice, rolledTotal) => {
 if (checkPrompt.dc != null) {
 const pass = rolledTotal >= checkPrompt.dc;
 const d20 = dice.find(d => d.die === 20)?.value ?? 0;
 logHistoryEvent({
 characterId: character.id, userId,
 eventType: 'check',
 description: `${rollLabel} DC ${checkPrompt.dc}: d20(${d20}) ${mod >= 0 ? '+' : ''}${mod} = ${rolledTotal} — ${pass ? 'SUCCESS' : 'FAIL'}`,
 newValue: rolledTotal,
 }).catch(() => {});
 }
 },
 });
 }
 setCheckPrompt(null);
 }}
 style={{ fontSize: 11, fontWeight: 700, padding: '6px 14px', borderRadius: 7, cursor: 'pointer', minHeight: 0, border: `1px solid ${accent}`, background: accent, color: '#fff' }}>
 🎲 Roll
 </button>
 <button
 onClick={() => setCheckPrompt(null)}
 style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 7, cursor: 'pointer', minHeight: 0, border: '1px solid rgba(167,139,250,0.3)', background: 'rgba(167,139,250,0.08)', color: accent }}>
 Dismiss
 </button>
 </div>
 </div>
 );
 })()}

 {/* v2.167.0 — Phase Q.0 pt 8: long rest applied banner.
     Auto-dismisses after 8s; the inbox preserves the entry. */}
 {longRestCompleted && (
 <div style={{
 padding: '10px 14px', borderRadius: 10,
 background: 'rgba(212,160,23,0.1)', border: '1px solid var(--c-gold-bdr)',
 display: 'flex', alignItems: 'center', gap: 10,
 }}>
 <span style={{ fontSize: 18, flexShrink: 0 }}>🌙</span>
 <div style={{ flex: 1 }}>
 <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--c-gold-l)', marginBottom: 2 }}>
 Long Rest Completed
 </div>
 <div style={{ fontSize: 12, color: 'var(--t-1)' }}>
 The DM applied a party long rest. HP, spell slots, hit dice, and class resources have been restored.
 </div>
 </div>
 <button onClick={() => setLongRestCompleted(false)}
 style={{ fontSize: 11, color: 'var(--t-3)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: '0 4px' }}>
 ✕
 </button>
 </div>
 )}

 {/* ── Your Turn banner ── */}
 {/* v2.294.0 — Inlined sub-component (defined at module bottom).
     Reads combat state via useCombat() so it can stay inside
     the existing CombatProvider tree. Was a JSX block driven by
     parent state; the parent state itself was driven by a dead
     session_states sub. */}
 <YourTurnBanner characterId={character.id} characterName={character.name} />

 {/* ── Divider ── */}
 <div style={{ height: 1, background: 'var(--c-border)' }} />

 {/* v2.380.0 — Quick-cast favorites bar. Renders only when at least
     one spell is pinned. Each chip is a full SpellCastButton (same
     Cast modal / save resolver / upcast flow as the Spells tab). The
     small × button next to each chip lets the user unpin without
     navigating away. Horizontally scrollable on narrow viewports. */}
 {(character.pinned_spells ?? []).length > 0 && (() => {
 const pinnedData = (character.pinned_spells ?? [])
 .map(id => spellMap[id])
 .filter((s): s is NonNullable<typeof s> => !!s);
 if (pinnedData.length === 0) return null;
 return (
 <div style={{
 display: 'flex', alignItems: 'center', gap: 6,
 padding: '6px 10px',
 background: 'rgba(201,146,42,0.04)',
 borderBottom: '1px solid var(--c-border)',
 overflowX: 'auto' as const, flexWrap: 'nowrap' as const,
 }}>
 <span style={{
 fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 800,
 letterSpacing: '0.14em', textTransform: 'uppercase' as const,
 color: 'var(--c-gold-l)',
 flexShrink: 0, paddingRight: 4,
 }}>
 ★ Quick Cast
 </span>
 {pinnedData.map(spell => (
 <div key={spell.id} style={{
 display: 'flex', alignItems: 'center', gap: 2,
 background: 'var(--c-card)',
 border: '1px solid var(--c-border-m)',
 borderRadius: 'var(--r-md)',
 padding: '2px 4px 2px 8px',
 flexShrink: 0,
 }}>
 <span style={{
 fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 700,
 color: 'var(--t-1)', whiteSpace: 'nowrap' as const,
 maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis',
 }} title={spell.name}>
 {spell.name}
 </span>
 <SpellCastButton
 character={character}
 spell={spell}
 onUpdateSlots={handleUpdateSlots}
 onConcentrationCast={() => setConcentration(spell.id)}
 userId={userId}
 campaignId={character.campaign_id}
 compact
 />
 <button
 onClick={() => {
 const pinned = character.pinned_spells ?? [];
 applyUpdate({ pinned_spells: pinned.filter(x => x !== spell.id) }, true);
 }}
 title="Unpin from quick-cast"
 aria-label={`Unpin ${spell.name}`}
 style={{
 background: 'transparent', border: 'none',
 padding: '0 4px', cursor: 'pointer',
 fontSize: 12, lineHeight: 1, minHeight: 0,
 color: 'var(--t-3)', flexShrink: 0,
 }}
 >
 ×
 </button>
 </div>
 ))}
 </div>
 );
 })()}

 {/* v2.77.0: Turn Economy moved to the vitals column (above Saving Throws)
     per user request. See the top of cs-vitals-col for the actual render. */}

 {/* Tabs */}
 <div className="tabs" style={{ overflowX: "auto", flexWrap: "nowrap" }}>
 {TABS.map(tab => (
 <button
 key={tab.id}
 className={`tab ${activeTab === tab.id ? 'active' : ''}`}
 onClick={() => setActiveTab(tab.id)}
 >
 {tab.label}
 {tab.id === 'spells' && allSpellIds.length > 0 && (
 <span style={{ marginLeft: 4, fontSize: 10, background: 'rgba(201,146,42,0.2)', color: 'var(--c-gold-l)', padding: '1px 5px', borderRadius: 9, fontFamily: 'var(--ff-body)' }}>
 {allSpellIds.length}
 </span>
 )}
 </button>
 ))}
 </div>

 {/* Tab content */}
 <div>
 <DamageEffect
 currentHP={character.current_hp}
 maxHP={character.max_hp}
 lastDamageNotes={lastDamageNotes}
 />
 <ErrorBoundary section={activeTab}>
 <div key={activeTab} className="animate-fade-in">

 {/* ── GLOBAL ALERTS — spell assignment + pending choices ── */}
 <PendingChoicesAlert character={character} onUpdate={u => applyUpdate(u, true)} />
 {/* v2.260.0 — was reading character.is_spellcaster which doesn't
     exist on Character; the field lives on ClassData. The OR-fallback
     to spell_slots was masking the bug. Look up the class properly. */}
 {(CLASS_MAP[character.class_name]?.is_spellcaster || Object.values(character.spell_slots).some((s: any) => s.total > 0)) && (activeTab === 'spells' || activeTab === 'actions') && (
 <SpellCompletionBanner
 character={character}
 onGoToSpells={() => {
 const evt = new CustomEvent('dndkeep:gototab', { detail: 'spells' });
 window.dispatchEvent(evt);
 }}
 />
 )}

 {/* ── ABILITIES: Skills + Passive Scores + Senses + Tools & Languages ──
     v2.51.0: Conditions panel removed (visible at top via COND chip + active
     conditions banner). Passive/Senses/Tools/Languages relocated here from
     the left sidebar so they live with the rest of the character info. */}
 {activeTab === 'abilities' && (
 <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
 <SkillsList character={character} computed={computed} onUpdate={u => applyUpdate(u, true)} />

 {/* ── Passive Scores ── */}
 <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: '12px 14px' }}>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: 'var(--c-gold-l)', marginBottom: 8 }}>
 Passive Scores
 </div>
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 6 }}>
 {[
 { label: 'Passive Perception', value: computed.passive_perception },
 { label: 'Passive Investigation', value: computed.passive_investigation },
 { label: 'Passive Insight', value: computed.passive_insight },
 ].map(({ label, value }) => (
 <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: 'var(--r-sm)', background: 'var(--c-raised)' }}>
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)' }}>{label}</span>
 <span style={{ fontFamily: 'var(--ff-stat)', fontWeight: 800, fontSize: 14, color: 'var(--t-1)' }}>{value}</span>
 </div>
 ))}
 </div>
 </div>

 {/* ── Senses ── */}
 {(() => {
 const speciesData = SPECIES.find(s => s.name === character.species);
 const dv = (character as any).darkvision ?? speciesData?.darkvision ?? 0;
 if (dv === 0) return null;
 return (
 <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: '12px 14px' }}>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: 'var(--c-gold-l)', marginBottom: 8 }}>
 Senses
 </div>
 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderRadius: 'var(--r-sm)', background: 'var(--c-raised)' }}>
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)' }}>Darkvision</span>
 <span style={{ fontFamily: 'var(--ff-stat)', fontWeight: 800, fontSize: 13, color: '#60a5fa' }}>{dv} ft.</span>
 </div>
 </div>
 );
 })()}

 {/* ── Languages (own section) ──
     v2.83.0: Tools & Languages were previously combined in one card. Split
     into two separate sections per user request: Languages sits above
     (right after Senses), Tools at the very bottom of the Abilities tab.
     Makes each list easier to scan without visual competition. */}
 {(() => {
 const bgData = BACKGROUNDS.find((b: any) => b.name === character.background);
 const speciesData = SPECIES.find(s => s.name === character.species);
 const speciesLangs = speciesData?.languages ?? [];
 const bgBonusLangCount = bgData?.languages ?? 0;
 const extraLangs = character.extra_languages ?? [];
 const allLangs: string[] = [
 ...speciesLangs,
 ...extraLangs,
 ];
 if (allLangs.length === 0 && bgBonusLangCount === 0) return null;
 return (
 <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: '12px 14px' }}>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: 'var(--c-gold-l)', marginBottom: 8 }}>
 Languages
 </div>
 <div style={{ padding: '6px 10px', borderRadius: 'var(--r-sm)', background: 'var(--c-raised)' }}>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)' }}>
 {allLangs.join(', ')}{bgBonusLangCount > 0 && extraLangs.length < bgBonusLangCount ? ` + ${bgBonusLangCount - extraLangs.length} choice` : ''}
 </div>
 </div>
 </div>
 );
 })()}

 {/* ── Tools (own section, at the bottom of Abilities tab) ── */}
 {(() => {
 const bgData = BACKGROUNDS.find((b: any) => b.name === character.background);
 const bgTool = bgData?.tool_proficiency ?? null;
 const extraTools = character.extra_tool_proficiencies ?? [];
 const allTools: string[] = [
 ...(bgTool ? [bgTool] : []),
 ...extraTools,
 ];
 if (allTools.length === 0) return null;
 return (
 <div style={{ background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-md)', padding: '12px 14px' }}>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: 'var(--c-gold-l)', marginBottom: 8 }}>
 Tools
 </div>
 <div style={{ padding: '6px 10px', borderRadius: 'var(--r-sm)', background: 'var(--c-raised)' }}>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)' }}>
 {allTools.join(', ')}
 </div>
 </div>
 </div>
 );
 })()}
 </div>
 )}

 {/* ── FEATURES & TRAITS ── */}
 {activeTab === 'features' && (
 <FeaturesAndTraitsPanel
 character={character}
 onUpdate={u => applyUpdate(u, true)}
 />
 )}

 {/* ── SPELLS ── */}
 {activeTab === 'spells' && (
 <SpellsTab
 character={character}
 computed={computed}
 knownSpellData={knownSpellData}
 availableSpells={availableSpells}
 maxSpellLevel={maxSpellLevel}
 concentrationSpellId={concentrationSpellId}
 hasSpellSlots={hasSpellSlots}
 onUpdateSlots={handleUpdateSlots}
 onAddSpell={id => {
 const check = canAddKnownSpell(character, id);
 if (!check.allowed) {
 // v2.263.0 — was console.warn only. Surface the block reason so
 // the user sees "Cantrip limit reached (3/3)" or "Already known"
 // instead of clicking and getting no feedback.
 toast.showToast(check.reason ?? 'Cannot add this spell', 'warn');
 return;
 }
 applyUpdate({ known_spells: [...character.known_spells, id] }, true);
 }}
 onRemoveSpell={id => {
 if (concentrationSpellId === id) setConcentration(null);
 applyUpdate({ known_spells: character.known_spells.filter(x => x !== id), prepared_spells: character.prepared_spells.filter(x => x !== id) }, true);
 }}
 onTogglePrepared={id => {
 const is = character.prepared_spells.includes(id);
 if (is) {
 // Always allow unpreparing
 applyUpdate({ prepared_spells: character.prepared_spells.filter(x => x !== id) }, true);
 } else {
 // Use canonical enforcement — single source of truth (src/lib/spellLimits.ts)
 const check = canPrepareSpell(character, id);
 if (!check.allowed) {
 // v2.263.0 — was console.warn only, which left the player
 // thinking the prepare toggle was broken. Surface the reason
 // (from spellLimits.ts: "Prepared spell limit reached (16/17)",
 // "Already prepared", etc.) as a toast so the user knows why.
 toast.showToast(check.reason ?? 'Cannot prepare this spell', 'warn');
 return;
 }
 applyUpdate({ prepared_spells: [...character.prepared_spells, id] }, true);
 }
 }}
 onConcentrate={id => setConcentration(concentrationSpellId === id ? null : id)}
 onTogglePinned={id => {
 // v2.380.0 — Toggle spell ID in/out of pinned_spells.
 // Always allow removal. Adding gated by 6-pin cap; toast
 // on overflow so the user knows why nothing happened.
 const pinned = character.pinned_spells ?? [];
 if (pinned.includes(id)) {
 applyUpdate({ pinned_spells: pinned.filter(x => x !== id) }, true);
 } else {
 if (pinned.length >= 6) {
 toast.showToast('Quick-cast bar is full (6 max). Unpin one to add this.', 'warn');
 return;
 }
 applyUpdate({ pinned_spells: [...pinned, id] }, true);
 }
 }}
 userId={userId}
 campaignId={character.campaign_id}
 />
 )}

 {/* ── COMBAT: Weapons & Attacks only ── */}
 {activeTab === 'actions' && (() => {
 // v2.179.0 — Phase Q.0 pt 20: equip-auto-attack.
 // v2.266.0 — the inline filter + map were extracted to
 // src/lib/inventoryWeapon.ts so the Inventory tab can also
 // strike from equipped weapons without forking the math.
 // The predicate (isStrikeableInventoryWeapon) and the conversion
 // (inventoryItemToWeapon) live there with full RAW notes about
 // the damage cascade fix from v2.184.
 const inventoryWeapons = (character.inventory ?? []).filter(isStrikeableInventoryWeapon);
 const inventoryAsWeapons = inventoryWeapons.map((item: any) => inventoryItemToWeapon(item, computed));

 // Unarmed Strike — always available per 2024 PHB (p.377)
 // Attack: d20 + STR mod + Proficiency Bonus
 // Damage: flat 1 + STR modifier bludgeoning (no dice roll)
 // v2.87.0: Three modes — Damage (existing), Grapple, Shove (new). Grapple
 // and Shove are contested Athletics checks. We precompute the character's
 // Athletics bonus (STR mod + prof if proficient + prof again if expertise)
 // so the modal can show and roll it without re-deriving.
 const strMod = computed.modifiers.strength ?? 0;
 const pb = computed.proficiency_bonus ?? 2;
 const isAthleticsProf = (character.skill_proficiencies ?? []).includes('Athletics');
 const isAthleticsExpert = (character.skill_expertises ?? []).includes('Athletics');
 const athleticsBonus = strMod + (isAthleticsProf ? pb : 0) + (isAthleticsExpert ? pb : 0);
 const unarmedStrike: any = {
 id: 'unarmed',
 name: 'Unarmed Strike',
 attackBonus: strMod + pb,
 damageDice: 'flat',
 damageBonus: 1 + strMod, // 1 + STR mod per 2024 PHB; can be 0 if STR is very low
 damageType: 'bludgeoning',
 range: 'Melee',
 properties: '',
 notes: '',
 unarmedModes: true,
 athleticsBonus,
 };
 const allWeapons = [unarmedStrike, ...(character.weapons ?? []), ...inventoryAsWeapons];

 // v2.43.0: Defenses calc moved to top-level vitals row (above HPStatsPanel area).
 // The Combat IIFE no longer needs to compute these.

 return (
 <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>

 {/* v2.46.0: Turn Economy MOVED above the tab nav so it's visible on every tab.
     This Actions-tab-only copy is removed to avoid duplication. */}

 {/* v2.43.0: Defenses strip MOVED to vitals row (above HPStatsPanel area).
 No longer rendered here — keeps Actions tab focused on combat actions. */}

 {/* Filter chips — v2.78.0: plain pills (chiclets removed per user request).
     Turn economy state (used this turn) is tracked by the Turn Economy panel
     in the vitals column, not here. These pills just filter the list.
     v2.87.0: Added "Limited" pill to isolate abilities/spells with
     charges/rests — the filter logic was already wired throughout
     (ClassAbilitiesSection + spell row filter), just needed a UI entry. */}
 <div>
 <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
 {([
 { id: 'all', label: 'All' },
 { id: 'action', label: 'Action' },
 { id: 'bonus', label: 'Bonus' },
 { id: 'reaction', label: 'Reaction' },
 { id: 'limited', label: 'Limited Use' },
 ] as const).map(f => {
 const activePill = combatFilter === f.id;
 return (
 <button
 key={f.id}
 onClick={() => setCombatFilter(f.id)}
 title={f.id === 'limited'
 ? 'Show only abilities and spells with limited uses / rest-based charges'
 : `Filter: ${f.label}`}
 style={{
 fontFamily: 'var(--ff-body)', fontWeight: activePill ? 700 : 600, fontSize: 10,
 letterSpacing: '.06em', textTransform: 'uppercase',
 padding: '4px 10px', borderRadius: 999, cursor: 'pointer', minHeight: 0,
 border: activePill ? '2px solid var(--c-gold)' : '1px solid var(--c-border)',
 background: activePill ? 'rgba(245,158,11,0.15)' : 'var(--c-raised)',
 color: activePill ? 'var(--c-gold-l)' : 'var(--t-3)',
 transition: 'all .15s',
 flex: '0 0 auto',
 }}>
 {f.label}
 </button>
 );
 })}
 {inventoryWeapons.length > 0 && (
 <span style={{ marginLeft: 'auto', fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--c-gold-l)', background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)', borderRadius: 999, padding: '2px 8px' }}>
 +{inventoryWeapons.length} from inventory
 </span>
 )}
 </div>

 {/* v2.34.1: Content-type filters — multi-select. Empty set = show all. */}
 <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
 <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--t-3)', marginRight: 4 }}>
 Show:
 </span>
 {([
 { id: 'weapon' as const, label: 'Weapons', color: '#f87171' },
 { id: 'spell' as const, label: 'Spells', color: '#a78bfa' },
 { id: 'ability' as const, label: 'Abilities', color: '#fbbf24' },
 { id: 'item' as const, label: 'Items', color: '#4ade80' },
 ]).map(f => {
 const active = contentFilters.has(f.id);
 return (
 <button key={f.id} onClick={() => {
 // v2.55.0: single-select behavior — clicking a different filter swaps to it,
 // clicking the active filter clears it (returns to "show all").
 setContentFilters(prev => {
 if (prev.has(f.id)) return new Set(); // toggle off
 return new Set([f.id]); // swap to this one
 });
 }}
 style={{
 fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10,
 letterSpacing: '.06em', textTransform: 'uppercase',
 padding: '4px 10px', borderRadius: 20, cursor: 'pointer', minHeight: 0,
 border: `1px solid ${active ? f.color : 'var(--c-border)'}`,
 background: active ? `${f.color}22` : 'transparent',
 color: active ? f.color : 'var(--t-3)',
 transition: 'all .15s',
 }}>
 {f.label}
 </button>
 );
 })}
 {contentFilters.size > 0 && (
 <button onClick={() => setContentFilters(new Set())} style={{
 fontFamily: 'var(--ff-body)', fontWeight: 600, fontSize: 10, letterSpacing: '.04em',
 padding: '4px 8px', borderRadius: 20, cursor: 'pointer', minHeight: 0,
 border: '1px solid var(--c-border)', background: 'transparent',
 color: 'var(--t-3)',
 }}>
 Clear
 </button>
 )}
 </div>
 </div>

 {/* v2.34.1: content-filter helpers. empty set = show all kinds. */}
 {(() => null)()}

 {/* v2.86.0: Standard Actions — 2024 PHB universal actions every
     character can take (Dash, Disengage, Dodge, Help, Hide, Influence,
     Ready, Search, Study, Utilize). Each click broadcasts to the action
     log so the DM + party see what the player is doing, logs to
     character_history for the player's personal audit trail, and marks
     Action as used so Turn Economy flips and leveled spells get locked
     out for the turn.
     v2.87.0: Hidden on 'limited' filter — standard actions are unlimited.
     v2.198.0 — Phase Q.0 pt 39: collapse toggle removed. Now that
     v2.182's pill-grid layout makes the section visually compact (one
     row of 10 small pills instead of 10 stacked cards), there's no
     reason to hide it by default. Always-visible cuts an extra click
     out of every Dash/Dodge/Hide decision and keeps DASHING/DODGING
     active-effect chips visible without needing to expand the section. */}
 {(combatFilter === 'all' || combatFilter === 'action') && (
 <div>
 {/* Static header — no longer a clickable toggle. Active-effect
     chips (DASHING/DODGING) live inline with the title. */}
 <div
 style={{
 width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
 borderBottom: '1px solid var(--c-border)',
 marginBottom: 8, marginTop: 4,
 padding: '0 0 5px 0',
 }}
 >
 <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase' as const, color: 'var(--t-3)' }}>
 Standard Actions
 </span>
 {/* Active-effect chips — same as before */}
 {dashingThisTurn && (
 <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', padding: '2px 7px', borderRadius: 999, color: '#60a5fa', background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.4)' }}>
 DASHING +{character.speed ?? 30}FT
 </span>
 )}
 {dodgingThisTurn && (
 <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', padding: '2px 7px', borderRadius: 999, color: '#60a5fa', background: 'rgba(96,165,250,0.15)', border: '1px solid rgba(96,165,250,0.4)' }}>
 DODGING
 </span>
 )}
 </span>
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-3)' }}>
 broadcasts to party · uses your Action
 </span>
 </div>
 <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 10 }}>
 {/* v2.182.0 — Phase Q.0 pt 23: standard actions rebuilt as a
     compact pill grid + detail panel. Click a pill to expand its
     description + Use button below. Only one detail panel open at a
     time. */}
 <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
 {STANDARD_ACTIONS.map(action => {
 const isExpanded = expandedStandardAction === action.id;
 const isFlashing = justUsedStandardAction === action.id;
 return (
 <button
 key={action.id}
 onClick={() => setExpandedStandardAction(isExpanded ? null : action.id)}
 style={{
 fontFamily: 'var(--ff-body)', fontSize: 12, fontWeight: 700,
 padding: '6px 14px', borderRadius: 999, cursor: 'pointer', minHeight: 0,
 border: isFlashing
 ? '1px solid #34d399'
 : isExpanded
 ? '1px solid rgba(96,165,250,0.7)'
 : '1px solid rgba(96,165,250,0.35)',
 background: isFlashing
 ? '#34d399'
 : isExpanded
 ? 'rgba(96,165,250,0.22)'
 : 'rgba(96,165,250,0.08)',
 color: isFlashing ? '#000' : '#60a5fa',
 transition: 'all 0.15s',
 }}
 title={action.shortDescription}
 >
 {isFlashing ? `${action.name} ✓` : action.name}
 </button>
 );
 })}
 </div>

 {/* Detail panel for the currently-expanded action */}
 {expandedStandardAction && (() => {
 const action = STANDARD_ACTIONS.find(a => a.id === expandedStandardAction);
 if (!action) return null;
 const isFlashing = justUsedStandardAction === action.id;
 const handleUse = () => {
 setSpellCastThisTurn(true);
 if (action.id === 'dash') setDashingThisTurn(true);
 if (action.id === 'dodge') setDodgingThisTurn(true);
 import('../shared/ActionLog').then(({ logAction }) => {
 logAction({
 campaignId: character.campaign_id ?? null,
 characterId: character.id,
 characterName: character.name,
 actionType: 'standard-action',
 actionName: action.name,
 notes: action.shortDescription,
 });
 }).catch(() => {});
 logHistoryEvent({
 characterId: character.id,
 userId: character.user_id,
 eventType: 'other',
 description: `Took ${action.name} action`,
 });
 setJustUsedStandardAction(action.id);
 window.setTimeout(() => {
 setJustUsedStandardAction(curr => curr === action.id ? null : curr);
 }, 1800);
 };
 return (
 <div
 className="animate-fade-in"
 style={{
 background: 'var(--c-surface)',
 border: '1px solid rgba(96,165,250,0.25)',
 borderLeft: '3px solid #60a5fa',
 borderRadius: 'var(--r-md)',
 padding: '12px 16px',
 display: 'flex', flexDirection: 'column' as const, gap: 10,
 }}
 >
 <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
 <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 800, fontSize: 15, color: 'var(--t-1)' }}>
 {action.name}
 </span>
 <span style={{
 fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
 color: '#60a5fa', background: 'rgba(96,165,250,0.15)',
 border: '1px solid rgba(96,165,250,0.4)',
 borderRadius: 999, padding: '2px 7px',
 }}>
 ACTION
 </span>
 <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
 <button
 onClick={handleUse}
 style={{
 padding: '6px 16px', borderRadius: 'var(--r-md)', cursor: 'pointer',
 background: isFlashing ? '#34d399' : 'rgba(96,165,250,0.15)',
 border: `1px solid ${isFlashing ? '#34d399' : 'rgba(96,165,250,0.5)'}`,
 color: isFlashing ? '#000' : '#60a5fa',
 fontFamily: 'var(--ff-body)', fontWeight: isFlashing ? 800 : 700, fontSize: 12,
 letterSpacing: '0.04em',
 transition: 'background 0.2s, color 0.2s, border-color 0.2s',
 minHeight: 0, minWidth: 80,
 }}
 >
 {isFlashing ? 'Used!' : 'Use'}
 </button>
 <button
 onClick={() => setExpandedStandardAction(null)}
 title="Close"
 aria-label="Close"
 style={{
 background: 'transparent', border: '1px solid var(--c-border)',
 borderRadius: 'var(--r-md)', padding: '6px 10px', cursor: 'pointer',
 color: 'var(--t-3)', fontSize: 12, fontWeight: 700,
 minHeight: 0,
 }}
 >
 ✕
 </button>
 </span>
 </div>
 <div style={{
 fontFamily: 'var(--ff-body)', fontSize: 13, color: 'var(--t-2)',
 lineHeight: 1.6, whiteSpace: 'pre-wrap' as const,
 }}>
 {action.longDescription || action.shortDescription}
 </div>
 </div>
 );
 })()}
 </div>
 </div>
 )}

 {/* Weapons — merged from weapons list + equipped inventory */}
 {combatFilter === 'all' && (contentFilters.size === 0 || contentFilters.has('weapon')) && (
 <WeaponsTracker
 weapons={allWeapons}
 onUpdate={weapons => applyUpdate({ weapons: weapons.filter((w: any) => !String(w.id).startsWith('inv_')) })}
 characterId={userId}
 historyCharacterId={character.id}
 userId={character.user_id}
 characterName={character.name}
 campaignId={character.campaign_id}
 activeConditions={character.active_conditions}
 activeBufss={(character as any).active_buffs ?? []}
 />
 )}

 {/* Class Abilities — with DDB-style section labels */}
 {combatFilter === 'all' && (contentFilters.size === 0 || contentFilters.has('ability')) && (
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--c-border)', paddingBottom: 5, marginTop: 4 }}>
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase' as const, color: 'var(--t-3)' }}>
 ABILITIES &amp; RESOURCES
 </span>
 </div>
 )}
 {(contentFilters.size === 0 || contentFilters.has('ability')) && (
 <ClassAbilitiesSection
 character={character}
 combatFilter={combatFilter}
 onUpdate={u => applyUpdate(u, true)}
 userId={userId}
 campaignId={character.campaign_id}
 campaign={activeCampaign}
 />
 )}

 {/* v2.188.0 — Phase Q.0 pt 29: SPECIES section.
     Today only Tiefling has actionable per-species choices (Fiendish
     Legacy → unlocks 3 spells across levels 1/3/5). The section
     auto-hides for species with no actionable choices, so a Human
     character sees nothing here. When other species gain similar
     mechanics (Aasimar revelations, Dragonborn ancestries with
     unique cantrips, etc.), they get added here as additional
     branches inside the same section.

     v2.237.0 — filter gate now includes the 'spell' content filter
     in addition to 'ability', because species spells (Hold Person,
     Ray of Sickness, Poison Spray) ARE spells too. Filtering by
     spells should still surface the Tiefling section. The row
     rendering itself (below) was rebuilt in v2.237 to match the
     regular spell-row look so they harmonize visually. */}
 {(combatFilter === 'all' || combatFilter === 'action' || combatFilter === 'reaction') &&
  (contentFilters.size === 0 || contentFilters.has('ability') || contentFilters.has('spell')) &&
  character.species === 'Tiefling' && (() => {
   const choices = (character.species_choices as any) ?? {};
   const currentLegacyId = choices.tieflingLegacy as TieflingLegacy | undefined;
   const legacy = getTieflingLegacy(currentLegacyId);
   const activeSpells = getActiveLegacySpells(legacy, character.level);

   function pickLegacy(id: TieflingLegacy) {
     const next = { ...choices, tieflingLegacy: id };
     applyUpdate({ species_choices: next }, true);
   }

   // v2.201.0 — Phase Q.0 pt 41: free-cast handler for L3+ legacy
   // spells. RAW: 1 free cast per long rest per spell (no slot
   // consumed). Increments feature_uses; doLongRest already wipes
   // feature_uses so the free cast auto-refreshes. Logs to action
   // log + emits a spell_cast combat_event with payload.free_cast=true
   // so the History tab distinguishes free vs slot-cast.
   function castFreeLegacy(spellName: string) {
     const key = legacySpellFeatureKey(spellName);
     const fu = ((character.feature_uses as Record<string, number>) ?? {});
     if ((fu[key] ?? 0) >= 1) return; // already used this long rest
     applyUpdate({
       feature_uses: { ...fu, [key]: 1 },
     }, true);
     // v2.203.0 — Phase Q.0 pt 43: auto-trigger Concentration when the
     // free-cast spell requires it (e.g. Darkness for Infernal Tiefling
     // at L5). Without this, the player got the "Cast Free" button to
     // work but had to remember to manually mark concentration on the
     // Spells tab — easy to forget mid-combat. Looks the spell up by
     // name in spellMap (Object.values walk; the map is small) and
     // calls setConcentration with the resolved id. Per RAW (and
     // matching the Spells-tab cast pipeline), starting a new
     // concentration spell auto-breaks any existing one — no confirm
     // modal, just like onConcentrationCast for slot-cast spells.
     const castSpell = Object.values(spellMap).find(s => s?.name === spellName);
     const requiresConc = castSpell && (castSpell as any).concentration === true;
     if (castSpell && requiresConc) {
       setConcentration(castSpell.id);
     }
     import('../shared/ActionLog').then(({ logAction }) => {
       logAction({
         campaignId: character.campaign_id ?? null,
         characterId: character.id,
         characterName: character.name,
         actionType: 'spell',
         actionName: `${spellName} (Fiendish Legacy — Free)`,
         notes: requiresConc
           ? 'Cast without a spell slot via Tiefling Fiendish Legacy. Concentration started. Refreshes on Long Rest.'
           : 'Cast without a spell slot via Tiefling Fiendish Legacy. Refreshes on Long Rest.',
       });
     }).catch(() => {});
     emitCombatEvent({
       campaignId: character.campaign_id ?? null,
       actorType: 'player',
       actorId: character.id,
       actorName: character.name,
       eventType: 'spell_cast',
       payload: {
         spell_name: spellName,
         source: 'tiefling-legacy',
         free_cast: true,
         no_slot_consumed: true,
         concentration_started: !!requiresConc,
       },
     }).catch(() => {});
   }

   return (
     <div style={{ marginTop: 'var(--sp-3)' }}>
       <div style={{
         display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
       }}>
         <span style={{
           fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700,
           letterSpacing: '0.12em', textTransform: 'uppercase' as const,
           color: '#f97316',
         }}>
           Species — Tiefling
         </span>
         {legacy && (
           <span style={{
             fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
             textTransform: 'uppercase' as const,
             color: '#f97316', background: 'rgba(249,115,22,0.1)',
             border: '1px solid rgba(249,115,22,0.4)',
             borderRadius: 999, padding: '2px 8px',
           }}>
             {legacy.name} Legacy
           </span>
         )}
       </div>

       {/* Legacy picker — shown when no legacy chosen, OR as a small
           "change" affordance below the spell list. */}
       {!legacy && (
         <div style={{
           padding: '12px 14px', borderRadius: 'var(--r-md)',
           background: 'rgba(249,115,22,0.04)',
           border: '1px solid rgba(249,115,22,0.25)',
           marginBottom: 8,
         }}>
           <div style={{
             fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)',
             marginBottom: 10, lineHeight: 1.5,
           }}>
             <strong style={{ color: 'var(--t-1)' }}>Fiendish Legacy.</strong>{' '}
             Choose your heritage to unlock granted spells (cantrip at level 1,
             1st-level at 3, 2nd-level at 5).
           </div>
           <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
             {TIEFLING_LEGACIES.map(opt => (
               <button
                 key={opt.id}
                 onClick={() => pickLegacy(opt.id)}
                 style={{
                   flex: '1 1 200px',
                   padding: '10px 12px', borderRadius: 'var(--r-md)',
                   background: 'var(--c-card)',
                   border: '1px solid rgba(249,115,22,0.3)',
                   cursor: 'pointer', textAlign: 'left' as const,
                   minHeight: 0,
                   transition: 'all var(--tr-fast)',
                 }}
                 onMouseEnter={e => {
                   (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(249,115,22,0.7)';
                   (e.currentTarget as HTMLButtonElement).style.background = 'rgba(249,115,22,0.08)';
                 }}
                 onMouseLeave={e => {
                   (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(249,115,22,0.3)';
                   (e.currentTarget as HTMLButtonElement).style.background = 'var(--c-card)';
                 }}
               >
                 <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 800, fontSize: 13, color: '#f97316', marginBottom: 4 }}>
                   {opt.name}
                 </div>
                 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)', lineHeight: 1.4, marginBottom: 6 }}>
                   {opt.flavor}
                 </div>
                 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-2)', lineHeight: 1.5 }}>
                   {opt.spells.map(s => `L${s.unlockLevel}: ${s.spellName}`).join(' · ')}
                 </div>
               </button>
             ))}
           </div>
         </div>
       )}

       {/* Granted-spells list — v2.237.0 rebuild.
           Each row now mirrors the regular spell-row visual grammar
           (level badge / school bar / name + effect-type tag / time
           abbrev / range / hit-DC / chevron / Cast). The far-left
           badge shows the SPELL'S level (Cantrip → "AT WILL"; 2nd
           level → "Lvl 2"; etc.) instead of the old unlock level
           (L1/L3/L5). The "granted at character level N" info moved
           into the expanded detail panel.

           Each row hosts a SpellCastButton for canonical slot-cast
           AND, on L3+ rows, the "Free" once-per-LR affordance the
           Tiefling feature grants (kept as a small secondary button
           because it's a real RAW mechanic — once per long rest you
           can cast Hold Person without spending a slot). Cantrip
           rows just expose the SpellCastButton (at-will).

           If the spell can't be resolved against spellMap (data
           drift between speciesChoices.ts and the spell catalogue),
           the row degrades to a small warning so the gap is visible
           rather than silent. */}
       {legacy && activeSpells.length > 0 && (
         <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
           {(() => {
             const speciesSchoolColor: Record<string, string> = {
               Abjuration: '#60a5fa', Conjuration: '#a78bfa', Divination: '#34d399',
               Enchantment: '#f472b6', Evocation: '#fb923c', Illusion: '#c084fc',
               Necromancy: '#94a3b8', Transmutation: '#4ade80',
             };
             return activeSpells.map(grant => {
               const spell = Object.values(spellMap).find(s => s?.name === grant.spellName);
               const featureKey = legacySpellFeatureKey(grant.spellName);
               const used = ((character.feature_uses as Record<string, number>) ?? {})[featureKey] ?? 0;

               // Fallback: spell missing from catalogue. Surface as a
               // visible warning row rather than silently rendering blank.
               if (!spell) {
                 return (
                   <div key={grant.spellName} style={{
                     display: 'flex', alignItems: 'center', gap: 10,
                     padding: '8px 12px', borderRadius: 'var(--r-md)',
                     border: '1px solid rgba(239,68,68,0.3)',
                     background: 'rgba(239,68,68,0.05)',
                   }}>
                     <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-1)' }}>
                       {grant.spellName}
                     </span>
                     <span style={{ fontSize: 10, color: '#ef4444' }}>
                       Spell not found in catalogue (granted at L{grant.unlockLevel}).
                     </span>
                   </div>
                 );
               }

               const isCantrip = spell.level === 0;
               const freeAvailable = !isCantrip && used < 1;
               const sc = speciesSchoolColor[spell.school] ?? '#a78bfa';
               const eff = spell.level;
               const rowKey = `species-${spell.id}`;
               const isExpanded = expandedActionsSpell === rowKey;
               const mech = parseSpellMechanics(spell.description, {
                 save_type: (spell as any).save_type,
                 attack_type: (spell as any).attack_type,
                 damage_dice: (spell as any).damage_dice,
                 damage_type: (spell as any).damage_type,
                 heal_dice: (spell as any).heal_dice,
               });
               const spellAttackBonus = computed.spell_attack_bonus ?? undefined;
               const spellSaveDC = computed.spell_save_dc ?? undefined;
               const hitDC = mech.isAttack && spellAttackBonus !== undefined
                 ? `+${spellAttackBonus}`
                 : mech.saveType && spellSaveDC !== undefined
                 ? `${mech.saveType} ${spellSaveDC}`
                 : '—';
               const timeAbbr = (spell.casting_time ?? '')
                 .replace('1 action', '1A').replace('1 Action', '1A')
                 .replace('1 bonus action', '1BA').replace('Bonus Action', '1BA').replace('bonus action', '1BA')
                 .replace('1 reaction', '1R').replace('Reaction', '1R')
                 .replace('1 minute', '1 min').replace('10 minutes', '10 min')
                 .replace('1 hour', '1 hr').replace('8 hours', '8 hr');

               return (
                 <div key={rowKey} style={{
                   borderRadius: 'var(--r-md)',
                   border: `1px solid ${isExpanded ? `${sc}45` : 'rgba(249,115,22,0.22)'}`,
                   background: isExpanded ? `${sc}08` : 'rgba(249,115,22,0.03)',
                   overflow: 'hidden',
                   transition: 'all 0.15s',
                 }}>
                   {/* Row — same grid template as regular spell rows
                       so the columns align visually if you scroll
                       between the SPECIES section and SPELLS. */}
                   <div
                     onClick={() => setExpandedActionsSpell(isExpanded ? null : rowKey)}
                     style={{
                       display: 'grid',
                       gridTemplateColumns: '70px 3px 1fr 46px 70px 74px 16px 170px',
                       alignItems: 'center', gap: '0 8px',
                       padding: '7px 10px', cursor: 'pointer', minHeight: 44,
                     }}
                   >
                     {/* Col 0: spell-level badge */}
                     <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                       {eff === 0 ? (
                         <div style={{ fontFamily: 'var(--ff-body)', fontSize: 8, fontWeight: 800, color: '#a78bfa', letterSpacing: '0.04em', textTransform: 'uppercase' as const, lineHeight: 1.2, textAlign: 'center' }}>AT<br/>WILL</div>
                       ) : (
                         <span style={{
                           fontFamily: 'var(--ff-stat)', fontSize: 13, fontWeight: 800,
                           color: sc,
                           padding: '3px 8px', borderRadius: 6,
                           border: `1px solid ${sc}45`,
                           background: `${sc}0f`,
                           whiteSpace: 'nowrap' as const,
                         }} title={`Level ${eff} spell`}>
                           Lvl {eff}
                         </span>
                       )}
                     </div>

                     {/* Col 1: school color bar */}
                     <div style={{ width: 3, height: 30, borderRadius: 2, background: sc, opacity: 0.75 }} />

                     {/* Col 2: name + school + effect-type tag */}
                     <div style={{ minWidth: 0 }}>
                       <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'nowrap' as const, overflow: 'hidden' }}>
                         <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-1)', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                           {spell.name}
                         </span>
                         {spell.concentration && (
                           <span style={{
                             fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const,
                             color: '#fbbf24', background: 'rgba(251,191,36,0.1)',
                             border: '1px solid rgba(251,191,36,0.35)', borderRadius: 999,
                             padding: '1px 7px', flexShrink: 0,
                           }} title="Concentration spell">
                             Concentration
                           </span>
                         )}
                       </div>
                       <div style={{ fontSize: 9, color: 'var(--t-3)', marginTop: 1, whiteSpace: 'nowrap' as const, display: 'flex', alignItems: 'center', gap: 5 }}>
                         <span>{spell.school}</span>
                         {(() => {
                           const aoe = (spell as any).area_of_effect as { type: string; size: number } | undefined;
                           if (aoe) {
                             return <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: '#fb923c', background: 'rgba(251,146,60,0.12)', border: '1px solid rgba(251,146,60,0.4)', padding: '1px 6px', borderRadius: 4, lineHeight: 1.4, flexShrink: 0 }} title={`Area of Effect — ${aoe.size}ft ${aoe.type}`}>AoE</span>;
                           }
                           if (mech.isSave) {
                             const saveAb = (mech.saveType ?? '').toUpperCase();
                             const col = saveAb === 'STR' ? '#ef4444' : saveAb === 'DEX' ? '#34d399' : saveAb === 'CON' ? '#f59e0b' : saveAb === 'INT' ? '#60a5fa' : saveAb === 'WIS' ? '#22c55e' : saveAb === 'CHA' ? '#ec4899' : '#60a5fa';
                             return <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: col, background: `${col}20`, border: `1px solid ${col}55`, padding: '1px 6px', borderRadius: 4, lineHeight: 1.4, flexShrink: 0 }} title={`${saveAb} saving throw`}>{saveAb} Save</span>;
                           }
                           if (mech.isAttack) {
                             return <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: '#fbbf24', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.4)', padding: '1px 6px', borderRadius: 4, lineHeight: 1.4, flexShrink: 0 }} title="Spell attack roll">Attack</span>;
                           }
                           return null;
                         })()}
                       </div>
                     </div>

                     {/* Col 3: time abbreviation */}
                     <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-2)', textAlign: 'center', whiteSpace: 'nowrap' as const }}>{timeAbbr}</div>

                     {/* Col 4: range */}
                     <div style={{ textAlign: 'center', minWidth: 0, lineHeight: 1.1 }}>
                       <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-2)', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{spell.range}</div>
                     </div>

                     {/* Col 5: hit/DC */}
                     <div style={{ textAlign: 'center' }}>
                       {hitDC !== '—' ? (
                         <span style={{
                           fontFamily: 'var(--ff-stat)', fontWeight: 900, fontSize: 12,
                           color: mech.isAttack ? '#fbbf24' : '#94a3b8',
                           background: mech.isAttack ? 'rgba(251,191,36,0.1)' : 'rgba(148,163,184,0.1)',
                           border: `1px solid ${mech.isAttack ? 'rgba(251,191,36,0.3)' : 'rgba(148,163,184,0.25)'}`,
                           borderRadius: 999, padding: '1px 6px', display: 'inline-block',
                         }}>{hitDC}</span>
                       ) : (
                         <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-3)' }}>—</span>
                       )}
                     </div>

                     {/* Col 6: chevron */}
                     <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                       <span style={{ fontSize: 9, color: 'var(--t-3)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
                     </div>

                     {/* Col 7: cast actions. L3+ rows get a small "Free"
                         secondary button before the canonical Cast. */}
                     <div onClick={e => {
                       const target = e.target as HTMLElement;
                       if (target.closest('button')) e.stopPropagation();
                     }} style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                       {!isCantrip && (freeAvailable ? (
                         <button
                           onClick={() => castFreeLegacy(grant.spellName)}
                           title={`Cast ${grant.spellName} for free (refreshes on Long Rest). Slot-cast also available via the Cast button.`}
                           style={{
                             padding: '5px 10px', borderRadius: 'var(--r-md)',
                             cursor: 'pointer', minHeight: 0,
                             background: 'rgba(249,115,22,0.15)',
                             border: '1px solid rgba(249,115,22,0.5)',
                             color: '#f97316',
                             fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10,
                             letterSpacing: '0.04em',
                             flexShrink: 0,
                           }}
                         >
                           Free
                         </button>
                       ) : (
                         <span title="Free Long-Rest cast already used. You can still cast from a slot via the Cast button." style={{
                           fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                           textTransform: 'uppercase' as const,
                           color: 'var(--t-3)',
                           background: 'var(--c-raised)',
                           border: '1px solid var(--c-border)',
                           borderRadius: 4, padding: '3px 6px',
                           flexShrink: 0,
                         }}>
                           Used·LR
                         </span>
                       ))}
                       <SpellCastButton
                         spell={spell}
                         character={character}
                         userId={userId ?? ''}
                         campaignId={character.campaign_id}
                         onUpdateSlots={slots => applyUpdate({ spell_slots: slots }, true)}
                         compact={true}
                         onConcentrationCast={() => setConcentration(spell.id)}
                       />
                     </div>
                   </div>

                   {/* Expanded detail — mirrors the regular spell row's
                       expanded panel (stats grid + description) and adds
                       a footer noting the species grant level. */}
                   {isExpanded && (
                     <div style={{ borderTop: `1px solid ${sc}20`, padding: '12px 14px', background: 'rgba(255,255,255,0.015)' }}>
                       <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' as const, marginBottom: 10, alignItems: 'center' }}>
                         {[['Casting Time', spell.casting_time], ['Range', spell.range], ['Duration', spell.duration], ['Components', spell.components]].map(([k, v]) => v ? (
                           <div key={k}>
                             <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: 'var(--t-3)', marginBottom: 2 }}>{k}</div>
                             <div style={{ fontSize: 12, color: 'var(--t-1)' }}>{v}</div>
                           </div>
                         ) : null)}
                       </div>
                       {spell.description && (
                         <div style={{ fontSize: 12, color: 'var(--t-2)', lineHeight: 1.5, whiteSpace: 'pre-wrap' as const }}>
                           {spell.description}
                         </div>
                       )}
                       <div style={{
                         marginTop: 10, paddingTop: 8,
                         borderTop: '1px dashed rgba(249,115,22,0.25)',
                         fontSize: 11, color: '#f97316', fontStyle: 'italic' as const,
                       }}>
                         Granted by Tiefling Fiendish Legacy ({legacy.name}) at character level {grant.unlockLevel}.
                         {!isCantrip && ' Once per Long Rest you may cast it without a spell slot.'}
                       </div>
                     </div>
                   )}
                 </div>
               );
             });
           })()}

           {/* Subtle "change legacy" link at the end. Confirms before
               wiping (legacy choice in 2024 PHB is permanent at character
               creation, but app users may want to fix typos). */}
           <button
             onClick={() => {
               if (!confirm(`Change Fiendish Legacy from ${legacy.name}? You will keep your old spells in your spell list — this only swaps which legacy is active for the SPECIES section.`)) return;
               const next = { ...choices };
               delete next.tieflingLegacy;
               applyUpdate({ species_choices: next }, true);
             }}
             style={{
               marginTop: 4, alignSelf: 'flex-start' as const,
               background: 'transparent', border: 'none',
               color: 'var(--t-3)', cursor: 'pointer',
               fontSize: 10, fontFamily: 'var(--ff-body)',
               textDecoration: 'underline', padding: '4px 0',
               minHeight: 0,
             }}
           >
             Change legacy
           </button>
         </div>
       )}
     </div>
   );
 })()}

 {/* v2.376.0 — SPECIES TRAITS section. Surfaces any species trait
     with actionType set (e.g. Tabaxi Feline Agility, Dragonborn
     Breath Weapon, Aasimar Healing Hands, Goliath Large Form /
     Stone's Endurance) as clickable rows. Passive traits like
     Darkvision, Fey Ancestry, Cat's Talent stay in Features tab —
     they have no actionType field and are filtered out here.
     Tiefling spells go through the dedicated section above; these
     are non-spell species actions that previously had no surface. */}
 {(combatFilter === 'all' || combatFilter === 'action' || combatFilter === 'bonus' || combatFilter === 'reaction') &&
  (contentFilters.size === 0 || contentFilters.has('ability')) && (() => {
   const speciesData = SPECIES.find(s => s.name === character.species);
   if (!speciesData) return null;
   // v2.376.0 — capture into local to preserve TS narrowing through
   // the .map callback closure below (TS doesn't auto-narrow across
   // closure boundaries even after the early-return guard).
   const sd = speciesData;
   const actionableTraits = sd.traits.filter(t => (t as any).actionType);
   // Filter Goliath Large Form gate: 5th level minimum per RAW.
   const visibleTraits = actionableTraits.filter(t => {
     if (t.name === 'Large Form' && character.level < 5) return false;
     return true;
   });
   if (visibleTraits.length === 0) return null;
   const actionTypeColors: Record<string, string> = {
     action: '#ef4444', bonus: '#60a5fa', reaction: '#a78bfa',
     free: '#34d399', special: '#14b8a6',
   };
   const actionTypeLabels: Record<string, string> = {
     action: 'ACTION', bonus: 'BONUS', reaction: 'REACT',
     free: 'FREE', special: 'SPECIAL',
   };
   return (
     <div style={{ marginTop: 'var(--sp-3)' }}>
       <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--c-border)', paddingBottom: 5, marginBottom: 8 }}>
         <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase' as const, color: 'var(--t-3)' }}>
           SPECIES — {sd.name.toUpperCase()}
         </span>
       </div>
       <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 4 }}>
         {visibleTraits.map(trait => {
           const t = trait as any;
           const acColor = actionTypeColors[t.actionType] ?? '#94a3b8';
           const acLabel = actionTypeLabels[t.actionType] ?? t.actionType.toUpperCase();
           const featureKey = `species:${trait.name}`;
           // Resolve maxUses: numeric literal, or "PB" abilities use prof bonus
           const profBonus = computed.proficiency_bonus ?? 2;
           const maxUses: number | undefined = typeof t.maxUses === 'number'
             ? t.maxUses
             : (t.rest && (trait.name === 'Stone\'s Endurance' || trait.name === 'Breath Weapon'))
               ? profBonus
               : undefined;
           const used = ((character.feature_uses as Record<string, number>) ?? {})[featureKey] ?? 0;
           const exhausted = maxUses !== undefined && used >= maxUses;
           function useTrait() {
             // Increment feature_uses[species:Name] up to maxUses; log
             // through the action log so the DM history shows the use.
             if (maxUses !== undefined) {
               if (used >= maxUses) return;
               const fu = ((character.feature_uses as Record<string, number>) ?? {});
               applyUpdate({ feature_uses: { ...fu, [featureKey]: used + 1 } }, true);
             }
             import('../shared/ActionLog').then(({ logAction }) => {
               logAction({
                 campaignId: character.campaign_id ?? null,
                 characterId: character.id,
                 characterName: character.name,
                 actionType: 'roll',
                 actionName: `${trait.name} (${sd.name} species)`,
                 notes: maxUses !== undefined
                   ? `${maxUses - used - 1}/${maxUses} uses remaining after this.`
                   : trait.description.split('.')[0],
               });
             }).catch(() => {});
           }
           return (
             <div key={trait.name} style={{
               background: 'var(--c-card)',
               border: '1px solid var(--c-border)',
               borderRadius: 8,
               overflow: 'hidden',
               transition: 'all 0.15s',
             }}>
               <div style={{
                 display: 'grid',
                 gridTemplateColumns: '70px 3px 1fr 46px 70px 36px 74px 80px 180px 110px 16px',
                 alignItems: 'center', gap: '0 8px', padding: '7px 10px', minHeight: 44,
               }}>
                 {/* Col 0: action-type badge */}
                 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                   <span style={{
                     fontFamily: 'var(--ff-stat)', fontWeight: 800, fontSize: 9,
                     letterSpacing: '0.08em', color: acColor,
                     background: `${acColor}15`,
                     border: `1px solid ${acColor}40`,
                     borderRadius: 4, padding: '2px 5px', whiteSpace: 'nowrap' as const,
                   }}>{acLabel}</span>
                 </div>
                 {/* Col 1: action color stripe */}
                 <div style={{ width: 3, height: 30, borderRadius: 2, background: `${acColor}88` }} />
                 {/* Col 2: NAME */}
                 <div style={{ minWidth: 0 }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                     <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--t-1)', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                       {trait.name}
                     </span>
                   </div>
                   <div style={{ fontSize: 9, color: 'var(--t-3)', marginTop: 1 }}>
                     {sd.name} species{t.rest ? ` · refreshes on ${t.rest === 'long' ? 'Long' : 'Short'} Rest` : ''}
                   </div>
                 </div>
                 {/* Col 3: TIME (empty — action type lives in LEAD) */}
                 <div />
                 {/* Col 4: RANGE */}
                 <div style={{ fontSize: 10, color: 'var(--t-2)', textAlign: 'center', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                   {t.range ?? ''}
                 </div>
                 {/* Col 5: TAGS (empty for species traits) */}
                 <div />
                 {/* Col 6: HIT/DC (empty — species saves don't use spell DC) */}
                 <div />
                 {/* Col 7: EFFECT (empty — could surface damage in future) */}
                 <div />
                 {/* Col 8: BUTTONS — Use */}
                 <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', width: '100%' }}>
                   <button
                     onClick={useTrait}
                     disabled={exhausted}
                     title={exhausted ? `No uses remaining — refreshes on ${t.rest === 'long' ? 'Long' : 'Short'} Rest` : trait.description}
                     style={{
                       padding: '4px 12px', borderRadius: 'var(--r-md)',
                       cursor: exhausted ? 'not-allowed' : 'pointer',
                       background: exhausted ? 'rgba(148,163,184,0.08)' : `${acColor}20`,
                       border: `1px solid ${exhausted ? 'rgba(148,163,184,0.2)' : `${acColor}60`}`,
                       color: exhausted ? 'var(--t-3)' : acColor,
                       fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 11,
                       letterSpacing: '0.04em', minHeight: 0, flexShrink: 0,
                       opacity: exhausted ? 0.55 : 1,
                     }}
                   >
                     {exhausted ? 'Used' : 'Use'}
                   </button>
                 </div>
                 {/* Col 9: CHARGES (chiclet tracker for limited-use) */}
                 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                   {maxUses !== undefined && Array.from({ length: maxUses }).map((_, i) => (
                     <span key={i} style={{
                       display: 'inline-block', width: 10, height: 10,
                       borderRadius: 2, marginRight: 3,
                       border: `1px solid ${acColor}55`,
                       background: i < (maxUses - used) ? acColor : 'transparent',
                     }} />
                   ))}
                 </div>
                 {/* Col 10: CHEVRON (empty — no expanded panel for now) */}
                 <div />
               </div>
             </div>
           );
         })}
       </div>
     </div>
   );
 })()}

 {/* Health Potions — consumables that are actions on your turn */}
 {(combatFilter === 'all' || combatFilter === 'action') && (contentFilters.size === 0 || contentFilters.has('item')) && (() => {
 const potions = (character.inventory ?? []).filter((item: any) =>
 item.category === 'Potion' && item.quantity > 0
 );
 if (potions.length === 0) return null;
 return (
 <div style={{ marginTop: 'var(--sp-3)' }}>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as 'uppercase', color: 'var(--c-green-l)', marginBottom: 6 }}>
 Potions & Consumables
 </div>
 <div style={{ display: 'flex', flexDirection: 'column' as 'column', gap: 4 }}>
 {potions.map((item: any) => {
  // v2.326.0 — T4: row collapsed by default; click anywhere outside the
  // Use button or quantity badge to expand the description below. Falls
  // back to no chevron on items without a description (nothing to reveal).
  const isExpanded = expandedItemId === item.id;
  const hasDesc = !!item.description;
  return (
   <div key={item.id} style={{
    borderRadius: 'var(--r-md)',
    border: `1px solid ${isExpanded ? 'rgba(52,211,153,0.45)' : 'rgba(52,211,153,0.2)'}`,
    background: isExpanded ? 'rgba(52,211,153,0.06)' : 'rgba(52,211,153,0.03)',
    overflow: 'hidden',
    transition: 'all 0.15s',
   }}>
    <div
     onClick={() => { if (hasDesc) setExpandedItemId(isExpanded ? null : item.id); }}
     style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: hasDesc ? 'pointer' : 'default' }}
    >
     <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13, color: 'var(--t-1)' }}>{item.name}</div>
     </div>
     {hasDesc && (
      <span style={{ fontSize: 9, color: 'var(--t-3)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}>▼</span>
     )}
     <span style={{ fontFamily: 'var(--ff-stat)', fontSize: 11, color: 'var(--c-green-l)', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', padding: '2px 8px', borderRadius: 999, flexShrink: 0 }}>
      ×{item.quantity}
     </span>
     {/* v2.82.0: Use button opens the target chooser. Drinking yourself rolls
         the heal dice and applies HP; giving to another just rolls + logs. */}
     <button
      onClick={(e) => { e.stopPropagation(); setPotionToUse(item); }}
      style={{
       padding: '5px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer',
       background: 'rgba(52,211,153,0.15)',
       border: '1px solid rgba(52,211,153,0.5)',
       color: 'var(--c-green-l)',
       fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 11,
       letterSpacing: '0.04em', minHeight: 0, flexShrink: 0,
      }}
     >
      Use
     </button>
    </div>
    {isExpanded && hasDesc && (
     <div style={{
      padding: '0 14px 10px 14px',
      fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)',
      lineHeight: 1.5,
      borderTop: '1px solid rgba(52,211,153,0.15)',
      paddingTop: 8,
     }}>
      {item.description}
     </div>
    )}
   </div>
  );
 })}
 </div>
 </div>
 );
 })()}

 {/* Action / Bonus / Reaction features */}
 {/* Active Feats — feats with usable abilities */}
 {(contentFilters.size === 0 || contentFilters.has('ability')) && (() => {
 const featNames = character.gained_feats ?? [];
 const ACTIVE_KW = ['magic action', 'bonus action', 'reaction', 'once per', 'luck point', 'spend', 'expend', 'per long rest', 'per short rest'];
 const activeFeats = featNames.filter(name => {
 const f = FEATS.find(ft => ft.name === name);
 return f && f.benefits.some(b => ACTIVE_KW.some(kw => b.toLowerCase().includes(kw)));
 });
 if (activeFeats.length === 0) return null;
 // Only show on All or Action/Bonus/Reaction filters
 if (combatFilter === 'all' || combatFilter === 'action' || combatFilter === 'bonus' || combatFilter === 'reaction') {
 return (
 <div style={{ marginTop: 'var(--sp-3)' }}>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as 'uppercase', color: '#fbbf24', marginBottom: 6 }}>
 Feat Abilities
 </div>
 <FeatsPanel character={character} onUpdate={u => applyUpdate(u, true)} />
 </div>
 );
 }
 return null;
 })()}

 {(contentFilters.size === 0 || contentFilters.has('spell')) && (() => {
 // v2.260.0 — same fix as the alerts banner above; was reading
 // character.is_spellcaster which is a ClassData field, not a
 // Character field. Falls back to spell_slots check.
 const isSpellcaster = CLASS_MAP[character.class_name]?.is_spellcaster ||
 Object.values(character.spell_slots).some((s: any) => s.total > 0);
 if (!isSpellcaster) return null;

 const PREPARER_CLASSES_ACT = ['Cleric', 'Druid', 'Paladin', 'Wizard', 'Artificer', 'Psion'];
 const isPreparer = PREPARER_CLASSES_ACT.includes(character.class_name);
 const readySpells = knownSpellData.filter(s => {
 if (s.level === 0) return true;
 return !isPreparer || character.prepared_spells.includes(s.id);
 });
 if (readySpells.length === 0) return null;

 // Slot usage per level — to gray spells when exhausted
 const slotsByLevel: Record<number, { total: number; used: number; remaining: number }> = {};
 Object.entries(character.spell_slots).forEach(([k, v]: [string, any]) => {
 const lvl = parseInt(k);
 if (!isNaN(lvl) && v?.total) slotsByLevel[lvl] = { total: v.total, used: v.used ?? 0, remaining: v.total - (v.used ?? 0) };
 });

 // Highest slot level with any total — used to cap upcast expansion
 const maxSlotLevel = Math.max(0, ...Object.entries(slotsByLevel).map(([k, v]) => (v.total > 0 ? parseInt(k) : 0)));

 const cantrips = readySpells.filter(s => s.level === 0);
 const leveledBase = readySpells.filter(s => s.level > 0);

 // v2.34.1: expand leveled list with upcast variants when toggle is on.
 // v2.36.0: One row per spell (no upcast duplicates). Upcastability is signaled
 // via a small "↑" chip next to the level badge; actual tier selection happens
 // via the SpellCastButton's modal picker when the user clicks Cast.
 type ReadyRow = SpellData & { effectiveLevel: number; isUpcast: boolean };
 const leveled: ReadyRow[] = leveledBase.map(s => ({ ...s, effectiveLevel: s.level, isUpcast: false }));
 leveled.sort((a, b) => a.effectiveLevel - b.effectiveLevel || a.name.localeCompare(b.name));

 // Check if any leveled spells have slots remaining
 const hasAnySlots = leveled.some(s => {
 for (let lvl = s.level; lvl <= 9; lvl++) {
 if ((slotsByLevel[lvl]?.remaining ?? 0) > 0) return true;
 }
 return false;
 });

 const schoolColor: Record<string, string> = {
 Abjuration: '#60a5fa', Conjuration: '#a78bfa', Divination: '#34d399',
 Enchantment: '#f472b6', Evocation: '#fb923c', Illusion: '#c084fc',
 Necromancy: '#94a3b8', Transmutation: '#4ade80',
 };

 return (
 <div style={{ marginTop: 'var(--sp-3)' }}>
 {/* SPELLS section header — DDB style */}
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(167,139,250,0.2)', paddingBottom: 5, marginBottom: 8, gap: 8, flexWrap: 'wrap' as const }}>
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase' as 'uppercase', color: '#a78bfa' }}>
 SPELLS
 </span>
 {/* v2.36.0: Upcast toggle removed per feedback. Upcast affordance now lives
 directly on each leveled spell row as a "↑" arrow chip, letting the user
 upcast from the cast modal picker when they click Cast. */}
 {/* v2.263.0 — was reading character.prepared_spells.length, which
     INCLUDES granted (always-prepared) subclass spells and so always
     reads higher than the player's actual cap usage. Now uses
     getSpellCounts which excludes granted, and additionally surfaces
     the max so DMs/players see "16 / 17 prepared" — same shape as
     the SpellsTab badges and SpellCompletionBanner. */}
 {isPreparer && (() => {
   const { prepared } = getSpellCounts(character);
   const max = getMaxPrepared(character);
   return (
     <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-3)' }}>
       {prepared} / {max} prepared
     </span>
   );
 })()}
 </div>

 {/* v2.78.0: Actions-tab level filter now uses the shared LevelTab component
     (same one SpellsTab uses). Pill + chiclet rail are separated surfaces;
     pill filters the list, chiclets expend/restore slots. Height matched to
     surrounding pills. */}
 {(() => {
 const presentLevels = [0, ...Object.keys(slotsByLevel).map(Number).sort((a, b) => a - b)];
 const LEVEL_LABELS: Record<number, string> = { 0: 'Cantrips', 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th', 6: '6th', 7: '7th', 8: '8th', 9: '9th' };
 return (
 <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const, marginBottom: 10, alignItems: 'center' }}>
 <LevelTab
 label="All"
 count={cantrips.length + leveled.length}
 active={actionsLevelFilter === 'all'}
 onClick={() => setActionsLevelFilter('all')}
 />
 {presentLevels.map(lvl => {
 const slotBucket = slotsByLevel[lvl];
 const max = lvl > 0 ? (slotBucket?.total ?? 0) : 0;
 const remaining = lvl > 0 ? (slotBucket?.remaining ?? 0) : 0;
 const rowCount = lvl === 0 ? cantrips.length : leveled.filter(s => s.level === lvl).length;
 return (
 <LevelTab
 key={lvl}
 label={LEVEL_LABELS[lvl] ?? String(lvl)}
 count={rowCount}
 slots={lvl > 0 ? { max, remaining } : null}
 active={actionsLevelFilter === lvl}
 onClick={() => setActionsLevelFilter(lvl)}
 onToggleSlot={lvl > 0 ? (_idx, expending) => {
 const slotKey = String(lvl);
 const current = character.spell_slots?.[slotKey];
 if (!current) return;
 const currentUsed = current.used ?? 0;
 const newUsed = expending
 ? Math.min(current.total, currentUsed + 1)
 : Math.max(0, currentUsed - 1);
 if (newUsed === currentUsed) return;
 applyUpdate({ spell_slots: { ...character.spell_slots, [slotKey]: { ...current, used: newUsed } } }, true);
 } : undefined}
 />
 );
 })}
 </div>
 );
 })()}

 <div style={{ display: 'flex', flexDirection: 'column' as 'column', gap: 4 }}>
 {/* v2.35.1: Dropped EFFECT column per feedback — effect info lives in the expanded panel.
 Fixed 170px action column so Attack+Damage rows align with Utility "Cast" rows. */}
 <div style={{ display: 'grid', gridTemplateColumns: '70px 3px 1fr 46px 70px 74px 16px 170px', gap: '0 8px', padding: '0 10px 2px', marginBottom: 2 }}>
 {['', '', 'NAME', 'TIME', 'RANGE', 'HIT / DC', '', ''].map((h, i) => (
 <span key={i} style={{ fontFamily: 'var(--ff-body)', fontSize: 7, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--t-3)' }}>{h}</span>
 ))}
 </div>
 {/* v2.78.0: Spells now grouped by level with a section header per group.
     Each header shows "{Ordinal} Level" and the remaining/max slot count so
     the player can see at a glance how many slots they have left as they
     scroll through the list. Cantrips show "At-Will" instead of a slot count. */}
 {(() => {
 const filtered = [...cantrips.map(s => ({ ...s, effectiveLevel: 0, isUpcast: false })), ...leveled]
 .filter(s => actionsLevelFilter === 'all' || s.level === actionsLevelFilter)
 .filter(s => {
 // v2.46.0: combatFilter now actually filters spell rows by casting time.
 // 'all' = no filter; 'action' = 1-action spells only; 'bonus' = 1-BA only;
 // 'reaction' = 1-reaction only. 'limited' is a slot-based filter handled elsewhere.
 if (combatFilter === 'all' || combatFilter === 'limited') return true;
 const ct = (s.casting_time ?? '').toLowerCase();
 if (combatFilter === 'reaction') return ct.includes('reaction');
 if (combatFilter === 'bonus') return ct.includes('bonus action') || ct.includes('bonus');
 if (combatFilter === 'action') {
 // 1 action spells only — exclude bonus actions and reactions
 return ct.includes('action') && !ct.includes('bonus') && !ct.includes('reaction');
 }
 return true;
 });
 const byLevel: Record<number, typeof filtered> = {};
 filtered.forEach(s => { (byLevel[s.level] ??= []).push(s); });
 const sortedLevels = Object.keys(byLevel).map(Number).sort((a, b) => a - b);
 const LVL_LBL: Record<number, string> = { 0: 'Cantrips', 1: '1st Level', 2: '2nd Level', 3: '3rd Level', 4: '4th Level', 5: '5th Level', 6: '6th Level', 7: '7th Level', 8: '8th Level', 9: '9th Level' };
 return sortedLevels.map(lvl => {
 const groupSpells = byLevel[lvl];
 const bucket = slotsByLevel[lvl];
 return (
 <div key={`grp-${lvl}`} style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
 {/* Level section header with slot pip indicator */}
 <div style={{
 display: 'flex', alignItems: 'center', gap: 10,
 padding: '4px 10px 6px', marginTop: lvl === sortedLevels[0] ? 0 : 6,
 borderBottom: '1px solid var(--c-border)',
 }}>
 <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--t-2)' }}>
 {LVL_LBL[lvl] ?? `Level ${lvl}`}
 </span>
 <span style={{ fontSize: 10, color: 'var(--t-3)', background: 'var(--c-raised)', padding: '1px 6px', borderRadius: 999 }}>
 {groupSpells.length}
 </span>
 {lvl === 0 ? (
 <span style={{ fontSize: 10, color: 'var(--t-3)', fontStyle: 'italic', marginLeft: 4 }}>At-Will</span>
 ) : bucket && bucket.total > 0 ? (
 <div style={{ display: 'flex', gap: 3, alignItems: 'center', marginLeft: 4 }}>
 {Array.from({ length: Math.min(bucket.total, 5) }).map((_, i) => (
 <div key={i} style={{ width: 9, height: 9, borderRadius: '50%', border: '1.5px solid var(--c-gold-bdr)', background: i < bucket.remaining ? 'var(--c-gold)' : 'transparent', boxShadow: i < bucket.remaining ? '0 0 4px rgba(212,160,23,0.4)' : 'none' }} />
 ))}
 {bucket.total > 5 && <span style={{ fontSize: 8, color: 'var(--t-3)' }}>+{bucket.total - 5}</span>}
 <span style={{ fontSize: 10, color: 'var(--t-3)', marginLeft: 3 }}>{bucket.remaining}/{bucket.total} slots</span>
 </div>
 ) : null}
 </div>

 {groupSpells.map(spell => {
 const sc = schoolColor[spell.school] ?? '#a78bfa';
 const eff = (spell as any).effectiveLevel ?? spell.level;
 const isUpcast = !!(spell as any).isUpcast;
 const rowKey = `${spell.id}-${eff}`;
 const isExpanded = expandedActionsSpell === rowKey;

 // v2.36.0: one row per spell, so gray-out if no slot from eff through 9 has remaining.
 const slotsExhausted = eff > 0 && (() => {
 for (let lvl = eff; lvl <= 9; lvl++) {
 if ((slotsByLevel[lvl]?.remaining ?? 0) > 0) return false;
 }
 return true;
 })();

 // v2.44.0: Whether this spell supports upcasting at all. Single source of
 // truth = presence of higher_levels text. Spells like Jump (no higher_levels
 // field) won't show the ↑ chip and won't allow upcasting from the modal.
 const canUpcast = canUpcastSpell(spell);

 // v2.35.0: mirror Spells-tab HIT/DC + EFFECT computation
 const mechanics = parseSpellMechanics(spell.description, {
 save_type: (spell as any).save_type,
 attack_type: (spell as any).attack_type,
 damage_dice: (spell as any).damage_dice,
 damage_type: (spell as any).damage_type,
 heal_dice: (spell as any).heal_dice,
 });
 const spellAttack = computed.spell_attack_bonus ?? undefined;
 const saveDC = computed.spell_save_dc ?? undefined;
 const hitDC = mechanics.isAttack && spellAttack !== undefined
 ? `+${spellAttack}`
 : mechanics.saveType && saveDC !== undefined
 ? `${mechanics.saveType} ${saveDC}`
 : '—';
 const effectLabel = mechanics.damageDice
 ? `${mechanics.damageDice}${mechanics.damageType ? ` ${mechanics.damageType}` : ''}`
 : mechanics.healDice
 ? `Heal ${mechanics.healDice}`
 : mechanics.isUtility
 ? 'Utility'
 : mechanics.isBuff
 ? 'Buff'
 : '—';
 const effectColor = mechanics.damageDice ? '#f87171' : mechanics.healDice ? '#4ade80' : mechanics.isBuff ? '#60a5fa' : mechanics.isUtility ? '#a78bfa' : 'var(--t-3)';

 // Abbreviate casting time to match Spells-tab TIME column width
 const timeAbbr = spell.casting_time
 .replace('1 action', '1A').replace('1 Action', '1A')
 .replace('1 bonus action', '1BA').replace('Bonus Action', '1BA').replace('bonus action', '1BA')
 .replace('1 reaction', '1R').replace('Reaction', '1R')
 .replace('1 minute', '1 min').replace('10 minutes', '10 min')
 .replace('1 hour', '1 hr').replace('8 hours', '8 hr');

 // v2.37.0: highlight the row if this spell is the one being concentrated on
 const isActivelyConcentrating = concentrationSpellId === spell.id;

 return (
 <div key={rowKey} style={{
 borderRadius: 'var(--r-md)',
 border: `1px solid ${
 isActivelyConcentrating ? 'rgba(167,139,250,0.55)' :
 slotsExhausted ? 'rgba(239,68,68,0.15)' :
 isExpanded ? `${sc}45` :
 'rgba(167,139,250,0.18)'
 }`,
 background: isActivelyConcentrating ? 'rgba(167,139,250,0.10)' :
 slotsExhausted ? 'rgba(239,68,68,0.03)' :
 isExpanded ? `${sc}08` :
 'rgba(167,139,250,0.04)',
 opacity: slotsExhausted ? 0.55 : 1,
 overflow: 'hidden',
 transition: 'all 0.15s',
 boxShadow: isActivelyConcentrating ? '0 0 0 2px rgba(167,139,250,0.18)' : 'none',
 }}>
 {/* Row — 8-col grid (EFFECT column removed per v2.35.1). Fixed 170px action col
 so rows with Attack+Damage buttons align with rows that only have a Cast button. */}
 <div
 onClick={() => setExpandedActionsSpell(isExpanded ? null : rowKey)}
 style={{
 display: 'grid',
 gridTemplateColumns: '70px 3px 1fr 46px 70px 74px 16px 170px',
 alignItems: 'center', gap: '0 8px',
 padding: '7px 10px', cursor: 'pointer', minHeight: 44,
 }}
 >
 {/* Col 0: Level badge or AT WILL */}
 <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
 {eff === 0 ? (
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 8, fontWeight: 800, color: '#a78bfa', letterSpacing: '0.04em', textTransform: 'uppercase' as const, lineHeight: 1.2, textAlign: 'center' }}>AT<br/>WILL</div>
 ) : (
 <span style={{
 fontFamily: 'var(--ff-stat)', fontSize: 13, fontWeight: 800,
 color: slotsExhausted ? '#ef4444' : sc,
 padding: '3px 8px', borderRadius: 6,
 border: `1px solid ${slotsExhausted ? 'rgba(239,68,68,0.3)' : `${sc}45`}`,
 background: slotsExhausted ? 'rgba(239,68,68,0.08)' : `${sc}0f`,
 whiteSpace: 'nowrap' as const,
 display: 'inline-flex', alignItems: 'center', gap: 3,
 }} title={canUpcast ? `Lvl ${eff} — can be upcast for greater effect` : `Lvl ${eff}`}>
 Lvl {eff}
 {canUpcast && (
 <span aria-hidden style={{
 display: 'inline-block', fontSize: 10, fontWeight: 900,
 color: slotsExhausted ? '#ef4444' : sc, lineHeight: 1,
 transform: 'translateY(-1px)',
 }}>↑</span>
 )}
 </span>
 )}
 </div>

 {/* Col 1: School color bar */}
 <div style={{ width: 3, height: 30, borderRadius: 2, background: sc, opacity: slotsExhausted ? 0.3 : 0.75 }} />

 {/* Col 2: Name + school line */}
 <div style={{ minWidth: 0 }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'nowrap' as const, overflow: 'hidden' }}>
 <span style={{ fontWeight: 700, fontSize: 13, color: slotsExhausted ? 'var(--t-3)' : 'var(--t-1)', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
 {spell.name}
 </span>
 {/* v2.37.0: Upgraded concentration marker — pillbox, always clearly visible.
 When THIS spell is being concentrated on, pill shows "● ACTIVE" in purple. */}
 {spell.concentration && (
 isActivelyConcentrating ? (
 <span style={{
 fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' as const,
 color: '#c4b5fd', background: 'rgba(167,139,250,0.22)',
 border: '1px solid rgba(167,139,250,0.55)', borderRadius: 999,
 padding: '2px 8px', flexShrink: 0,
 boxShadow: '0 0 0 2px rgba(167,139,250,0.08)',
 }} title="You are currently concentrating on this spell">
 ● Active
 </span>
 ) : (
 <span style={{
 fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' as const,
 color: '#fbbf24', background: 'rgba(251,191,36,0.1)',
 border: '1px solid rgba(251,191,36,0.35)', borderRadius: 999,
 padding: '1px 7px', flexShrink: 0,
 }} title="Concentration spell — casting requires maintaining focus">
 Concentration
 </span>
 )
 )}
 {slotsExhausted && <span style={{ fontSize: 9, fontWeight: 700, color: '#ef4444', flexShrink: 0 }}>No Slots</span>}
 </div>
 <div style={{ fontSize: 9, color: 'var(--t-3)', marginTop: 1, whiteSpace: 'nowrap' as const, display: 'flex', alignItems: 'center', gap: 5 }}>
 <span>{spell.school}{spell.ritual ? ' · Ritual' : ''}</span>
 {/* v2.172.0 — Phase Q.0 pt 13: effect-type tag. Mirrors the
     "DAMAGE · GRAPPLE · SHOVE" style tags under Unarmed Strike
     in the Actions tab so players can see at a glance whether a
     spell is Utility / Attack / Save / AoE. The mechanics resolver
     already computes the categories — we just surface them. AoE is
     called out because strategic value differs. Priority: AoE >
     Save > Attack > Utility to avoid cluttering with >1 tag. */}
 {(() => {
 const aoe = (spell as any).area_of_effect as { type: string; size: number } | undefined;
 if (aoe) {
 return (
 <span style={{
 fontSize: 8, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const,
 color: '#fb923c', background: 'rgba(251,146,60,0.12)',
 border: '1px solid rgba(251,146,60,0.4)',
 padding: '1px 6px', borderRadius: 4, lineHeight: 1.4, flexShrink: 0,
 }} title={`Area of Effect — ${aoe.size}ft ${aoe.type}`}>AoE</span>
 );
 }
 if (mechanics.isSave) {
 const saveAb = (mechanics.saveType ?? '').toUpperCase();
 const col = saveAb === 'STR' ? '#ef4444' : saveAb === 'DEX' ? '#34d399' : saveAb === 'CON' ? '#f59e0b' : saveAb === 'INT' ? '#60a5fa' : saveAb === 'WIS' ? '#22c55e' : saveAb === 'CHA' ? '#ec4899' : '#60a5fa';
 return (
 <span style={{
 fontSize: 8, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const,
 color: col, background: `${col}20`,
 border: `1px solid ${col}55`,
 padding: '1px 6px', borderRadius: 4, lineHeight: 1.4, flexShrink: 0,
 }} title={`${saveAb} saving throw`}>{saveAb} Save</span>
 );
 }
 if (mechanics.isAttack) {
 return (
 <span style={{
 fontSize: 8, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const,
 color: '#fbbf24', background: 'rgba(251,191,36,0.12)',
 border: '1px solid rgba(251,191,36,0.4)',
 padding: '1px 6px', borderRadius: 4, lineHeight: 1.4, flexShrink: 0,
 }} title="Spell attack roll">Attack</span>
 );
 }
 if (mechanics.isUtility) {
 return (
 <span style={{
 fontSize: 8, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const,
 color: '#a78bfa', background: 'rgba(167,139,250,0.12)',
 border: '1px solid rgba(167,139,250,0.4)',
 padding: '1px 6px', borderRadius: 4, lineHeight: 1.4, flexShrink: 0,
 }} title="Utility / buff spell">Utility</span>
 );
 }
 return null;
 })()}
 </div>
 </div>

 {/* Col 3: TIME */}
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-2)', textAlign: 'center', whiteSpace: 'nowrap' as const }}>{timeAbbr}</div>

 {/* Col 4: RANGE + TARGET (v2.63.0 stacked) */}
 <div style={{ textAlign: 'center', minWidth: 0, lineHeight: 1.1 }}>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-2)', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{spell.range}</div>
 {(() => {
 // Derive target description: AoE first, else parse description, else "1 target" for ranged spells
 const aoe = (spell as any).area_of_effect as { type: string; size: number } | undefined;
 if (aoe) return <div style={{ fontFamily: 'var(--ff-body)', fontSize: 8, color: 'var(--t-3)', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{aoe.size}-ft {aoe.type}</div>;
 const rng = (spell.range || '').toLowerCase();
 if (rng === 'self') return null; // self-buff spells don't need a target line
 if (rng === 'touch' || rng === '—' || rng === '') return null;
 const desc = (spell.description || '').toLowerCase();
 // Pattern matching for common target counts
 let targetText = '1 target';
 const upToN = desc.match(/up to (one|two|three|four|five|six|seven|eight|nine|ten|\d+) (?:creatures?|targets?)/);
 if (upToN) {
 const numWord = upToN[1];
 const numMap: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10' };
 targetText = `${numMap[numWord] ?? numWord} targets`;
 } else if (/creatures of your choice|any number of creatures/.test(desc)) {
 targetText = 'multi';
 } else if (/two creatures|two targets/.test(desc)) {
 targetText = '2 targets';
 } else if (/three creatures|three targets/.test(desc)) {
 targetText = '3 targets';
 }
 return <div style={{ fontFamily: 'var(--ff-body)', fontSize: 8, color: 'var(--t-3)', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{targetText}</div>;
 })()}
 </div>

 {/* Col 5: HIT / DC */}
 <div style={{ textAlign: 'center' }}>
 {hitDC !== '—' ? (
 <span style={{
 fontFamily: 'var(--ff-stat)', fontWeight: 900, fontSize: 12,
 color: mechanics.isAttack ? '#fbbf24' : '#94a3b8',
 background: mechanics.isAttack ? 'rgba(251,191,36,0.1)' : 'rgba(148,163,184,0.1)',
 border: `1px solid ${mechanics.isAttack ? 'rgba(251,191,36,0.3)' : 'rgba(148,163,184,0.25)'}`,
 borderRadius: 999, padding: '1px 6px', display: 'inline-block',
 }}>{hitDC}</span>
 ) : (
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-3)' }}>—</span>
 )}
 </div>

 {/* Col 6: Expand chevron (left of action column) */}
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
 <span style={{ fontSize: 9, color: 'var(--t-3)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
 </div>

 {/* Col 7: Cast action buttons (fixed 170px, right-justified so Cast sits at far right) */}
 {/* v2.172.0 — Phase Q.0 pt 13: dead-zone fix. Previously this
     wrapper had `onClick={e => e.stopPropagation()}` which blocked
     the parent row-expand handler for ALL clicks landing in the
     170px column — including the whitespace between the chevron
     and the Cast button. Users complained they couldn't expand a
     spell by clicking anywhere near the right side. New logic:
     propagation only stops when the click lands on an actual
     <button> (via closest('button')). Whitespace clicks bubble up
     and expand the row as expected. */}
 <div onClick={e => {
 const target = e.target as HTMLElement;
 if (target.closest('button')) e.stopPropagation();
 }} style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, flexWrap: 'wrap' as const, alignItems: 'center' }}>
 <SpellCastButton
 spell={spell}
 character={character}
 userId={userId ?? ''}
 campaignId={character.campaign_id}
 onUpdateSlots={slots => applyUpdate({ spell_slots: slots }, true)}
 compact={true}
 forceSlotLevel={isUpcast ? eff : undefined}
 spellLockedOut={(() => {
 // v2.46.0: RAW 2024 spell action economy:
 // - One spell with Action casting time per turn (cantrip OR leveled — both eat the action)
 // - One spell with Bonus Action casting time per turn (cantrip OR leveled)
 // - 2024 PHB removed the famous "BA spell forces cantrip-only action" rule
 const ct = (spell.casting_time ?? '').toLowerCase();
 const isBonusActionSpell = ct.includes('bonus action') || (ct.includes('bonus') && !ct.includes('action'));
 const isReactionSpell = ct.includes('reaction');
 const isActionSpell = ct.includes('action') && !isBonusActionSpell && !isReactionSpell;
 if (isReactionSpell) return false; // reactions are free, don't lock
 if (isActionSpell && spellCastThisTurn) return true;
 if (isBonusActionSpell && bonusActionSpellCast) return true;
 return false;
 })()}
 onLeveledSpellCast={(isBonusAction?: boolean) => {
 // v2.46.0: Track action vs bonus-action consumption based on the spell's
 // casting time, not just whether it's leveled. Cantrips with 1A casting
 // time also consume the action. The isBonusAction param from
 // SpellCastButton already reflects the spell's casting time.
 if (isBonusAction) {
 setBonusActionSpellCast(true);
 } else {
 setSpellCastThisTurn(true);
 }
 }}
 onConcentrationCast={() => setConcentration(spell.id)}
 />
 </div>
 </div>

 {/* Expanded detail panel — mirrors Spells-tab SpellCard expanded block */}
 {isExpanded && (
 <div style={{ borderTop: `1px solid ${sc}20`, padding: '12px 14px', background: 'rgba(255,255,255,0.015)' }}>
 {/* Stats row */}
 <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' as const, marginBottom: 10, alignItems: 'center' }}>
 {[['Casting Time', spell.casting_time], ['Range', spell.range], ['Duration', spell.duration], ['Components', spell.components]].map(([k, v]) => v ? (
 <div key={k}>
 <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: 'var(--t-3)', marginBottom: 2 }}>{k}</div>
 <div style={{ fontSize: 12, color: 'var(--t-2)', fontWeight: 500 }}>{v}</div>
 </div>
 ) : null)}
 {/* v2.35.1: Effect pill moved here from the main row per feedback */}
 <div>
 <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.1em', color: 'var(--t-3)', marginBottom: 2 }}>Effect</div>
 <span style={{
 fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
 color: effectColor, background: effectColor + '12',
 border: `1px solid ${effectColor}30`, borderRadius: 4, padding: '2px 7px',
 whiteSpace: 'nowrap' as const,
 }}>{effectLabel}</span>
 </div>
 </div>
 <p style={{ fontSize: 13, color: 'var(--t-2)', lineHeight: 1.65, margin: 0 }}>{spell.description}</p>

 {/* v2.49.0: Upcast trigger button — appears for spells that support
     upcasting and have higher slots available. Lets the user deliberately
     pick a higher slot via a modal, instead of always casting at base. */}
 <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
 <SpellCastButton
 spell={spell}
 character={character}
 userId={userId ?? ''}
 campaignId={character.campaign_id}
 onUpdateSlots={slots => applyUpdate({ spell_slots: slots }, true)}
 upcastTrigger={true}
 onLeveledSpellCast={(isBonusAction?: boolean) => {
 if (isBonusAction) setBonusActionSpellCast(true); else setSpellCastThisTurn(true);
 }}
 onConcentrationCast={() => setConcentration(spell.id)}
 />
 </div>
 </div>
 )}
 </div>
 );
 })}
 </div>
 );
 });
 })()}
 </div>
 </div>
 );
 })()}

 </div>
 );
 })()}
 {/* v2.326.0 — T4: Recent Rolls strip removed. The History tab's
     unified timeline (CharacterHistory + combat events + roll log)
     covers the same ground without duplicating a fixed pane at the
     bottom of every Actions-tab session. The floating Roll Log
     overlay in the bottom-right of the screen handles in-the-
     moment review. */}

 {/* ── INVENTORY ── */}
 {activeTab === 'inventory' && (
 <div style={{ maxWidth: 900 }}>
 <Inventory character={character} onUpdateInventory={handleUpdateInventory} onUpdateCurrency={currency => applyUpdate({ currency })} onUpdateAC={ac => applyUpdate({ armor_class: ac }, true)} onUpdateHP={hp => applyUpdate({ current_hp: hp }, true)} computed={computed} userId={userId} campaignId={character.campaign_id} />
 </div>
 )}

 {/* ── BIO: Features + Notes merged ── */}
 {activeTab === 'bio' && (
 <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 'var(--sp-6)', maxWidth: 900 }}>
 <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
 {/* Structured features from character creation */}
 {character.features_and_traits && (() => {
 const raw = character.features_and_traits;
 const sections = raw.split(/\n\n(?=\[)/).filter(Boolean);
 if (sections.length <= 1) return (
 <div>
 <div className="section-header">Features & Traits</div>
 <FeaturesPanel character={character} onUpdateNotes={notes => applyUpdate({ features_text: notes }, true)} />
 </div>
 );
 return (
 <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
 <div className="section-header">Features & Traits</div>
 {sections.map((section, i) => {
 const match = section.match(/^\[([^\]]+)\]\n([\s\S]*)$/);
 if (!match) return <div key={i} style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', whiteSpace: 'pre-wrap' }}>{section}</div>;
 const [, title, body] = match;
 const sectionIcons: Record<string, string> = {
 'Origin Feat': '', 'Fighting Style': '', 'Metamagic': '',
 'Eldritch Invocations': '', 'Expertise': '', 'Divine Order': '',
 'Primal Order': '', 'Feats from ASI': '',
 };
 return (
 <div key={i} style={{ background: 'var(--c-raised)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', padding: 'var(--sp-3) var(--sp-4)' }}>
 <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--c-gold-l)', marginBottom: 6 }}>
 {title}
 </div>
 <div style={{ fontSize: 'var(--fs-sm)', color: 'var(--t-2)', lineHeight: 1.6 }}>{body.trim()}</div>
 </div>
 );
 })}
 <FeaturesPanel character={character} onUpdateNotes={notes => applyUpdate({ features_text: notes }, true)} />
 </div>
 );
 })()}
 {!character.features_and_traits && (
 <div>
 <div className="section-header">Features & Traits</div>
 <FeaturesPanel character={character} onUpdateNotes={notes => applyUpdate({ features_text: notes }, true)} />
 </div>
 )}
 </div>
 <div>
 <div className="section-header">Notes & Personality</div>
 <Notes character={character} onUpdate={handleUpdateNote} />
 </div>
 </div>
 )}

 {/* ── HISTORY: Permanent character audit log + Roll log + Action log ── */}
 {activeTab === 'history' && (
 <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)', maxWidth: 900 }}>

 {/* v2.176.0 — Phase Q.0 pt 17: unified history feed. Replaces the
     prior 3-section layout (CharacterHistory + CombatEventLog +
     RollHistory / ActionLog) with a single filter-capable timeline
     that merges character_history, combat_events, and DM prompts
     from campaign_chat. Secret rolls are excluded per spec. The old
     components still exist in src/ — kept for possible future drill-
     down views — but no longer mounted on the History tab. */}
 <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
 <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 8 }}>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--t-3)' }}>
 Character Timeline
 </div>
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-3)' }}>
 DM prompts · HP · rolls · conditions · spells · newest first
 </span>
 </div>
 <UnifiedHistory characterId={character.id} campaignId={character.campaign_id ?? null} maxHeight={560} />
 </section>

 </div>
 )}

 </div>
 </ErrorBoundary>


 </div>

 {/* Level Up Wizard */}
 {showLevelUp && (
 <LevelUpWizard
 character={character}
 onLevelUp={updates => applyUpdate(updates, true)}
 onClose={() => setShowLevelUp(false)}
 />
 )}

 {/* DM-requested roll prompt — floats in bottom center when DM asks for a roll */}
 {character.campaign_id && userId && (
 <PlayerRollPrompt
 campaignId={character.campaign_id}
 characterId={character.id}
 character={{
 id: character.id,
 name: character.name,
 strength: character.strength,
 dexterity: character.dexterity,
 constitution: character.constitution,
 intelligence: character.intelligence,
 wisdom: character.wisdom,
 charisma: character.charisma,
 skill_proficiencies: character.skill_proficiencies ?? [],
 saving_throw_proficiencies: character.saving_throw_proficiencies ?? [],
 level: character.level,
 }}
 />
 )}
 {userId && character.campaign_id && false && <CampaignBar userId={userId} />}

 </div>{/* end cs-content-col */}
 </div>{/* end cs-hud-layout */}

 {/* v2.82.0 / v2.84.0: Potion use modal — Self/Other target chooser + heal
     dice roller. v2.84.0 changes: (1) portaled to document.body to escape
     any transform containing block (was rendering mid-page where you could
     scroll past it); (2) shell dimensions match the upcast modal exactly
     (maxWidth 560, calc(100dvh - 32px) for iOS Safari); (3) button labels
     simplified — primary is "Drink for yourself", secondary is "Give to
     another player" (the heals badge above already shows the dice expr). */}
 {potionToUse && (() => {
 const diceMatch: string = (potionToUse.description ?? potionToUse.name ?? '')
 .match(/(\d+d\d+(?:\s*[+-]\s*\d+)?)/i)?.[1] ?? '';
 const expr = diceMatch.replace(/\s+/g, '') || '2d4+2';
 const parsed = expr.match(/(\d+)d(\d+)(?:([+-])(\d+))?/i);
 const diceCount = parsed ? parseInt(parsed[1]) : 2;
 const dieSize = parsed ? parseInt(parsed[2]) : 4;
 const bonusSign = parsed?.[3] === '-' ? -1 : 1;
 const flatBonus = parsed?.[4] ? parseInt(parsed[4]) * bonusSign : 0;

 const rollPotion = (target: 'self' | 'other') => {
 const rolls: { die: number; value: number }[] = [];
 for (let i = 0; i < diceCount; i++) {
 rolls.push({ die: dieSize, value: Math.floor(Math.random() * dieSize) + 1 });
 }
 const dieSum = rolls.reduce((a, r) => a + r.value, 0);
 const healTotal = dieSum + flatBonus;
 const label = target === 'self'
 ? `${potionToUse.name} — Drink (Heal ${expr})`
 : `${potionToUse.name} — Given to Ally (Heal ${expr})`;

 triggerRoll({
 result: rolls[0]?.value ?? 0,
 dieType: dieSize,
 allDice: rolls,
 expression: expr,
 flatBonus,
 total: healTotal,
 label,
 logHistory: { characterId: character.id, userId: character.user_id },
 onResult: (_dice, physTotal) => {
 if (target === 'self') {
 const currentHp = character.current_hp ?? 0;
 const maxHp = character.max_hp ?? currentHp;
 const newHp = Math.min(maxHp, currentHp + physTotal);
 const actualHealed = newHp - currentHp;
 applyUpdate({ current_hp: newHp }, true);
 // v2.85.0: Edge flash (green) + confirmation modal fire AFTER dice
 // settle, keyed to the physics-detected total so the user sees the
 // visual response in the same beat as the dice result.
 flashEdge('heal');
 setHealSuccess({
 sourceName: potionToUse.name,
 expr,
 amount: actualHealed,
 newHp,
 maxHp,
 });
 }
 // Decrement potion count — remove stack if it hits zero.
 const newInventory = (character.inventory ?? []).map((it: any) =>
 it.id === potionToUse.id ? { ...it, quantity: Math.max(0, it.quantity - 1) } : it
 );
 const cleaned = newInventory.filter((it: any) => !(it.id === potionToUse.id && it.quantity <= 0));
 applyUpdate({ inventory: cleaned }, true);

 // v2.193.0 — Phase Q.0 pt 34: emit potion_consumed event for the
 // unified History tab. Includes whether the heal was self vs ally
 // and the rolled total. Self vs ally distinction matters because
 // an ally-given potion doesn't update the drinker's HP — only the
 // potion stack count moves. The History row uses payload.target
 // to distinguish the two cases visually.
 emitCombatEvent({
 campaignId: character.campaign_id ?? null,
 actorType: 'player',
 actorId: character.id,
 actorName: character.name,
 eventType: 'potion_consumed',
 payload: {
 item_name: potionToUse.name,
 item_id: potionToUse.id,
 magic_item_id: potionToUse.magic_item_id ?? null,
 target: target, // 'self' | 'other'
 heal_total: physTotal,
 dice_expression: expr,
 },
 }).catch(() => {});
 },
 });
 setPotionToUse(null);
 };

 return createPortal(
 <div className="modal-overlay" onClick={() => setPotionToUse(null)}>
 <div
 className="modal"
 onClick={e => e.stopPropagation()}
 style={{
 maxWidth: 560, width: 'calc(100vw - 16px)',
 // dvh for iOS Safari — vh includes the address bar so 100vh exceeds
 // the visible area on mobile and pushes content below the fold.
 maxHeight: 'calc(100dvh - 32px)',
 display: 'flex', flexDirection: 'column' as const,
 padding: 20,
 }}
 >
 {/* Title section — mirrors upcast modal structure */}
 <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--c-border)' }}>
 <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: 'var(--c-green-l)', marginBottom: 6 }}>
 Use Potion
 </div>
 <h3 style={{
 margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--t-1)',
 wordBreak: 'break-word' as const, overflowWrap: 'anywhere' as const,
 lineHeight: 1.15,
 }}>
 {potionToUse.name}
 </h3>
 </div>

 {/* Scrollable middle section — description + heals badge */}
 <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' as const, marginRight: -8, paddingRight: 8 }}>
 {potionToUse.description && (
 <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--t-2)', lineHeight: 1.6 }}>
 {potionToUse.description}
 </p>
 )}
 <div style={{
 display: 'flex', alignItems: 'center', gap: 10,
 padding: '10px 14px', borderRadius: 'var(--r-md)',
 background: 'rgba(52,211,153,0.08)',
 border: '1px solid rgba(52,211,153,0.3)',
 }}>
 <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--c-green-l)' }}>Heals</span>
 <span style={{ fontFamily: 'var(--ff-stat)', fontSize: 20, fontWeight: 800, color: 'var(--c-green-l)' }}>{expr} HP</span>
 {!diceMatch && (
 <span style={{ fontSize: 9, color: 'var(--t-3)', fontStyle: 'italic' as const, marginLeft: 'auto' }}>
 (default — no dice found in description)
 </span>
 )}
 </div>
 </div>

 {/* Action footer — vertically stacked full-width buttons, mirroring
     the upcast modal pattern so the primary button is always reachable
     on mobile. Primary on top, secondary, cancel. */}
 <div style={{
 display: 'flex', flexDirection: 'column' as const, gap: 8,
 paddingTop: 14, borderTop: '1px solid var(--c-border)', marginTop: 12,
 }}>
 <button
 onClick={() => rollPotion('self')}
 style={{
 width: '100%', justifyContent: 'center',
 fontFamily: 'var(--ff-body)', fontWeight: 800, fontSize: 14,
 padding: '12px 16px', borderRadius: 'var(--r-md)', cursor: 'pointer',
 border: '1px solid rgba(52,211,153,0.6)',
 background: 'linear-gradient(180deg, rgba(52,211,153,0.35), rgba(52,211,153,0.2))',
 color: '#d1fae5', letterSpacing: '0.04em',
 boxShadow: '0 2px 8px rgba(52,211,153,0.25)',
 minHeight: 0,
 }}
 >
 Drink for yourself
 </button>
 <button
 onClick={() => rollPotion('other')}
 style={{
 width: '100%', justifyContent: 'center',
 fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13,
 padding: '10px 16px', borderRadius: 'var(--r-md)', cursor: 'pointer',
 border: '1px solid var(--c-border-m)',
 background: 'var(--c-raised)', color: 'var(--t-2)',
 minHeight: 0,
 }}
 >
 Give to another player
 </button>
 <button
 className="btn-secondary"
 onClick={() => setPotionToUse(null)}
 style={{ width: '100%', justifyContent: 'center', fontWeight: 600, minHeight: 0 }}
 >
 Cancel
 </button>
 </div>
 </div>
 </div>,
 document.body
 );
 })()}

 {/* v2.85.0: Heal success modal — fires after dice settle when a player
     heals themselves. Mirrors the concentration-break prompt pattern: portal
     to body, standard modal shell, single OK button to dismiss. This is the
     canonical post-HP-change confirmation; damage-taken will use the same
     state shape + modal pattern. */}
 {healSuccess && createPortal(
 <div className="modal-overlay" onClick={() => setHealSuccess(null)}>
 <div
 className="modal"
 onClick={e => e.stopPropagation()}
 style={{
 maxWidth: 440, width: 'calc(100vw - 16px)',
 maxHeight: 'calc(100dvh - 32px)',
 display: 'flex', flexDirection: 'column' as const,
 padding: 20,
 }}
 >
 <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--c-border)' }}>
 <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: 'var(--c-green-l)', marginBottom: 6 }}>
 You Healed
 </div>
 <h3 style={{
 margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--t-1)',
 wordBreak: 'break-word' as const, overflowWrap: 'anywhere' as const,
 lineHeight: 1.2,
 }}>
 {healSuccess.sourceName}
 </h3>
 </div>
 <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14, marginBottom: 16 }}>
 <div style={{
 display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 10,
 padding: '18px 16px', borderRadius: 'var(--r-md)',
 background: 'rgba(52,211,153,0.12)',
 border: '1px solid rgba(52,211,153,0.4)',
 }}>
 <span style={{ fontFamily: 'var(--ff-stat)', fontSize: 42, fontWeight: 900, color: 'var(--c-green-l)', lineHeight: 1 }}>
 +{healSuccess.amount}
 </span>
 <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--c-green-l)' }}>
 HP
 </span>
 </div>
 <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, color: 'var(--t-2)' }}>
 <span>Rolled <strong style={{ color: 'var(--t-1)' }}>{healSuccess.expr}</strong></span>
 <span>Now at <strong style={{ color: 'var(--c-green-l)' }}>{healSuccess.newHp}/{healSuccess.maxHp}</strong></span>
 </div>
 {healSuccess.newHp === healSuccess.maxHp && (
 <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--c-gold-l)', letterSpacing: '0.08em', fontWeight: 700, textTransform: 'uppercase' as const }}>
 Full Health
 </div>
 )}
 </div>
 <button
 onClick={() => setHealSuccess(null)}
 style={{
 width: '100%', padding: '12px 16px', borderRadius: 'var(--r-md)',
 cursor: 'pointer', fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 14,
 border: '1px solid rgba(52,211,153,0.6)',
 background: 'linear-gradient(180deg, rgba(52,211,153,0.35), rgba(52,211,153,0.2))',
 color: '#d1fae5', letterSpacing: '0.04em',
 boxShadow: '0 2px 8px rgba(52,211,153,0.2)',
 minHeight: 0,
 }}
 >
 OK
 </button>
 </div>
 </div>,
 document.body
 )}

 </div>
 {/* v2.96.0 — Phase D: initiative strip for players on their sheet */}
 <InitiativeStrip isDM={false} />
 {/* v2.98.0 — Phase E: reaction prompt for this character */}
 {character.campaign_id && <ReactionPromptModal campaignId={character.campaign_id} />}
 {/* v2.118.0 — Phase I pt 2: concentration save prompt when automation is 'prompt' */}
 <ConcentrationSavePromptModal characterId={character.id} />
 {/* v2.144.0 — Phase N pt 2: death save prompt when the downed character
     starts their turn at 0 HP and automation resolves to 'prompt' */}
 {character.campaign_id && <DeathSavePromptModal characterId={character.id} campaignId={character.campaign_id} />}
 </CombatProvider>
 );
}

// ------------------------------------------------------------------
// SpellRow
// ------------------------------------------------------------------
function SpellRow({
 spell, isPrepared, isConcentrating, castButton, onTogglePrepared, onConcentrate, onRemove,
}: {
 spell: SpellData;
 isPrepared: boolean;
 isConcentrating: boolean;
 castButton?: ReactNode;
 onTogglePrepared: () => void;
 onConcentrate: () => void;
 onRemove: () => void;
}) {
 const [expanded, setExpanded] = useState(false);

 return (
 <div style={{
 border: isConcentrating ? '1px solid rgba(201,146,42,0.5)' : '1px solid var(--c-border)',
 borderRadius: 'var(--r-md)',
 background: isConcentrating ? 'rgba(201,146,42,0.05)' : 'var(--c-surface)',
 overflow: 'hidden',
 transition: 'border-color var(--tr-fast)',
 }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-3) var(--sp-4)' }}>
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--c-gold-l)', minWidth: 42 }}>
 {LEVEL_LABELS[spell.level]}
 </span>

 <button
 onClick={() => setExpanded(e => !e)}
 style={{ fontFamily: 'var(--ff-body)', fontWeight: 600, fontSize: 'var(--fs-sm)', color: 'var(--t-1)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', flex: 1 }}
 >
 {spell.name}
 </button>

 <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
 {spell.concentration && (
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--c-gold)', fontWeight: 700 }} title="Concentration">C</span>
 )}
 {spell.ritual && (
 <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: '#60a5fa', fontWeight: 700 }} title="Ritual">R</span>
 )}
 </div>

 {spell.concentration && (
 <button
 onClick={onConcentrate}
 className={isConcentrating ? 'btn-gold btn-sm' : 'btn-secondary btn-sm'}
 style={{ fontSize: 'var(--fs-xs)' }}
 >
 {isConcentrating ? 'Concentrating' : 'Concentrate'}
 </button>
 )}

 {/* Cast button */}
 {castButton}

 {spell.level > 0 && (
 <button
 onClick={onTogglePrepared}
 className={isPrepared ? 'btn-gold btn-sm' : 'btn-secondary btn-sm'}
 style={{ fontSize: 'var(--fs-xs)' }}
 >
 {isPrepared ? 'Prepared' : 'Prepare'}
 </button>
 )}

 <button
 onClick={onRemove}
 className="btn-ghost btn-sm"
 style={{ color: 'var(--t-2)', fontSize: 'var(--fs-xs)', padding: '2px 6px' }}
 title="Remove from spellbook"
 >
 
 </button>
 </div>

 {expanded && (
 <div style={{ padding: 'var(--sp-3) var(--sp-4)', borderTop: '1px solid var(--c-border)', background: '#080d14', animation: 'fadeIn 120ms ease both' }}>
 <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--sp-2)', marginBottom: 'var(--sp-3)' }}>
 {([['Time', spell.casting_time], ['Range', spell.range], ['Duration', spell.duration], ['Components', spell.components]] as [string, string][]).map(([l, v]) => (
 <div key={l}>
 <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t-2)', marginBottom: 1 }}>{l}</div>
 <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>{v}</div>
 </div>
 ))}
 </div>
 <p style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.6, color: 'var(--t-2)' }}>{spell.description}</p>
 {spell.higher_levels && (
 <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginTop: 'var(--sp-2)', fontStyle: 'italic' }}>
 At Higher Levels: {spell.higher_levels}
 </p>
 )}
 </div>
 )}

 </div>
 );
}

// ──────────────────────────────────────────────────────────────────
// v2.294.0 — Combat banner ("Your Turn" / "Combat active") sub-component.
//
// Was a JSX block driven by parent state (combatActive / isMyTurn /
// currentTurnName / combatRound) that came from a session_states
// realtime subscription. After the v2.286+ migrations, that table
// stopped being the canonical combat source and the banner had been
// silently broken (combat_active stayed false in production).
//
// New shape: pure derivation from useCombat() inside the existing
// CombatProvider tree. The provider already realtime-subscribes to
// combat_encounters + combat_participants for this campaign, so this
// sub-component renders nothing during peace and the right banner
// during combat with no extra plumbing.
//
// "Your turn" matching: modern combat_participants use entity_id to
// link back to the character row, so we match
// `currentActor.entity_id === characterId` for player chars.
// Legacy fallback by name was a defensive hack for the v2.248-era
// schema where Combatant entries created via "Add Monster" had no
// link back to the npcs table; modern combat doesn't have that
// problem so the name fallback is dropped.
// ──────────────────────────────────────────────────────────────────
function YourTurnBanner({ characterId, characterName: _characterName }: {
 characterId: string;
 characterName: string;
}) {
 const { encounter, currentActor } = useCombat();
 if (!encounter || encounter.status !== 'active') return null;

 const isMyTurn = currentActor?.entity_id === characterId
 && currentActor?.participant_type === 'character';
 const currentTurnName = currentActor?.name ?? '';
 const combatRound = encounter.round_number ?? 1;

 return (
 <div style={{
 padding: '8px 16px',
 background: isMyTurn
 ? 'linear-gradient(90deg, rgba(212,160,23,0.18), rgba(212,160,23,0.06))'
 : 'rgba(255,255,255,0.03)',
 border: `1px solid ${isMyTurn ? 'var(--c-gold-bdr)' : 'var(--c-border)'}`,
 borderRadius: 10,
 display: 'grid',
 gridTemplateColumns: '1fr auto 1fr',
 alignItems: 'center',
 gap: 10,
 transition: 'all 0.3s',
 animation: isMyTurn ? 'pulse-gold 2s infinite' : 'none',
 }}>
 <div />
 <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center' }}>
 <div style={{
 width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
 background: isMyTurn ? 'var(--c-gold)' : 'var(--t-3)',
 boxShadow: isMyTurn ? '0 0 8px var(--c-gold)' : 'none',
 }} />
 {isMyTurn ? (
 <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--c-gold-l)', letterSpacing: '0.04em' }}>
 YOUR TURN
 </span>
 ) : (
 <span style={{ fontWeight: 500, fontSize: 12, color: 'var(--t-3)' }}>
 Combat active — {currentTurnName ? `${currentTurnName}'s turn` : 'waiting…'}
 </span>
 )}
 </div>
 <span style={{ fontSize: 10, color: 'var(--t-3)', fontWeight: 600, textAlign: 'right' }}>
 ROUND {combatRound}
 </span>
 </div>
 );
}
