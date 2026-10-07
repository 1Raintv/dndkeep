import {expect,it,vi} from 'vitest';
vi.mock('../../../lib/supabase',()=>({supabase:{}}));
import {PsionicRequestError,type PsionicEnhancementPersistence} from '../../../lib/api/psionicTurns';
import type {Character} from '../../../types';
import {payPsionicEnergy} from './payPsionicEnergy';
const request={requestId:'one-use',operation:'spend' as const,count:2,rolls:[2,3],sourceFeature:'Biofeedback'};
const receipt={requestId:'one-use',remaining:4,restorationResource:null,restorationUsed:null,energyRevision:1,rolls:[2,3],replayed:false};
function setup(){
 const latest={current:{id:'hero',class_resources:{'psionic-energy-dice':6,other:9}} as unknown as Character};
 const service:PsionicEnhancementPersistence={energy:vi.fn(),spend:vi.fn(),surge:vi.fn(),getTurn:vi.fn()};
 const options={active:()=>true,confirm:vi.fn(async()=>true),warn:vi.fn()};
 return {latest,service,options};
}
it('retries the identical saved Energy Dice request and accepts the receipt',async()=>{
 const {latest,service,options}=setup();vi.mocked(service.energy).mockRejectedValueOnce(new Error('Lost response')).mockResolvedValueOnce({...receipt,replayed:true});
 expect(await payPsionicEnergy(service,latest,request,options)).toMatchObject({remaining:4,replayed:true});
 expect(vi.mocked(service.energy).mock.calls).toEqual([[request],[request]]);
 expect(latest.current.class_resources).toEqual({'psionic-energy-dice':4,other:9});
});
it('does not change a new character when an older payment completes',async()=>{
 const {latest,service,options}=setup();let finish!:(r:typeof receipt)=>void;vi.mocked(service.energy).mockReturnValue(new Promise(resolve=>{finish=resolve;}));
 const pending=payPsionicEnergy(service,latest,request,options);latest.current={...latest.current,id:'other'};finish(receipt);
 expect(await pending).toEqual(receipt);expect(latest.current.class_resources?.['psionic-energy-dice']).toBe(6);
});
it('never applies an unconfirmed or rejected payment to the local pool',async()=>{
 for(const error of [new Error('Lost response'),new PsionicRequestError('Not enough dice',true)]){
  const {latest,service,options}=setup();options.confirm.mockResolvedValue(false);vi.mocked(service.energy).mockRejectedValue(error);
  expect(await payPsionicEnergy(service,latest,request,options)).toBeNull();expect(latest.current.class_resources?.['psionic-energy-dice']).toBe(6);expect(service.energy).toHaveBeenCalledTimes(1);
 }
});
