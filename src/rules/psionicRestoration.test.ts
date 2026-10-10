import {describe,expect,it} from 'vitest';
import {psionicDieCount,psionicDieSides,psionicPoolRemaining,psionicRestorationStatus,restorePsionicDice} from './psionicRestoration';
const character={class_name:'Psion',level:5,class_resources:{'psionic-energy-dice':2,'psion-disciplines':['test'],'other':3},feature_uses:{Other:2}};
describe('Psionic Restoration',()=>{
  it.each([[5,6],[8,6],[9,8],[12,8],[13,10],[16,10],[17,12],[20,12]])('refills level %s to %s dice',(level,max)=>{
    expect(psionicDieCount(level)).toBe(max);
    const result=restorePsionicDice({...character,level});
    expect(result?.class_resources).toEqual({...character.class_resources,'psionic-energy-dice':max,'psionic-restoration':0});
    expect(result?.feature_uses).toEqual({Other:2,'Psionic Restoration':1});
    expect(restorePsionicDice({...character,...result})).toBeNull();
  });
  it('requires Psion level 5',()=>{
    expect(restorePsionicDice({...character,level:4})).toBeNull();
    expect(restorePsionicDice({...character,class_name:'Wizard'})).toBeNull();
  });
  it('does not waste a use on a full or uninitialized pool',()=>{
    expect(restorePsionicDice({...character,class_resources:{}})).toBeNull();
    expect(restorePsionicDice({...character,class_resources:{'psionic-energy-dice':6}})).toBeNull();
  });
  it('honors either existing spent-use representation',()=>{
    expect(psionicRestorationStatus({...character,feature_uses:{'Psionic Restoration':1}}).used).toBe(true);
    expect(restorePsionicDice({...character,class_resources:{...character.class_resources,'psionic-restoration':0}})).toBeNull();
  });
  it('a partial dice refill does not restore meditation; a long rest resets availability',()=>{
    const used=restorePsionicDice(character)!;
    expect(restorePsionicDice({...character,...used,class_resources:{...used.class_resources,'psionic-energy-dice':3}})).toBeNull();
    expect(restorePsionicDice({...character,feature_uses:{},class_resources:{'psionic-restoration':1,'psionic-energy-dice':0}})).not.toBeNull();
  });
});

// Every row of the owner-provided UA Energy Dice table, not inferred tiers.
it.each([
 [1,4,6],[2,4,6],[3,4,6],[4,4,6],[5,6,8],[6,6,8],[7,6,8],[8,6,8],
 [9,8,8],[10,8,8],[11,8,10],[12,8,10],[13,10,10],[14,10,10],[15,10,10],[16,10,10],
 [17,12,12],[18,12,12],[19,12,12],[20,12,12],
])('level %i has %i Energy Dice of d%i', (level,count,sides)=>{
 expect(psionicDieCount(level)).toBe(count);expect(psionicDieSides(level)).toBe(sides);
 expect(psionicPoolRemaining(level,undefined)).toBe(count);
 expect(psionicPoolRemaining(level,count)).toBe(count);
 expect(psionicPoolRemaining(level,count+1)).toBeNull();
});
it.each([NaN,Infinity,-1,1.5,'2',null,7])('does not restore a malformed level-five pool (%s)',pool=>{
 const invalid={...character,class_resources:{'psionic-energy-dice':pool}};
 expect(psionicPoolRemaining(5,pool)).toBeNull();
 expect(restorePsionicDice(invalid)).toBeNull();
 expect(psionicRestorationStatus(invalid).reason).toBe('Check Psionic Energy Dice');
 expect(psionicRestorationStatus(invalid).recovered).toBe(0);
});
it.each([NaN,Infinity,0,-1,5.5,21])('rejects invalid Psion level %s',level=>{
 expect(psionicPoolRemaining(level,2)).toBeNull();
 expect(restorePsionicDice({...character,level})).toBeNull();
});

it('restores a secondary Psion pool at its own level and preserves the other class',()=>{
 const c={...character,class_name:'Fighter',level:11,secondary_class:'Psion',secondary_level:5};
 const result=restorePsionicDice(c);
 expect(result?.class_resources).toEqual({...character.class_resources,'psionic-energy-dice':6,'psionic-restoration':0});
 expect(result?.feature_uses).toEqual({Other:2,'Psionic Restoration':1});
 expect(restorePsionicDice({...c,...result})).toBeNull();
 expect(restorePsionicDice({...c,secondary_level:4})).toBeNull();
});


it.each([null,'1',-1,2,0.5,NaN,Infinity])('rejects malformed remaining Restoration uses (%s)',value=>{
 const c={...character,class_resources:{...character.class_resources,'psionic-restoration':value}};
 expect(psionicRestorationStatus(c).reason).toBe('Check Psionic Restoration uses');
 expect(restorePsionicDice(c)).toBeNull();
});
it.each([null,'0',-1,0.5,NaN,Infinity])('rejects malformed spent Restoration uses (%s)',value=>{
 const c={...character,feature_uses:{'Psionic Restoration':value}} as unknown as typeof character;
 expect(psionicRestorationStatus(c).reason).toBe('Check Psionic Restoration uses');
 expect(restorePsionicDice(c)).toBeNull();
});
it('preserves legacy nonnegative spent counts as unavailable',()=>{
 expect(psionicRestorationStatus({...character,feature_uses:{'Psionic Restoration':2}}).reason).toBe('Used · Long Rest');
});
