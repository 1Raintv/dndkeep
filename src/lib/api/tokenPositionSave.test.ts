import { beforeEach, expect, it, vi } from 'vitest';
import { updateTokenPos } from './sceneTokens';
import { updatePlacementPos } from './scenePlacements';
const mock=vi.hoisted(()=>({result:vi.fn()}));
vi.mock('../supabase',()=>({supabase:{from:()=>({update:()=>({eq:()=>({select:()=>({maybeSingle:mock.result})})})})}}));
beforeEach(()=>vi.clearAllMocks());
for(const [name,save] of [['legacy',updateTokenPos],['placements',updatePlacementPos]] as const) {
  it(`${name}: refuses an RLS-filtered or missing row`,async()=>{
    mock.result.mockResolvedValue({data:null,error:null});
    expect(await save('a',35,105)).toMatchObject({ok:false,reason:'other'});
  });
  it(`${name}: only confirms a returned saved row`,async()=>{
    mock.result.mockResolvedValue({data:{id:'a'},error:null});
    expect(await save('a',35,105)).toEqual({ok:true});
  });
}
