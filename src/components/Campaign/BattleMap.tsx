import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { MONSTERS } from '../../data/monsters';
import { DMRollRequestPanel } from './RollRequest';
import { logRoll } from '../CharacterSheet/QuickRoll';

// ── Types ──────────────────────────────────────────────────────────
interface MapToken {
  id: string;
  name: string;
  type: 'player' | 'npc' | 'object';
  col: number; row: number;
  character_id?: string;
  npc_roster_id?: string;
  color: string; emoji: string;
  hp: number; max_hp: number; ac: number; speed: number;
  conditions: string[];
  str: number; dex: number; con: number; int: number; wis: number; cha: number;
  description: string;
  image_url: string;
  immunities: string;
  attack_name: string; attack_bonus: number; attack_damage: string;
  cr: string; xp: number;
  visible_to_players: boolean;
  is_hidden: boolean;
  // What fields the DM has revealed to players
  revealed: {
    hp: boolean; ac: boolean; stats: boolean;
    description: boolean; immunities: boolean; attacks: boolean;
  };
}

interface BattleMapData {
  id: string; campaign_id: string; name: string; image_url: string;
  grid_cols: number; grid_rows: number; grid_size: number;
  tokens: MapToken[]; active: boolean;
  map_active_for_players: boolean; background_color: string;
}

interface TokenNote {
  id: string; campaign_id: string; token_key: string;
  author_id: string; author_name: string; note: string; created_at: string;
}

interface DMRosterNPC {
  id: string; owner_id: string; campaign_id?: string;
  name: string; type: string; cr: string; size: string;
  hp: number; max_hp: number; ac: number; speed: number;
  str: number; dex: number; con: number; int: number; wis: number; cha: number;
  attack_name: string; attack_bonus: number; attack_damage: string; xp: number;
  description: string; traits: string; immunities: string;
  image_url?: string; emoji: string; color: string;
  source_monster_id?: string; times_used: number;
}

interface PlayerChar {
  id: string; name: string; class_name: string; level: number;
  current_hp: number; max_hp: number; armor_class: number;
  active_conditions: string[];
  strength: number; dexterity: number; constitution: number;
  intelligence: number; wisdom: number; charisma: number; speed: number;
}

interface BattleMapProps {
  campaignId: string; isDM: boolean; userId: string;
  playerCharacters?: PlayerChar[];
  onConditionApplied?: (characterId: string, conditions: string[]) => void;
}

const ALL_CONDITIONS = [
  'Blinded','Charmed','Deafened','Exhaustion','Frightened',
  'Grappled','Incapacitated','Invisible','Paralyzed','Petrified',
  'Poisoned','Prone','Restrained','Stunned','Unconscious',
];
const COND_COLOR: Record<string,string> = {
  Blinded:'#94a3b8',Charmed:'#f472b6',Deafened:'#78716c',Exhaustion:'#a78bfa',
  Frightened:'#fb923c',Grappled:'#84cc16',Incapacitated:'#f87171',Invisible:'#60a5fa',
  Paralyzed:'#e879f9',Petrified:'#6b7280',Poisoned:'#4ade80',Prone:'#fbbf24',
  Restrained:'#f97316',Stunned:'#c084fc',Unconscious:'#ef4444',
};
const TOKEN_EMOJIS = ['⚔️','🛡️','🏹','🧙','🧝','🧟','👹','👺','🐉','🐺','🐗','💀','👻','🔥','❄️','⚡','🌊','🌿','🗡️','🪄','🐍','🦅','🐻','🦁','🐊','👤'];
const TOKEN_COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#6366f1','#a855f7','#ec4899','#14b8a6','#f59e0b','#64748b','#ffffff'];
const MOD = (s:number) => Math.floor((s-10)/2);
const FMT_MOD = (s:number) => { const m=MOD(s); return (m>=0?'+':'')+m; };

function hpColor(pct:number){ return pct>0.5?'#22c55e':pct>0.25?'#f59e0b':'#ef4444'; }

// ── Token dot on grid ─────────────────────────────────────────────
function TokenDot({ token, selected, dragging, onClick, onDragStart, isDM }:{
  token:MapToken; selected:boolean; dragging:boolean;
  onClick:()=>void; onDragStart:(e:React.DragEvent)=>void; isDM:boolean;
}) {
  const pct = token.max_hp>0 ? token.hp/token.max_hp : 1;
  const showHp = isDM || token.revealed.hp;
  return (
    <div draggable={isDM} onDragStart={onDragStart} onClick={onClick} title={isDM||token.visible_to_players?token.name:'???'}
      style={{
        position:'absolute',inset:3,borderRadius:'50%',
        background: token.is_hidden&&!isDM ? 'transparent' : token.color+'bb',
        border:`2px solid ${selected?'#fff':token.color}`,
        boxShadow: selected?`0 0 0 2px #fff,0 0 0 4px ${token.color}`:undefined,
        cursor:isDM?'grab':'pointer',
        opacity:(token.is_hidden&&!isDM)?0:dragging?0.35:1,
        display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
        overflow:'hidden',userSelect:'none',transition:'box-shadow .15s,opacity .15s',
      }}>
      <span style={{fontSize:16,lineHeight:1,pointerEvents:'none'}}>
        {(!isDM&&token.is_hidden)?'👁':token.emoji}
      </span>
      {token.conditions.length>0&&(
        <div style={{position:'absolute',top:2,right:2,width:7,height:7,borderRadius:'50%',background:'#f97316',border:'1px solid rgba(0,0,0,0.4)'}}/>
      )}
      {showHp&&token.max_hp>0&&(
        <div style={{position:'absolute',bottom:0,left:0,right:0,height:3,background:'rgba(0,0,0,0.4)'}}>
          <div style={{height:'100%',width:`${Math.max(0,Math.min(100,pct*100))}%`,background:hpColor(pct),transition:'width .3s'}}/>
        </div>
      )}
      {selected&&(
        <div style={{position:'absolute',inset:-4,borderRadius:'50%',border:'2px dashed #fff',pointerEvents:'none',animation:'spin 4s linear infinite'}}/>
      )}
    </div>
  );
}

// ── Left panel: Token Detail ──────────────────────────────────────
function TokenDetailPanel({ token, isDM, notes, userId, userName, campaignId, onUpdateToken, onApplyCond, onRemoveCond, onUpdateHP, onDeleteToken, onToggleHide, onReveal, onClose }:{
  token:MapToken; isDM:boolean; notes:TokenNote[];
  userId:string; userName:string; campaignId:string;
  onUpdateToken:(id:string, u:Partial<MapToken>)=>void;
  onApplyCond:(c:string)=>void; onRemoveCond:(c:string)=>void;
  onUpdateHP:(delta:number, mode:'damage'|'heal'|'set')=>void;
  onDeleteToken:()=>void; onToggleHide:()=>void;
  onReveal:(field:keyof MapToken['revealed'], val:boolean)=>void;
  onClose:()=>void;
}) {
  const [hpInput,setHpInput]=useState('');
  const [hpMode,setHpMode]=useState<'damage'|'heal'|'set'>('damage');
  const [newNote,setNewNote]=useState('');
  const [editDesc,setEditDesc]=useState(false);
  const [descDraft,setDescDraft]=useState(token.description);
  const [uploadingImg,setUploadingImg]=useState(false);
  const fileRef=useRef<HTMLInputElement>(null);
  const pct=token.max_hp>0?token.hp/token.max_hp:1;

  async function submitNote(){
    if(!newNote.trim())return;
    await supabase.from('token_notes').insert({
      campaign_id:campaignId, token_key:token.id,
      author_id:userId, author_name:userName, note:newNote.trim(),
    });
    setNewNote('');
  }

  async function deleteNote(noteId:string){
    await supabase.from('token_notes').delete().eq('id',noteId);
  }

  async function uploadImage(file:File){
    setUploadingImg(true);
    const ext=file.name.split('.').pop();
    const path=`token-images/${campaignId}/${token.id}.${ext}`;
    const { error } = await supabase.storage.from('avatars').upload(path,file,{upsert:true});
    if(!error){
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      onUpdateToken(token.id,{image_url:data.publicUrl});
    }
    setUploadingImg(false);
  }

  const REVEAL_FIELDS: {key:keyof MapToken['revealed'],label:string}[] = [
    {key:'hp',label:'HP Bar'},{key:'ac',label:'AC'},{key:'stats',label:'Ability Scores'},
    {key:'attacks',label:'Attack'},{key:'immunities',label:'Immunities'},{key:'description',label:'Description'},
  ];

  // What a player sees depends on revealed flags
  const showHp = isDM || token.revealed.hp;
  const showAc = isDM || token.revealed.ac;
  const showStats = isDM || token.revealed.stats;
  const showAttacks = isDM || token.revealed.attacks;
  const showImmunities = isDM || token.revealed.immunities;
  const showDescription = isDM || token.revealed.description;

  return (
    <div style={{width:280,flexShrink:0,background:'linear-gradient(160deg,#111827,#0d1117)',border:'1px solid var(--c-gold-bdr)',borderRadius:12,display:'flex',flexDirection:'column',overflow:'hidden',maxHeight:'80vh'}}>
      {/* Header */}
      <div style={{padding:'12px 14px',borderBottom:'1px solid var(--c-border)',display:'flex',alignItems:'center',gap:10,background:'rgba(212,160,23,0.06)'}}>
        {/* Token image or emoji */}
        <div style={{width:48,height:48,borderRadius:'50%',border:`2px solid ${token.color}`,overflow:'hidden',flexShrink:0,background:token.color+'20',
          display:'flex',alignItems:'center',justifyContent:'center',cursor:isDM?'pointer':undefined,position:'relative'}}
          onClick={isDM?()=>fileRef.current?.click():undefined}>
          {token.image_url ? (
            <img src={token.image_url} style={{width:'100%',height:'100%',objectFit:'cover'}}/>
          ) : (
            <span style={{fontSize:24}}>{token.emoji}</span>
          )}
          {isDM&&<div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',opacity:0,transition:'opacity .15s'}} className="hover-show">📷</div>}
        </div>
        <input type="file" accept="image/*" ref={fileRef} style={{display:'none'}} onChange={e=>e.target.files?.[0]&&uploadImage(e.target.files[0])}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:800,fontSize:14,color:'var(--t-1)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{token.name}</div>
          <div style={{fontSize:10,color:'var(--t-3)',textTransform:'uppercase',letterSpacing:'0.08em'}}>
            {token.type==='player'?'Player':token.type==='npc'?`NPC · CR ${token.cr}`:'Object'}
          </div>
          {isDM&&<div style={{fontSize:9,color:token.is_hidden?'#f97316':'#22c55e',marginTop:2}}>{token.is_hidden?'👁 Hidden from players':'👁 Visible to players'}</div>}
        </div>
        <button onClick={onClose} style={{background:'none',border:'none',color:'var(--t-2)',cursor:'pointer',fontSize:14,padding:'2px 4px',flexShrink:0}}>✕</button>
      </div>

      <div style={{flex:1,overflowY:'auto',padding:12,display:'flex',flexDirection:'column',gap:12}}>

        {/* HP */}
        {showHp&&(
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
        <div style={{display:'flex',gap:6}}>
          {showAc&&<div style={{flex:1,background:'rgba(255,255,255,0.04)',borderRadius:7,padding:'6px 8px',textAlign:'center'}}>
            <div style={{fontSize:9,color:'var(--t-3)',textTransform:'uppercase',letterSpacing:'0.08em'}}>AC</div>
            <div style={{fontWeight:900,fontSize:20,color:'#60a5fa'}}>{token.ac}</div>
          </div>}
          <div style={{flex:1,background:'rgba(255,255,255,0.04)',borderRadius:7,padding:'6px 8px',textAlign:'center'}}>
            <div style={{fontSize:9,color:'var(--t-3)',textTransform:'uppercase',letterSpacing:'0.08em'}}>Speed</div>
            <div style={{fontWeight:900,fontSize:20,color:'var(--c-gold-l)'}}>{token.speed}</div>
          </div>
          {showAttacks&&token.attack_name&&(
            <div style={{flex:2,background:'rgba(239,68,68,0.06)',borderRadius:7,padding:'6px 8px',border:'1px solid rgba(239,68,68,0.2)'}}>
              <div style={{fontSize:9,color:'#f87171',textTransform:'uppercase',letterSpacing:'0.08em'}}>{token.attack_name}</div>
              <div style={{fontWeight:700,fontSize:12,color:'var(--t-1)',marginTop:2}}>+{token.attack_bonus} · {token.attack_damage}</div>
            </div>
          )}
        </div>

        {/* Ability scores */}
        {showStats&&(
          <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:4}}>
            {(['str','dex','con','int','wis','cha'] as const).map(ab=>(
              <div key={ab} style={{background:'rgba(255,255,255,0.04)',borderRadius:6,padding:'4px 3px',textAlign:'center'}}>
                <div style={{fontSize:8,color:'var(--t-3)',textTransform:'uppercase'}}>{ab}</div>
                <div style={{fontWeight:700,fontSize:13,color:'var(--t-1)'}}>{FMT_MOD(token[ab])}</div>
                <div style={{fontSize:9,color:'var(--t-3)'}}>{token[ab]}</div>
              </div>
            ))}
          </div>
        )}

        {/* Immunities */}
        {showImmunities&&token.immunities&&(
          <div style={{fontSize:11,color:'#a78bfa',background:'rgba(167,139,250,0.08)',borderRadius:7,padding:'6px 10px',border:'1px solid rgba(167,139,250,0.2)'}}>
            <span style={{fontWeight:700,color:'var(--t-3)',fontSize:9,textTransform:'uppercase',letterSpacing:'0.08em'}}>Immunities: </span>
            {token.immunities}
          </div>
        )}

        {/* Conditions */}
        {token.conditions.length>0&&(
          <div>
            <div style={{fontSize:10,color:'var(--t-3)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:5}}>Conditions</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
              {token.conditions.map(c=>(
                <span key={c} onClick={isDM?()=>onRemoveCond(c):undefined} style={{
                  fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:99,
                  background:(COND_COLOR[c]??'#6b7280')+'22',border:`1px solid ${(COND_COLOR[c]??'#6b7280')}55`,
                  color:COND_COLOR[c]??'#9ca3af',cursor:isDM?'pointer':undefined,
                }}>{c}{isDM&&' ✕'}</span>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        {showDescription&&(
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5}}>
              <div style={{fontSize:10,color:'var(--t-3)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em'}}>Description</div>
              {isDM&&<button onClick={()=>{setEditDesc(v=>!v);setDescDraft(token.description)}} style={{fontSize:9,background:'none',border:'none',color:'var(--c-gold-l)',cursor:'pointer'}}>
                {editDesc?'Cancel':'Edit'}
              </button>}
            </div>
            {editDesc&&isDM ? (
              <div style={{display:'flex',flexDirection:'column',gap:5}}>
                <textarea value={descDraft} onChange={e=>setDescDraft(e.target.value)} rows={4}
                  style={{fontSize:12,resize:'vertical',fontFamily:'var(--ff-body)'}}/>
                <button onClick={()=>{onUpdateToken(token.id,{description:descDraft});setEditDesc(false)}}
                  className="btn-gold btn-sm" style={{alignSelf:'flex-end'}}>Save</button>
              </div>
            ) : (
              <p style={{fontSize:12,color:'var(--t-2)',lineHeight:1.6,margin:0,fontFamily:'var(--ff-body)'}}>
                {token.description||<span style={{color:'var(--t-3)',fontStyle:'italic'}}>No description yet.</span>}
              </p>
            )}
          </div>
        )}

        {/* ── DM Controls ── */}
        {isDM&&(
          <>
            {/* HP adjust */}
            <div style={{borderTop:'1px solid var(--c-border)',paddingTop:10}}>
              <div style={{fontSize:10,color:'var(--c-gold-l)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>DM Controls</div>
              <div style={{display:'flex',gap:4,marginBottom:6}}>
                {(['damage','heal','set'] as const).map(m=>(
                  <button key={m} onClick={()=>setHpMode(m)} style={{
                    flex:1,fontSize:9,fontWeight:700,padding:'3px 4px',borderRadius:5,cursor:'pointer',
                    border:`1px solid ${m==='damage'?'rgba(239,68,68,0.4)':m==='heal'?'rgba(34,197,94,0.4)':'rgba(96,165,250,0.4)'}`,
                    background:hpMode===m?(m==='damage'?'rgba(239,68,68,0.15)':m==='heal'?'rgba(34,197,94,0.15)':'rgba(96,165,250,0.15)'):'transparent',
                    color:hpMode===m?(m==='damage'?'#ef4444':m==='heal'?'#22c55e':'#60a5fa'):'var(--t-2)',
                  }}>{m}</button>
                ))}
              </div>
              <div style={{display:'flex',gap:5}}>
                <input type="number" value={hpInput} onChange={e=>setHpInput(e.target.value)} placeholder="Amount"
                  style={{flex:1,fontSize:12,padding:'5px 8px'}}
                  onKeyDown={e=>{ if(e.key==='Enter'&&hpInput){onUpdateHP(parseInt(hpInput),hpMode);setHpInput('');} }}/>
                <button onClick={()=>{if(hpInput){onUpdateHP(parseInt(hpInput),hpMode);setHpInput('');}}}
                  style={{fontSize:11,fontWeight:700,padding:'5px 10px',borderRadius:6,cursor:'pointer',
                    border:'1px solid var(--c-gold-bdr)',background:'var(--c-gold-bg)',color:'var(--c-gold-l)'}}>Apply</button>
              </div>
            </div>

            {/* Apply conditions */}
            <div>
              <div style={{fontSize:10,color:'var(--t-3)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:5}}>Apply Condition</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
                {ALL_CONDITIONS.filter(c=>!token.conditions.includes(c)).map(c=>(
                  <button key={c} onClick={()=>onApplyCond(c)} style={{
                    fontSize:9,fontWeight:600,padding:'2px 7px',borderRadius:99,cursor:'pointer',
                    border:`1px solid ${(COND_COLOR[c]??'#6b7280')}44`,
                    background:(COND_COLOR[c]??'#6b7280')+'11',color:COND_COLOR[c]??'#9ca3af',
                  }}>{c}</button>
                ))}
              </div>
            </div>

            {/* Reveal controls */}
            <div>
              <div style={{fontSize:10,color:'var(--t-3)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>Reveal to Players</div>
              <div style={{display:'flex',flexDirection:'column',gap:4}}>
                {REVEAL_FIELDS.map(({key,label})=>(
                  <label key={key} style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:11,color:'var(--t-2)'}}>
                    <div onClick={()=>onReveal(key,!token.revealed[key])} style={{
                      width:32,height:18,borderRadius:9,position:'relative',cursor:'pointer',transition:'background .2s',
                      background:token.revealed[key]?'var(--c-gold)':'rgba(255,255,255,0.12)',flexShrink:0,
                    }}>
                      <div style={{
                        position:'absolute',top:2,left:token.revealed[key]?14:2,width:14,height:14,
                        borderRadius:'50%',background:'#fff',transition:'left .2s',
                      }}/>
                    </div>
                    {label}
                    {token.revealed[key]&&<span style={{fontSize:9,color:'var(--c-gold-l)'}}>✓ Revealed</span>}
                  </label>
                ))}
              </div>
            </div>

            {/* Token actions */}
            <div style={{display:'flex',gap:5}}>
              <button onClick={onToggleHide} style={{flex:1,fontSize:10,fontWeight:700,padding:'5px 6px',borderRadius:6,cursor:'pointer',
                border:'1px solid var(--c-border)',background:token.is_hidden?'rgba(255,255,255,0.06)':'transparent',color:'var(--t-2)'}}>
                {token.is_hidden?'👁 Show':'🙈 Hide'}
              </button>
              <button onClick={onDeleteToken} style={{flex:1,fontSize:10,fontWeight:700,padding:'5px 6px',borderRadius:6,cursor:'pointer',
                border:'1px solid rgba(239,68,68,0.3)',background:'rgba(239,68,68,0.08)',color:'#ef4444'}}>Remove</button>
            </div>
          </>
        )}

        {/* ── Party Notes ── */}
        <div style={{borderTop:'1px solid var(--c-border)',paddingTop:10}}>
          <div style={{fontSize:10,color:'var(--t-3)',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:6}}>Party Notes</div>
          {notes.map(n=>(
            <div key={n.id} style={{background:'rgba(255,255,255,0.04)',borderRadius:7,padding:'7px 10px',marginBottom:5}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:3}}>
                <span style={{fontSize:10,fontWeight:700,color:'var(--c-gold-l)'}}>{n.author_name}</span>
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  <span style={{fontSize:9,color:'var(--t-3)'}}>{new Date(n.created_at).toLocaleDateString()}</span>
                  {n.author_id===userId&&<button onClick={()=>deleteNote(n.id)} style={{fontSize:9,background:'none',border:'none',color:'var(--t-3)',cursor:'pointer'}}>✕</button>}
                </div>
              </div>
              <p style={{margin:0,fontSize:12,color:'var(--t-2)',lineHeight:1.5,fontFamily:'var(--ff-body)'}}>{n.note}</p>
            </div>
          ))}
          <div style={{display:'flex',gap:5,marginTop:4}}>
            <input value={newNote} onChange={e=>setNewNote(e.target.value)} placeholder="Add a note for the party…"
              style={{flex:1,fontSize:12}} onKeyDown={e=>e.key==='Enter'&&submitNote()}/>
            <button onClick={submitNote} disabled={!newNote.trim()}
              style={{fontSize:11,fontWeight:700,padding:'5px 10px',borderRadius:6,cursor:'pointer',
                border:'1px solid var(--c-gold-bdr)',background:'var(--c-gold-bg)',color:'var(--c-gold-l)'}}>Add</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Right panel: NPC Roster (DM only) ────────────────────────────
function NPCRoster({ campaignId, userId, onAddToMap, onClose }:{
  campaignId:string; userId:string;
  onAddToMap:(npc:DMRosterNPC)=>void; onClose:()=>void;
}) {
  const [roster,setRoster]=useState<DMRosterNPC[]>([]);
  const [search,setSearch]=useState('');
  const [tab,setTab]=useState<'mine'|'stock'>('mine');
  const [editNPC,setEditNPC]=useState<DMRosterNPC|null>(null);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{ loadRoster(); },[]);

  async function loadRoster(){
    setLoading(true);
    const {data}=await supabase.from('dm_npc_roster').select('*').eq('owner_id',userId).order('updated_at',{ascending:false});
    if(data) setRoster(data);
    setLoading(false);
  }

  async function saveNPC(npc:Partial<DMRosterNPC>&{name:string}){
    if(npc.id){
      await supabase.from('dm_npc_roster').update({...npc,updated_at:new Date().toISOString()}).eq('id',npc.id);
    } else {
      await supabase.from('dm_npc_roster').insert({...npc,owner_id:userId,campaign_id:campaignId,times_used:0});
    }
    loadRoster();
    setEditNPC(null);
  }

  async function deleteNPC(id:string){
    await supabase.from('dm_npc_roster').delete().eq('id',id);
    setRoster(r=>r.filter(n=>n.id!==id));
  }

  function cloneMonster(m:typeof MONSTERS[0]){
    const npc:Partial<DMRosterNPC>={
      name:m.name, type:String(m.type), cr:String(m.cr), size:String(m.size),
      hp:m.hp, max_hp:m.hp, ac:m.ac, speed:m.speed??30,
      str:m.str, dex:m.dex, con:m.con, int:m.int, wis:m.wis, cha:m.cha,
      attack_name:m.attack_name, attack_bonus:m.attack_bonus, attack_damage:m.attack_damage, xp:m.xp,
      description:(m as any).traits||'', traits:(m as any).traits||'', immunities:'',
      emoji:'👹', color:'#ef4444', source_monster_id:m.id,
    };
    setEditNPC(npc as DMRosterNPC);
  }

  const filteredRoster = roster.filter(n=>n.name.toLowerCase().includes(search.toLowerCase())||n.type.toLowerCase().includes(search.toLowerCase()));
  const filteredStock = MONSTERS.filter(m=>m.name.toLowerCase().includes(search.toLowerCase())||m.type.toLowerCase().includes(search.toLowerCase()));

  if(editNPC) return (
    <NPCEditForm npc={editNPC} onSave={saveNPC} onCancel={()=>setEditNPC(null)}/>
  );

  return (
    <div style={{width:260,flexShrink:0,background:'#0d1117',border:'1px solid var(--c-border)',borderRadius:12,display:'flex',flexDirection:'column',overflow:'hidden',maxHeight:'80vh'}}>
      <div style={{padding:'10px 14px',borderBottom:'1px solid var(--c-border)',display:'flex',alignItems:'center',gap:8}}>
        <div style={{fontWeight:800,fontSize:12,color:'var(--c-gold-l)',textTransform:'uppercase',letterSpacing:'0.1em',flex:1}}>NPC Roster</div>
        <button onClick={()=>setEditNPC({} as DMRosterNPC)} style={{fontSize:11,fontWeight:700,padding:'3px 8px',borderRadius:5,cursor:'pointer',
          border:'1px solid var(--c-gold-bdr)',background:'var(--c-gold-bg)',color:'var(--c-gold-l)'}}>+ New</button>
        <button onClick={onClose} style={{background:'none',border:'none',color:'var(--t-2)',cursor:'pointer',fontSize:13}}>✕</button>
      </div>

      {/* Search */}
      <div style={{padding:'8px 12px',borderBottom:'1px solid var(--c-border)'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search NPCs & monsters…" style={{width:'100%',fontSize:12}}/>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',borderBottom:'1px solid var(--c-border)'}}>
        {(['mine','stock'] as const).map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{
            flex:1,fontSize:11,fontWeight:700,padding:'7px 4px',cursor:'pointer',
            border:'none',borderBottom:tab===t?`2px solid var(--c-gold)`:undefined,
            background:'transparent',color:tab===t?'var(--c-gold-l)':'var(--t-2)',
          }}>{t==='mine'?`My NPCs (${roster.length})`:`SRD Library (${MONSTERS.length})`}</button>
        ))}
      </div>

      <div style={{flex:1,overflowY:'auto',padding:'6px 8px',display:'flex',flexDirection:'column',gap:4}}>
        {loading&&tab==='mine'&&<div style={{textAlign:'center',padding:'20px 0',color:'var(--t-3)',fontSize:12}}>Loading…</div>}

        {tab==='mine'&&!loading&&filteredRoster.map(npc=>(
          <div key={npc.id} style={{background:'rgba(255,255,255,0.04)',borderRadius:8,padding:'8px 10px',border:'1px solid var(--c-border)'}}>
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
              <span style={{fontSize:16}}>{npc.emoji}</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:12,color:'var(--t-1)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{npc.name}</div>
                <div style={{fontSize:9,color:'var(--t-3)'}}>{npc.type} · CR {npc.cr} · HP {npc.hp} · AC {npc.ac}</div>
              </div>
            </div>
            <div style={{display:'flex',gap:4}}>
              <button onClick={()=>onAddToMap(npc)} style={{flex:2,fontSize:9,fontWeight:700,padding:'3px 6px',borderRadius:5,cursor:'pointer',
                border:'1px solid var(--c-gold-bdr)',background:'var(--c-gold-bg)',color:'var(--c-gold-l)'}}>Add to Map</button>
              <button onClick={()=>setEditNPC(npc)} style={{flex:1,fontSize:9,fontWeight:700,padding:'3px 6px',borderRadius:5,cursor:'pointer',
                border:'1px solid var(--c-border)',background:'transparent',color:'var(--t-2)'}}>Edit</button>
              <button onClick={()=>deleteNPC(npc.id)} style={{flex:1,fontSize:9,fontWeight:700,padding:'3px 6px',borderRadius:5,cursor:'pointer',
                border:'1px solid rgba(239,68,68,0.3)',background:'transparent',color:'#ef4444'}}>Del</button>
            </div>
          </div>
        ))}

        {tab==='mine'&&!loading&&filteredRoster.length===0&&(
          <div style={{textAlign:'center',padding:'20px 0',color:'var(--t-3)',fontSize:12}}>
            {search?`No results for "${search}"`:'No NPCs saved yet. Clone from library or create new.'}
          </div>
        )}

        {tab==='stock'&&filteredStock.map(m=>(
          <div key={m.id} style={{background:'rgba(255,255,255,0.03)',borderRadius:8,padding:'7px 10px',border:'1px solid rgba(255,255,255,0.06)'}}>
            <div style={{fontWeight:700,fontSize:12,color:'var(--t-1)'}}>{m.name}</div>
            <div style={{fontSize:9,color:'var(--t-3)',marginBottom:4}}>{m.type} · CR {m.cr} · HP {m.hp} · AC {m.ac}</div>
            <div style={{display:'flex',gap:4}}>
              <button onClick={()=>{
                const rosterNpc:DMRosterNPC={
                  id:'',owner_id:userId,campaign_id:campaignId,
                  name:m.name,type:String(m.type),cr:String(m.cr),size:String(m.size),
                  hp:m.hp,max_hp:m.hp,ac:m.ac,speed:m.speed??30,
                  str:m.str,dex:m.dex,con:m.con,int:m.int,wis:m.wis,cha:m.cha,
                  attack_name:m.attack_name,attack_bonus:m.attack_bonus,attack_damage:m.attack_damage,xp:m.xp,
                  description:'',traits:(m as any).traits||'',immunities:'',
                  emoji:'👹',color:'#ef4444',source_monster_id:m.id,times_used:0,
                };
                onAddToMap(rosterNpc);
              }} style={{flex:2,fontSize:9,fontWeight:700,padding:'3px 6px',borderRadius:5,cursor:'pointer',
                border:'1px solid rgba(96,165,250,0.4)',background:'rgba(96,165,250,0.1)',color:'#60a5fa'}}>Add to Map</button>
              <button onClick={()=>cloneMonster(m)} style={{flex:2,fontSize:9,fontWeight:700,padding:'3px 6px',borderRadius:5,cursor:'pointer',
                border:'1px solid var(--c-gold-bdr)',background:'var(--c-gold-bg)',color:'var(--c-gold-l)'}}>Clone → Mine</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── NPC Edit Form ─────────────────────────────────────────────────
function NPCEditForm({ npc, onSave, onCancel }:{
  npc:Partial<DMRosterNPC>; onSave:(n:Partial<DMRosterNPC>&{name:string})=>void; onCancel:()=>void;
}) {
  const [name,setName]=useState(npc.name||'');
  const [type,setType]=useState(npc.type||'Humanoid');
  const [cr,setCr]=useState(npc.cr||'1');
  const [hp,setHp]=useState(String(npc.hp||10));
  const [ac,setAc]=useState(String(npc.ac||12));
  const [speed,setSpeed]=useState(String(npc.speed||30));
  const [str,setStr]=useState(String(npc.str||10)); const [dex,setDex]=useState(String(npc.dex||10));
  const [con,setCon]=useState(String(npc.con||10)); const [int_,setInt]=useState(String(npc.int||10));
  const [wis,setWis]=useState(String(npc.wis||10)); const [cha,setCha]=useState(String(npc.cha||10));
  const [atk,setAtk]=useState(npc.attack_name||'Strike'); const [atkBonus,setAtkBonus]=useState(String(npc.attack_bonus||3));
  const [atkDmg,setAtkDmg]=useState(npc.attack_damage||'1d6'); const [xp,setXp]=useState(String(npc.xp||100));
  const [desc,setDesc]=useState(npc.description||''); const [traits,setTraits]=useState(npc.traits||'');
  const [immunities,setImmunities]=useState(npc.immunities||'');
  const [emoji,setEmoji]=useState(npc.emoji||'👹'); const [color,setColor]=useState(npc.color||'#ef4444');

  function submit(){
    if(!name.trim())return;
    onSave({...npc,name,type,cr,hp:parseInt(hp)||10,max_hp:parseInt(hp)||10,ac:parseInt(ac)||12,
      speed:parseInt(speed)||30,str:parseInt(str)||10,dex:parseInt(dex)||10,con:parseInt(con)||10,
      int:parseInt(int_)||10,wis:parseInt(wis)||10,cha:parseInt(cha)||10,
      attack_name:atk,attack_bonus:parseInt(atkBonus)||3,attack_damage:atkDmg,xp:parseInt(xp)||100,
      description:desc,traits,immunities,emoji,color,
    });
  }

  return (
    <div style={{flex:1,overflowY:'auto',padding:12,display:'flex',flexDirection:'column',gap:8}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
        <div style={{fontWeight:800,fontSize:12,color:'var(--c-gold-l)',textTransform:'uppercase'}}>
          {npc.id?'Edit NPC':'New NPC'}
        </div>
        <button onClick={onCancel} style={{background:'none',border:'none',color:'var(--t-2)',cursor:'pointer',fontSize:12}}>← Back</button>
      </div>

      <input value={name} onChange={e=>setName(e.target.value)} placeholder="Name *" style={{fontSize:13,fontWeight:700}} autoFocus/>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6}}>
        <div><label style={{fontSize:9,color:'var(--t-3)',display:'block',marginBottom:2}}>Type</label>
          <input value={type} onChange={e=>setType(e.target.value)} style={{width:'100%',fontSize:11}}/></div>
        <div><label style={{fontSize:9,color:'var(--t-3)',display:'block',marginBottom:2}}>CR</label>
          <input value={cr} onChange={e=>setCr(e.target.value)} style={{width:'100%',fontSize:11}}/></div>
        <div><label style={{fontSize:9,color:'var(--t-3)',display:'block',marginBottom:2}}>XP</label>
          <input type="number" value={xp} onChange={e=>setXp(e.target.value)} style={{width:'100%',fontSize:11}}/></div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6}}>
        <div><label style={{fontSize:9,color:'var(--t-3)',display:'block',marginBottom:2}}>HP</label>
          <input type="number" value={hp} onChange={e=>setHp(e.target.value)} style={{width:'100%',fontSize:11}}/></div>
        <div><label style={{fontSize:9,color:'var(--t-3)',display:'block',marginBottom:2}}>AC</label>
          <input type="number" value={ac} onChange={e=>setAc(e.target.value)} style={{width:'100%',fontSize:11}}/></div>
        <div><label style={{fontSize:9,color:'var(--t-3)',display:'block',marginBottom:2}}>Speed</label>
          <input type="number" value={speed} onChange={e=>setSpeed(e.target.value)} style={{width:'100%',fontSize:11}}/></div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:4}}>
        {[['STR',str,setStr],['DEX',dex,setDex],['CON',con,setCon],['INT',int_,setInt],['WIS',wis,setWis],['CHA',cha,setCha]].map(([l,v,s])=>(
          <div key={l as string}><label style={{fontSize:8,color:'var(--t-3)',display:'block',marginBottom:2}}>{l as string}</label>
            <input type="number" value={v as string} onChange={e=>(s as (v:string)=>void)(e.target.value)} style={{width:'100%',fontSize:10,padding:'2px 3px'}}/></div>
        ))}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 2fr',gap:6}}>
        <div><label style={{fontSize:9,color:'var(--t-3)',display:'block',marginBottom:2}}>Attack Name</label>
          <input value={atk} onChange={e=>setAtk(e.target.value)} style={{width:'100%',fontSize:11}}/></div>
        <div><label style={{fontSize:9,color:'var(--t-3)',display:'block',marginBottom:2}}>Bonus</label>
          <input type="number" value={atkBonus} onChange={e=>setAtkBonus(e.target.value)} style={{width:'100%',fontSize:11}}/></div>
        <div><label style={{fontSize:9,color:'var(--t-3)',display:'block',marginBottom:2}}>Damage</label>
          <input value={atkDmg} onChange={e=>setAtkDmg(e.target.value)} style={{width:'100%',fontSize:11}}/></div>
      </div>
      <div><label style={{fontSize:9,color:'var(--t-3)',display:'block',marginBottom:2}}>Immunities (e.g. sleep, charm, poison)</label>
        <input value={immunities} onChange={e=>setImmunities(e.target.value)} style={{width:'100%',fontSize:12}}/></div>
      <div><label style={{fontSize:9,color:'var(--t-3)',display:'block',marginBottom:2}}>Description</label>
        <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={3} style={{width:'100%',fontSize:11,resize:'vertical'}}/></div>
      <div><label style={{fontSize:9,color:'var(--t-3)',display:'block',marginBottom:2}}>Traits & Abilities</label>
        <textarea value={traits} onChange={e=>setTraits(e.target.value)} rows={3} style={{width:'100%',fontSize:11,resize:'vertical'}}/></div>
      <div>
        <label style={{fontSize:9,color:'var(--t-3)',display:'block',marginBottom:4}}>Icon</label>
        <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
          {TOKEN_EMOJIS.map(e=>(
            <button key={e} onClick={()=>setEmoji(e)} style={{width:28,height:28,fontSize:14,borderRadius:5,cursor:'pointer',
              border:emoji===e?'2px solid var(--c-gold)':'1px solid var(--c-border)',background:emoji===e?'var(--c-gold-bg)':'transparent'}}>{e}</button>
          ))}
        </div>
      </div>
      <div>
        <label style={{fontSize:9,color:'var(--t-3)',display:'block',marginBottom:4}}>Color</label>
        <div style={{display:'flex',gap:5}}>
          {TOKEN_COLORS.map(c=>(
            <button key={c} onClick={()=>setColor(c)} style={{width:22,height:22,borderRadius:'50%',background:c,cursor:'pointer',
              border:color===c?'3px solid #fff':'2px solid transparent',flexShrink:0}}/>
          ))}
        </div>
      </div>
      <button onClick={submit} className="btn-gold" style={{marginTop:4,fontWeight:700}}>
        {npc.id?'Save Changes':'Create NPC'}
      </button>
    </div>
  );
}

// ── Main BattleMap ─────────────────────────────────────────────────
export default function BattleMap({ campaignId, isDM, userId, playerCharacters=[], onConditionApplied }:BattleMapProps) {
  const [maps,setMaps]=useState<BattleMapData[]>([]);
  const [activeMap,setActiveMap]=useState<BattleMapData|null>(null);
  const [selectedTokenId,setSelectedTokenId]=useState<string|null>(null);
  const [draggingTokenId,setDraggingTokenId]=useState<string|null>(null);
  const [tokenNotes,setTokenNotes]=useState<TokenNote[]>([]);
  const [showRoster,setShowRoster]=useState(false);
  const [showAddPlayer,setShowAddPlayer]=useState(false);
  const [saving,setSaving]=useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>|null>(null);

  // user display name
  const [userName,setUserName]=useState('Player');
  useEffect(()=>{
    if(userId) supabase.from('profiles').select('display_name,email').eq('id',userId).single()
      .then(({data})=>{ if(data) setUserName(data.display_name||data.email?.split('@')[0]||'Player'); });
  },[userId]);

  // Load maps + realtime
  useEffect(()=>{
    loadMaps();
    const ch=supabase.channel(`bmaps:${campaignId}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'battle_maps',filter:`campaign_id=eq.${campaignId}`},p=>{
        if(p.eventType==='UPDATE'||p.eventType==='INSERT'){
          const u=p.new as BattleMapData;
          setMaps(prev=>prev.map(m=>m.id===u.id?{...m,...u}:m));
          setActiveMap(prev=>prev?.id===u.id?{...prev,...u}:prev);
        }
      })
      .subscribe();
    return ()=>{ supabase.removeChannel(ch); };
  },[campaignId]);

  // Load notes for selected token
  useEffect(()=>{
    if(!selectedTokenId||!activeMap) return;
    loadNotes(selectedTokenId);
    const ch=supabase.channel(`notes:${selectedTokenId}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'token_notes',
        filter:`campaign_id=eq.${campaignId}`},()=>loadNotes(selectedTokenId))
      .subscribe();
    return ()=>{ supabase.removeChannel(ch); };
  },[selectedTokenId,campaignId]);

  async function loadMaps(){
    const {data}=await supabase.from('battle_maps').select('*').eq('campaign_id',campaignId).order('created_at');
    if(!data) return;

    // Collect all character_ids from player tokens across all maps
    const charIds = [...new Set(
      data.flatMap(m=>(m.tokens as MapToken[]).filter(t=>t.character_id).map(t=>t.character_id!))
    )];

    // Fetch live HP/conditions from characters table — single source of truth
    let liveChars: Record<string,{current_hp:number;active_conditions:string[]}> = {};
    if(charIds.length>0){
      const {data:chars}=await supabase.from('characters')
        .select('id,current_hp,active_conditions')
        .in('id',charIds);
      if(chars) chars.forEach(c=>{ liveChars[c.id]={current_hp:c.current_hp,active_conditions:c.active_conditions??[]}; });
    }

    // Patch tokens with live values so map never shows stale HP on load
    const patchedData = data.map(m=>({
      ...m,
      tokens:(m.tokens as MapToken[]).map(t=>{
        if(!t.character_id||!liveChars[t.character_id]) return t;
        const live = liveChars[t.character_id];
        return {...t, hp:live.current_hp, conditions:live.active_conditions};
      })
    }));

    setMaps(patchedData);
    const active=patchedData.find(m=>m.active)??patchedData[0]??null;
    setActiveMap(active);
  }

  async function loadNotes(tokenKey:string){
    const {data}=await supabase.from('token_notes').select('*').eq('campaign_id',campaignId).eq('token_key',tokenKey).order('created_at');
    if(data) setTokenNotes(data);
  }

  async function saveTokensImmediate(tokens:MapToken[]){
    if(!activeMap)return;
    setSaving(true);
    await supabase.from('battle_maps').update({tokens}).eq('id',activeMap.id);
    setSaving(false);
  }

  function saveTokens(tokens:MapToken[], immediate=false){
    if(!activeMap)return;
    if(saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if(immediate){
      saveTokensImmediate(tokens);
    } else {
      setSaving(true);
      saveTimerRef.current = setTimeout(()=>saveTokensImmediate(tokens), 400);
    }
  }

  async function createMap(name:string,cols:number,rows:number){
    const {data}=await supabase.from('battle_maps').insert({
      campaign_id:campaignId,name,image_url:'',grid_cols:cols,grid_rows:rows,grid_size:48,
      tokens:[],active:maps.length===0,map_active_for_players:false,background_color:'#0d1117',
    }).select().single();
    if(data){ setMaps(p=>[...p,data]); setActiveMap(data); }
  }

  function updateToken(tokenId:string,updates:Partial<MapToken>,immediate=true){
    if(!activeMap)return;
    // Get the OLD token value BEFORE mapping (for delta calculation)
    const oldToken=activeMap.tokens.find(t=>t.id===tokenId);
    const tokens=activeMap.tokens.map(t=>t.id===tokenId?{...t,...updates}:t);
    setActiveMap({...activeMap,tokens});
    saveTokens(tokens, immediate);
    const token=tokens.find(t=>t.id===tokenId);
    // Write to characters table — this is the single source of truth
    // Realtime will propagate to character sheet and all other views
    if(token?.character_id&&updates.conditions!==undefined){
      onConditionApplied?.(token.character_id,updates.conditions);
      supabase.from('characters').update({active_conditions:updates.conditions}).eq('id',token.character_id);
    }
    if(token?.character_id&&updates.hp!==undefined){
      supabase.from('characters').update({current_hp:updates.hp}).eq('id',token.character_id);
    }
    // Log damage/healing using the OLD hp for correct delta
    if(updates.hp!==undefined&&oldToken){
      const prevHp = oldToken.hp;
      const newHp = updates.hp;
      const delta = Math.abs(newHp - prevHp);
      const isDamage = newHp < prevHp;
      if(delta > 0){
        supabase.from('action_logs').insert({
          campaign_id: campaignId,
          character_id: token?.character_id ?? null,
          character_name: 'DM',
          action_type: isDamage ? 'damage' : 'heal',
          action_name: isDamage ? `Damage → ${oldToken.name}` : `Heal → ${oldToken.name}`,
          target_name: oldToken.name,
          dice_expression: '',
          individual_results: [delta],
          total: delta,
          notes: `${oldToken.name}: ${prevHp} → ${newHp} HP`,
        });
      }
    }
  }

  function removeToken(tokenId:string){
    if(!activeMap)return;
    const tokens=activeMap.tokens.filter(t=>t.id!==tokenId);
    setActiveMap({...activeMap,tokens});
    saveTokens(tokens, true);
    setSelectedTokenId(null);
  }

  function addRosterNPC(npc:DMRosterNPC){
    if(!activeMap)return;
    const occupied=new Set(activeMap.tokens.map(t=>`${t.col},${t.row}`));
    let col=1,row=1;
    outer:for(let r=1;r<=activeMap.grid_rows;r++)for(let c=1;c<=activeMap.grid_cols;c++){
      if(!occupied.has(`${c},${r}`)){col=c;row=r;break outer;}
    }
    const token:MapToken={
      id:crypto.randomUUID(),name:npc.name,type:'npc',col,row,
      npc_roster_id:npc.id||undefined as string|undefined,
      color:npc.color,emoji:npc.emoji,
      hp:npc.hp,max_hp:npc.max_hp,ac:npc.ac,speed:npc.speed,
      conditions:[],
      str:npc.str,dex:npc.dex,con:npc.con,int:npc.int,wis:npc.wis,cha:npc.cha,
      description:npc.description,image_url:npc.image_url||'',
      immunities:npc.immunities,attack_name:npc.attack_name,
      attack_bonus:npc.attack_bonus,attack_damage:npc.attack_damage,
      cr:npc.cr,xp:npc.xp,
      visible_to_players:true,is_hidden:false,
      revealed:{hp:false,ac:false,stats:false,description:false,immunities:false,attacks:false},
    };
    const tokens=[...activeMap.tokens,token];
    setActiveMap({...activeMap,tokens});
    saveTokens(tokens, true);
    // Update times_used
    if(npc.id) supabase.from('dm_npc_roster').update({times_used:npc.times_used+1,last_used_at:new Date().toISOString()}).eq('id',npc.id);
    setShowRoster(false);
  }

  function addPlayerToken(pc:PlayerChar){
    if(!activeMap)return;
    const occupied=new Set(activeMap.tokens.map(t=>`${t.col},${t.row}`));
    let col=1,row=1;
    outer:for(let r=1;r<=activeMap.grid_rows;r++)for(let c=1;c<=activeMap.grid_cols;c++){
      if(!occupied.has(`${c},${r}`)){col=c;row=r;break outer;}
    }
    const token:MapToken={
      id:crypto.randomUUID(),name:pc.name,type:'player',col,row,character_id:pc.id,
      color:'#60a5fa',emoji:'🧝',
      hp:pc.current_hp,max_hp:pc.max_hp,ac:pc.armor_class,speed:pc.speed,
      conditions:pc.active_conditions??[],
      str:pc.strength,dex:pc.dexterity,con:pc.constitution,
      int:pc.intelligence,wis:pc.wisdom,cha:pc.charisma,
      description:'',image_url:'',immunities:'',
      attack_name:'',attack_bonus:0,attack_damage:'',cr:'—',xp:0,
      visible_to_players:true,is_hidden:false,
      revealed:{hp:true,ac:true,stats:true,description:true,immunities:true,attacks:true},
    };
    const tokens=[...activeMap.tokens,token];
    setActiveMap({...activeMap,tokens});
    saveTokens(tokens, true);
    setShowAddPlayer(false);
  }

  // Sync player tokens from live character data
  // Subscribe directly to characters table — single source of truth for player HP
  useEffect(()=>{
    if(!campaignId) return;
    const ch = supabase.channel(`bmap-chars-${campaignId}`)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'characters',
        filter:`campaign_id=eq.${campaignId}`},payload=>{
          const updated = payload.new as {id:string;current_hp:number;active_conditions:string[]};
          if(!updated?.id) return;
          setActiveMap(prev=>{
            if(!prev) return prev;
            const tokens = prev.tokens.map(t=>{
              if(t.character_id!==updated.id) return t;
              const upd:Partial<MapToken>={};
              if(t.hp!==updated.current_hp) upd.hp=updated.current_hp;
              if(JSON.stringify(t.conditions)!==JSON.stringify(updated.active_conditions??[])) upd.conditions=updated.active_conditions??[];
              return Object.keys(upd).length?{...t,...upd}:t;
            });
            return {...prev,tokens};
          });
        })
      .subscribe();
    return ()=>{ supabase.removeChannel(ch); };
  },[campaignId]);

  async function toggleMapActiveForPlayers(){
    if(!activeMap)return;
    const val=!activeMap.map_active_for_players;
    await supabase.from('battle_maps').update({map_active_for_players:val}).eq('id',activeMap.id);
    setActiveMap({...activeMap,map_active_for_players:val});
  }

  // Drag
  function handleDragStart(e:React.DragEvent,tokenId:string){
    e.dataTransfer.setData('tokenId',tokenId);
    setDraggingTokenId(tokenId);
  }
  function handleCellDrop(e:React.DragEvent,col:number,row:number){
    e.preventDefault();
    const tokenId=e.dataTransfer.getData('tokenId');
    if(!tokenId||!activeMap)return;
    if(activeMap.tokens.find(t=>t.col===col&&t.row===row&&t.id!==tokenId))return;
    updateToken(tokenId,{col,row},false); // debounced position save
    setDraggingTokenId(null);
  }

  const selectedToken=activeMap?.tokens.find(t=>t.id===selectedTokenId)??null;
  const visibleTokens=(activeMap?.tokens??[]).filter(t=>isDM||!t.is_hidden);
  const mapIsLive=activeMap?.map_active_for_players??false;
  const gridSize=activeMap?.grid_size??48;

  // Player sees greyed-out overlay until DM activates
  const playerBlocked=!isDM&&!mapIsLive;

  // ── New map form state ──
  const [showNewMap,setShowNewMap]=useState(false);
  const [newMapName,setNewMapName]=useState('');
  const [newCols,setNewCols]=useState('20');
  const [newRows,setNewRows]=useState('15');

  return (
    <div style={{display:'flex',flexDirection:'column',gap:10,width:'100%'}}>
      {/* Toolbar */}
      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
        {maps.length>0&&maps.map(m=>(
          <button key={m.id} onClick={()=>setActiveMap(m)} style={{
            fontSize:11,fontWeight:700,padding:'4px 10px',borderRadius:6,cursor:'pointer',
            border:activeMap?.id===m.id?'1px solid var(--c-gold-bdr)':'1px solid var(--c-border)',
            background:activeMap?.id===m.id?'var(--c-gold-bg)':'transparent',
            color:activeMap?.id===m.id?'var(--c-gold-l)':'var(--t-2)',
          }}>{m.name}</button>
        ))}
        {isDM&&<>
          <button onClick={()=>setShowAddPlayer(true)} className="btn-secondary btn-sm" disabled={!activeMap}>+ Player Token</button>
          <button onClick={()=>setShowRoster(v=>!v)} style={{
            fontSize:11,fontWeight:700,padding:'5px 10px',borderRadius:6,cursor:'pointer',
            border:showRoster?'1px solid var(--c-gold-bdr)':'1px solid var(--c-border)',
            background:showRoster?'var(--c-gold-bg)':'transparent',
            color:showRoster?'var(--c-gold-l)':'var(--t-2)',
          }}>🗂 NPC Roster</button>
          <button onClick={()=>setShowNewMap(v=>!v)} className="btn-secondary btn-sm">+ New Map</button>
          <button onClick={toggleMapActiveForPlayers} style={{
            fontSize:11,fontWeight:700,padding:'5px 10px',borderRadius:6,cursor:'pointer',
            border:mapIsLive?'1px solid rgba(34,197,94,0.5)':'1px solid rgba(239,68,68,0.4)',
            background:mapIsLive?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.08)',
            color:mapIsLive?'#22c55e':'#ef4444',
          }} disabled={!activeMap}>{mapIsLive?'🟢 Live for Players':'🔴 Hidden from Players'}</button>
          {saving&&<span style={{fontSize:11,color:'var(--t-3)',fontStyle:'italic'}}>Saving…</span>}
        </>}
        {!isDM&&(
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:mapIsLive?'#22c55e':'#6b7280'}}/>
            <span style={{fontSize:11,color:mapIsLive?'#22c55e':'var(--t-3)'}}>{mapIsLive?'Map Active':'Waiting for DM…'}</span>
          </div>
        )}
      </div>

      {/* New map form */}
      {showNewMap&&isDM&&(
        <div style={{display:'flex',gap:8,alignItems:'center',padding:'8px 12px',background:'var(--c-raised)',borderRadius:8,border:'1px solid var(--c-border)'}}>
          <input value={newMapName} onChange={e=>setNewMapName(e.target.value)} placeholder="Map name" style={{flex:1,fontSize:13}}
            onKeyDown={e=>e.key==='Enter'&&createMap(newMapName,parseInt(newCols)||20,parseInt(newRows)||15)} autoFocus/>
          <input type="number" value={newCols} onChange={e=>setNewCols(e.target.value)} style={{width:50,fontSize:12}} placeholder="Cols"/>
          <span style={{fontSize:11,color:'var(--t-3)'}}>×</span>
          <input type="number" value={newRows} onChange={e=>setNewRows(e.target.value)} style={{width:50,fontSize:12}} placeholder="Rows"/>
          <button onClick={()=>createMap(newMapName,parseInt(newCols)||20,parseInt(newRows)||15)} className="btn-gold btn-sm">Create</button>
        </div>
      )}

      {/* Main layout: Detail | Map | Roster */}
      <div style={{display:'flex',gap:12,alignItems:'flex-start',width:'100%'}}>
        {/* LEFT: Token detail */}
        {selectedToken&&(
          <TokenDetailPanel
            token={selectedToken} isDM={isDM} notes={tokenNotes}
            userId={userId} userName={userName} campaignId={campaignId}
            onUpdateToken={updateToken}
            onApplyCond={c=>updateToken(selectedToken.id,{conditions:[...selectedToken.conditions.filter(x=>x!==c),c]})}
            onRemoveCond={c=>updateToken(selectedToken.id,{conditions:selectedToken.conditions.filter(x=>x!==c)})}
            onUpdateHP={(delta,mode)=>{
              let hp=selectedToken.hp;
              if(mode==='damage')hp=Math.max(0,hp-delta);
              else if(mode==='heal')hp=Math.min(selectedToken.max_hp,hp+delta);
              else hp=Math.max(0,Math.min(selectedToken.max_hp,delta));
              const updates:Partial<MapToken>={hp};
              if(hp===0&&!selectedToken.conditions.includes('Unconscious')){
                updates.conditions=[...selectedToken.conditions,'Unconscious'];
              }
              updateToken(selectedToken.id,updates);
            }}
            onDeleteToken={()=>removeToken(selectedToken.id)}
            onToggleHide={()=>updateToken(selectedToken.id,{is_hidden:!selectedToken.is_hidden})}
            onReveal={(field,val)=>updateToken(selectedToken.id,{revealed:{...selectedToken.revealed,[field]:val}})}
            onClose={()=>setSelectedTokenId(null)}
          />
        )}

        {/* CENTER: Grid */}
        <div style={{flex:1,minWidth:0,position:'relative'}}>
          {activeMap ? (
            <div style={{position:'relative'}}>
              <div style={{overflowX:'auto',overflowY:'auto',maxHeight:'72vh',border:'1px solid var(--c-border)',borderRadius:10,
                background:activeMap.background_color||'#0d1117',
                filter:playerBlocked?'grayscale(100%) brightness(0.4)':'none',
                pointerEvents:playerBlocked?'none':'auto',transition:'filter .3s'}}>
                <div style={{position:'relative',width:activeMap.grid_cols*gridSize,height:activeMap.grid_rows*gridSize,
                  backgroundImage:activeMap.image_url?`url(${activeMap.image_url})`:'none',backgroundSize:'cover',backgroundPosition:'center'}}>
                  {/* Grid SVG */}
                  <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
                    {Array.from({length:activeMap.grid_cols+1},(_,i)=>(
                      <line key={`v${i}`} x1={i*gridSize} y1={0} x2={i*gridSize} y2={activeMap.grid_rows*gridSize} stroke="rgba(255,255,255,0.07)" strokeWidth={1}/>
                    ))}
                    {Array.from({length:activeMap.grid_rows+1},(_,i)=>(
                      <line key={`h${i}`} x1={0} y1={i*gridSize} x2={activeMap.grid_cols*gridSize} y2={i*gridSize} stroke="rgba(255,255,255,0.07)" strokeWidth={1}/>
                    ))}
                  </svg>
                  {/* Drop zones */}
                  {draggingTokenId&&Array.from({length:activeMap.grid_rows},(_,r)=>
                    Array.from({length:activeMap.grid_cols},(_,c)=>(
                      <div key={`cell-${c}-${r}`}
                        onDragOver={e=>e.preventDefault()}
                        onDrop={e=>handleCellDrop(e,c+1,r+1)}
                        style={{position:'absolute',left:c*gridSize,top:r*gridSize,width:gridSize,height:gridSize}}/>
                    ))
                  )}
                  {/* Tokens */}
                  {visibleTokens.map(token=>(
                    <div key={token.id} style={{
                      position:'absolute',
                      left:(token.col-1)*gridSize,top:(token.row-1)*gridSize,
                      width:gridSize,height:gridSize,zIndex:selectedTokenId===token.id?10:5,
                      transition:draggingTokenId===token.id?'none':'left .2s,top .2s',
                    }}>
                      <TokenDot
                        token={token} selected={selectedTokenId===token.id}
                        dragging={draggingTokenId===token.id} isDM={isDM}
                        onClick={()=>setSelectedTokenId(prev=>prev===token.id?null:token.id)}
                        onDragStart={e=>handleDragStart(e,token.id)}
                      />
                      <div style={{position:'absolute',bottom:-15,left:'50%',transform:'translateX(-50%)',
                        fontSize:9,fontWeight:700,color:'#fff',whiteSpace:'nowrap',
                        textShadow:'0 1px 3px rgba(0,0,0,0.9)',pointerEvents:'none'}}>
                        {(!isDM&&token.is_hidden)?'???':token.name.length>8?token.name.slice(0,8)+'…':token.name}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Player blocked overlay */}
              {playerBlocked&&(
                <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',
                  borderRadius:10,zIndex:5,pointerEvents:'none'}}>
                  <div style={{background:'rgba(0,0,0,0.8)',borderRadius:12,padding:'20px 32px',textAlign:'center',
                    border:'1px solid var(--c-border)'}}>
                    <div style={{fontSize:28,marginBottom:8}}>🗺️</div>
                    <div style={{fontSize:13,fontWeight:700,color:'var(--t-1)',marginBottom:4}}>Battle Map</div>
                    <div style={{fontSize:11,color:'var(--t-3)'}}>Waiting for DM to activate the map…</div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{padding:'60px 20px',textAlign:'center',color:'var(--t-3)',fontSize:14,
              border:'1px dashed var(--c-border)',borderRadius:10}}>
              {isDM?'Create a new map above to get started.':'Waiting for DM to set up the map…'}
            </div>
          )}
          {/* Legend */}
          {activeMap&&(
            <div style={{display:'flex',gap:12,fontSize:10,color:'var(--t-3)',marginTop:6,flexWrap:'wrap'}}>
              <span>🟢 Full HP · 🟡 Bloodied · 🔴 Critical</span>
              <span>🟠 dot = conditions active</span>
              {isDM&&<span>· Drag tokens to move · Click to inspect</span>}
              {!isDM&&<span>· Click tokens for details & party notes</span>}
            </div>
          )}
        </div>

        {/* RIGHT: NPC Roster */}
        {showRoster&&isDM&&(
          <NPCRoster campaignId={campaignId} userId={userId}
            onAddToMap={addRosterNPC} onClose={()=>setShowRoster(false)}/>
        )}
      </div>

      {/* DM Roll Request Panel */}
      {isDM && activeMap && (
        <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--c-raised)', borderRadius: 10, border: '1px solid var(--c-border)' }}>
          <DMRollRequestPanel
            campaignId={campaignId}
            userId={userId}
            playerCharacters={playerCharacters.map(pc => ({
              id: pc.id, name: pc.name,
              strength: pc.strength, dexterity: pc.dexterity, constitution: pc.constitution,
              intelligence: pc.intelligence, wisdom: pc.wisdom, charisma: pc.charisma,
              skill_proficiencies: [],
              saving_throw_proficiencies: [],
              level: 1,
            }))}
          />
        </div>
      )}

      {/* Add player token modal */}
      {showAddPlayer&&isDM&&(
        <div style={{position:'fixed',inset:0,zIndex:200,background:'rgba(0,0,0,0.7)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}
          onClick={()=>setShowAddPlayer(false)}>
          <div style={{background:'var(--c-card)',border:'1px solid var(--c-gold-bdr)',borderRadius:14,width:'100%',maxWidth:400,padding:20}}
            onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:800,fontSize:14,color:'var(--c-gold-l)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:14}}>Add Player Token</div>
            {playerCharacters.length===0?(
              <p style={{color:'var(--t-3)',fontSize:13}}>No player characters connected to this campaign.</p>
            ):playerCharacters.map(pc=>(
              <div key={pc.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 12px',
                background:'var(--c-raised)',borderRadius:8,marginBottom:6}}>
                <div>
                  <div style={{fontWeight:700,fontSize:13,color:'var(--t-1)'}}>{pc.name}</div>
                  <div style={{fontSize:10,color:'var(--t-3)'}}>{pc.class_name} · HP {pc.current_hp}/{pc.max_hp} · AC {pc.armor_class}</div>
                </div>
                <button onClick={()=>addPlayerToken(pc)} className="btn-gold btn-sm">Add</button>
              </div>
            ))}
            <button onClick={()=>setShowAddPlayer(false)} className="btn-secondary btn-sm" style={{marginTop:8,width:'100%'}}>Cancel</button>
          </div>
        </div>
      )}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
