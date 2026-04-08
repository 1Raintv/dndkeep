import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

// ── Shared types (copied from BattleMap to avoid circular imports) ─
interface MapToken {
  id: string; name: string; type: 'player'|'npc'|'object';
  col: number; row: number;
  character_id?: string; color: string; emoji: string;
  hp: number; max_hp: number; ac: number; speed: number;
  conditions: string[];
  str: number; dex: number; con: number; int: number; wis: number; cha: number;
  description: string; image_url: string; immunities: string;
  attack_name: string; attack_bonus: number; attack_damage: string; cr: string; xp: number;
  visible_to_players: boolean; is_hidden: boolean;
  revealed: { hp: boolean; ac: boolean; stats: boolean; description: boolean; immunities: boolean; attacks: boolean; };
}

interface BattleMapData {
  id: string; campaign_id: string; name: string; image_url: string;
  grid_cols: number; grid_rows: number; grid_size: number;
  tokens: MapToken[]; active: boolean;
  map_active_for_players: boolean; background_color: string;
}

const COND_COLOR: Record<string,string> = {
  Blinded:'#94a3b8',Charmed:'#f472b6',Deafened:'#78716c',Exhaustion:'#a78bfa',
  Frightened:'#fb923c',Grappled:'#84cc16',Incapacitated:'#f87171',Invisible:'#60a5fa',
  Paralyzed:'#e879f9',Petrified:'#6b7280',Poisoned:'#4ade80',Prone:'#fbbf24',
  Restrained:'#f97316',Stunned:'#c084fc',Unconscious:'#ef4444',
};

function hpColor(pct: number) { return pct>0.5?'#22c55e':pct>0.25?'#f59e0b':'#ef4444'; }
function mod(s: number) { return Math.floor((s-10)/2); }
function fmtMod(s: number) { const m=mod(s); return (m>=0?'+':'')+m; }

// ── Token Dot (player view — read only, shows fog for hidden) ─────
function PlayerToken({ token, selected, onClick }: {
  token: MapToken; selected: boolean; onClick: () => void;
}) {
  const pct = token.max_hp>0 ? token.hp/token.max_hp : 1;
  const isEnemy = token.type === 'npc';

  return (
    <div onClick={onClick} style={{
      position:'absolute', inset:3, borderRadius:'50%',
      background: token.color+'bb',
      border:`2px solid ${selected?'#fff':token.color}`,
      boxShadow: selected?`0 0 0 2px #fff,0 0 0 4px ${token.color}`:undefined,
      cursor:'pointer',
      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
      overflow:'hidden', userSelect:'none', transition:'box-shadow .15s',
    }}>
      <span style={{fontSize:16,lineHeight:1,pointerEvents:'none'}}>{token.emoji}</span>
      {token.conditions.length>0 && (
        <div style={{position:'absolute',top:2,right:2,width:7,height:7,borderRadius:'50%',background:'#f97316',border:'1px solid rgba(0,0,0,0.4)'}}/>
      )}
      {token.revealed.hp && token.max_hp>0 && (
        <div style={{position:'absolute',bottom:0,left:0,right:0,height:3,background:'rgba(0,0,0,0.4)'}}>
          <div style={{height:'100%',width:`${Math.max(0,Math.min(100,pct*100))}%`,background:hpColor(pct),transition:'width .3s'}}/>
        </div>
      )}
      {selected && (
        <div style={{position:'absolute',inset:-4,borderRadius:'50%',border:'2px dashed #fff',pointerEvents:'none',animation:'spin 4s linear infinite'}}/>
      )}
      {/* Fog indicator for unknown enemies */}
      {isEnemy && !token.revealed.hp && !token.revealed.ac && !token.revealed.stats && (
        <div style={{position:'absolute',bottom:3,left:0,right:0,fontSize:7,textAlign:'center',color:'rgba(255,255,255,0.4)'}}>???</div>
      )}
    </div>
  );
}

// ── Token Info Panel (player side — only revealed fields) ──────────
function PlayerTokenPanel({ token, onClose }: { token: MapToken; onClose: () => void }) {
  const pct = token.max_hp>0 ? token.hp/token.max_hp : 1;
  const anythingRevealed = token.revealed.hp || token.revealed.ac || token.revealed.stats || token.revealed.description || token.revealed.immunities || token.revealed.attacks;
  const isOwn = token.type === 'player';

  return (
    <div style={{
      width:260,flexShrink:0,
      background:'linear-gradient(160deg,#111827,#0d1117)',
      border:'1px solid var(--c-gold-bdr)',borderRadius:12,
      display:'flex',flexDirection:'column',overflow:'hidden',maxHeight:'75vh',
    }}>
      {/* Header */}
      <div style={{padding:'12px 14px',borderBottom:'1px solid var(--c-border)',
        display:'flex',alignItems:'center',gap:10,background:'rgba(212,160,23,0.06)'}}>
        <div style={{width:44,height:44,borderRadius:'50%',border:`2px solid ${token.color}`,overflow:'hidden',
          flexShrink:0,background:token.color+'20',display:'flex',alignItems:'center',justifyContent:'center'}}>
          {token.image_url
            ? <img src={token.image_url} style={{width:'100%',height:'100%',objectFit:'cover'}}/>
            : <span style={{fontSize:22}}>{token.emoji}</span>}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:800,fontSize:14,color:'var(--t-1)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{token.name}</div>
          <div style={{fontSize:10,color:'var(--t-3)',textTransform:'uppercase',letterSpacing:'0.08em'}}>
            {isOwn ? 'Player Character' : token.type==='npc' ? `NPC${token.cr&&token.cr!=='—'?` · CR ${token.cr}`:''}` : 'Object'}
          </div>
        </div>
        <button onClick={onClose} style={{background:'none',border:'none',color:'var(--t-2)',cursor:'pointer',fontSize:14}}>✕</button>
      </div>

      <div style={{flex:1,overflowY:'auto',padding:12,display:'flex',flexDirection:'column',gap:10}}>
        {/* Always show conditions */}
        {token.conditions.length>0 && (
          <div>
            <div style={{fontSize:10,color:'var(--t-3)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:5}}>Conditions</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
              {token.conditions.map(c=>(
                <span key={c} style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:99,
                  background:(COND_COLOR[c]??'#6b7280')+'22',border:`1px solid ${(COND_COLOR[c]??'#6b7280')}55`,
                  color:COND_COLOR[c]??'#9ca3af'}}>{c}</span>
              ))}
            </div>
          </div>
        )}

        {/* HP — revealed or own */}
        {(isOwn || token.revealed.hp) && token.max_hp>0 && (
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
              <span style={{fontSize:10,color:'var(--t-3)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em'}}>HP</span>
              <span style={{fontWeight:900,fontSize:18,color:hpColor(pct)}}>{token.hp}<span style={{fontSize:11,color:'var(--t-3)',fontWeight:400}}>/{token.max_hp}</span></span>
            </div>
            <div style={{height:6,borderRadius:3,background:'rgba(255,255,255,0.08)',overflow:'hidden'}}>
              <div style={{height:'100%',width:`${Math.max(0,Math.min(100,pct*100))}%`,background:hpColor(pct),transition:'width .3s'}}/>
            </div>
          </div>
        )}

        {/* AC + Speed */}
        {(isOwn || token.revealed.ac) && (
          <div style={{display:'flex',gap:6}}>
            <div style={{flex:1,background:'rgba(255,255,255,0.04)',borderRadius:7,padding:'6px 8px',textAlign:'center'}}>
              <div style={{fontSize:9,color:'var(--t-3)',textTransform:'uppercase',letterSpacing:'0.08em'}}>AC</div>
              <div style={{fontWeight:900,fontSize:20,color:'#60a5fa'}}>{token.ac}</div>
            </div>
            <div style={{flex:1,background:'rgba(255,255,255,0.04)',borderRadius:7,padding:'6px 8px',textAlign:'center'}}>
              <div style={{fontSize:9,color:'var(--t-3)',textTransform:'uppercase',letterSpacing:'0.08em'}}>Speed</div>
              <div style={{fontWeight:900,fontSize:20,color:'var(--c-gold-l)'}}>{token.speed}ft</div>
            </div>
          </div>
        )}

        {/* Attack */}
        {(isOwn || token.revealed.attacks) && token.attack_name && (
          <div style={{background:'rgba(239,68,68,0.06)',borderRadius:7,padding:'7px 10px',border:'1px solid rgba(239,68,68,0.2)'}}>
            <div style={{fontSize:9,color:'#f87171',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:3}}>{token.attack_name}</div>
            <div style={{fontWeight:700,fontSize:13,color:'var(--t-1)'}}>+{token.attack_bonus} to hit · {token.attack_damage}</div>
          </div>
        )}

        {/* Ability scores */}
        {(isOwn || token.revealed.stats) && (
          <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:4}}>
            {(['str','dex','con','int','wis','cha'] as const).map(ab=>(
              <div key={ab} style={{background:'rgba(255,255,255,0.04)',borderRadius:6,padding:'4px 3px',textAlign:'center'}}>
                <div style={{fontSize:8,color:'var(--t-3)',textTransform:'uppercase'}}>{ab}</div>
                <div style={{fontWeight:700,fontSize:13,color:'var(--t-1)'}}>{fmtMod(token[ab])}</div>
                <div style={{fontSize:9,color:'var(--t-3)'}}>{token[ab]}</div>
              </div>
            ))}
          </div>
        )}

        {/* Immunities */}
        {(isOwn || token.revealed.immunities) && token.immunities && (
          <div style={{fontSize:11,color:'#a78bfa',background:'rgba(167,139,250,0.08)',borderRadius:7,padding:'6px 10px',border:'1px solid rgba(167,139,250,0.2)'}}>
            <span style={{fontWeight:700,color:'var(--t-3)',fontSize:9,textTransform:'uppercase',letterSpacing:'0.08em'}}>Immunities: </span>
            {token.immunities}
          </div>
        )}

        {/* Description */}
        {(isOwn || token.revealed.description) && token.description && (
          <div>
            <div style={{fontSize:10,color:'var(--t-3)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:5}}>About</div>
            <p style={{margin:0,fontSize:12,color:'var(--t-2)',lineHeight:1.6,fontFamily:'var(--ff-body)'}}>{token.description}</p>
          </div>
        )}

        {/* Fog of war — nothing revealed yet */}
        {!isOwn && !anythingRevealed && token.conditions.length===0 && (
          <div style={{textAlign:'center',padding:'20px 0',color:'var(--t-3)',fontSize:12}}>
            <div style={{fontSize:28,marginBottom:8}}>🌫️</div>
            <div style={{fontWeight:700,marginBottom:4}}>Unknown</div>
            <div style={{fontSize:11}}>The DM hasn't revealed information about this creature yet.</div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Player Battle Map ──────────────────────────────────────────────
export default function PlayerBattleMap({ campaignId, myCharacterId }: {
  campaignId: string;
  myCharacterId?: string;
}) {
  const [map, setMap] = useState<BattleMapData|null>(null);
  const [selected, setSelected] = useState<string|null>(null);

  useEffect(() => {
    loadMap();
    const ch = supabase.channel(`pbmap:${campaignId}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'battle_maps',
        filter:`campaign_id=eq.${campaignId}`},p=>{
          if(p.eventType==='UPDATE'||p.eventType==='INSERT'){
            const u=p.new as BattleMapData;
            setMap(prev=>prev?.id===u.id?{...prev,...u}:u);
          }
        })
      .subscribe();
    return ()=>{ supabase.removeChannel(ch); };
  },[campaignId]);

  async function loadMap(){
    const {data}=await supabase.from('battle_maps').select('*')
      .eq('campaign_id',campaignId).eq('active',true).maybeSingle();
    setMap(data);
  }

  const gridSize = map?.grid_size ?? 48;
  const visibleTokens = (map?.tokens??[]).filter(t=>!t.is_hidden);
  const selectedToken = visibleTokens.find(t=>t.id===selected)??null;

  if(!map || !map.map_active_for_players){
    return (
      <div style={{padding:'48px 20px',textAlign:'center',border:'1px dashed var(--c-border)',borderRadius:12}}>
        <div style={{fontSize:32,marginBottom:12}}>🗺️</div>
        <div style={{fontSize:14,fontWeight:700,color:'var(--t-1)',marginBottom:6}}>Battle Map</div>
        <div style={{fontSize:12,color:'var(--t-3)'}}>Waiting for your DM to open the map…</div>
      </div>
    );
  }

  return (
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      <div style={{fontSize:11,color:'var(--t-3)',display:'flex',alignItems:'center',gap:6}}>
        <div style={{width:8,height:8,borderRadius:'50%',background:'#22c55e',boxShadow:'0 0 6px #22c55e'}}/>
        <span style={{color:'#22c55e',fontWeight:600}}>{map.name}</span>
        <span>· {visibleTokens.length} tokens · Click any token to inspect</span>
      </div>

      <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
        {/* Token panel */}
        {selectedToken && (
          <PlayerTokenPanel token={selectedToken} onClose={()=>setSelected(null)}/>
        )}

        {/* Grid */}
        <div style={{flex:1,overflowX:'auto',overflowY:'auto',maxHeight:'72vh',
          border:'1px solid var(--c-border)',borderRadius:10,
          background:map.background_color||'#0d1117'}}>
          <div style={{position:'relative',
            width:map.grid_cols*gridSize,height:map.grid_rows*gridSize,
            backgroundImage:map.image_url?`url(${map.image_url})`:'none',
            backgroundSize:'cover',backgroundPosition:'center'}}>
            {/* Grid lines */}
            <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
              {Array.from({length:map.grid_cols+1},(_,i)=>(
                <line key={`v${i}`} x1={i*gridSize} y1={0} x2={i*gridSize} y2={map.grid_rows*gridSize}
                  stroke="rgba(255,255,255,0.06)" strokeWidth={1}/>
              ))}
              {Array.from({length:map.grid_rows+1},(_,i)=>(
                <line key={`h${i}`} x1={0} y1={i*gridSize} x2={map.grid_cols*gridSize} y2={i*gridSize}
                  stroke="rgba(255,255,255,0.06)" strokeWidth={1}/>
              ))}
            </svg>

            {/* Tokens */}
            {visibleTokens.map(token=>(
              <div key={token.id} style={{
                position:'absolute',
                left:(token.col-1)*gridSize,top:(token.row-1)*gridSize,
                width:gridSize,height:gridSize,zIndex:selected===token.id?10:5,
                transition:'left .25s,top .25s',
              }}>
                <PlayerToken
                  token={token} selected={selected===token.id}
                  onClick={()=>setSelected(prev=>prev===token.id?null:token.id)}
                />
                {/* Name label — player only sees NPC name if not hidden */}
                <div style={{
                  position:'absolute',bottom:-15,left:'50%',transform:'translateX(-50%)',
                  fontSize:9,fontWeight:700,color:'#fff',whiteSpace:'nowrap',
                  textShadow:'0 1px 3px rgba(0,0,0,0.9)',pointerEvents:'none',
                }}>
                  {token.type==='player'||token.visible_to_players
                    ? (token.name.length>8?token.name.slice(0,8)+'…':token.name)
                    : '???'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{display:'flex',gap:12,fontSize:10,color:'var(--t-3)',flexWrap:'wrap'}}>
        <span>🟢 Full HP · 🟡 Bloodied (&lt;50%) · 🔴 Critical (&lt;25%)</span>
        <span>🟠 dot = conditions · 🌫️ = DM hasn't revealed info yet</span>
        <span>· Click any token to inspect</span>
      </div>

      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
