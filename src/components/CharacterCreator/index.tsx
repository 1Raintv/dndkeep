import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AbilityKey, Alignment, AbilityScoreMethod, Character } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { createCharacter } from '../../lib/supabase';
import { CLASS_MAP } from '../../data/classes';
import { BACKGROUND_MAP } from '../../data/backgrounds';
import { SPECIES_MAP } from '../../data/species';
import { SPECIES_AUTO_SKILLS } from '../../data/classAbilities';
import { slotRowToSpellSlots, getSpellSlotRow } from '../../data/spellSlots';
import { abilityModifier } from '../../lib/gameUtils';
import { calcMaxHP } from '../../data/levelProgression';
import StepSpecies from './StepSpecies';
import StepClass from './StepClass';
import StepBackground from './StepBackground';
import StepAbilityScores from './StepAbilityScores';
import StepSubclass from './StepSubclass';
import StepBuild, { emptyBuildChoices, type BuildChoices } from './StepBuild';
import StepReview from './StepReview';

const ORIGIN_FEAT_SPECIES = ['Human'];
const ABILITIES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const;
import { buildFeaturesText } from '../../lib/buildFeaturesText';

function Crumb({ label, done }: { label: string; done?: boolean }) {
  return (
    <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, padding: '2px 9px', borderRadius: 999,
      color: done ? 'var(--c-gold-l)' : 'var(--t-2)',
      background: done ? 'var(--c-gold-bg)' : 'var(--c-raised)',
      border: `1px solid ${done ? 'var(--c-gold-bdr)' : 'var(--c-border-m)'}` }}>
      {label}
    </span>
  );
}

function SummaryRow({ icon, label, value, empty, done }: {
  icon: string; label: string; value: string; empty?: boolean; done?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--c-border)' }}>
      <span style={{ fontSize: 12, opacity: empty ? 0.4 : 1 }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 'var(--fs-xs)', color: 'var(--t-3)', minWidth: 0 }}>{label}</span>
      <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 600, color: done ? 'var(--c-gold-l)' : empty ? 'var(--t-3)' : 'var(--t-2)', textAlign: 'right', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </span>
    </div>
  );
}

const DEFAULT_SCORES: Record<AbilityKey, number> = {
  strength: 10, dexterity: 10, constitution: 10,
  intelligence: 10, wisdom: 10, charisma: 10,
};

const STEPS = ['Species', 'Class', 'Background', 'Ability Scores', 'Build', 'Review'];

export default function CharacterCreator() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wizard state
  const [species, setSpecies] = useState('');
  const [className, setClassName] = useState('');
  const [background, setBackground] = useState('');
  const [scores, setScores] = useState<Record<AbilityKey, number>>(DEFAULT_SCORES);
  const [method, setMethod] = useState<AbilityScoreMethod>('standard_array');
  const [subclass, setSubclass] = useState('');
  const [name, setName] = useState('');
  const [alignment, setAlignment] = useState<Alignment>('True Neutral');
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [buildChoices, setBuildChoices] = useState<BuildChoices>(emptyBuildChoices());
  const [level, setLevel] = useState(1);
  const [currentBuildLevel, setCurrentBuildLevel] = useState(1);
  // Reset to level 1 each time the user enters the Build step
  const goToStep = (n: number) => {
    if (n === 4) setCurrentBuildLevel(1);
    setStep(n);
  };
  const [originFeat, setOriginFeat] = useState('');

  function handleSkillToggle(skill: string) {
    setSelectedSkills(prev =>
      prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]
    );
  }

  function handleLevelChange(newLevel: number) {
    setLevel(newLevel);
    // If level drops below 3, clear subclass (not yet unlocked)
    if (newLevel < 3) setSubclass('');
  }

  function canAdvance(): boolean {
    switch (step) {
      case 0: return species !== '' && name.trim() !== '' && (
        !ORIGIN_FEAT_SPECIES.includes(species) || originFeat !== ''
      );
      case 1: return className !== '';
      case 2: return background !== '';
      case 3: return ABILITIES.every(ab => scores[ab] >= 1);
      case 4: return true; // level nav always allowed; subclass gate handled in onClick
      case 5: return !!name.trim();
    }
    return true;
  }

    async function handleCreate() {
    if (!user) { setError('Not signed in.'); return; }
    setSaving(true);
    setError(null);

    const cls = CLASS_MAP[className];
    const bg = BACKGROUND_MAP[background];
    const sp = SPECIES_MAP[species];

    const finalScores = { ...scores };
    if (bg) {
      finalScores[bg.asi_primary] += 2;
      finalScores[bg.asi_secondary] += 1;
    }

    // HP using average per level
    const hp = cls
      ? calcMaxHP(cls.hit_die, finalScores.constitution, level)
      : 10;

    // Spell slots for chosen level
    const slotRow = cls ? getSpellSlotRow(cls.name, level) : [];
    const spellSlots = slotRowToSpellSlots(slotRow);

    const bgSkills = bg?.skill_proficiencies ?? [];
    const speciesAutoSkills = SPECIES_AUTO_SKILLS[species] ?? [];
    const allSkills = [...new Set([...bgSkills, ...selectedSkills, ...speciesAutoSkills])];

    const insert: Omit<Character, 'id' | 'created_at' | 'updated_at'> = {
      user_id: user.id,
      campaign_id: null,
      name: name.trim(),
      species,
      class_name: className,
      subclass: subclass || null,
      background,
      level,
      experience_points: 0,
      alignment,
      avatar_url: null,
      inspiration: false,
      equipped_armor: 'unarmored',
      weapons: [],
      share_token: null,
      share_enabled: false,
      wildshape_active: false,
      wildshape_beast_name: '',
      wildshape_current_hp: 0,
      wildshape_max_hp: 0,
      concentration_spell: '',
      class_resources: {
        ...(buildChoices.metamagic.length ? { metamagic: buildChoices.metamagic } : {}),
        ...(buildChoices.invocations.length ? { invocations: buildChoices.invocations } : {}),
      },
      secondary_class: '',
      secondary_level: 0,
      secondary_subclass: '',
      features_text: '',
      strength:     finalScores.strength,
      dexterity:    finalScores.dexterity,
      constitution: finalScores.constitution,
      intelligence: finalScores.intelligence,
      wisdom:       finalScores.wisdom,
      charisma:     finalScores.charisma,
      max_hp:    hp,
      current_hp: hp,
      temp_hp:    0,
      hit_dice_spent: 0,
      armor_class: 10 + abilityModifier(finalScores.dexterity),
      speed: sp?.speed ?? 30,
      initiative_bonus: 0,
      saving_throw_proficiencies: cls?.saving_throw_proficiencies ?? [],
      skill_proficiencies: allSkills,
      skill_expertises: [],
      spell_slots: spellSlots,
      prepared_spells: [],
      known_spells: [
        ...buildChoices.spells,
        ...buildChoices.cantrips,
        // Psion gets Mage Hand automatically (invisible, no components)
        ...(className === 'Psion' && !buildChoices.cantrips.includes('mage-hand') ? ['mage-hand'] : []),
      ],
      inventory: [],
      currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      active_conditions: [],
      death_saves_successes: 0,
      death_saves_failures: 0,
      notes: '',
      personality_traits: '',
      ideals: '',
      bonds: '',
      flaws: '',
      features_and_traits: buildFeaturesText(className, species, background, subclass || null)
        + (originFeat ? `\n\n[Origin Feat]\n${originFeat}` : '')
        + (buildChoices.fightingStyle ? `\n\n[Fighting Style]\n${buildChoices.fightingStyle}` : '')
        + (buildChoices.metamagic.length ? `\n\n[Metamagic]\n${buildChoices.metamagic.join(', ')}` : '')
        + (buildChoices.invocations.length ? `\n\n[Eldritch Invocations]\n${buildChoices.invocations.join(', ')}` : '')
        + (buildChoices.expertise.length ? `\n\n[Expertise]\n${buildChoices.expertise.join(', ')}` : '')
        + (buildChoices.divineOrder ? `\n\n[Divine Order]\n${buildChoices.divineOrder}` : '')
        + (buildChoices.primalOrder ? `\n\n[Primal Order]\n${buildChoices.primalOrder}` : '')
        + (Object.keys(buildChoices.feats).length ? `\n\n[Feats from ASI]\n${Object.entries(buildChoices.feats).map(([lvl, feat]) => `Level ${lvl}: ${feat}`).join('\n')}` : ''),
      gained_feats: [
        ...(originFeat ? [originFeat] : []),
        ...Object.values(buildChoices.feats as Record<string, string>).filter(Boolean),
      ],
      ability_score_improvements: [
        ...(bg ? [
          { ability: bg.asi_primary,   amount: 2, source: 'background' },
          { ability: bg.asi_secondary, amount: 1, source: 'background' },
        ] : []),
        ...Object.entries(buildChoices.asiChoices).map(([lvl, asiChoice]) => {
          const a = asiChoice as { ability: string; amount: number; ability2?: string; amount2?: number };
          return { ability: a.ability as import('../../types').AbilityKey, amount: a.amount, source: `level_${lvl}` };
        }),
      ],
      ability_score_method: method,
    };

    const { data, error: err } = await createCharacter(insert);
    setSaving(false);

    if (err) {
      const msg = err.message.includes('FREE_TIER_LIMIT')
        ? 'Free accounts are limited to 1 character. Upgrade to Pro for up to 6 characters.'
        : err.message.includes('PRO_TIER_LIMIT') ? 'You have reached 6 characters. Purchase additional slots (5 for $5) in Settings.'
        : err.message;
      setError(msg);
    } else if (data) {
      navigate(`/character/${data.id}`);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 'var(--sp-8)', borderBottom: '1px solid var(--c-border)' }}>
        {STEPS.map((label, i) => (
          <button
            key={label}
            onClick={() => i < step && goToStep(i)}
            style={{
              fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: 'var(--sp-3) var(--sp-4)', border: 'none',
              borderBottom: i === step ? '2px solid var(--c-gold)' : '2px solid transparent',
              background: 'transparent',
              color: i === step ? 'var(--c-gold-l)' : i < step ? 'var(--t-2)' : 'var(--t-2)',
              cursor: i < step ? 'pointer' : 'default',
              marginBottom: -1,
              display: 'flex', alignItems: 'center', gap: 'var(--sp-2)',
            }}
          >
            <span style={{
              width: 20, height: 20, borderRadius: '50%',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px',
              background: i < step ? 'var(--c-gold)' : i === step ? 'rgba(201,146,42,0.2)' : 'var(--c-raised)',
              color: i < step ? 'var(--c-bg)' : i === step ? 'var(--c-gold-l)' : 'var(--t-2)',
              flexShrink: 0,
            }}>
              {i < step ? '✓' : i + 1}
            </span>
            {label}
            {/* Show level on Subclass tab when level < 3 */}
            
          </button>
        ))}
      </div>

      {/* Navigation — top, consistent across all steps */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--sp-6)', alignItems: 'center' }}>
          <button className="btn-secondary btn-sm" onClick={() => {
            if (step === 4 && currentBuildLevel > 1) setCurrentBuildLevel(l => l - 1);
            else if (step > 0) goToStep(step - 1);
            else navigate('/lobby');
          }} disabled={saving}>
            {step === 0 ? '✕ Cancel' : '← Back'}
          </button>
          <button
            className="btn-gold"
            style={{ minWidth: 120 }}
            onClick={() => {
              if (step === 4 && currentBuildLevel < level) {
                setCurrentBuildLevel(l => l + 1);
              } else if (step === 4 && (level < 3 || buildChoices.subclass !== '')) {
                goToStep(step + 1);
              } else if (step === 4) {
                // subclass required before review
              } else if (step < STEPS.length - 1) {
                goToStep(step + 1);
              } else {
                handleCreate();
              }
            }}
            disabled={!canAdvance() || saving}
          >
            {saving ? 'Creating...' : (
              step === STEPS.length - 1 ? '✨ Create Character' :
              step === 4 && currentBuildLevel < level ? `Level ${currentBuildLevel + 1} →` :
              step === 4 ? 'Review →' :
              step === STEPS.length - 2 ? 'Review →' :
              'Continue →'
            )}
          </button>
        </div>

      {/* Layout: step content + sticky summary sidebar */}
      <div className="creator-two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 'var(--sp-6)', alignItems: 'start' }}>
      <div key={step} className="animate-fade-in" style={{ minHeight: 400 }}>
        {/* Breadcrumb — what you've chosen so far */}
        {(name || species || className || background) && step > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 'var(--sp-4)', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Your build:</span>
            {name && <Crumb label={name} />}
            {level > 1 && <Crumb label={`Level ${level}`} />}
            {species && <Crumb label={species} done />}
            {className && <Crumb label={className} done />}
            {background && <Crumb label={background} done />}
            {(buildChoices.subclass || subclass) && <Crumb label={buildChoices.subclass || subclass} done />}
          </div>
        )}
        {step === 0 && <StepSpecies selected={species} originFeat={originFeat} name={name} level={level} onNameChange={setName} onLevelChange={handleLevelChange} onSelect={s => { setSpecies(s); setOriginFeat(''); }} onOriginFeatSelect={setOriginFeat} />}
        {step === 1 && <StepClass selected={className} level={level} selectedSkills={selectedSkills} onSelect={c => { setClassName(c); setSubclass(''); setSelectedSkills([]); }} onLevelChange={handleLevelChange} onSkillToggle={handleSkillToggle} />}
        {step === 2 && <StepBackground selected={background} onSelect={setBackground} />}
        {step === 3 && <StepAbilityScores scores={scores} method={method} backgroundName={background} className={className} level={level} onScoresChange={setScores} onMethodChange={setMethod} />}
        {step === 4 && (
          <StepBuild
            className={className}
            level={level}
            choices={buildChoices}
            onChoicesChange={c => {
              setBuildChoices(c);
              if (c.subclass) setSubclass(c.subclass);
            }}
            currentLevel={currentBuildLevel}
            onCurrentLevelChange={setCurrentBuildLevel}
          />
        )}
        {step === 5 && (
          <StepReview
            name={name}
            species={species}
            className={className}
            subclass={subclass}
            background={background}
            level={level}
            scores={scores}
            method={method}
            selectedSkills={selectedSkills}
            buildChoices={buildChoices}
            originFeat={originFeat}
            alignment={alignment}
            onAlignmentChange={setAlignment}
          />
        )}

      </div>

      {/* Sticky character summary */}
      <div className="creator-summary" style={{ position: 'sticky', top: 20, display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
        <div style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--t-3)' }}>
          Character Summary
        </div>
        {/* Name */}
        <SummaryRow icon="✍️" label="Name" value={name || '—'} empty={!name} />
        <SummaryRow icon="⚡" label="Level" value={String(level)} />
        {/* Species */}
        <SummaryRow icon="🧬" label="Species" value={species || '—'} empty={!species} done={!!species} />
        {/* Class */}
        <SummaryRow icon="⚔️" label="Class" value={className || '—'} empty={!className} done={!!className} />
        {/* Background */}
        <SummaryRow icon="🎒" label="Background" value={background || '—'} empty={!background} done={!!background} />
        {/* Subclass */}
        {level >= 3 && (
          <SummaryRow icon="✦" label="Subclass" value={buildChoices.subclass || subclass || '—'} empty={!buildChoices.subclass && !subclass} done={!!(buildChoices.subclass || subclass)} />
        )}

        {/* Live HP preview */}
        {className && (() => {
          const cls = CLASS_MAP[className];
          if (!cls) return null;
          const bg = BACKGROUND_MAP[background];
          const finalScores = { ...scores };
          if (bg) { finalScores[bg.asi_primary as keyof typeof finalScores] += 2; finalScores[bg.asi_secondary as keyof typeof finalScores] += 1; }
          const hp = calcMaxHP(cls.hit_die, finalScores.constitution, level);
          const profBonus = level < 5 ? 2 : level < 9 ? 3 : level < 13 ? 4 : level < 17 ? 5 : 6;
          return (
            <div style={{ marginTop: 'var(--sp-2)', padding: 'var(--sp-3)', background: 'var(--c-card)', border: '1px solid var(--c-border)', borderRadius: 'var(--r-lg)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-3)', marginBottom: 2 }}>Preview</div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>Hit Points</span>
                <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--c-green-l)' }}>{hp}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>Prof. Bonus</span>
                <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--c-gold-l)' }}>+{profBonus}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)' }}>Hit Die</span>
                <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 700, color: 'var(--t-1)' }}>d{cls.hit_die}</span>
              </div>
            </div>
          );
        })()}
      </div>

      </div>

      {/* Error */}
      {error && (
        <div style={{ marginTop: 'var(--sp-4)', background: 'rgba(155,28,28,0.15)', border: '1px solid rgba(107,20,20,1)', borderRadius: 'var(--r-md)', padding: 'var(--sp-3)', fontSize: 'var(--fs-sm)', color: '#fca5a5', fontFamily: 'var(--ff-body)' }}>
          {error}
        </div>
      )}


    </div>
  );
}
