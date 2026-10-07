import {usePsionicEnhancements} from '../../lib/hooks/usePsionicEnhancements';
import PsionicPaymentRecoveryPanel from '../CharacterSheet/_shared/PsionicPaymentRecoveryPanel';
// The party panel has no optimistic save queue; snapshots still reject
// concurrent edits on the server. Recovery uses the same owner/DM checks.
const queue={flush:async()=>{},getSnapshot:()=>({pending:false,error:null})};
export default function PsionicPartyRestRecovery({characterId,name,onConfirmed}:{characterId:string;name:string;onConfirmed:()=>void}){
 const persistence=usePsionicEnhancements(characterId,queue,()=>onConfirmed());
 return <PsionicPaymentRecoveryPanel characterId={characterId} persistence={persistence} kindFilter="rest" label={`${name}: saved rest`}/>;
}
