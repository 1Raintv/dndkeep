import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { AbilityKey, Alignment, AbilityScoreMethod, Character } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { createCharacter } from '../../lib/supabase';
import { CLASS_MAP } from '../../data/classes';
import { BACKGROUND_MAP } from '../../data/backgrounds';
import { SPECIES_MAP } from '../../data/species';
import { slotRowToSpellSlots, getSpellSlotRow } from '../../data/spellSlots';
import { abilityModifier } from '../../lib/gameUtils';
import { calcMaxHP } from '../../data/levelProgression';
import StepSpecies from './StepSpecies';
import StepClass from './StepClass';
import StepBackground from './StepBackground';
import StepAbilityScores from './StepAbilityScores';
import StepSubclass from './StepSubclass';
import StepReview from './StepReview';
import { buildFeaturesText } from '../../lib/buildFeaturesText';

const DEFAULT_SCORES: Record<AbilityKey, number> = {
  strength: 10, dexterity: 10, constitution: 10,
  intelligence: 10, wisdom: 10, charisma: 10,
};

const STEPS = ['Species', 'Class', 'Background', 'Ability Scores', 'Subclass', 'Review'];

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
  const [level, setLevel] = useState(1);
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
    if (step === 0) {
      if (!species) return false;
      // Human requires an origin feat selection
      if (species === 'Human' && !originFeat) return false;
      return true;
    }
    if (step === 1) return !!className;
    if (step === 2) return !!background;
    if (step === 3) return true;
    if (step === 4) {
      // Subclass unlocks at level 3 (2024 PHB — all classes)
      if (level < 3) return true; // skip subclass, not yet unlocked
      const cls = CLASS_MAP[className];
      const availableSubs = cls?.subclasses.filter(s => s.unlock_level <= level) ?? [];
      return availableSubs.length === 0 || !!subclass;
    }
    if (step === 5) {
      const cls = CLASS_MAP[className];
      return !!name.trim() && selectedSkills.length === (cls?.skill_count ?? 2);
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
    const allSkills = [...bgSkills, ...selectedSkills];

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
      class_resources: {},
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
      known_spells: [],
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
      features_and_traits: buildFeaturesText(className, species, background, subclass || null) + (originFeat ? `\n\n[Origin Feat]\n${originFeat}` : ''),
      ability_score_improvements: bg ? [
        { ability: bg.asi_primary,   amount: 2, source: 'background' },
        { ability: bg.asi_secondary, amount: 1, source: 'background' },
      ] : [],
      ability_score_method: method,
    };

    const { data, error: err } = await createCharacter(insert);
    setSaving(false);

    if (err) {
      const msg = err.message.includes('FREE_TIER_LIMIT')
        ? 'Free accounts are limited to 1 character. Upgrade to Pro for unlimited characters.'
        : err.message;
      setError(msg);
    } else if (data) {
      navigate(`/character/${data.id}`);
    }
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      {/* Step indicator */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 'var(--space-8)', borderBottom: '1px solid var(--border-subtle)' }}>
        {STEPS.map((label, i) => (
          <button
            key={label}
            onClick={() => i < step && setStep(i)}
            style={{
              fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xs)', fontWeight: 700,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              padding: 'var(--space-3) var(--space-4)', border: 'none',
              borderBottom: i === step ? '2px solid var(--color-gold)' : '2px solid transparent',
              background: 'transparent',
              color: i === step ? 'var(--text-gold)' : i < step ? 'var(--text-secondary)' : 'var(--text-muted)',
              cursor: i < step ? 'pointer' : 'default',
              marginBottom: -1,
              display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            }}
          >
            <span style={{
              width: 20, height: 20, borderRadius: '50%',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px',
              background: i < step ? 'var(--color-gold)' : i === step ? 'rgba(201,146,42,0.2)' : 'var(--bg-raised)',
              color: i < step ? 'var(--color-void)' : i === step ? 'var(--text-gold)' : 'var(--text-muted)',
              flexShrink: 0,
            }}>
              {i < step ? '✓' : i + 1}
            </span>
            {label}
            {/* Show level on Subclass tab when level < 3 */}
            {i === 4 && level < 3 && (
              <span style={{ fontSize: 9, color: 'var(--text-muted)', background: 'var(--bg-sunken)', padding: '1px 4px', borderRadius: 3 }}>
                lvl {level}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Navigation — top */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-6)', alignItems: 'center' }}>
        <button className="btn-secondary btn-sm" onClick={() => step > 0 ? setStep(s => s - 1) : navigate('/lobby')} disabled={saving}>
          {step === 0 ? '✕ Cancel' : '← Back'}
        </button>
        <button
          className={step === STEPS.length - 1 ? 'btn-gold' : 'btn-gold'}
          style={{ minWidth: 120 }}
          onClick={() => step < STEPS.length - 1 ? setStep(s => s + 1) : handleCreate()}
          disabled={!canAdvance() || saving}
        >
          {saving ? 'Creating...' : step === STEPS.length - 1 ? '✨ Create Character' : 'Continue →'}
        </button>
      </div>

      {/* Step content */}
      <div key={step} className="animate-fade-in" style={{ minHeight: 400 }}>
        {step === 0 && <StepSpecies selected={species} originFeat={originFeat} onSelect={s => { setSpecies(s); setOriginFeat(''); }} onOriginFeatSelect={setOriginFeat} />}
        {step === 1 && <StepClass selected={className} level={level} onSelect={c => { setClassName(c); setSubclass(''); }} onLevelChange={handleLevelChange} />}
        {step === 2 && <StepBackground selected={background} onSelect={setBackground} />}
        {step === 3 && <StepAbilityScores scores={scores} method={method} backgroundName={background} className={className} onScoresChange={setScores} onMethodChange={setMethod} />}
        {step === 4 && (
          <StepSubclass
            className={className}
            selected={subclass}
            onSelect={setSubclass}
            level={level}
          />
        )}
        {step === 5 && (
          <StepReview
            name={name} alignment={alignment} species={species} className={className}
            subclass={subclass} background={background} scores={scores} method={method}
            selectedSkills={selectedSkills} level={level}
            onNameChange={setName} onAlignmentChange={setAlignment}
            onSkillToggle={handleSkillToggle}
          />
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ marginTop: 'var(--space-4)', background: 'rgba(155,28,28,0.15)', border: '1px solid var(--color-blood)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', fontSize: 'var(--text-sm)', color: '#fca5a5', fontFamily: 'var(--font-heading)' }}>
          {error}
        </div>
      )}


    </div>
  );
}
