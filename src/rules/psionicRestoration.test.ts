import {describe,expect,it} from 'vitest';
import {psionicDieCount,psionicRestorationStatus,restorePsionicDice} from './psionicRestoration';
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
