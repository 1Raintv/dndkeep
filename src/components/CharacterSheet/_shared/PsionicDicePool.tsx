import {useEffect,useRef,useState} from 'react';
import type {PsionicEnhancementPersistence} from '../../../lib/api/psionicTurns';
import {useOptimisticCharacterRef} from '../../../lib/hooks/useOptimisticCharacterRef';
import {useModal} from '../../shared/Modal';
import {useToast} from '../../shared/Toast';
import {payPsionicEnergy} from './payPsionicEnergy';
// v2.784  --  the pool is stored once; each manual toggle is an explicit,
// retry-safe one-die transaction rather than a stale absolute-value save.
import type { Character } from '../../../types';
import SlotBoxes, { PALETTE_PSI } from './SlotBoxes';

interface Props {
  persistence?:PsionicEnhancementPersistence;
  character: Character;
  /** Total PED pool size at the character's current level. */
  total: number;
  /** Current dice spent (used). */
  used: number;
  /** When true, boxes are non-interactive. */
  disabled?: boolean;
}

export default function PsionicDicePool({
  character,
  persistence,
  total,
  used,
  disabled = false,
}: Props) {
  const latest=useOptimisticCharacterRef(character),busy=useRef(false),mounted=useRef(true);
  const [pending,setPending]=useState(false),modal=useModal(),{showToast}=useToast();
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  if (total <= 0) return null;
  const safeUsed = Math.max(0, Math.min(total, used));
  const remaining = total - safeUsed;

  function handleToggle(_idx: number, isExpending: boolean) {
    if (disabled||busy.current) return;
    busy.current=true;setPending(true);const id=latest.current.id;
    void payPsionicEnergy(persistence,latest,{requestId:crypto.randomUUID(),operation:isExpending?'spend':'recover-die',count:1,rolls:[],sourceFeature:isExpending?'Psionic Energy Dice':'Manual Energy Die recovery',recoveryNote:'Manual tracker adjustment only; no feature effect or dice roll was requested.'},
     {active:()=>mounted.current&&latest.current.id===id,confirm:modal.confirm,warn:message=>showToast(message,'warn')})
     .finally(()=>{busy.current=false;if(mounted.current)setPending(false);});
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <SlotBoxes
        total={total}
        used={safeUsed}
        onToggle={handleToggle}
        size="sm"
        palette={PALETTE_PSI}
        disabled={disabled||pending}
        ariaLabel="Psionic Energy Dice pool"
        ariaLabelPrefix="Psionic Energy Die"
        title={(_, available) =>
          available
            ? 'Spend a Psionic Energy Die (Short/Long Rest recovers)'
            : 'Restore a Psionic Energy Die'
        }
      />
      <span
        style={{
          fontFamily: 'var(--ff-stat)',
          fontSize: 11,
          fontWeight: 700,
          color: remaining > 0 ? '#c084fc' : 'var(--t-3)',
          letterSpacing: '0.04em',
          flexShrink: 0,
        }}
        title={`${remaining} of ${total} Psionic Energy Dice remaining`}
      >
        {remaining}/{total}
      </span>
    </span>
  );
}
