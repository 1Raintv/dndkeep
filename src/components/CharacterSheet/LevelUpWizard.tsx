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
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-4)',
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-gold)',
        borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-gold)',
        width: '100%', maxWidth: 560, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: 'var(--space-5) var(--space-6)',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'linear-gradient(135deg, var(--color-charcoal), var(--color-shadow))',
        }}>
          <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 'var(--text-xl)', color: 'var(--color-gold-bright)' }}>
            ✨ Level Up!
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 2 }}>
            {character.name} is now {character.class_name} level {newLevel}
          </div>
          {/* Step dots */}
          <div style={{ display: 'flex', gap: 6, marginTop: 'var(--space-3)' }}>
            {steps.map((s, i) => (
              <div key={s} style={{
                width: 8, height: 8, borderRadius: '50%',
                background: i <= currentIdx ? 'var(--color-gold)' : 'var(--border-dim)',
              }} />
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-5) var(--space-6)' }}>
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
          padding: 'var(--space-4) var(--space-6)',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)',
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
        <Gain icon="❤️" label="Max HP" before={character.max_hp} after={newMaxHP} color="var(--hp-full)" />
        <Gain icon="📖" label="Level" before={character.level} after={newLevel} color="var(--color-gold-bright)" />
        {profBonusIncreased && <Gain icon="✦" label="Proficiency Bonus" before={newProfBonus - 1} after={newProfBonus} color="#a78bfa" />}
      </div>

      {/* What you get at this level */}
      <div>
        <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-2)' }}>
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

      <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
        HP gain uses average formula. You can edit your max HP manually in Character Settings.
      </div>
    </div>
  );
}

function SubclassStep({ classData, selected, onSelect }: any) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--text-primary)' }}>
        Choose your {classData.name} subclass
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        {classData.subclasses.map((sub: any) => (
          <button
            key={sub.name}
            onClick={() => onSelect(sub.name)}
            style={{
              textAlign: 'left', padding: 'var(--space-3) var(--space-4)',
              border: selected === sub.name ? '2px solid var(--color-gold)' : '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              background: selected === sub.name ? 'rgba(212,160,23,0.08)' : 'var(--bg-sunken)',
              cursor: 'pointer', transition: 'all var(--transition-fast)',
            }}
          >
            <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)', color: selected === sub.name ? 'var(--color-gold-bright)' : 'var(--text-primary)', marginBottom: 3 }}>
              {selected === sub.name ? '✓ ' : ''}{sub.name}
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              {sub.description}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ASIStep({ character, asiChoice, onSetChoice, abiBoosts, onSetBoosts, totalBoosts, selectedFeat, onSetFeat, featSearch, onSetFeatSearch, availableFeats }: any) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--text-primary)' }}>
        Ability Score Improvement or Feat
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        {(['asi', 'feat'] as const).map(choice => (
          <button
            key={choice}
            onClick={() => onSetChoice(choice)}
            style={{
              flex: 1, padding: 'var(--space-3)', cursor: 'pointer',
              border: asiChoice === choice ? '2px solid var(--color-gold)' : '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              background: asiChoice === choice ? 'rgba(212,160,23,0.08)' : 'var(--bg-sunken)',
            }}
          >
            <div style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)', color: asiChoice === choice ? 'var(--color-gold-bright)' : 'var(--text-primary)' }}>
              {choice === 'asi' ? '📈 Ability Score +2' : '⭐ Take a Feat'}
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 2 }}>
              {choice === 'asi' ? '+2 to one ability or +1 to two' : 'Choose from 43 general feats'}
            </div>
          </button>
        ))}
      </div>

      {asiChoice === 'asi' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: totalBoosts === 2 ? 'var(--hp-full)' : 'var(--text-muted)', gridColumn: '1/-1', marginBottom: 4 }}>
            Points to distribute: {2 - totalBoosts} remaining
          </div>
          {ABILITY_NAMES.map(ab => {
            const current = character[ab] as number;
            const boost = abiBoosts[ab] ?? 0;
            const atCap = current + boost >= 20;
            return (
              <div key={ab} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-3)', background: 'var(--bg-sunken)', borderRadius: 'var(--radius-md)' }}>
                <span style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', flex: 1, textTransform: 'capitalize' }}>{ab.slice(0,3)}</span>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--text-muted)', fontSize: 'var(--text-sm)' }}>{current}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => {
                    if (boost <= 0) return;
                    onSetBoosts((p: any) => ({ ...p, [ab]: boost - 1 }));
                  }} style={{ width: 22, height: 22, borderRadius: '50%', border: '1px solid var(--border-dim)', background: 'var(--bg-raised)', cursor: 'pointer', minHeight: 0, fontSize: 14 }} disabled={boost <= 0}>−</button>
                  <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--color-gold-bright)', minWidth: 16, textAlign: 'center', fontSize: 'var(--text-sm)' }}>{boost > 0 ? `+${boost}` : '0'}</span>
                  <button onClick={() => {
                    if (totalBoosts >= 2 || atCap) return;
                    onSetBoosts((p: any) => ({ ...p, [ab]: boost + 1 }));
                  }} style={{ width: 22, height: 22, borderRadius: '50%', border: '1px solid var(--border-dim)', background: 'var(--bg-raised)', cursor: 'pointer', minHeight: 0, fontSize: 14 }} disabled={totalBoosts >= 2 || atCap}>+</button>
                </div>
                {boost > 0 && <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, color: 'var(--color-gold-bright)', fontSize: 'var(--text-sm)' }}>→ {current + boost}</span>}
              </div>
            );
          })}
        </div>
      )}

      {asiChoice === 'feat' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <input
            value={featSearch}
            onChange={e => onSetFeatSearch(e.target.value)}
            placeholder="Search feats…"
            style={{ fontSize: 'var(--text-sm)' }}
            autoFocus
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
            {availableFeats.map((feat: any) => (
              <button
                key={feat.name}
                onClick={() => onSetFeat(feat.name)}
                style={{
                  textAlign: 'left', padding: 'var(--space-2) var(--space-3)',
                  border: selectedFeat === feat.name ? '2px solid var(--color-gold)' : '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  background: selectedFeat === feat.name ? 'rgba(212,160,23,0.08)' : 'var(--bg-sunken)',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 'var(--text-sm)', color: selectedFeat === feat.name ? 'var(--color-gold-bright)' : 'var(--text-primary)' }}>
                  {selectedFeat === feat.name ? '✓ ' : ''}{feat.name}
                  {feat.prerequisite && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> — Req: {feat.prerequisite}</span>}
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 1 }}>{feat.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ConfirmStep({ character, newLevel, avgHPGain, newMaxHP, selectedSubclass, abiBoosts, selectedFeat }: any) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 'var(--text-md)', color: 'var(--color-gold-bright)', textAlign: 'center' }}>
        Ready to Level Up?
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <ConfirmLine icon="📖" label="New Level" value={`${character.class_name} ${newLevel}`} />
        <ConfirmLine icon="❤️" label="Max HP" value={`${character.max_hp} → ${newMaxHP} (+${avgHPGain})`} />
        {selectedSubclass && <ConfirmLine icon="⭐" label="Subclass" value={selectedSubclass} highlight />}
        {abiBoosts && Object.entries(abiBoosts).filter(([,v]) => v).map(([k, v]) => (
          <ConfirmLine key={k} icon="📈" label={k.slice(0,3).toUpperCase()} value={`${character[k]} → ${(character[k] as number) + (v as number)} (+${v})`} highlight />
        ))}
        {selectedFeat && <ConfirmLine icon="⭐" label="Feat Gained" value={selectedFeat} highlight />}
      </div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center' }}>
        This will update your character immediately. You can always adjust stats in Character Settings.
      </div>
    </div>
  );
}

function Gain({ icon, label, before, after, color }: any) {
  return (
    <div style={{ padding: 'var(--space-3)', background: 'var(--bg-sunken)', borderRadius: 'var(--radius-lg)', border: `1px solid ${color}20` }}>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>{icon} {label}</div>
      <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 900, fontSize: 'var(--text-lg)', color, marginTop: 2 }}>
        {before} → {after}
      </div>
    </div>
  );
}

function Feature({ text, icon, highlight }: { text: string; icon: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px', background: highlight ? 'rgba(212,160,23,0.08)' : 'var(--bg-sunken)', borderRadius: 'var(--radius-md)', border: highlight ? '1px solid rgba(212,160,23,0.2)' : '1px solid var(--border-subtle)' }}>
      <span>{icon}</span>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: highlight ? 'var(--color-gold-bright)' : 'var(--text-secondary)', fontWeight: highlight ? 600 : 400 }}>{text}</span>
    </div>
  );
}

function ConfirmLine({ icon, label, value, highlight }: { icon: string; label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', background: highlight ? 'rgba(212,160,23,0.06)' : 'var(--bg-sunken)', borderRadius: 'var(--radius-md)', border: highlight ? '1px solid rgba(212,160,23,0.2)' : '1px solid var(--border-subtle)' }}>
      <span>{icon}</span>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', minWidth: 80 }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: highlight ? 'var(--color-gold-bright)' : 'var(--text-secondary)', fontWeight: highlight ? 600 : 400 }}>{value}</span>
    </div>
  );
}
