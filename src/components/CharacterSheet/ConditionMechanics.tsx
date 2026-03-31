/**
 * ConditionMechanics — shows mechanical reminders for active conditions.
 * D&D Beyond shows conditions as pills. We show what they actually MEAN.
 */

interface ConditionMechanicsProps {
  conditions: string[];
}

interface MechanicReminder {
  title: string;
  color: string;
  reminders: string[];
}

const CONDITION_MECHANICS: Record<string, MechanicReminder> = {
  Blinded: {
    title: '🚫 Blinded',
    color: '#94a3b8',
    reminders: [
      '❌ Your attack rolls have Disadvantage',
      '✅ Attack rolls against you have Advantage',
      '❌ Auto-fail checks requiring sight',
    ],
  },
  Charmed: {
    title: '💕 Charmed',
    color: '#f472b6',
    reminders: [
      '❌ Can\'t attack or target the charmer with harmful abilities',
      '⚠️ Charmer has Advantage on social checks against you',
    ],
  },
  Deafened: {
    title: '🔇 Deafened',
    color: '#94a3b8',
    reminders: [
      '❌ Auto-fail checks requiring hearing',
      '⚠️ Some spells with verbal components may be harder to cast',
    ],
  },
  Exhaustion: {
    title: '😮‍💨 Exhausted',
    color: '#fb923c',
    reminders: [
      '⚠️ Level 1: Disadvantage on ability checks',
      '⚠️ Level 2: Speed halved',
      '⚠️ Level 3: Disadvantage on attacks & saves',
      '⚠️ Level 4: Max HP halved',
      '⚠️ Level 5: Speed = 0',
      '☠️ Level 6: Death',
    ],
  },
  Frightened: {
    title: '😱 Frightened',
    color: '#facc15',
    reminders: [
      '❌ Disadvantage on attacks while source is in sight',
      '❌ Disadvantage on ability checks while source is in sight',
      '❌ Can\'t willingly move closer to source',
    ],
  },
  Grappled: {
    title: '🤼 Grappled',
    color: '#a78bfa',
    reminders: [
      '❌ Speed = 0, no speed bonuses',
      '⚠️ Ends if grappler is incapacitated or you move out of reach',
    ],
  },
  Incapacitated: {
    title: '💤 Incapacitated',
    color: '#94a3b8',
    reminders: [
      '❌ Can\'t take actions or reactions',
    ],
  },
  Invisible: {
    title: '👻 Invisible',
    color: '#e2e8f0',
    reminders: [
      '✅ Your attack rolls have Advantage',
      '✅ Attack rolls against you have Disadvantage',
      '⚠️ Still detectable by sound, smell, tracks',
    ],
  },
  Paralyzed: {
    title: '⚡ Paralyzed',
    color: '#facc15',
    reminders: [
      '❌ Auto-fail Str and Dex saving throws',
      '✅ Attack rolls against you have Advantage',
      '⚠️ Any attack that hits within 5 ft is a critical hit',
      '❌ Can\'t move or speak',
      '❌ Can\'t take actions or reactions',
    ],
  },
  Petrified: {
    title: '🪨 Petrified',
    color: '#94a3b8',
    reminders: [
      '❌ Can\'t move, speak, or take actions/reactions',
      '❌ Auto-fail Str and Dex saves',
      '✅ Attack rolls against you have Advantage',
      '⚠️ Resistance to all damage',
      '⚠️ Immune to poison and disease',
    ],
  },
  Poisoned: {
    title: '🤢 Poisoned',
    color: '#86efac',
    reminders: [
      '❌ Disadvantage on attack rolls',
      '❌ Disadvantage on ability checks',
    ],
  },
  Prone: {
    title: '⬇️ Prone',
    color: '#fb923c',
    reminders: [
      '❌ Disadvantage on your attack rolls',
      '✅ Melee attacks against you have Advantage',
      '❌ Ranged attacks against you have Disadvantage',
      '⚠️ Movement costs double to stand up (half your speed)',
    ],
  },
  Restrained: {
    title: '⛓️ Restrained',
    color: '#a78bfa',
    reminders: [
      '❌ Speed = 0',
      '❌ Your attack rolls have Disadvantage',
      '✅ Attack rolls against you have Advantage',
      '❌ Disadvantage on Dexterity saving throws',
    ],
  },
  Stunned: {
    title: '💫 Stunned',
    color: '#facc15',
    reminders: [
      '❌ Auto-fail Str and Dex saving throws',
      '✅ Attack rolls against you have Advantage',
      '❌ Can\'t move',
      '❌ Can\'t take actions',
      '⚠️ Can only speak falteringly',
    ],
  },
  Unconscious: {
    title: '💀 Unconscious',
    color: '#64748b',
    reminders: [
      '❌ Auto-fail Str and Dex saves',
      '✅ Attack rolls against you have Advantage',
      '⚠️ Any hit within 5 ft is a critical hit',
      '❌ Can\'t take actions, reactions, or move',
      '❌ Can\'t speak — drop anything held',
    ],
  },
  Concentration: {
    title: '🔮 Concentrating',
    color: '#8b6be8',
    reminders: [
      '⚠️ Taking damage requires CON save (DC = max(10, half damage))',
      '⚠️ Casting another concentration spell ends this one',
      '⚠️ Being incapacitated or killed ends concentration',
    ],
  },
};

export default function ConditionMechanics({ conditions }: ConditionMechanicsProps) {
  const activeConditions = conditions.filter(c => CONDITION_MECHANICS[c]);

  if (!activeConditions.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
      {activeConditions.map(condition => {
        const mech = CONDITION_MECHANICS[condition];
        return (
          <div key={condition} style={{
            padding: 'var(--space-3) var(--space-4)',
            borderRadius: 'var(--radius-lg)',
            border: `1px solid ${mech.color}40`,
            background: `${mech.color}08`,
          }}>
            <div style={{
              fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
              color: mech.color, letterSpacing: '0.06em', marginBottom: 'var(--space-2)',
            }}>
              {mech.title}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {mech.reminders.map((r, i) => (
                <div key={i} style={{
                  fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
                  color: 'var(--text-secondary)', lineHeight: 1.5,
                }}>
                  {r}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
