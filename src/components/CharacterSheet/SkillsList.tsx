import { useState } from 'react';
import type { Character, ComputedStats } from '../../types';
import { SKILLS } from '../../data/skills';
import { CONDITION_MAP } from '../../data/conditions';
import { abilityAbbrev, formatModifier, rollDie } from '../../lib/gameUtils';
import { useDiceRoll } from '../../context/DiceRollContext';

interface SkillsListProps {
  character: Character;
  computed: ComputedStats;
  onUpdate: (updates: Partial<Character>) => void;
}

interface RollResult {
  skillName: string;
  d20: number;
  modifier: number;
  total: number;
  isCrit: boolean;
  isFail: boolean;
}

export default function SkillsList({ character, computed, onUpdate }: SkillsListProps) {
  const sortedSkills = [...SKILLS].sort((a, b) => a.name.localeCompare(b.name));
  const [lastRoll, setLastRoll] = useState<RollResult | null>(null);
  const { triggerRoll } = useDiceRoll();

  function rollSkill(skillName: string, modifier: number) {
    // Check for disadvantage from active conditions
    const hasDisadvantage = (character.active_conditions ?? []).some(c => {
      const mech = CONDITION_MAP[c];
      return mech?.attackDisadvantage || mech?.abilityCheckDisadvantage;
    });
    const roll1 = rollDie(20);
    const roll2 = hasDisadvantage ? rollDie(20) : roll1;
    const d20 = hasDisadvantage ? Math.min(roll1, roll2) : roll1;
    const total = d20 + modifier;
    setLastRoll({ skillName, d20, modifier, total, isCrit: d20 === 20, isFail: d20 === 1 });
    const conditionNote = hasDisadvantage ? ' (Disadvantage)' : '';
    triggerRoll({ result: d20, dieType: 20, modifier, total, label: skillName + ' Check' + conditionNote });
  }

  function cycleSkill(e: React.MouseEvent, skillName: string) {
    e.stopPropagation();
    const isProf   = character.skill_proficiencies.includes(skillName);
    const isExpert = character.skill_expertises.includes(skillName);
    let newProf   = [...character.skill_proficiencies];
    let newExpert = [...character.skill_expertises];
    if (!isProf && !isExpert) {
      newProf = [...newProf, skillName];
    } else if (isProf && !isExpert) {
      newExpert = [...newExpert, skillName];
    } else {
      newProf   = newProf.filter(s => s !== skillName);
      newExpert = newExpert.filter(s => s !== skillName);
    }
    onUpdate({ skill_proficiencies: newProf, skill_expertises: newExpert });
  }

  return (
    <section>
      <div className="section-header">Skills</div>

      {/* Roll result display */}
      {lastRoll && (
        <div style={{
          marginBottom: 'var(--sp-4)',
          padding: 'var(--sp-3) var(--sp-4)',
          borderRadius: 'var(--r-md)',
          border: `1px solid ${lastRoll.isCrit ? 'var(--hp-full)' : lastRoll.isFail ? 'rgba(107,20,20,1)' : 'var(--c-gold-bdr)'}`,
          background: lastRoll.isCrit ? 'rgba(22,163,74,0.1)' : lastRoll.isFail ? 'rgba(127,29,29,0.1)' : 'rgba(201,146,42,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--sp-4)',
        }}>
          <div>
            <span style={{ fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)', color: 'var(--c-gold-l)' }}>
              {lastRoll.skillName}
            </span>
            <span style={{ fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--t-2)', marginLeft: 'var(--sp-2)' }}>
              d20({lastRoll.d20}) {lastRoll.modifier >= 0 ? '+' : ''}{lastRoll.modifier}
            </span>
            {lastRoll.isCrit && (
              <span style={{ marginLeft: 'var(--sp-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: 'var(--hp-full)' }}>
                Natural 20
              </span>
            )}
            {lastRoll.isFail && (
              <span style={{ marginLeft: 'var(--sp-2)', fontFamily: 'var(--ff-body)', fontSize: 'var(--fs-xs)', color: '#fca5a5' }}>
                Natural 1
              </span>
            )}
          </div>
          <span style={{
            fontFamily: 'var(--ff-brand)',
            fontWeight: 900,
            fontSize: '2rem',
            lineHeight: 1,
            color: lastRoll.isCrit ? 'var(--hp-full)' : lastRoll.isFail ? '#fca5a5' : 'var(--c-gold-l)',
          }}>
            {lastRoll.total}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {sortedSkills.map(skill => {
          const data = computed.skills[skill.name];
          if (!data) return null;

          const dotClass = data.expert
            ? 'prof-dot expert'
            : data.proficient
            ? 'prof-dot proficient'
            : 'prof-dot';

          return (
            <div
              key={skill.name}
              onClick={() => rollSkill(skill.name, data.total)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && rollSkill(skill.name, data.total)}
              title={`Roll ${skill.name} check (d20${data.total >= 0 ? '+' : ''}${data.total})`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-2)',
                padding: '4px var(--sp-3)',
                borderRadius: 'var(--r-sm)',
                background: lastRoll?.skillName === skill.name
                  ? 'rgba(201,146,42,0.1)'
                  : data.proficient ? 'rgba(201,146,42,0.05)' : 'transparent',
                transition: 'background var(--tr-fast)',
                cursor: 'pointer',
                userSelect: 'none',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.background = 'var(--c-raised)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.background =
                  lastRoll?.skillName === skill.name
                    ? 'rgba(201,146,42,0.1)'
                    : data.proficient ? 'rgba(201,146,42,0.05)' : 'transparent';
              }}
            >
              {/* Dot — click to cycle proficiency (stops row click) */}
              <button
                onClick={e => cycleSkill(e, skill.name)}
                title={
                  data.expert ? 'Expert — click to remove'
                  : data.proficient ? 'Proficient — click for Expertise'
                  : 'Not proficient — click to add'
                }
                style={{
                  background: 'none', border: 'none', padding: 0,
                  cursor: 'pointer', flexShrink: 0,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 16, height: 16,
                }}
              >
                <span className={dotClass} style={{ pointerEvents: 'none' }} />
              </button>

              <span style={{
                fontFamily: 'var(--ff-body)', fontWeight: 600, fontSize: 'var(--fs-sm)',
                color: data.expert ? 'var(--c-amber-l)' : data.proficient ? 'var(--t-1)' : 'var(--t-2)',
                flex: 1,
              }}>
                {skill.name}
              </span>

              <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--t-2)', fontFamily: 'var(--ff-body)' }}>
                {abilityAbbrev(skill.ability)}
              </span>

              <span style={{
                fontFamily: 'var(--ff-body)', fontWeight: 700, fontSize: 'var(--fs-sm)',
                color: data.expert ? 'var(--c-amber-l)' : data.proficient ? 'var(--c-gold-l)' : 'var(--t-2)',
                minWidth: '2rem', textAlign: 'right',
              }}>
                {formatModifier(data.total)}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{
        marginTop: 'var(--sp-3)',
        display: 'flex',
        gap: 'var(--sp-4)',
        fontSize: 'var(--fs-xs)',
        color: 'var(--t-2)',
        fontFamily: 'var(--ff-body)',
        flexWrap: 'wrap',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="prof-dot" /> None
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="prof-dot proficient" /> Proficient
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span className="prof-dot expert" /> Expertise
        </span>
        <span style={{ color: 'var(--t-2)', fontStyle: 'italic', marginLeft: 'auto' }}>
          Click row to roll — click dot to toggle proficiency
        </span>
      </div>
    </section>
  );
}
