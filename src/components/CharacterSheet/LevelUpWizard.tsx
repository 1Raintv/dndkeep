import { useState } from 'react';
import type { Character } from '../../types';
import { CLASSES } from '../../data/classes';
import { FEATS } from '../../data/feats';
import { xpForNextLevel, abilityModifier } from '../../lib/gameUtils';

interface LevelUpWizardProps {
  character: Character;
  onLevelUp: (updates: Partial<Character>) => void;
  onClose: () => void;
}

const ABILITY_NAMES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const;
type AbilityKey = typeof ABILITY_NAMES[number];

const ASI_LEVELS = new Set([4, 8, 12, 16, 19]);

export default function LevelUpWizard({ character, onLevelUp, onClose }: LevelUpWizardProps) {
  const newLevel = character.level + 1;
  const classData = CLASSES.find(c => c.name === character.class_name);
  const needsSubclass = newLevel === 3 && !character.subclass;
  const needsASI = ASI_LEVELS.has(newLevel);

  const [step, setStep] = useState<'overview' | 'subclass' | 'asi' | 'confirm'>('overview');
  const [selectedSubclass, setSelectedSubclass] = useState(character.subclass ?? '');
  const [asiChoice, setAsiChoice] = useState<'asi' | 'feat'>('asi');
  const [abiBoosts, setAbiBoosts] = useState<Partial<Record<AbilityKey, number>>>({});
  const [selectedFeat, setSelectedFeat] = useState('');
  const [featSearch, setFeatSearch] = useState('');

  const totalBoosts = (Object.values(abiBoosts) as number[]).reduce((a, b) => a + (b ?? 0), 0);
  const availableFeats = FEATS.filter(f =>
    (f.category === 'general' || f.category === 'fighting-style') &&
    f.name.toLowerCase().includes(featSearch.toLowerCase())
  );

  // Compute what new HP they get
  const classHD = classData?.hit_die ?? 8;
  const avgHPGain = Math.floor(classHD / 2) + 1 + abilityModifier(character.constitution);
  const newMaxHP = character.max_hp + avgHPGain;

  function computeNewProfBonus(level: number) {
    return Math.ceil(level / 4) + 1;
  }
  const newProfBonus = computeNewProfBonus(newLevel);
  const oldProfBonus = computeNewProfBonus(character.level);
  const profBonusIncreased = newProfBonus > oldProfBonus;

  function buildUpdates(): Partial<Character> {
    const updates: Partial<Character> = {
      level: newLevel,
      max_hp: newMaxHP,
      current_hp: character.current_hp + avgHPGain,
    };
    if (selectedSubclass && needsSubclass) updates.subclass = selectedSubclass;
    if (needsASI && asiChoice === 'asi') {
      for (const [key, val] of Object.entries(abiBoosts)) {
        const numVal = val as number;
        if (numVal) updates[key as AbilityKey] = (character[key as AbilityKey] as number) + numVal;
      }
    }
    return updates;
  }

  function handleConfirm() {
    onLevelUp(buildUpdates());
    onClose();
  }

  // Steps flow
  const steps: ('overview' | 'subclass' | 'asi' | 'confirm')[] = ['overview'];
  if (needsSubclass) steps.push('subclass');
  if (needsASI) steps.push('asi');
  steps.push('confirm');

  const currentIdx = steps.indexOf(step);
  const canNext = step === 'overview' ||
    (step === 'subclass' && selectedSubclass) ||
    (step === 'asi' && (asiChoice === 'feat' ? selectedFeat : totalBoosts === 2)) ||
    step === 'confirm';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--sp-4)',
    }}>
      <div style={{
        background: 'var(--c-card)', border: '1px solid var(--c-gold-bdr)',
        borderRadius: 'var(--r-xl)', boxShadow: 'var(--shadow-gold)',
        width: '100%', maxWidth: 560, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: 'var(--sp-5) var(--sp-6)',
          borderBottom: '1px solid var(--c-border)',
          background: 'linear-gradient(135deg, var(--c-surface), var(--c-card))',
        }}>
          <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 900, fontSize: 'var(--fs-xl)', color: 'var(--c-gold-l)' }}>
            ✨ Level Up!
          </div>
          <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: 'var(--t-2)', marginTop: 2 }}>
            {character.name} is now {character.class_name} level {newLevel}
          </div>
          {/* Step dots */}
          <div style={{ display: 'flex', gap: 6, marginTop: 'var(--sp-3)' }}>
            {steps.map((s, i) => (
              <div key={s} style={{
                width: 8, height: 8, borderRadius: '50%',
                background: i <= currentIdx ? 'var(--c-gold)' : 'var(--c-border-m)',
              }} />
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--sp-5) var(--sp-6)' }}>
          {step === 'overview' && (
            <OverviewStep
              newLevel={newLevel}
              character={character}
              classData={classData}
              avgHPGain={avgHPGain}
              newMaxHP={newMaxHP}
              profBonusIncreased={profBonusIncreased}
              newProfBonus={newProfBonus}
              needsSubclass={needsSubclass}
              needsASI={needsASI}
            />
          )}

          {step === 'subclass' && classData && (
            <SubclassStep
              classData={classData}
              selected={selectedSubclass}
              onSelect={setSelectedSubclass}
            />
          )}

          {step === 'asi' && (
            <ASIStep
              character={character}
              asiChoice={asiChoice}
              onSetChoice={setAsiChoice}
              abiBoosts={abiBoosts}
              onSetBoosts={setAbiBoosts}
              totalBoosts={totalBoosts}
              selectedFeat={selectedFeat}
              onSetFeat={setSelectedFeat}
              featSearch={featSearch}
              onSetFeatSearch={setFeatSearch}
              availableFeats={availableFeats}
            />
          )}

          {step === 'confirm' && (
            <ConfirmStep
              character={character}
              newLevel={newLevel}
              avgHPGain={avgHPGain}
              newMaxHP={newMaxHP}
              selectedSubclass={needsSubclass ? selectedSubclass : undefined}
              abiBoosts={needsASI && asiChoice === 'asi' ? abiBoosts : undefined}
              selectedFeat={needsASI && asiChoice === 'feat' ? selectedFeat : undefined}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: 'var(--sp-4) var(--sp-6)',
          borderTop: '1px solid var(--c-border)',
          display: 'flex', justifyContent: 'space-between', gap: 'var(--sp-3)',
        }}>
          <button className="btn-ghost btn-sm" onClick={() => {
            if (currentIdx === 0) { onClose(); }
            else { setStep(steps[currentIdx - 1]); }
          }}>
            {currentIdx === 0 ? '✕ Cancel' : '← Back'}
          </button>

          {step === 'confirm' ? (
            <button className="btn-gold" onClick={handleConfirm} style={{ fontWeight: 700 }}>
              ✨ Confirm Level Up
            </button>
          ) : (
            <button
              className="btn-primary btn-sm"
              onClick={() => setStep(steps[currentIdx + 1])}
              disabled={!canNext}
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step components ─────────────────────────────────────────────────

function OverviewStep({ newLevel, character, classData, avgHPGain, newMaxHP, profBonusIncreased, newProfBonus, needsSubclass, needsASI }: any) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--sp-3)' }}>
        <Gain icon="❤️" label="Max HP" before={character.max_hp} after={newMaxHP} color="var(--hp-full)" />
        <Gain icon="📖" label="Level" before={character.level} after={newLevel} color="var(--c-gold-l)" />
        {profBonusIncreased && <Gain icon="✦" label="Proficiency Bonus" before={newProfBonus - 1} after={newProfBonus} color="#a78bfa" />}
      </div>

      {/* What you get at this level */}
      <div>
        <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--t-2)', marginBottom: 'var(--sp-2)' }}>
          Features gained at level {newLevel}:
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Feature text={`+${avgHPGain} HP (average d${classData?.hit_die ?? 8}/2+1 + Con)`} icon="❤️" />
          {needsSubclass && <Feature text="Choose your subclass" icon="⭐" highlight />}
          {needsASI && <Feature text="Ability Score Improvement or Feat" icon="📈" highlight />}
          {newLevel === 5 && <Feature text="Extra Attack (most martial classes)" icon="⚔️" />}
          {newLevel === 5 && character.class_name === 'Rogue' && <Feature text="Uncanny Dodge" icon="🏃" />}
          {newLevel === 5 && character.class_name === 'Monk' && <Feature text="Stunning Strike" icon="👊" />}
          {newLevel === 20 && <Feature text="Capstone feature — check your class!" icon="🌟" highlight />}
        </div>
      </div>

      <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', fontStyle: 'italic' }}>
        HP gain uses average formula. You can edit your max HP manually in Character Settings.
      </div>
    </div>
  );
}

function SubclassStep({ classData, selected, onSelect }: any) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
      <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-md)', color: 'var(--t-1)' }}>
        Choose your {classData.name} subclass
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
        {classData.subclasses.map((sub: any) => (
          <button
            key={sub.name}
            onClick={() => onSelect(sub.name)}
            style={{
              textAlign: 'left', padding: 'var(--sp-3) var(--sp-4)',
              border: selected === sub.name ? '2px solid var(--c-gold)' : '1px solid var(--c-border)',
              borderRadius: 'var(--r-lg)',
              background: selected === sub.name ? 'rgba(212,160,23,0.08)' : '#080d14',
              cursor: 'pointer', transition: 'all var(--tr-fast)',
            }}
          >
            <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: selected === sub.name ? 'var(--c-gold-l)' : 'var(--t-1)', marginBottom: 3 }}>
              {selected === sub.name ? '✓ ' : ''}{sub.name}
            </div>
            <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', lineHeight: 1.5 }}>
              {sub.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ASIStep({ character, asiChoice, onSetChoice, abiBoosts, onSetBoosts, totalBoosts, selectedFeat, onSetFeat, featSearch, onSetFeatSearch, availableFeats }: any) {
  const [expandedFeat, setExpandedFeat] = useState<string | null>(null);
  const [asiMode, setAsiMode] = useState<'+2' | '+1+1'>('+2');

  // When ASI mode changes, reset boosts
  function handleAsiMode(mode: '+2' | '+1+1') {
    setAsiMode(mode);
    onSetBoosts({});
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      <div style={{ fontWeight: 700, fontSize: 'var(--fs-md)', color: 'var(--t-1)' }}>
        Ability Score Improvement or Feat
      </div>

      {/* Top-level choice: ASI or Feat */}
      <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
        {(['asi', 'feat'] as const).map(choice => (
          <button
            key={choice}
            onClick={() => onSetChoice(choice)}
            style={{
              flex: 1, padding: 'var(--sp-3)', cursor: 'pointer',
              border: asiChoice === choice ? '2px solid var(--c-gold)' : '1px solid var(--c-border)',
              borderRadius: 'var(--r-lg)',
              background: asiChoice === choice ? 'rgba(212,160,23,0.08)' : 'var(--c-card)',
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm)', color: asiChoice === choice ? 'var(--c-gold-l)' : 'var(--t-1)' }}>
              {choice === 'asi' ? '+2 Ability Score' : 'Take a Feat'}
            </div>
            <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginTop: 2 }}>
              {choice === 'asi' ? 'Boost one or two ability scores' : 'Choose a special feature or power'}
            </div>
          </button>
        ))}
      </div>

      {/* ASI path */}
      {asiChoice === 'asi' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' }}>
          {/* Sub-choice: +2 one stat or +1 two stats */}
          <div style={{ display: 'flex', gap: 8 }}>
            {(['+2', '+1+1'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => handleAsiMode(mode)}
                style={{
                  flex: 1, padding: '8px 12px', cursor: 'pointer', borderRadius: 8,
                  border: asiMode === mode ? '2px solid var(--c-gold)' : '1px solid var(--c-border)',
                  background: asiMode === mode ? 'rgba(212,160,23,0.08)' : 'var(--c-raised)',
                  fontSize: 13, fontWeight: 600,
                  color: asiMode === mode ? 'var(--c-gold-l)' : 'var(--t-2)',
                }}
              >
                {mode === '+2' ? '+2 to one ability' : '+1 to two abilities'}
              </button>
            ))}
          </div>

          {/* Points counter */}
          <div style={{ fontSize: 'var(--fs-xs)', color: totalBoosts === 2 ? 'var(--hp-full)' : 'var(--t-2)', fontWeight: 600 }}>
            {totalBoosts === 2
              ? '✓ Points fully allocated'
              : `${2 - totalBoosts} point${2 - totalBoosts !== 1 ? 's' : ''} remaining`
            }
          </div>

          {/* Ability rows */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {ABILITY_NAMES.map(ab => {
              const current = character[ab] as number;
              const boost = abiBoosts[ab] ?? 0;
              const atCap = current + boost >= 20;
              const maxBoost = asiMode === '+2' ? 2 : 1;
              const canAdd = totalBoosts < 2 && !atCap && boost < maxBoost;
              return (
                <div key={ab} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', background: boost > 0 ? 'rgba(212,160,23,0.06)' : 'var(--c-card)',
                  borderRadius: 8, border: boost > 0 ? '1px solid var(--c-gold-bdr)' : '1px solid var(--c-border)',
                  transition: 'all var(--tr-fast)',
                }}>
                  <span style={{ fontWeight: 700, fontSize: 12, color: 'var(--t-2)', flex: 1, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {ab.slice(0,3)}
                  </span>
                  <span style={{ fontFamily: 'var(--ff-stat)', fontWeight: 700, color: 'var(--t-2)', fontSize: 14, minWidth: 20, textAlign: 'center' }}>
                    {current}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button
                      onClick={() => { if (boost <= 0) return; onSetBoosts((p: any) => ({ ...p, [ab]: boost - 1 })); }}
                      disabled={boost <= 0}
                      style={{ width: 20, height: 20, borderRadius: '50%', border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', cursor: boost > 0 ? 'pointer' : 'not-allowed', minHeight: 0, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: boost <= 0 ? 0.3 : 1 }}
                    >−</button>
                    <span style={{ fontFamily: 'var(--ff-stat)', fontWeight: 800, color: boost > 0 ? 'var(--c-gold-l)' : 'var(--t-3)', minWidth: 20, textAlign: 'center', fontSize: 13 }}>
                      {boost > 0 ? `+${boost}` : '0'}
                    </span>
                    <button
                      onClick={() => { if (!canAdd) return; onSetBoosts((p: any) => ({ ...p, [ab]: boost + 1 })); }}
                      disabled={!canAdd}
                      style={{ width: 20, height: 20, borderRadius: '50%', border: '1px solid var(--c-border-m)', background: 'var(--c-raised)', cursor: canAdd ? 'pointer' : 'not-allowed', minHeight: 0, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: !canAdd ? 0.3 : 1 }}
                    >+</button>
                  </div>
                  {boost > 0 && (
                    <span style={{ fontFamily: 'var(--ff-stat)', fontWeight: 700, color: 'var(--c-gold-l)', fontSize: 13 }}>
                      → {current + boost}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Feat path */}
      {asiChoice === 'feat' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
          <input
            value={featSearch}
            onChange={e => onSetFeatSearch(e.target.value)}
            placeholder="Search feats by name or benefit…"
            style={{ fontSize: 'var(--fs-sm)' }}
            autoFocus
          />
          <div style={{ fontSize: 10, color: 'var(--t-3)', letterSpacing: '0.04em' }}>
            {availableFeats.length} feats available · click to expand · click name to select
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 340, overflowY: 'auto' }}>
            {availableFeats.map((feat: any) => {
              const isSelected = selectedFeat === feat.name;
              const isExpanded = expandedFeat === feat.name;
              return (
                <div
                  key={feat.name}
                  style={{
                    borderRadius: 8,
                    border: isSelected ? '2px solid var(--c-gold)' : isExpanded ? '1px solid var(--c-border-m)' : '1px solid var(--c-border)',
                    background: isSelected ? 'rgba(212,160,23,0.08)' : 'var(--c-card)',
                    overflow: 'hidden',
                    transition: 'all var(--tr-fast)',
                  }}
                >
                  {/* Header row — click to expand/collapse */}
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer' }}
                    onClick={() => setExpandedFeat(isExpanded ? null : feat.name)}
                  >
                    {/* Select button */}
                    <button
                      onClick={e => { e.stopPropagation(); onSetFeat(feat.name); }}
                      style={{
                        width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                        border: `2px solid ${isSelected ? 'var(--c-gold)' : 'var(--c-border-m)'}`,
                        background: isSelected ? 'var(--c-gold)' : 'transparent',
                        cursor: 'pointer', minHeight: 0, padding: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: isSelected ? 'var(--c-gold-l)' : 'var(--t-1)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {feat.name}
                        {feat.category === 'origin' && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: '#60a5fa', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.25)', padding: '1px 5px', borderRadius: 999 }}>Origin</span>
                        )}
                        {feat.prerequisite && (
                          <span style={{ fontSize: 9, color: 'var(--t-3)' }}>Req: {feat.prerequisite}</span>
                        )}
                      </div>
                      {!isExpanded && (
                        <div style={{ fontSize: 11, color: 'var(--t-3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {feat.description}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--t-3)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform var(--tr-fast)', flexShrink: 0 }}>▼</span>
                  </div>

                  {/* Expanded description + benefits */}
                  {isExpanded && (
                    <div style={{ padding: '0 12px 12px', borderTop: '1px solid var(--c-border)', marginTop: 0 }}>
                      <p style={{ fontSize: 12, color: 'var(--t-2)', lineHeight: 1.6, margin: '8px 0 6px' }}>
                        {feat.description}
                      </p>
                      {feat.benefits && feat.benefits.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {feat.benefits.map((b: string, i: number) => (
                            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                              <span style={{ color: 'var(--c-gold-l)', fontSize: 11, flexShrink: 0, marginTop: 1 }}>•</span>
                              <span style={{ fontSize: 11, color: 'var(--t-2)', lineHeight: 1.5 }}>{b}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <button
                        onClick={() => onSetFeat(feat.name)}
                        style={{
                          marginTop: 10, fontSize: 11, fontWeight: 700, padding: '5px 14px',
                          borderRadius: 6, cursor: 'pointer', minHeight: 0,
                          border: isSelected ? '1px solid var(--c-gold)' : '1px solid var(--c-border-m)',
                          background: isSelected ? 'var(--c-gold-bg)' : 'var(--c-raised)',
                          color: isSelected ? 'var(--c-gold-l)' : 'var(--t-1)',
                        }}
                      >
                        {isSelected ? '✓ Selected' : 'Select this feat'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {availableFeats.length === 0 && (
              <div style={{ textAlign: 'center', padding: 'var(--sp-4)', color: 'var(--t-3)', fontSize: 13 }}>
                No feats match your search.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ConfirmStep({ character, newLevel, avgHPGain, newMaxHP, selectedSubclass, abiBoosts, selectedFeat }: any) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
      <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-md)', color: 'var(--c-gold-l)', textAlign: 'center' }}>
        Ready to Level Up?
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
        <ConfirmLine icon="📖" label="New Level" value={`${character.class_name} ${newLevel}`} />
        <ConfirmLine icon="❤️" label="Max HP" value={`${character.max_hp} → ${newMaxHP} (+${avgHPGain})`} />
        {selectedSubclass && <ConfirmLine icon="⭐" label="Subclass" value={selectedSubclass} highlight />}
        {abiBoosts && Object.entries(abiBoosts).filter(([,v]) => v).map(([k, v]) => (
          <ConfirmLine key={k} icon="📈" label={k.slice(0,3).toUpperCase()} value={`${character[k]} → ${(character[k] as number) + (v as number)} (+${v})`} highlight />
        ))}
        {selectedFeat && <ConfirmLine icon="⭐" label="Feat Gained" value={selectedFeat} highlight />}
      </div>
      <div style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', fontStyle: 'italic', textAlign: 'center' }}>
        This will update your character immediately. You can always adjust stats in Character Settings.
      </div>
    </div>
  );
}

function Gain({ icon, label, before, after, color }: any) {
  return (
    <div style={{ padding: 'var(--sp-3)', background: '#080d14', borderRadius: 'var(--r-lg)', border: `1px solid ${color}20` }}>
      <div style={{ fontFamily: 'var(--ff-body)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--t-2)' }}>{icon} {label}</div>
      <div style={{ fontFamily: 'var(--ff-body)', fontWeight: 900, fontSize: 'var(--fs-lg)', color, marginTop: 2 }}>
        {before} → {after}
      </div>
    </div>
  );
}

function Feature({ text, icon, highlight }: { text: string; icon: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px', background: highlight ? 'rgba(212,160,23,0.08)' : '#080d14', borderRadius: 'var(--r-md)', border: highlight ? '1px solid rgba(212,160,23,0.2)' : '1px solid var(--c-border)' }}>
      <span>{icon}</span>
      <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: highlight ? 'var(--c-gold-l)' : 'var(--t-2)', fontWeight: highlight ? 600 : 400 }}>{text}</span>
    </div>
  );
}

function ConfirmLine({ icon, label, value, highlight }: { icon: string; label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-2) var(--sp-3)', background: highlight ? 'rgba(212,160,23,0.06)' : '#080d14', borderRadius: 'var(--r-md)', border: highlight ? '1px solid rgba(212,160,23,0.2)' : '1px solid var(--c-border)' }}>
      <span>{icon}</span>
      <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', fontWeight: 600, color: 'var(--t-2)', textTransform: 'uppercase', letterSpacing: '0.1em', minWidth: 80 }}>{label}</span>
      <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-sm)', color: highlight ? 'var(--c-gold-l)' : 'var(--t-2)', fontWeight: highlight ? 600 : 400 }}>{value}</span>
    </div>
  );
}
