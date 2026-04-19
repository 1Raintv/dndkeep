import { useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Character, ConditionName, InventoryItem, SpellSlots, NoteField, ActiveBuff, SpellData } from '../../types';
import { computeStats, abilityModifier, rollDie } from '../../lib/gameUtils';
import { updateCharacter, supabase } from '../../lib/supabase';
import { useDebouncedCallback } from '../../lib/useDebounce';
import { useSpells } from '../../lib/hooks/useSpells';
import { FEATS } from '../../data/feats';
import { CLASS_MAP, getSubclassSpellIds } from '../../data/classes';
import { CONDITION_MAP } from '../../data/conditions';
import { getCharacterResources, buildDefaultResources } from '../../data/classResources';
import { acBreakdown } from '../../data/equipment';
import { canAddKnownSpell, canPrepareSpell } from '../../lib/spellLimits';

import CharacterHeader from './CharacterHeader';
import AbilityScores from './AbilityScores';
import HPStatsPanel from './HPStatsPanel';
import DeathSaves from './DeathSaves';
import CampaignBar from './CampaignBar';
import SkillsList from './SkillsList';
import SpellSlotsPanel from './SpellSlots';
import SpellCastButton from './SpellCastButton';
import ConditionsPanel from './ConditionsPanel';
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
import WeaponsTracker from './WeaponsTracker';
import RollHistory from './RollHistory';
import ActiveBuffsPanel from './ActiveBuffsPanel';
import LevelUpWizard from './LevelUpWizard';
import SpellsTab from './SpellsTab';
import ConditionMechanics from './ConditionMechanics';
import ActionLog from '../shared/ActionLog';
import WildshapeTracker from './WildshapeTracker';
import ErrorBoundary from '../ErrorBoundary';
import DamageEffect from './DamageEffect';
import { PlayerRollPrompt } from '../Campaign/RollRequest';
import ClassResourcesPanel from './ClassResourcesPanel';
import MagicItemBrowser from '../shared/MagicItemBrowser';
import { useKeyboardShortcuts } from '../../lib/useKeyboardShortcuts';
import { useCampaign } from '../../context/CampaignContext';
import { resolveAutomation } from '../../lib/automations';

type Tab = 'actions' | 'abilities' | 'features' | 'spells' | 'inventory' | 'bio' | 'history';

const TABS: { id: Tab; label: string }[] = [
  { id: 'actions',    label: '⚔️ Actions' },
  { id: 'abilities',  label: 'Abilities' },
  { id: 'features',   label: 'Features' },
  { id: 'spells',     label: 'Spells' },
  { id: 'inventory',  label: 'Inventory' },
  { id: 'bio',        label: 'Notes' },
  { id: 'history',    label: 'History' },
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
}

export default function CharacterSheet({ initialCharacter, realtimeEnabled: _realtimeEnabled = false, isPro = false, userId = '' }: CharacterSheetProps) {
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

  // ── Initiative / "your turn" banner ──────────────────────────────
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [combatActive, setCombatActive] = useState(false);
  const [currentTurnName, setCurrentTurnName] = useState('');
  const [combatRound, setCombatRound] = useState(1);

  // ── DM Announcements & Save Prompts ────────────────────────────
  const [dmAnnouncement, setDmAnnouncement] = useState<string | null>(null);
  const [savePrompt, setSavePrompt] = useState<{ ability: string; dc: number } | null>(null);

  useEffect(() => {
    if (!character.campaign_id) return;
    const ch = supabase
      .channel(`dm-broadcast-${character.campaign_id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'campaign_chat',
        filter: `campaign_id=eq.${character.campaign_id}`,
      }, payload => {
        const row = payload.new as any;
        if (row.message_type === 'announcement') {
          setDmAnnouncement(row.message);
          setTimeout(() => setDmAnnouncement(null), 30000);
        } else if (row.message_type === 'save_prompt') {
          try { setSavePrompt(JSON.parse(row.message)); } catch {}
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [character.campaign_id]);

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
    const allGranted = [...new Set([...subSpellIds, ...classGranted])];

    // Known spells: add missing granted, strip stale auto-grants
    const desiredKnown = character.known_spells.filter(id => !stale.includes(id));
    const missingKnown = allGranted.filter(id => !desiredKnown.includes(id));
    if (missingKnown.length > 0 || desiredKnown.length !== character.known_spells.length) {
      updates.known_spells = [...desiredKnown, ...missingKnown];
    }

    // Prepared spells: same — auto-prepare what's currently granted, drop stale
    const desiredPrepared = character.prepared_spells.filter(id => !stale.includes(id));
    const missingPrepared = subSpellIds.filter(id => !desiredPrepared.includes(id));
    if (missingPrepared.length > 0 || desiredPrepared.length !== character.prepared_spells.length) {
      updates.prepared_spells = [...desiredPrepared, ...missingPrepared];
    }

    if (Object.keys(updates).length > 0) {
      applyUpdate(updates, true);
    }
  }, [character.subclass, character.class_name, character.level]); // eslint-disable-line react-hooks/exhaustive-deps

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
        // Fields that can be written by external sources (BattleMap, DM actions)
        const externalFields = [
          'current_hp', 'temp_hp', 'active_conditions', 'concentration_spell',
          'spell_slots', 'death_saves_successes', 'death_saves_failures',
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

    // Fetch initial state
    supabase
      .from('session_states')
      .select('*')
      .eq('campaign_id', character.campaign_id)
      .maybeSingle()
      .then(({ data }) => { if (data) applySessionState(data); });

    // Subscribe to changes
    const ch = supabase
      .channel(`session-state-${character.campaign_id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_states', filter: `campaign_id=eq.${character.campaign_id}` },
        payload => { if (payload.new) applySessionState(payload.new as any); }
      )
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [character.campaign_id, character.id]);

  function applySessionState(state: any) {
    const active = !!state.combat_active;
    setCombatActive(active);
    setCombatRound(state.round ?? 1);
    if (!active) { setIsMyTurn(false); setCurrentTurnName(''); return; }
    const order: any[] = state.initiative_order ?? [];
    const sorted = [...order].sort((a, b) => b.initiative - a.initiative);
    const idx = state.current_turn % Math.max(sorted.length, 1);
    const current = sorted[idx];
    if (!current) return;
    setCurrentTurnName(current.name ?? '');
    setIsMyTurn(current.character_id === character.id || current.name === character.name);
  }
  // Concentration: derived from character.concentration_spell (persisted in DB).
  // Empty string means "not concentrating" — same as null at the React layer.
  // Writes go through setConcentration(), which persists immediately so a refresh
  // mid-combat won't silently drop the spell.
  const concentrationSpellId = character.concentration_spell || null;
  const [concentrationSaveDC, setConcentrationSaveDC] = useState<number | null>(null);

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
    setCharacter(prev => ({ ...prev, ...partial }));
    pendingRef.current = { ...pendingRef.current, ...partial };
    if (immediate) flushToSupabase();
    else debouncedFlush();
  }

  /** Persist concentration spell ID immediately to DB so it survives refresh. */
  function setConcentration(spellId: string | null) {
    applyUpdate({ concentration_spell: spellId ?? '' }, true);
  }

  // ------------------------------------------------------------------
  // Automation framework — resolve campaign + character settings
  // ------------------------------------------------------------------
  const { campaigns } = useCampaign();
  const activeCampaign = useMemo(
    () => campaigns.find(c => c.id === character.campaign_id) ?? null,
    [campaigns, character.campaign_id]
  );

  /**
   * Shared concentration-save roll. Used by both the Prompt popup's Roll
   * button and the Auto path in handleUpdateHP. Rolls 1d20 + CON save
   * bonus vs the DC, logs to the action log, and drops concentration on
   * a failed save. Returns the roll result for callers that want it.
   */
  function rollConcentrationSave(dc: number): { passed: boolean; total: number; d20: number } {
    const conScore = character.constitution ?? 10;
    const conMod = Math.floor((conScore - 10) / 2);
    const pb = Math.ceil(character.level / 4) + 1;
    const hasSaveProf = character.saving_throw_proficiencies?.includes('constitution');
    const saveBonus = conMod + (hasSaveProf ? pb : 0);
    const d20 = Math.floor(Math.random() * 20) + 1;
    const total = d20 + saveBonus;
    const passed = total >= dc;
    if (!passed) setConcentration(null);
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
        notes: `DC ${dc} · ${passed ? '✓ Maintained' : '✗ Concentration broken'}`,
      });
    });
    return { passed, total, d20 };
  }

  // ------------------------------------------------------------------
  // Handlers
  // ------------------------------------------------------------------
  function handleUpdateHP(current_hp: number, temp_hp: number) {
    // Concentration save check — if taking damage while concentrating,
    // respect the concentration_on_damage automation setting.
    const damageTaken = current_hp < character.current_hp;
    if (damageTaken && concentrationSpellId) {
      const damage = character.current_hp - current_hp;
      const dc = Math.max(10, Math.floor(damage / 2));
      const mode = resolveAutomation('concentration_on_damage', character, activeCampaign);
      if (mode === 'prompt') {
        setConcentrationSaveDC(dc);
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
      applyUpdate({ active_conditions, concentration_spell: '' }, true);
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
  const [combatFilter, setCombatFilter] = useState<'all'|'action'|'bonus'|'reaction'|'limited'>('all');
  const [spellCastThisTurn, setSpellCastThisTurn] = useState(false);
  // Per 2024 rules: if you cast a leveled BONUS ACTION spell, main action = cantrip only
  const [bonusActionSpellCast, setBonusActionSpellCast] = useState(false);
  const [isDM, setIsDM] = useState(false);

  function rollHitDie() {
    const cls = CLASS_MAP[character.class_name];
    if (!cls) return;
    const hitDie = cls.hit_die;
    const conMod = abilityModifier(character.constitution);
    const roll = rollDie(hitDie);
    const gained = Math.max(1, roll + conMod);
    const newHp = Math.min(character.max_hp, character.current_hp + gained);
    const newSpent = (character.hit_dice_spent ?? 0) + 1;
    setShortRestHpGained(prev => prev + (newHp - character.current_hp));
    applyUpdate({ current_hp: newHp, hit_dice_spent: newSpent }, true);
  }

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
    applyUpdate({
      current_hp: character.max_hp,
      temp_hp: 0,
      spell_slots: recoveredSlots,
      active_conditions: character.active_conditions.filter(c => c !== 'Exhaustion'),
      death_saves_successes: 0,
      death_saves_failures: 0,
      hit_dice_spent: newSpent,
      class_resources: newResources,
      feature_uses: {}, // All per-rest feature uses reset on long rest
    }, true);
    setConcentration(null);
    setShortRestHpGained(0);
    setShowRest(false);
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
              handleUpdateHP(character.current_hp, tempHP);
            } else {
              const newHP = Math.max(0, Math.min(character.max_hp, character.current_hp + delta));
              handleUpdateHP(newHP, character.temp_hp);
            }
          }}
      />

      {/* HP Stats — shown directly below character name */}
      <HPStatsPanel
        character={character}
        computed={computed}
        onUpdateHP={(delta, tempHP) => {
          if (tempHP !== undefined) {
            handleUpdateHP(character.current_hp, tempHP);
          } else {
            const newHP = Math.max(0, Math.min(character.max_hp, character.current_hp + delta));
            handleUpdateHP(newHP, character.temp_hp);
          }
        }}
        onUpdateAC={ac => applyUpdate({ armor_class: ac }, true)}
        onUpdateSpeed={speed => applyUpdate({ speed }, true)}
      />

      {/* Death Saves — shown when HP = 0 */}
      {character.current_hp <= 0 && !character.wildshape_active && (
        <DeathSaves
          character={character}
          onUpdate={u => applyUpdate(u, true)}
        />
      )}

      {/* Active conditions — shown near HP/name */}
      {character.active_conditions.length > 0 && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)',
          padding: '6px 12px', background: 'rgba(155,28,28,0.08)',
          border: '1px solid rgba(155,28,28,0.3)', borderRadius: 'var(--r-md)',
          marginTop: -8,
        }}>
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fca5a5', alignSelf: 'center' }}>
            Conditions:
          </span>
          {character.active_conditions.map(c => (
            <span key={c} className="condition-pill">{c}</span>
          ))}
        </div>
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

      {/* Concentration banner */}
      {/* Concentration Save Prompt — shown when taking damage while concentrating */}
      {concentrationSaveDC !== null && concentrationSpellId && (() => {
        const conScore = character.constitution ?? 10;
        const conMod = Math.floor((conScore - 10) / 2);
        const pb = Math.ceil(character.level / 4) + 1;
        const hasSaveProf = character.saving_throw_proficiencies?.includes('constitution');
        const saveBonus = conMod + (hasSaveProf ? pb : 0);
        const spellName = spellMap[concentrationSpellId]?.name ?? 'Concentration';
        return (
          <div style={{
            padding: '12px 16px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.4)',
            animation: 'pulse-gold 1s ease-out 1',
          }}>
            <span style={{ fontSize: 18 }}>🎯</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 800, fontSize: 11, color: '#a78bfa', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: 2 }}>
                Concentration Check Required
              </div>
              <div style={{ fontFamily: 'var(--ff-body)', fontSize: 12, color: 'var(--t-2)' }}>
                {spellName} — CON save DC {concentrationSaveDC} (you need a {concentrationSaveDC} or higher)
              </div>
            </div>
            <button
              onClick={() => {
                rollConcentrationSave(concentrationSaveDC!);
                setConcentrationSaveDC(null);
              }}
              style={{ fontFamily: 'var(--ff-body)', fontWeight: 800, fontSize: 12, padding: '6px 14px', borderRadius: 'var(--r-md)', cursor: 'pointer',
                background: 'rgba(167,139,250,0.2)', border: '1px solid rgba(167,139,250,0.5)', color: '#a78bfa' }}
            >
              🎲 Roll CON Save (+{saveBonus >= 0 ? saveBonus : saveBonus})
            </button>
            <button onClick={() => setConcentrationSaveDC(null)}
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
            padding: 'var(--sp-3) var(--sp-4)',
            background: 'rgba(167,139,250,0.08)',
            border: '1px solid rgba(167,139,250,0.4)',
            borderRadius: 'var(--r-md)',
            gap: 'var(--sp-3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
              
              <div>
                <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: '#a78bfa' }}>
                  Concentrating: {spell.name}
                </div>
                <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
                  {spell.duration} · Taking damage requires a CON save (DC 10 or half damage taken)
                </div>
              </div>
            </div>
            <button
              onClick={() => setConcentration(null)}
              className="btn-secondary btn-sm"
              style={{ flexShrink: 0, borderColor: 'rgba(167,139,250,0.4)', color: '#a78bfa' }}
            >
              Drop
            </button>
          </div>
        ) : null;
      })()}

      {/* Wildshape banner (Druids only) */}
      {character.class_name === 'Druid' && character.wildshape_active && (() => {
        const hpPct = character.wildshape_max_hp > 0 ? (character.wildshape_current_hp ?? 0) / character.wildshape_max_hp : 0;
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
        <div className="modal-overlay" onClick={() => { setShortRestHpGained(0); setShowRest(false); }}>
          <div className="modal" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: 'var(--sp-2)' }}>Take a Rest</h2>
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

                      <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'center' }}>
                        <button
                          className="btn-gold"
                          onClick={rollHitDie}
                          disabled={available === 0 || atMax}
                          style={{ flex: 1, justifyContent: 'center' }}
                          title={available === 0 ? 'No hit dice remaining' : atMax ? 'Already at max HP' : `Roll 1d${hitDie}${conMod >= 0 ? '+' : ''}${conMod} to recover HP`}
                        >
                          Roll Hit Die (d{hitDie}{conMod >= 0 ? '+' : ''}{conMod})
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
              onClick={() => { setShortRestHpGained(0); setShowRest(false); }}
              style={{ marginTop: 'var(--sp-4)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Toolbar row: save status only */}
      {(saving || saveError) && (
        <div style={{ height: 20, display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          {saving && (
            <>
              <span className="spinner" style={{ width: 12, height: 12 }} />
              <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', letterSpacing: '0.06em' }}>
                Saving...
              </span>
            </>
          )}
          {saveError && !saving && (
            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--c-red-l)' }}>
              {saveError}
            </span>
          )}
        </div>
      )}



      {/* Concentration banner */}
      {concentrationSpellId && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
          padding: 'var(--sp-3) var(--sp-4)',
          background: 'rgba(201,146,42,0.06)', border: '1px solid rgba(201,146,42,0.3)',
          borderRadius: 'var(--r-md)',
        }}>
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--c-gold-l)' }}>
            Concentrating:
          </span>
          <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: 'var(--t-1)', flex: 1 }}>
            {spellMap[concentrationSpellId]?.name ?? concentrationSpellId}
          </span>
          <button className="btn-ghost btn-sm" onClick={() => setConcentration(null)}
            style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>
            End
          </button>
        </div>
      )}



      {/* Active condition warning banner */}
      {(() => {
        const mechConditions = (character.active_conditions ?? []).filter(c => {
          const m = CONDITION_MAP[c];
          return m?.attackDisadvantage || m?.abilityCheckDisadvantage || m?.concentrationBreaks || m?.cantAct;
        });
        if (!mechConditions.length) return null;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-2) var(--sp-4)', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 'var(--r-md)', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--c-red-l)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>⚠ Active Conditions:</span>
            {mechConditions.map(c => {
              const m = CONDITION_MAP[c];
              const effects = [];
              if (m?.attackDisadvantage) effects.push('disadv. attacks');
              if (m?.abilityCheckDisadvantage) effects.push('disadv. checks');
              if (m?.cantAct) effects.push("can't act");
              return (
                <span key={c} style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: m?.color ?? 'var(--t-2)', background: `${m?.color ?? '#64748b'}15`, border: `1px solid ${m?.color ?? '#64748b'}30`, padding: '2px 8px', borderRadius: 999 }}>
                  {m?.icon} {c}{effects.length ? ` — ${effects.join(', ')}` : ''}
                </span>
              );
            })}
          </div>
        );
      })()}

      {/* ── HUD TWO-COLUMN LAYOUT ── */}
      <div className="cs-hud-layout">
        {/* ── LEFT VITALS COLUMN — sticky on desktop ── */}
        <aside className="cs-vitals-col">
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
          <span style={{ fontSize: 16, flexShrink: 0 }}>📣</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--c-gold-l)', marginBottom: 4 }}>
              DM Announcement
            </div>
            <div style={{ fontSize: 13, color: 'var(--t-1)', lineHeight: 1.6 }}>{dmAnnouncement}</div>
          </div>
          <button onClick={() => setDmAnnouncement(null)}
            style={{ fontSize: 11, color: 'var(--t-3)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: '0 4px' }}>
            ✕
          </button>
        </div>
      )}

      {/* ── Save Prompt banner ── */}
      {savePrompt && (() => {
        const abilityKey = savePrompt.ability.toLowerCase() as keyof typeof character;
        const score = (character[abilityKey] as number) ?? 10;
        const mod = Math.floor((score - 10) / 2);
        const pb = computed.proficiencyBonus ?? 2;
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
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => setSavePrompt(null)}
                style={{ fontSize: 11, fontWeight: 600, padding: '5px 12px', borderRadius: 7, cursor: 'pointer', minHeight: 0, border: '1px solid rgba(96,165,250,0.3)', background: 'rgba(96,165,250,0.08)', color: '#60a5fa' }}>
                Dismiss
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Your Turn banner ── */}
      {combatActive && (
        <div style={{
          padding: '8px 16px',
          background: isMyTurn
            ? 'linear-gradient(90deg, rgba(212,160,23,0.18), rgba(212,160,23,0.06))'
            : 'rgba(255,255,255,0.03)',
          border: `1px solid ${isMyTurn ? 'var(--c-gold-bdr)' : 'var(--c-border)'}`,
          borderRadius: 10,
          display: 'flex', alignItems: 'center', gap: 10,
          transition: 'all 0.3s',
          animation: isMyTurn ? 'pulse-gold 2s infinite' : 'none',
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: isMyTurn ? 'var(--c-gold)' : 'var(--t-3)',
            boxShadow: isMyTurn ? '0 0 8px var(--c-gold)' : 'none',
          }} />
          {isMyTurn ? (
            <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--c-gold-l)', letterSpacing: '0.04em' }}>
              ⚔ YOUR TURN
            </span>
          ) : (
            <span style={{ fontWeight: 500, fontSize: 12, color: 'var(--t-3)' }}>
              Combat active — {currentTurnName ? `${currentTurnName}'s turn` : 'waiting…'}
            </span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--t-3)', fontWeight: 600 }}>
            ROUND {combatRound}
          </span>
        </div>
      )}

      {/* ── Divider ── */}
      <div style={{ height: 1, background: 'var(--c-border)' }} />

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
          {(character.is_spellcaster || Object.values(character.spell_slots).some((s: any) => s.total > 0)) && (activeTab === 'spells' || activeTab === 'actions') && (
            <SpellCompletionBanner
              character={character}
              onGoToSpells={() => {
                const evt = new CustomEvent('dndkeep:gototab', { detail: 'spells' });
                window.dispatchEvent(evt);
              }}
            />
          )}

        {/* ── ABILITIES: Skills + Conditions ── */}
        {activeTab === 'abilities' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
            <SkillsList character={character} computed={computed} onUpdate={u => applyUpdate(u, true)} />
            <ConditionsPanel character={character} onUpdateConditions={handleUpdateConditions} />
            {character.active_conditions.length > 0 && (
              <ConditionMechanics conditions={character.active_conditions} />
            )}
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
                console.warn('[spell add blocked]', check.reason);
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
                  console.warn('[spell prepare blocked]', check.reason);
                  return;
                }
                applyUpdate({ prepared_spells: [...character.prepared_spells, id] }, true);
              }
            }}
            onConcentrate={id => setConcentration(concentrationSpellId === id ? null : id)}
            userId={userId}
            campaignId={character.campaign_id}
          />
        )}

        {/* ── COMBAT: Weapons & Attacks only ── */}
        {activeTab === 'actions' && (() => {
          // Inventory weapons: items with damage or weapon category that are equipped
          const inventoryWeapons = (character.inventory ?? []).filter((item: any) =>
            item.equipped && (item.damage || item.is_weapon || item.category?.toLowerCase() === 'weapon' || item.category?.toLowerCase() === 'weapons')
          );
          const inventoryAsWeapons = inventoryWeapons.map((item: any) => {
            // Parse damage string like "1d6 piercing", "1d4+1 slashing", "2d6 fire"
            const dmgStr: string = item.damage ?? '';
            const diceMatch = dmgStr.match(/(\d+d\d+)/);
            const bonusMatch = dmgStr.match(/[+\-]\d+/);
            const typeMatch = dmgStr.match(/(slashing|piercing|bludgeoning|fire|cold|lightning|poison|acid|necrotic|radiant|psychic|thunder|force)/i);
            const strMod = computed.modifiers.strength ?? 0;
            const dexMod = computed.modifiers.dexterity ?? 0;
            // Use higher of STR/DEX for finesse weapons
            const isFinesse = item.properties?.toLowerCase().includes('finesse');
            const atkMod = isFinesse ? Math.max(strMod, dexMod) : strMod;
            const pb = computed.proficiency_bonus ?? 2;
            return {
              id: `inv_${item.id}`,
              name: item.name,
              attackBonus: atkMod + pb,
              damageDice: diceMatch ? diceMatch[1] : '1d4',
              damageBonus: bonusMatch ? parseInt(bonusMatch[0]) : atkMod,
              damageType: typeMatch ? typeMatch[1].toLowerCase() : 'bludgeoning',
              range: item.range ?? 'Melee',
              properties: item.properties ?? '',
              notes: '',
            };
          });

          // Unarmed Strike — always available per 2024 PHB (p.377)
          // Attack: d20 + STR mod + Proficiency Bonus
          // Damage: flat 1 + STR modifier bludgeoning (no dice roll)
          const strMod = computed.modifiers.strength ?? 0;
          const pb = computed.proficiency_bonus ?? 2;
          const unarmedStrike: any = {
            id: 'unarmed',
            name: 'Unarmed Strike',
            attackBonus: strMod + pb,
            damageDice: 'flat',
            damageBonus: 1 + strMod,   // 1 + STR mod per 2024 PHB; can be 0 if STR is very low
            damageType: 'bludgeoning',
            range: 'Melee',
            properties: '',
            notes: '',
          };
          const allWeapons = [unarmedStrike, ...(character.weapons ?? []), ...inventoryAsWeapons];

          // Defenses
          const buffs: any[] = (character as any).active_buffs ?? [];
          const res: string[] = [];
          buffs.forEach((b: any) => { (b.resistances ?? []).forEach((r: string) => { if (!res.includes(r)) res.push(r); }); });
          if (character.species?.toLowerCase().includes('tiefling') && !res.includes('Fire')) res.push('Fire');
          if (character.class_name?.toLowerCase().includes('barbarian') && !res.includes('Non-magical B/P/S')) res.push('Non-magical B/P/S (while raging)');

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)', maxWidth: 800 }}>

              {/* Turn Economy */}
              <ActionEconomy
                speedFeet={character.speed ?? 30}
                onActionUsed={(action: string, used: boolean) => {
                  if (action === 'action' && used && (combatFilter === 'all')) setCombatFilter('bonus');
                  if (action === 'action' && !used) setCombatFilter('all');
                }}
                onNewTurn={() => { setSpellCastThisTurn(false); setBonusActionSpellCast(false); }}
              />

              {/* Defenses strip */}
              {res.length > 0 && (
                <div style={{ background: 'var(--c-surface)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 'var(--r-lg)', padding: 'var(--sp-3) var(--sp-4)' }}>
                  <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: '#4ade80', marginBottom: 8 }}>🛡 Defenses</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {res.map((r: string, i: number) => (
                      <span key={i} style={{ fontFamily: 'var(--ff-body)', fontSize: 11, fontWeight: 600, color: '#4ade80', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 20, padding: '2px 10px' }}>{r}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Filter chips */}
              <div>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
                  {([
                    { id: 'all',      label: 'All' },
                    { id: 'limited',  label: '⏳ Limited Use' },
                    { id: 'action',   label: '🔵 Action' },
                    { id: 'bonus',    label: '⚡ Bonus' },
                    { id: 'reaction', label: '🛡 Reaction' },
                    ] as const).map(f => (
                    <button key={f.id} onClick={() => setCombatFilter(f.id)}
                      style={{
                        fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 10,
                        letterSpacing: '.06em', textTransform: 'uppercase',
                        padding: '4px 10px', borderRadius: 20, cursor: 'pointer',
                        border: combatFilter === f.id ? '1px solid var(--c-gold)' : '1px solid var(--c-border)',
                        background: combatFilter === f.id ? 'rgba(245,158,11,0.15)' : 'transparent',
                        color: combatFilter === f.id ? 'var(--c-gold-l)' : 'var(--t-3)',
                        transition: 'all .15s',
                      }}>
                      {f.label}
                    </button>
                  ))}
                  {inventoryWeapons.length > 0 && (
                    <span style={{ marginLeft: 'auto', fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--c-gold-l)', background: 'var(--c-gold-bg)', border: '1px solid var(--c-gold-bdr)', borderRadius: 999, padding: '2px 8px' }}>
                      +{inventoryWeapons.length} from inventory
                    </span>
                  )}
                </div>

                {/* Weapons — merged from weapons list + equipped inventory */}
                {combatFilter === 'all' && (
                  <WeaponsTracker
                    weapons={allWeapons}
                    onUpdate={weapons => applyUpdate({ weapons: weapons.filter((w: any) => !String(w.id).startsWith('inv_')) })}
                    characterId={userId}
                    characterName={character.name}
                    campaignId={character.campaign_id}
                    activeConditions={character.active_conditions}
                    activeBufss={(character as any).active_buffs ?? []}
                  />
                )}

                {/* Class Abilities — with DDB-style section labels */}
                {combatFilter === 'all' && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--c-border)', paddingBottom: 5, marginTop: 4 }}>
                    <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase' as const, color: 'var(--t-3)' }}>
                      ABILITIES &amp; RESOURCES
                    </span>
                  </div>
                )}
                <ClassAbilitiesSection
                  character={character}
                  combatFilter={combatFilter}
                  onUpdate={u => applyUpdate(u, true)}
                  userId={userId}
                  campaignId={character.campaign_id}
                />

                {/* Health Potions — consumables that are actions on your turn */}
                {(combatFilter === 'all' || combatFilter === 'action') && (() => {
                  const potions = (character.inventory ?? []).filter((item: any) =>
                    item.category === 'Potion' && item.quantity > 0
                  );
                  if (potions.length === 0) return null;
                  return (
                    <div style={{ marginTop: 'var(--sp-3)' }}>
                      <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as 'uppercase', color: 'var(--c-green-l)', marginBottom: 6 }}>
                        🧪 Potions & Consumables
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' as 'column', gap: 4 }}>
                        {potions.map((item: any) => (
                          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 'var(--r-md)', border: '1px solid rgba(52,211,153,0.2)', background: 'rgba(52,211,153,0.03)' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13, color: 'var(--t-1)' }}>{item.name}</div>
                              {item.description && (
                                <div style={{ fontFamily: 'var(--ff-body)', fontSize: 11, color: 'var(--t-3)', marginTop: 1 }}>{item.description}</div>
                              )}
                            </div>
                            <span style={{ fontFamily: 'var(--ff-stat)', fontSize: 11, color: 'var(--c-green-l)', background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', padding: '2px 8px', borderRadius: 999 }}>
                              ×{item.quantity}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Action / Bonus / Reaction features */}
                {/* Active Feats — feats with usable abilities */}
                {(() => {
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
                          ⚡ Feat Abilities
                        </div>
                        <FeatsPanel character={character} onUpdate={u => applyUpdate(u, true)} />
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* ── PREPARED SPELLS ── */}
                {(() => {
                  const isSpellcaster = character.is_spellcaster ||
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

                  const cantrips = readySpells.filter(s => s.level === 0);
                  const leveled = readySpells.filter(s => s.level > 0);

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
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(167,139,250,0.2)', paddingBottom: 5, marginBottom: 8 }}>
                        <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase' as 'uppercase', color: '#a78bfa' }}>
                          SPELLS
                        </span>
                        {isPreparer && <span style={{ fontFamily: 'var(--ff-body)', fontSize: 9, color: 'var(--t-3)' }}>{character.prepared_spells.length} prepared</span>}
                      </div>

                      {/* Mini slot tracker */}
                      {Object.keys(slotsByLevel).length > 0 && (
                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                          {Object.entries(slotsByLevel).map(([lvl, slot]) => {
                            const level = parseInt(lvl);
                            const levelLabels = ['','1st','2nd','3rd','4th','5th','6th','7th','8th','9th'];
                            const full = slot.remaining === 0;
                            return (
                              <div key={lvl} style={{
                                display: 'flex', alignItems: 'center', gap: 4,
                                padding: '3px 8px', borderRadius: 999, fontSize: 9, fontWeight: 700,
                                background: full ? 'rgba(239,68,68,0.08)' : 'rgba(167,139,250,0.1)',
                                border: `1px solid ${full ? 'rgba(239,68,68,0.3)' : 'rgba(167,139,250,0.3)'}`,
                                color: full ? '#ef4444' : '#a78bfa',
                              }}>
                                {levelLabels[level]}
                                <span style={{ fontFamily: 'var(--ff-stat)' }}>{slot.remaining}/{slot.total}</span>
                                {full && <span>🔒</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column' as 'column', gap: 4 }}>
                        {[...cantrips, ...leveled].map(spell => {
                          const sc = schoolColor[spell.school] ?? '#a78bfa';
                          // Gray out if no slots available for this spell level
                          const slotsExhausted = spell.level > 0 && (() => {
                            for (let lvl = spell.level; lvl <= 9; lvl++) {
                              if ((slotsByLevel[lvl]?.remaining ?? 0) > 0) return false;
                            }
                            return true;
                          })();

                          return (
                            <div key={spell.id} style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '8px 12px', borderRadius: 'var(--r-md)',
                              border: `1px solid ${slotsExhausted ? 'rgba(239,68,68,0.15)' : 'rgba(167,139,250,0.18)'}`,
                              background: slotsExhausted ? 'rgba(239,68,68,0.03)' : 'rgba(167,139,250,0.04)',
                              opacity: slotsExhausted ? 0.55 : 1,
                            }}>
                              {/* Slot level / AT WILL badge — left side */}
                              <div style={{ flexShrink: 0, width: 30, textAlign: 'center' }}>
                                {spell.level === 0 ? (
                                  <div style={{ fontFamily: 'var(--ff-body)', fontSize: 7, fontWeight: 800, color: '#a78bfa', letterSpacing: '0.06em', textTransform: 'uppercase' as const, lineHeight: 1.2 }}>AT<br/>WILL</div>
                                ) : (
                                  <div style={{ fontFamily: 'var(--ff-stat)', fontWeight: 900, fontSize: 13, color: slotsExhausted ? '#ef4444' : '#a78bfa', lineHeight: 1 }}>
                                    {spell.level}
                                    {spell.concentration && <span style={{ fontFamily: 'var(--ff-body)', fontSize: 7, display: 'block', color: '#fbbf24', fontWeight: 700 }}>CONC</span>}
                                  </div>
                                )}
                              </div>
                              <div style={{ width: 3, height: 28, borderRadius: 2, background: sc, opacity: slotsExhausted ? 0.3 : 0.7, flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
                                  <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 13, color: slotsExhausted ? 'var(--t-3)' : 'var(--t-1)' }}>
                                    {spell.name}
                                  </span>
                                  {slotsExhausted && <span style={{ fontSize: 9, fontWeight: 700, color: '#ef4444' }}>🔒 No Slots</span>}
                                </div>
                                <div style={{ fontSize: 9, color: 'var(--t-3)', marginTop: 1 }}>
                                  {spell.casting_time} · {spell.range} · {spell.school}
                                </div>
                              </div>
                              <SpellCastButton
                                spell={spell}
                                character={character}
                                userId={userId ?? ''}
                                campaignId={character.campaign_id}
                                onUpdateSlots={slots => applyUpdate({ spell_slots: slots }, true)}
                                compact={true}
                                spellLockedOut={
                                  // Locked if: already cast leveled spell this turn
                                  (spellCastThisTurn && spell.level > 0) ||
                                  // OR: bonus action spell cast → main action cantrip only (but lockout doesn't apply to cantrips)
                                  (bonusActionSpellCast && spell.level > 0)
                                }
                                onLeveledSpellCast={(isBonusAction?: boolean) => {
                                  setSpellCastThisTurn(true);
                                  if (isBonusAction) setBonusActionSpellCast(true);
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

              </div>
            </div>
          );
        })()}
        {/* ── COMPACT ROLL LOG — pinned at bottom of Actions tab ── */}
        {activeTab === 'actions' && character.campaign_id && (
          <div style={{ marginTop: 8, padding: '10px 14px', borderRadius: 'var(--r-lg)', background: 'var(--c-surface)', border: '1px solid var(--c-border)' }}>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--t-3)', marginBottom: 8 }}>Recent Rolls</div>
            <ActionLog campaignId={character.campaign_id} characterId={character.id} mode="character" maxHeight={120} compact />
          </div>
        )}

        {/* ── INVENTORY ── */}
        {activeTab === 'inventory' && (
          <div style={{ maxWidth: 900 }}>
            <Inventory character={character} onUpdateInventory={handleUpdateInventory} onUpdateCurrency={currency => applyUpdate({ currency })} onUpdateAC={ac => applyUpdate({ armor_class: ac }, true)} />
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

        {/* ── HISTORY: Roll log + Action log merged ── */}
        {activeTab === 'history' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', maxWidth: 900 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' as const, gap: 8 }}>
              <div style={{ fontFamily: 'var(--ff-body)', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--t-3)' }}>
                📜 Roll &amp; Action History
              </div>
              <span style={{ fontFamily: 'var(--ff-body)', fontSize: 10, color: 'var(--t-3)' }}>
                {character.campaign_id ? 'Showing campaign rolls + solo rolls • newest first' : 'Showing solo rolls • newest first'}
              </span>
            </div>
            {/* Unified timeline: in campaign use ActionLog (richer), solo use RollHistory */}
            {character.campaign_id ? (
              <ActionLog campaignId={character.campaign_id} characterId={character.id} mode="character" maxHeight={620} />
            ) : (
              <RollHistory characterId={character.id} userId={userId} />
            )}
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
    </div>
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
          ✕
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
