import {expect,it} from 'vitest';
import {spellActionKind,recoverableSpellAction} from './spellActionCost';
it.each([['1 Action','action'],['1 Bonus Action','bonusAction'],['Reaction, when struck','reaction'],['1 minute','action'],['1 hour','action'],['Reaction, when a creature takes a Bonus Action','reaction'],['Special',undefined]] as const)('captures %s without assuming every non-bonus casting is an action',(time,kind)=>expect(spellActionKind(time)).toBe(kind));
const action={encounterId:'e',turnId:'t',currentTurnId:'t',kind:'reaction'} as const;
it('restores only a server-confirmed current action, never an old or unknown turn',()=>{
 expect(recoverableSpellAction(action,{id:'e',status:'active',psionic_turn_id:'t'})).toBe('reaction');
 for(const encounter of [null,{id:'other',status:'active',psionic_turn_id:'t'},{id:'e',status:'ended',psionic_turn_id:'t'},{id:'e',status:'active',psionic_turn_id:'new'}])expect(recoverableSpellAction(action,encounter)).toBeNull();
 for(const record of [null,{...action,currentTurnId:null},{...action,currentTurnId:'new'}])expect(recoverableSpellAction(record,{id:'e',status:'active',psionic_turn_id:'t'})).toBeNull();
});

it('keeps absent casting times unknown without crashing recovery',()=>{expect(spellActionKind(null)).toBeUndefined();expect(spellActionKind(undefined)).toBeUndefined();});
