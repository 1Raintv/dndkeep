import {afterEach,expect,it,vi} from 'vitest';
import {hasWarCaster,rollConcentrationCheck,concentrationDamageEffect} from './concentrationSave';
afterEach(()=>vi.restoreAllMocks());
it('recognizes the feat name without applying it to similarly named notes',()=>{
 expect(hasWarCaster([' War Caster '])).toBe(true);expect(hasWarCaster(['war caster'])).toBe(true);
 expect(hasWarCaster(['War Caster notes'])).toBe(false);expect(hasWarCaster(null)).toBe(false);
});
it('uses one die for an ordinary concentration save',()=>{
 const random=vi.spyOn(Math,'random').mockReturnValue(.475);
 expect(rollConcentrationCheck(5,15,false,false)).toEqual({rolls:[10],d20:10,total:15,passed:true});expect(random).toHaveBeenCalledTimes(1);
});
it.each([[3,17],[17,3],[17,17]])('retains both advantage dice %s and %s but only adds one to the bonus',(first,second)=>{
 vi.spyOn(Math,'random').mockReturnValueOnce((first-.5)/20).mockReturnValueOnce((second-.5)/20);
 expect(rollConcentrationCheck(2,19,true,false)).toEqual({rolls:[first,second],d20:17,total:19,passed:true});
});
it('a discarded natural one does not fail the selected higher roll',()=>{
 vi.spyOn(Math,'random').mockReturnValueOnce(0).mockReturnValueOnce(.975);
 expect(rollConcentrationCheck(0,30,true,true)).toMatchObject({d20:20,passed:true});
});
it('standard saves can still fail DC 30 with a selected natural twenty',()=>{
 vi.spyOn(Math,'random').mockReturnValue(.975);
 expect(rollConcentrationCheck(0,30,true,false)).toMatchObject({rolls:[20,20],d20:20,passed:false});
});

it('damage preview honors immunity, incapacitation, automation and the DC cap',()=>{
 expect(concentrationDamageEffect(0,10,true,false,'auto')).toEqual({kind:'none'});
 expect(concentrationDamageEffect(23,10,true,false,'prompt')).toEqual({kind:'save',dc:11});
 expect(concentrationDamageEffect(100,10,true,false,'auto')).toEqual({kind:'save',dc:30});
 expect(concentrationDamageEffect(1,0,true,false,'off')).toEqual({kind:'ends'});
 expect(concentrationDamageEffect(1,10,true,true,'off')).toEqual({kind:'ends'});
 expect(concentrationDamageEffect(1,10,true,false,'off')).toEqual({kind:'off'});
 expect(concentrationDamageEffect(1,10,false,false,'prompt')).toEqual({kind:'none'});
});
