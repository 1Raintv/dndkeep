import {beforeEach,expect,it,vi} from 'vitest';
import {updateToken,deleteToken} from './sceneTokens';
import {updatePlacement,deletePlacement} from './scenePlacements';
const mock=vi.hoisted(()=>({result:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{from:()=>({update:()=>({eq:()=>({select:()=>({maybeSingle:mock.result})})}),delete:()=>({eq:()=>({select:()=>({maybeSingle:mock.result})})})})}}));
beforeEach(()=>vi.clearAllMocks());
for(const [name,save] of [['legacy update',()=>updateToken('a',{visibleToAll:false})],['placement update',()=>updatePlacement('a',{visibleToAll:false})],['legacy delete',()=>deleteToken('a')],['placement delete',()=>deletePlacement('a')]] as const) {
  it(`${name} rejects a missing row and confirms a returned row`,async()=>{
    mock.result.mockResolvedValue({data:null,error:null});expect(await save()).toBe(false);
    mock.result.mockResolvedValue({data:{id:'a'},error:null});expect(await save()).toBe(true);
  });
}
