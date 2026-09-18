import {beforeEach,it,expect,vi} from 'vitest';
const query=vi.hoisted(()=>({update:vi.fn(),eq:vi.fn(),select:vi.fn(),maybeSingle:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{from:()=>query}}));
import {setSceneBackground} from './scenes';
beforeEach(()=>{query.update.mockReturnValue(query);query.eq.mockReturnValue(query);query.select.mockReturnValue(query);});
it('confirms an updated scene',async()=>{query.maybeSingle.mockResolvedValue({data:{id:'scene'},error:null});expect(await setSceneBackground('scene','map.webp')).toBe(true);expect(query.eq).toHaveBeenCalledWith('id','scene');});
it('rejects a zero-row update',async()=>{query.maybeSingle.mockResolvedValue({data:null,error:null});expect(await setSceneBackground('scene','map.webp')).toBe(false);});
it('rejects database errors',async()=>{query.maybeSingle.mockResolvedValue({data:null,error:{message:'denied'}});expect(await setSceneBackground('scene','map.webp')).toBe(false);});
