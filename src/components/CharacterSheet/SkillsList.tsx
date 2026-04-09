import { useState } from 'react';
import type { Character, ComputedStats } from '../../types';
import { SKILLS } from '../../data/skills';
import { computeActiveBonuses } from '../../lib/gameUtils';
import { CONDITION_MAP } from '../../data/conditions';
import { formatModifier, rollDie } from '../../lib/gameUtils';
import { useDiceRoll } from '../../context/DiceRollContext';
import { supabase } from '../../lib/supabase';

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

const ABILITY_COLORS: Record<string, string> = {
  strength:     'var(--stat-str)',
  dexterity:    'var(--stat-dex)',
  constitution: 'var(--stat-con)',
  intelligence: 'var(--stat-int)',
  wisdom:       'var(--stat-wis)',
  charisma:     'var(--stat-cha)',
};

const ABILITY_ABBREVS: Record<string, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON',
  intelligence: 'INT', wisdom: 'WIS', charisma: 'CHA',
};

export default function SkillsList({ character, computed, onUpdate }: SkillsListProps) {
  const sortedSkills = [...SKILLS].sort((a, b) => a.name.localeCompare(b.name));
  const [lastRoll, setLastRoll] = useState<RollResult | null>(null);
  const { triggerRoll } = useDiceRoll();

  function rollSkill(skillName: string, modifier: number) {
    const buffs = computeActiveBonuses((character as any).active_buffs ?? []);
    const hasDisadvantage = (character.active_conditions ?? []).some(c => {
      const mech = CONDITION_MAP[c];
      return mech?.attackDisadvantage || mech?.abilityCheckDisadvantage;
    });
    const roll1 = rollDie(20);
    const roll2 = hasDisadvantage ? rollDie(20) : roll1;
    const d20 = hasDisadvantage ? Math.min(roll1, roll2) : roll1;
    const blessRoll = buffs.blessActive ? rollDie(4) : 0;
    const total = d20 + modifier + blessRoll;
    const label = `${skillName} Check${hasDisadvantage ? ' (Disadv.)' : ''}${blessRoll ? ` +${blessRoll} Bless` : ''}`;
    setLastRoll({ skillName, d20, modifier: modifier + blessRoll, total, isCrit: d20 === 20, isFail: d20 === 1 });
    triggerRoll({ result: d20, dieType: 20, modifier: modifier + blessRoll, total, label });
    supabase.from('roll_logs').insert({ user_id: character.user_id, character_id: character.id, campaign_id: character.campaign_id ?? null, label, dice_expression: '1d20', individual_results: [d20], total, modifier: modifier + blessRoll }).then(({error}) => { if (error) console.error('roll_logs insert error:', error); });
  }

  function cycleSkill(e: React.MouseEvent, skillName: string) {
    e.stopPropagation();
    const isProf = character.skill_proficiencies.includes(skillName);
    const isExpert = character.skill_expertises.includes(skillName);
    let newProf = [...character.skill_proficiencies];
    let newExpert = [...character.skill_expertises];
    if (!isProf && !isExpert) {
      newProf = [...newProf, skillName];
    } else if (isProf && !isExpert) {
      newExpert = [...newExpert, skillName];
    } else {
      newProf = newProf.filter(s => s !== skillName);
      newExpert = newExpert.filter(s => s !== skillName);
    }
    onUpdate({ skill_proficiencies: newProf, skill_expertises: newExpert });
  }

  const half = Math.ceil(sortedSkills.length / 2);
  const leftCol = sortedSkills.slice(0, half);
  const rightCol = sortedSkills.slice(half);

  function SkillRow({ skill }: { skill: (typeof sortedSkills)[0] }) {
    const data = computed.skills[skill.name];
    if (!data) return null;
    const isLastRolled = lastRoll?.skillName === skill.name;
    const abilityColor = ABILITY_COLORS[skill.ability] ?? 'var(--t-3)';
    const abilityAbbrev = ABILITY_ABBREVS[skill.ability] ?? '?';

    return (
      <div
        onClick={() => rollSkill(skill.name, data.total)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && rollSkill(skill.name, data.total)}
        title={`Roll ${skill.name} (d20${data.total >= 0 ? '+' : ''}${data.total})`}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '3px 4px', borderRadius: 'var(--r-sm)',
          background: isLastRolled ? 'var(--c-raised)' : 'transparent',
          transition: 'background var(--tr-fast)', cursor: 'pointer', userSelect: 'none',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--c-raised)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = isLastRolled ? 'var(--c-raised)' : 'transparent'; }}
      >
        {/* Proficiency indicator — click to cycle */}
        <button
          onClick={e => cycleSkill(e, skill.name)}
          title={data.expert ? 'Expertise — click to remove' : data.proficient ? 'Proficient — click for Expertise' : 'Not proficient — click to add'}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 14 }}
        >
          <div style={{
            width: 8, height: 8, borderRadius: data.expert ? '2px' : '50%',
            background: data.expert ? 'var(--c-gold-l)' : data.proficient ? 'var(--c-gold-l)' : 'transparent',
            border: `1.5px solid ${data.expert ? 'var(--c-gold-l)' : data.proficient ? 'var(--c-gold-l)' : 'var(--c-border-m)'}`,
            transform: data.expert ? 'rotate(45deg)' : 'none',
          }} />
        </button>

        {/* Skill name */}
        <span style={{
          fontFamily: 'var(--ff-body)', fontWeight: data.proficient ? 600 : 400,
          fontSize: 11, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: data.expert ? 'var(--c-gold-xl)' : data.proficient ? 'var(--t-1)' : 'var(--t-2)',
        }}>
          {skill.name}
        </span>

        {/* Ability abbreviation in stat color */}
        <span style={{ fontFamily: 'var(--ff-stat)', fontSize: 7, color: abilityColor, letterSpacing: '0.04em', flexShrink: 0, minWidth: 18, textAlign: 'right' }}>
          {abilityAbbrev}
        </span>

        {/* Bonus */}
        <span style={{
          fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: 11,
          color: data.expert ? 'var(--c-gold-xl)' : data.proficient ? 'var(--c-gold-l)' : 'var(--t-3)',
          minWidth: 24, textAlign: 'right', flexShrink: 0,
        }}>
          {formatModifier(data.total)}
        </span>
      </div>
    );
  }

  return (
    <section>
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Skills</span>
        <span style={{ fontSize: 9, color: 'var(--t-3)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
          click row to roll · click dot to toggle proficiency
        </span>
      </div>

      {/* Roll result */}
      {lastRoll && (() => {
        const skill = SKILLS.find(s => s.name === lastRoll.skillName);
        const col = lastRoll.isCrit ? 'var(--stat-dex)' : lastRoll.isFail ? 'var(--stat-str)' : (skill ? ABILITY_COLORS[skill.ability] : 'var(--c-gold-l)');
        return (
          <div style={{ marginBottom: 'var(--sp-3)', padding: '8px 12px', borderRadius: 'var(--r-md)', border: `1px solid ${col}40`, background: `${col}08`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 13, color: col }}>{lastRoll.skillName}</span>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--t-3)' }}>
                d20({lastRoll.d20}) {lastRoll.modifier >= 0 ? '+' : ''}{lastRoll.modifier}
              </span>
              {lastRoll.isCrit && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--stat-dex)' }}>Nat 20</span>}
              {lastRoll.isFail && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--stat-str)' }}>Nat 1</span>}
            </div>
            <span style={{ fontFamily: 'var(--ff-stat)', fontWeight: 700, fontSize: 22, color: col, lineHeight: 1 }}>{lastRoll.total}</span>
          </div>
        );
      })()}

      {/* Two-column skill grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 8px' }}>
        <div>{leftCol.map(s => <SkillRow key={s.name} skill={s} />)}</div>
        <div>{rightCol.map(s => <SkillRow key={s.name} skill={s} />)}</div>
      </div>

      {/* Legend */}
      <div style={{ marginTop: 'var(--sp-2)', display: 'flex', gap: 12, fontSize: 10, color: 'var(--t-3)', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', border: '1.5px solid var(--c-border-m)' }} /> None
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--c-gold-l)', border: '1.5px solid var(--c-gold-l)' }} /> Proficient
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ width: 7, height: 7, borderRadius: '2px', background: 'var(--c-gold-l)', transform: 'rotate(45deg)' }} /> Expertise
        </span>
      </div>
    </section>
  );
}
