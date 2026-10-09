import {expect,it} from 'vitest';
import {validPropelSave} from './propelSaveDetails';
const evidence={participantId:'target',outcome:'failed',dc:15,d20:3,bonus:2,total:5,rolls:[3],advantage:false,naturalExtremes:false};
it('records manual or willing results without inventing dice',()=>{expect(validPropelSave(null,'passed')).toBe(true);expect(validPropelSave({participantId:'target',outcome:'auto-failed',dc:15},'failed','target')).toBe(true);});
it.each([{participantId:'other'},{total:6},{rolls:[4]},{advantage:true},{naturalExtremes:undefined},{outcome:'passed'},{outcome:'auto-failed'},{dc:-1},{extra:'ignored'}])('rejects inconsistent save evidence %j',patch=>{expect(validPropelSave({...evidence,...patch},'failed','target')).toBe(false);});
it('keeps both advantage dice and honors explicit natural-extremes house rules',()=>{expect(validPropelSave({...evidence,d20:12,total:14,rolls:[3,12],advantage:true},'failed','target')).toBe(true);expect(validPropelSave({...evidence,d20:20,total:22,rolls:[20],dc:25},'failed','target')).toBe(true);expect(validPropelSave({...evidence,d20:20,total:22,rolls:[20],dc:25,outcome:'passed',naturalExtremes:true},'passed','target')).toBe(true);});
it('does not attach a save to cancellation',()=>{expect(validPropelSave(evidence,'cancelled','target')).toBe(false);});
