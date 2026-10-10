// @vitest-environment happy-dom
import {cleanup,render} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import type {WeaponItem} from '../../types';
const m=vi.hoisted(()=>({attack:vi.fn()}));
vi.mock('../Combat/PlayerAttackButton',()=>({default:(props:unknown)=>{m.attack(props);return null;}}));
vi.mock('../../lib/supabase',()=>({supabase:{}}));
vi.mock('../../lib/gameUtils',()=>({rollDie:vi.fn(),computeActiveBonuses:()=>({})}));
vi.mock('../../context/DiceRollContext',()=>({useDiceRoll:()=>({triggerRoll:vi.fn()})}));
vi.mock('../shared/ActionLog',()=>({logAction:vi.fn()}));
import WeaponsTracker from './WeaponsTracker';
afterEach(()=>{cleanup();vi.clearAllMocks();});
it.each([{id:'unarmed',damageDice:'flat',source:'ability',expression:'4'},{id:'unarmed',damageDice:'1d8',source:'ability',expression:'1d8+4'},{id:'bow',damageDice:'1d8',source:'weapon',expression:'1d8+4'}])('declares $id with its actual source and valid damage expression',({id,damageDice,source,expression})=>{
 const weapon:WeaponItem={id,name:id,damageDice,damageBonus:4,attackBonus:5,damageType:'bludgeoning',range:id==='bow'?'Ranged':'Melee',properties:'',notes:''};
 render(<WeaponsTracker weapons={[weapon]} attacksPerAction={1} onUpdate={vi.fn()} historyCharacterId="hero"/>);
 expect(m.attack).toHaveBeenCalledWith(expect.objectContaining({source,damageDice:expression,attackMode:id==='bow'?'ranged':'melee'}));
});
