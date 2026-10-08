import {expect,it} from 'vitest';
import {formatOutcomesLog,type TargetOutcome} from './classAbilityOutcomes';
const outcome:TargetOutcome={participantId:'target',participantName:'Psion',outcome:'passed',d20:17,total:24,bonus:7,rolls:[3,17],advantage:true};
it('preserves both Guards dice alongside the kept result in history',()=>{
 expect(formatOutcomesLog('Mind trial',18,'INT',[outcome])).toBe('Mind trial · DC 18 INT · Psion: passed (d20=17+7=24) [Psionic Guards: 3 or 17; keep highest]');
});
it('normal and manual saves do not acquire a protection claim',()=>{
 expect(formatOutcomesLog('Trial',18,'INT',[{...outcome,advantage:false}])).not.toContain('Guards');
 expect(formatOutcomesLog('Trial',18,'INT',[{participantId:'target',participantName:'Psion',outcome:'auto-failed'}])).toBe('Trial · DC 18 INT · Psion: willing');
});
