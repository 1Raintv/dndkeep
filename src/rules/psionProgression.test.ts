import {expect,it} from 'vitest';
import {psionProgression} from './psionProgression';
it('uses Psion levels and subclass in either class order',()=>{
 const expected={level:7,subclass:'Telepath',totalLevel:10};
 expect(psionProgression({class_name:'Psion',level:7,subclass:'Telepath',secondary_class:'Fighter',secondary_level:3,secondary_subclass:'Champion'})).toEqual(expected);
 expect(psionProgression({class_name:'Fighter',level:3,subclass:'Champion',secondary_class:'Psion',secondary_level:7,secondary_subclass:'Telepath'})).toEqual(expected);
});
it('does not infer a class from orphaned levels or an unlevelled selection',()=>{
 expect(psionProgression({class_name:'Fighter',level:7,secondary_level:7})).toBeNull();
 expect(psionProgression({class_name:'Fighter',level:7,secondary_class:'Psion',secondary_level:0})).toBeNull();
 expect(psionProgression({class_name:'Psion',level:7,secondary_level:19})?.totalLevel).toBe(7);
});
it.each([0,-1,1.5,21,NaN,Infinity])('rejects invalid primary level %s',level=>{
 expect(psionProgression({class_name:'Psion',level})).toBeNull();
 expect(psionProgression({class_name:'Fighter',level,secondary_class:'Psion',secondary_level:7})).toBeNull();
});
it.each([-1,1.5,NaN,Infinity,20])('rejects invalid combined progression with secondary %s',secondary_level=>{
 expect(psionProgression({class_name:'Psion',level:7,secondary_class:'Fighter',secondary_level})).toBeNull();
 expect(psionProgression({class_name:'Fighter',level:7,secondary_class:'Psion',secondary_level})).toBeNull();
});
it('rejects duplicated classes and absent primary identity',()=>{
 expect(psionProgression({class_name:'Psion',level:7,secondary_class:'Psion',secondary_level:7})).toBeNull();
 expect(psionProgression({class_name:'',level:1,secondary_class:'Psion',secondary_level:7})).toBeNull();
});
