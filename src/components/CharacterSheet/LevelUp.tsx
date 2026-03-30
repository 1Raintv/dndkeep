import { useState, useMemo } from 'react';
import type { Character } from '../../types';
import { CLASS_MAP } from '../../data/classes';
import { getSpellSlotRow, slotRowToSpellSlots } from '../../data/spellSlots';
import { rollDie, hpPerLevel, abilityModifier } from '../../lib/gameUtils';
import { FEATS, type FeatData } from '../../data/feats';

interface LevelUpProps {
  character: Character;
  onConfirm: (updates: Partial<Character>) => void;
  onCancel: () => void;
}

const ASI_LEVELS: Record<string, number[]> = {
  Barbarian:[4,8,12,16,19], Bard:[4,8,12,16,19], Cleric:[4,8,12,16,19],
  Druid:[4,8,12,16,19], Fighter:[4,6,8,12,14,16,19], Monk:[4,8,12,16,19],
  Paladin:[4,8,12,16,19], Ranger:[4,8,12,16,19], Rogue:[4,8,10,12,16,19],
  Sorcerer:[4,8,12,16,19], Warlock:[4,8,12,16,19], Wizard:[4,8,12,16,19],
};

const ABILITY_KEYS = ['strength','dexterity','constitution','intelligence','wisdom','charisma'] as const;
const ABILITY_LABELS: Record<string,string> = {
  strength:'Strength', dexterity:'Dexterity', constitution:'Constitution',
  intelligence:'Intelligence', wisdom:'Wisdom', charisma:'Charisma',
};

function FeatCard({ feat, selected, onSelect }: { feat: FeatData; selected: boolean; onSelect: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const catColor: Record<string,string> = { general:'#60a5fa', 'fighting-style':'#f87171', 'epic-boon':'#d946ef', origin:'var(--color-gold)' };
  return (
    <div style={{ borderRadius:'var(--radius-md)', border: selected ? '2px solid var(--color-gold)' : '1px solid var(--border-subtle)', background: selected ? 'rgba(201,146,42,0.08)' : 'var(--bg-sunken)', overflow:'hidden', transition:'all var(--transition-fast)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'var(--space-3)', padding:'var(--space-3) var(--space-4)', cursor:'pointer' }} onClick={onSelect}>
        <div style={{ width:18, height:18, borderRadius:'50%', flexShrink:0, border: selected ? '5px solid var(--color-gold)' : '2px solid var(--border-dim)', background: selected ? 'var(--color-gold)' : 'transparent' }} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'var(--space-2)', flexWrap:'wrap' }}>
            <span style={{ fontFamily:'var(--font-heading)', fontWeight:700, fontSize:'var(--text-sm)', color: selected ? 'var(--text-gold)' : 'var(--text-primary)' }}>{feat.name}</span>
            {feat.asi && <span style={{ fontSize:9, fontFamily:'var(--font-heading)', color:'var(--text-gold)', background:'rgba(201,146,42,0.15)', border:'1px solid rgba(201,146,42,0.3)', borderRadius:4, padding:'1px 5px' }}>+{feat.asi[0].amount} {feat.asi[0].ability}</span>}
            {feat.prerequisite && <span style={{ fontSize:9, fontFamily:'var(--font-heading)', color:'var(--text-muted)', background:'var(--bg-raised)', border:'1px solid var(--border-subtle)', borderRadius:4, padding:'1px 5px' }}>{feat.prerequisite}</span>}
            <span style={{ fontSize:9, fontFamily:'var(--font-heading)', color:catColor[feat.category], background:'rgba(0,0,0,0.2)', border:`1px solid ${catColor[feat.category]}40`, borderRadius:4, padding:'1px 5px', marginLeft:'auto' }}>{feat.category}</span>
          </div>
          <div style={{ fontSize:'var(--text-xs)', color:'var(--text-muted)', marginTop:2, lineHeight:1.4 }}>
            {feat.description.length > 100 && !expanded ? feat.description.slice(0,100)+'…' : feat.description}
          </div>
        </div>
        <button onClick={e=>{ e.stopPropagation(); setExpanded(v=>!v); }} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:'var(--text-xs)', flexShrink:0 }}>{expanded?'▲':'▼'}</button>
      </div>
      {expanded && (
        <div style={{ padding:'0 var(--space-4) var(--space-3)', borderTop:'1px solid var(--border-subtle)', background:'var(--bg-sunken)' }}>
          <ul style={{ margin:'var(--space-2) 0 0', paddingLeft:'var(--space-4)', display:'flex', flexDirection:'column', gap:'var(--space-1)' }}>
            {feat.benefits.map((b,i) => <li key={i} style={{ fontSize:'var(--text-xs)', color:'var(--text-secondary)', lineHeight:1.5 }}>{b}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function LevelUp({ character, onConfirm, onCancel }: LevelUpProps) {
  const cls = CLASS_MAP[character.class_name];
  const newLevel = character.level + 1;
  const conMod = abilityModifier(character.constitution);
  const averageHP = hpPerLevel(cls?.hit_die ?? 8, character.constitution);

  const [hpChoice, setHpChoice] = useState<'average'|'roll'>('average');
  const [rolledHP, setRolledHP] = useState<number|null>(null);
  const [subclass, setSubclass] = useState(character.subclass ?? '');
  const asiLevels = ASI_LEVELS[character.class_name] ?? [4,8,12,16,19];
  const hasASI = asiLevels.includes(newLevel);
  const [asiChoice, setAsiChoice] = useState<'asi'|'feat'>('asi');
  const [asiPrimary, setAsiPrimary] = useState('strength');
  const [asiSecondary, setAsiSecondary] = useState('none');
  const [selectedFeat, setSelectedFeat] = useState('');
  const [featSearch, setFeatSearch] = useState('');
  const [featCategory, setFeatCategory] = useState('all');

  const eligibleFeats = useMemo(() => FEATS.filter(f => {
    if (f.category === 'origin') return false;
    if (f.category === 'epic-boon' && newLevel < 19) return false;
    if (featCategory !== 'all' && f.category !== featCategory) return false;
    if (featSearch) { const q = featSearch.toLowerCase(); return f.name.toLowerCase().includes(q) || f.description.toLowerCase().includes(q); }
    return true;
  }), [newLevel, featCategory, featSearch]);

  const newSubclasses = cls?.subclasses.filter(sc => sc.unlock_level === newLevel) ?? [];
  const needsSubclassChoice = newSubclasses.length > 0 && !character.subclass;

  function roll() { setRolledHP(Math.max(1, rollDie(cls?.hit_die ?? 8) + conMod)); }
  const hpGain = hpChoice === 'average' ? averageHP : (rolledHP ?? averageHP);

  function buildNewSlots(): Character['spell_slots'] {
    if (!cls?.is_spellcaster) return character.spell_slots;
    const newSlotDef = slotRowToSpellSlots(getSpellSlotRow(cls.name, newLevel));
    const merged: Character['spell_slots'] = {};
    for (const [lvl, def] of Object.entries(newSlotDef)) {
      merged[lvl] = { total: def.total, used: Math.min(character.spell_slots[lvl]?.used ?? 0, def.total) };
    }
    return merged;
  }

  function confirm() {
    const updates: Partial<Character> = {
      level: newLevel,
      max_hp: character.max_hp + hpGain,
      current_hp: character.current_hp + hpGain,
      spell_slots: buildNewSlots(),
    };
    if (subclass && !character.subclass) updates.subclass = subclass;
    if (hasASI && asiChoice === 'asi') {
      const isSplit = asiSecondary !== 'none';
      const amt = isSplit ? 1 : 2;
      const k1 = asiPrimary as keyof Character;
      updates[k1] = Math.min(20, (character[k1] as number) + amt) as any;
      if (isSplit) {
        const k2 = asiSecondary as keyof Character;
        updates[k2] = Math.min(20, (character[k2] as number) + 1) as any;
      }
    }
    if (hasASI && asiChoice === 'feat' && selectedFeat) {
      const existing = character.features_and_traits ?? '';
      updates.features_and_traits = existing ? existing + `\n\n[Feat — Level ${newLevel}]\n${selectedFeat}` : `[Feat — Level ${newLevel}]\n${selectedFeat}`;
    }
    onConfirm(updates);
  }

  const canConfirm =
    (!needsSubclassChoice || !!subclass) &&
    (hpChoice === 'average' || rolledHP !== null) &&
    (!hasASI || asiChoice === 'asi' || (asiChoice === 'feat' && !!selectedFeat));

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{ maxWidth:580, maxHeight:'88vh', overflow:'hidden', display:'flex', flexDirection:'column' }}>
        <h2 style={{ marginBottom:'var(--space-1)', flexShrink:0 }}>Level Up!</h2>
        <p style={{ color:'var(--text-muted)', marginBottom:'var(--space-4)', fontFamily:'var(--font-heading)', fontSize:'var(--text-sm)', flexShrink:0 }}>
          {character.name} reaches level {newLevel} {character.class_name}
        </p>

        <div style={{ overflowY:'auto', flex:1, paddingRight:'var(--space-1)' }}>
          {/* HP */}
          <div className="section-header">Hit Points</div>
          <div style={{ display:'flex', gap:'var(--space-3)', marginBottom:'var(--space-3)' }}>
            <button className={hpChoice==='average'?'btn-gold':'btn-secondary'} onClick={()=>setHpChoice('average')}>Take Average (+{averageHP})</button>
            <button className={hpChoice==='roll'?'btn-gold':'btn-secondary'} onClick={()=>{setHpChoice('roll');setRolledHP(null);}}>Roll d{cls?.hit_die??8}</button>
          </div>
          {hpChoice === 'roll' && (
            <div style={{ marginBottom:'var(--space-3)', display:'flex', alignItems:'center', gap:'var(--space-3)' }}>
              <button className="btn-primary" onClick={roll}>Roll d{cls?.hit_die??8}{conMod>=0?`+${conMod}`:conMod}</button>
              {rolledHP !== null && <span style={{ fontFamily:'var(--font-display)', fontSize:'var(--text-2xl)', color:'var(--text-gold)' }}>+{rolledHP} HP</span>}
            </div>
          )}
          <div className="panel" style={{ marginBottom:'var(--space-5)', fontSize:'var(--text-sm)', fontFamily:'var(--font-heading)' }}>
            <div style={{ display:'flex', justifyContent:'space-between' }}><span style={{ color:'var(--text-muted)' }}>Current Max</span><span>{character.max_hp}</span></div>
            <div style={{ display:'flex', justifyContent:'space-between', color:'var(--hp-full)' }}><span>Gained</span><span>+{hpChoice==='average'?averageHP:(rolledHP??'?')}</span></div>
            <div style={{ display:'flex', justifyContent:'space-between', borderTop:'1px solid var(--border-subtle)', paddingTop:'var(--space-2)', marginTop:'var(--space-2)', color:'var(--text-gold)', fontWeight:700, fontSize:'var(--text-md)' }}>
              <span>New Max</span><span>{character.max_hp+(hpChoice==='average'?averageHP:(rolledHP??0))}</span>
            </div>
          </div>

          {/* Subclass */}
          {needsSubclassChoice && (
            <>
              <div className="section-header">Choose Subclass</div>
              <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-2)', marginBottom:'var(--space-5)' }}>
                {newSubclasses.map(sc => (
                  <button key={sc.name} onClick={()=>setSubclass(sc.name)} style={{ display:'flex', flexDirection:'column', gap:'var(--space-1)', padding:'var(--space-3) var(--space-4)', borderRadius:'var(--radius-md)', textAlign:'left', cursor:'pointer', border: subclass===sc.name?'2px solid var(--color-gold)':'1px solid var(--border-subtle)', background: subclass===sc.name?'rgba(201,146,42,0.1)':'var(--bg-sunken)' }}>
                    <span style={{ fontFamily:'var(--font-heading)', fontWeight:700, color: subclass===sc.name?'var(--text-gold)':'var(--text-primary)' }}>{sc.name}</span>
                    <span style={{ fontSize:'var(--text-xs)', color:'var(--text-muted)' }}>{sc.description}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ASI / Feat */}
          {hasASI && (
            <>
              <div className="section-header">Ability Score Improvement or Feat</div>
              <div style={{ display:'flex', gap:'var(--space-2)', marginBottom:'var(--space-4)' }}>
                <button className={asiChoice==='asi'?'btn-gold':'btn-secondary'} onClick={()=>setAsiChoice('asi')}>Ability Score Improvement</button>
                <button className={asiChoice==='feat'?'btn-gold':'btn-secondary'} onClick={()=>setAsiChoice('feat')}>Take a Feat</button>
              </div>

              {asiChoice === 'asi' && (
                <div className="panel" style={{ marginBottom:'var(--space-5)' }}>
                  <p style={{ fontSize:'var(--text-xs)', color:'var(--text-muted)', fontFamily:'var(--font-heading)', marginBottom:'var(--space-3)' }}>
                    Increase one score by 2, or two different scores by 1 each. Maximum 20.
                  </p>
                  <div style={{ display:'flex', gap:'var(--space-3)', flexWrap:'wrap' }}>
                    <div style={{ flex:1, minWidth:140 }}>
                      <label style={{ fontSize:'var(--text-xs)' }}>+2 to (or +1 if splitting)</label>
                      <select value={asiPrimary} onChange={e=>setAsiPrimary(e.target.value)}>
                        {ABILITY_KEYS.map(k => <option key={k} value={k} disabled={(character[k as keyof Character] as number)>=20}>{ABILITY_LABELS[k]} ({character[k as keyof Character]}{(character[k as keyof Character] as number)>=20?' — max':''})</option>)}
                      </select>
                    </div>
                    <div style={{ flex:1, minWidth:140 }}>
                      <label style={{ fontSize:'var(--text-xs)' }}>+1 to (optional split)</label>
                      <select value={asiSecondary} onChange={e=>setAsiSecondary(e.target.value)}>
                        <option value="none">None — take full +2</option>
                        {ABILITY_KEYS.filter(k=>k!==asiPrimary).map(k => <option key={k} value={k} disabled={(character[k as keyof Character] as number)>=20}>{ABILITY_LABELS[k]} ({character[k as keyof Character]}{(character[k as keyof Character] as number)>=20?' — max':''})</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {asiChoice === 'feat' && (
                <div style={{ marginBottom:'var(--space-5)' }}>
                  <div style={{ display:'flex', gap:'var(--space-2)', marginBottom:'var(--space-3)', flexWrap:'wrap' }}>
                    <input placeholder="Search feats..." value={featSearch} onChange={e=>setFeatSearch(e.target.value)} style={{ flex:1, minWidth:160, fontSize:'var(--text-sm)' }} />
                    <select value={featCategory} onChange={e=>setFeatCategory(e.target.value)} style={{ fontSize:'var(--text-sm)' }}>
                      <option value="all">All</option>
                      <option value="general">General</option>
                      <option value="fighting-style">Fighting Style</option>
                      {newLevel >= 19 && <option value="epic-boon">Epic Boon</option>}
                    </select>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:'var(--space-2)', maxHeight:320, overflowY:'auto', paddingRight:4 }}>
                    {eligibleFeats.length === 0 && <p style={{ color:'var(--text-muted)', fontSize:'var(--text-sm)', fontFamily:'var(--font-heading)', textAlign:'center', padding:'var(--space-4)' }}>No feats match.</p>}
                    {eligibleFeats.map(feat => <FeatCard key={feat.name} feat={feat} selected={selectedFeat===feat.name} onSelect={()=>setSelectedFeat(feat.name)} />)}
                  </div>
                  {selectedFeat && (
                    <div style={{ marginTop:'var(--space-3)', padding:'var(--space-3)', background:'rgba(201,146,42,0.08)', border:'1px solid var(--border-gold)', borderRadius:'var(--radius-md)', fontFamily:'var(--font-heading)', fontSize:'var(--text-sm)', color:'var(--text-gold)' }}>
                      ✓ Selected: {selectedFeat}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Spell slots */}
          {cls?.is_spellcaster && (
            <>
              <div className="section-header">Spell Slots at Level {newLevel}</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:'var(--space-2)', marginBottom:'var(--space-5)' }}>
                {Object.entries(buildNewSlots()).map(([lvl,slot]) => {
                  const gained = slot.total - (character.spell_slots[lvl]?.total ?? 0);
                  return (
                    <div key={lvl} className="panel" style={{ padding:'var(--space-2) var(--space-3)', textAlign:'center' }}>
                      <div style={{ fontFamily:'var(--font-heading)', fontSize:'var(--text-xs)', color:'var(--text-muted)' }}>{['1st','2nd','3rd','4th','5th','6th','7th','8th','9th'][Number(lvl)-1]}</div>
                      <div style={{ fontFamily:'var(--font-heading)', fontWeight:700, color: gained>0?'var(--text-gold)':'var(--text-primary)' }}>
                        {slot.total}{gained>0&&<span style={{ fontSize:'var(--text-xs)', color:'var(--hp-full)', marginLeft:4 }}>+{gained}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div style={{ display:'flex', gap:'var(--space-3)', paddingTop:'var(--space-4)', borderTop:'1px solid var(--border-subtle)', flexShrink:0 }}>
          <button className="btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn-primary btn-lg" onClick={confirm} disabled={!canConfirm} style={{ flex:1, justifyContent:'center' }}>
            Advance to Level {newLevel}
          </button>
        </div>
      </div>
    </div>
  );
}
