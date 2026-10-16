import {Fragment,StrictMode,useEffect,useMemo,useState} from 'react';import{createRoot}from'react-dom/client';import{players,shuffle}from './data';import{approvedCategories as categories,drawCategories}from './approvedCategories';import{slots,fit,findPlayer,strength,regularSeason,playoffs}from './sim';import type {Team,Stand,Series} from './sim';import {broadcast} from './broadcast';import './style.css';
type Phase='setup'|'draft'|'lineups'|'season'|'playoffs'|'finished';type CpuDifficulty='easy'|'medium'|'hard';type State={phase:Phase;teams:Team[];cats:string[];order:number[];pick:number;standings:Stand[];series:Series[];champion:number|null;mvp:string;override:boolean;playoffSeriesIndex:number;playoffGameIndex:number;playoffMoment:number;playoffStarted:boolean;cpuTeams:number[];cpuDifficulty:CpuDifficulty};
const initial:State={phase:'setup',teams:[],cats:[],order:[],pick:0,standings:[],series:[],champion:null,mvp:'',override:false,playoffSeriesIndex:0,playoffGameIndex:0,playoffMoment:0,playoffStarted:false,cpuTeams:[],cpuDifficulty:'medium'};const store='alltime-nba-draft-live-categories-v07';const cat=(id:string)=>categories.find(c=>c.id===id)!;
function Roster({team,moments=[],side}:{team:Team;moments?:ReturnType<typeof broadcast>;side?:'home'|'away'}){const ids=slots.map(s=>team.lineup[s]).filter(Boolean);const teamPoints=moments.filter(m=>m.text.includes(`for ${team.name}`));const counts:Record<string,number>={};for(const m of teamPoints){const p=ids.map(findPlayer).find(p=>m.headline.startsWith(p.name));if(p){const prev=m.index>0?moments.find(x=>x.index===m.index-1):null;const pts=side==='home'?m.homeScore-(prev?.homeScore||0):m.awayScore-(prev?.awayScore||0);counts[p.id]=(counts[p.id]||0)+Math.max(0,pts)}}return <aside className="roster-panel"><h3>{team.name}</h3><small>TEAM OVR {strength(team).toFixed(1)}</small>{slots.map(slot=>{const pid=team.lineup[slot];if(!pid)return null;const p=findPlayer(pid);return <div className="roster-player" key={slot}><span className="roster-slot">{slot}</span><div><b>{p.name}</b><small>{p.positions.join('/')} · OVR {p.overall}</small></div>{side&&<strong>{counts[pid]||0} PTS</strong>}</div>})}{side&&<p className="stat-note">Live points from scored baskets. Rebounds and assists aren't tracked by this broadcast engine yet.</p>}</aside>}
// Label tournament stages relative to the championship rather than their raw round numbers.
// A two-team tournament is Finals only; preliminary rounds are Play-In rounds.
function playoffRoundName(round:number,series:Series[]):string {
 const rounds=[...new Set(series.map(s=>s.round))].sort((a,b)=>a-b);
 const index=rounds.indexOf(round);
 if(index===rounds.length-1)return 'Finals';
 if(index===rounds.length-2)return 'Quarterfinals';
 return 'Play-In Round';
}
function Bracket({teams,series,activeIndex,gameIndex,standings}:{teams:Team[];series:Series[];activeIndex:number;gameIndex:number;standings:Stand[]}){
 const rounds=[...new Set(series.map(s=>s.round))].sort((a,b)=>a-b);const current=series[activeIndex];
 const tname=(id:number)=>teams.find(t=>t.id===id)?.name||'TBD';
 const shown=(s:Series)=>s.round<=current.round;
 // Seeds from standings; compute round-1 byes using same logic as sim
 const seedOrder=standings.map(s=>s.team);
 const r1count=series.filter(s=>s.round===1).length;
 // A team is "locked" for a future round if they didn't need to win a prior series to get there
 const isLocked=(teamId:number,round:number):boolean=>{
   // If team never played in any round before this one, they had a bye
   for(const s of series){
     if(s.round<round&&(s.higher===teamId||s.lower===teamId)){
       // They played a prior series; locked only if that series is complete and they won
       if(s.round<current.round)return s.winner===teamId;
       const si=series.indexOf(s);
       if(si<activeIndex)return s.winner===teamId;
       if(si===activeIndex&&gameIndex>=s.games.length)return s.winner===teamId;
       return false;
     }
   }
   return true;
 };
 const dispName=(s:Series,id:number):string=>{
   if(shown(s))return tname(id);
   return isLocked(id,s.round)?tname(id):'TBD';
 };
 const progress=(s:Series)=>{const idx=series.indexOf(s);if(s.round<current.round)return s.games.length;if(s.round>current.round)return 0;if(idx===activeIndex)return gameIndex;if(idx<activeIndex)return Math.min(gameIndex+1,s.games.length);return Math.min(gameIndex,s.games.length)};
 const score=(s:Series,id:number)=>{if(!shown(s))return '–';return String(s.games.slice(0,progress(s)).filter(g=>g.winner===id).length)};
 const teamClass=(s:Series,id:number):string=>{
   const name=dispName(s,id);
   if(name==='TBD')return 'bteam tbd';
   // Eliminated: lost a completed series
   const si=series.indexOf(s);
   const sDone=s.round<current.round||(si<activeIndex)||(si===activeIndex&&gameIndex>=s.games.length);
   if(sDone&&s.winner!==undefined&&s.winner!==id)return 'bteam elim';
   if(s.winner===id)return 'bteam win';
   return 'bteam';
 };
 const match=(s:Series,i:number)=>{const isActive=series.indexOf(s)===activeIndex;const done=s.winner!==undefined&&s.round<current.round;return <div key={i} className={'bmatch'+(isActive?' active':'')+(done?' done':'')}><div className={teamClass(s,s.higher)}><span>{dispName(s,s.higher)}</span><b>{score(s,s.higher)}</b></div><div className={teamClass(s,s.lower)}><span>{dispName(s,s.lower)}</span><b>{score(s,s.lower)}</b></div></div>};
 return <div className="bracket">{rounds.map((r,ri)=>{
   const rs=series.filter(s=>s.round===r);
   const label=r===Math.max(...rounds)?'CHAMPIONSHIP':playoffRoundName(r,series).toUpperCase();
   return <div key={r} className="bround"><div className="eyebrow">{label}</div><div className="bmatches">{rs.map(match)}</div>{ri<rounds.length-1&&<div className="bconnector"/>}{r===Math.max(...rounds)&&<div className="bracket-trophy">🏆</div>}</div>
 })}</div>
}
// Finals MVP is based on simulated Finals PRA per game (winning team only).
// The broadcast supplies deterministic points and modeled rebounds/assists.
function finalsMvp(teams:Team[],series:Series[],champion:number){
 const finalRound=Math.max(...series.map(s=>s.round));
 const finals=series.find(s=>s.round===finalRound && s.winner===champion);
 const team=teams.find(t=>t.id===champion);
 if(!finals||!team)return {id:'',ppg:0,rpg:0,apg:0,pra:0,games:0};
 const ids=slots.map(slot=>team.lineup[slot]).filter(Boolean);
 const totals=new Map(ids.map(id=>[id,{pts:0,reb:0,ast:0}]));
 for(const g of finals.games){
  for(const m of broadcast(g,teams)){
   const scorer=totals.get(m.scorerId);if(scorer)scorer.pts+=m.points;
   const rebounder=totals.get(m.rebounderId);if(rebounder)rebounder.reb++;
   const assister=totals.get(m.assisterId);if(assister)assister.ast++;
  }
 }
 const total=(id:string)=>{const t=totals.get(id)!;return t.pts+t.reb+t.ast};
 const sorted=[...ids].sort((a,b)=>total(b)-total(a)||findPlayer(b).overall-findPlayer(a).overall||a.localeCompare(b));
 const id=sorted[0]||'';const t=totals.get(id)||{pts:0,reb:0,ast:0};const games=finals.games.length;
 return {id,ppg:games?t.pts/games:0,rpg:games?t.reb/games:0,apg:games?t.ast/games:0,pra:games?total(id)/games:0,games};
}
function ShareResults({state}:{state:State}){
 const [copied,setCopied]=useState(false);
 const champ=state.teams.find(t=>t.id===state.champion);
 const fmvp=state.champion!=null?finalsMvp(state.teams,state.series,state.champion):null;
 const fmvpName=fmvp&&fmvp.id?findPlayer(fmvp.id).name:'—';
 const rounds=[...new Set(state.series.map(s=>s.round))].sort((a,b)=>a-b);
 const tname=(id:number)=>state.teams.find(t=>t.id===id)?.name||'?';
 const slotOrder=['PG','SG','SF','PF','C','6TH'];
 const rosterLines=champ?slotOrder.map(s=>{const pid=champ.lineup[s];return `${s==='6TH'?'6th':s}: ${pid?findPlayer(pid).name:'—'}`}):[];
 let text=`🏆 OUT OF BOUNDS — All-Time NBA Categories Draft\n\n`;
 text+=`Champion: ${champ?.name||'?'} \n`;
 if(fmvp)text+=`Finals MVP: ${fmvpName} (${fmvp.ppg.toFixed(1)} PPG, ${fmvp.rpg.toFixed(1)} RPG, ${fmvp.apg.toFixed(1)} APG)\n`;
 text+=`\n`;
 text+=rosterLines.join('\n')+'\n\n';
 for(const r of rounds){
   const label=r===Math.max(...rounds)?'Finals':playoffRoundName(r,state.series);
   text+=`${label}:\n`;
   for(const s of state.series.filter(x=>x.round===r)){
     text+=`  ${tname(s.higher)} ${s.wins[0]}-${s.wins[1]} ${tname(s.lower)}\n`;
   }
 }
 text+=`\nPlay OUT OF BOUNDS - Random Drafts + Sim: https://out-of-bounds-6n4m.onrender.com`;
 const copy=async()=>{
   try{await navigator.clipboard.writeText(text);setCopied(true);setTimeout(()=>setCopied(false),2000)}
   catch{setCopied(false)}
 };
 return <div className="share-results"><button className="primary" onClick={copy}>{copied?'✓ Copied!':'📋 Copy Results to Share'}</button></div>
}

// CPU chooses which category to draft from: prioritizes small pools and
// big talent drop-offs (take the star before someone else does).
// Smarter difficulties do this more reliably.
function cpuChooseCategory(team:Team,catIds:string[],used:Set<string>,difficulty:CpuDifficulty):string{
  const unfilled=catIds.filter(id=>!team.picks[id]);
  if(unfilled.length===1)return unfilled[0];
  const smartness=difficulty==='easy'?0.3:difficulty==='medium'?0.65:0.95;
  // Sometimes just pick randomly (worse on easy)
  if(Math.random()>smartness){
    return unfilled[Math.floor(Math.random()*unfilled.length)];
  }
  const scored=unfilled.map(id=>{
    const c=categories.find(x=>x.id===id)!;
    const elig=players.filter(p=>!used.has(p.id)&&c.eligible(p)).sort((a,b)=>b.overall-a.overall);
    if(!elig.length)return {id,score:-999};
    const best=elig[0].overall;
    const second=elig[1]?.overall||best-20;
    const dropoff=best-second;
    const poolSize=elig.length;
    // Small pools + high best + big dropoff = draft now
    const score=best*1.5+dropoff*2-poolSize*0.3;
    return {id,score};
  });
  scored.sort((a,b)=>b.score-a.score);
  return scored[0].id;
}

// CPU drafting: scores players by overall + noise. Easy makes mistakes like a
// casual fan (still takes obvious stars, but reaches and ignores fit).
// Hard drafts near-optimally with positional awareness.
function cpuPick(team:Team,catId:string,used:Set<string>,difficulty:CpuDifficulty):string|null{
  const c=categories.find(x=>x.id===catId)!;
  const eligible=players.filter(p=>!used.has(p.id)&&c.eligible(p));
  if(!eligible.length)return null;
  const noise=difficulty==='easy'?25:difficulty==='medium'?12:4;
  const scored=eligible.map(p=>{
    let score=p.overall+Math.random()*noise;
    if(difficulty==='hard'){
      // Bonus for positional versatility (can fill multiple slots well)
      const bestFit=Math.max(...slots.slice(0,5).map(s=>fit(p,s as 'PG')));
      score+=bestFit*8;
    }
    if(difficulty==='easy'){
      // Casual fans overvalue scoring reputation
      score+=p.offense*0.15;
    }
    return {p,score};
  });
  scored.sort((a,b)=>b.score-a.score);
  return scored[0].p.id;
}

function App(){const [state,setState]=useState<State>(()=>{try{return {...initial,...JSON.parse(localStorage.getItem(store)||'null')}}catch{return initial}});const [showHome,setShowHome]=useState(true);const [showModes,setShowModes]=useState(false);const [cpuSetup,setCpuSetup]=useState(false);const [cpuCount,setCpuCount]=useState(1);const [difficulty,setDifficulty]=useState<CpuDifficulty>('medium');const [names,setNames]=useState(['Team 1','Team 2','Team 3','Team 4']);const [search,setSearch]=useState('');const [selected,setSelected]=useState('');const [chosenCat,setChosenCat]=useState('');const [notice,setNotice]=useState('');const [allow,setAllow]=useState(false);const [expanded,setExpanded]=useState<number|null>(null);const [speed,setSpeed]=useState('auto');const [playing,setPlaying]=useState(false);const [halfPaused,setHalfPaused]=useState(false);
useEffect(()=>localStorage.setItem(store,JSON.stringify(state)),[state]);const update=(patch:Partial<State>)=>setState(s=>({...s,...patch}));const current=state.order[state.pick];const team=state.teams.find(t=>t.id===current);const colOrder=useMemo(()=>{const seen:number[]=[];for(const id of state.order){if(!seen.includes(id))seen.push(id)}return seen.length?seen:state.teams.map(t=>t.id)},[state.order,state.teams]);const used=new Set(state.teams.flatMap(t=>Object.values(t.picks)));
const matches=useMemo(()=>{const q=search.trim().toLocaleLowerCase();return q.length?players.filter(p=>p.name.toLocaleLowerCase().includes(q)||(p.aliases||[]).some(a=>a.toLocaleLowerCase().includes(q))).slice(0,12):[]},[search]);
function startVsCpu(){
  const human={id:0,name:'You',picks:{},lineup:{}};
  const cpus=Array.from({length:cpuCount},(_,i)=>({id:i+1,name:`CPU ${i+1}`,picks:{},lineup:{}}));
  const teams=[human,...cpus];
  const order:number[]=[];const shuffled=shuffle(teams.map(t=>t.id));
  for(let r=0;r<6;r++)order.push(...(r%2?[...shuffled].reverse():shuffled));
  update({phase:'draft',teams,cats:drawCategories(6).map(c=>c.id),order,pick:0,standings:[],series:[],champion:null,mvp:'',playoffSeriesIndex:0,playoffGameIndex:0,playoffMoment:0,playoffStarted:false,cpuTeams:cpus.map(c=>c.id),cpuDifficulty:difficulty});
  setCpuSetup(false);setSearch('');setSelected('');setChosenCat('');setNotice('');
}
function start(){const teams=names.map((name,id)=>({id,name:name.trim()||`Team ${id+1}`,picks:{},lineup:{}}));const order:number[]=[];const shuffled=shuffle(teams.map(t=>t.id));for(let r=0;r<6;r++)order.push(...(r%2?[...shuffled].reverse():shuffled));update({phase:'draft',teams,cats:drawCategories(6).map(c=>c.id),order,pick:0,standings:[],series:[],champion:null,mvp:'',playoffSeriesIndex:0,playoffGameIndex:0,playoffMoment:0,playoffStarted:false});setSearch('');setSelected('');setChosenCat('');setNotice('')}
function draft(pid?:string){const sel=pid||selected;if(!team||!sel||!chosenCat)return;const p=findPlayer(sel),c=cat(chosenCat);if(used.has(p.id)){setNotice('That player has already been drafted.');return}if(team.picks[chosenCat]){setNotice('This category is already filled.');return}if(!c.eligible(p)&&!allow){setNotice('This player is not on the approved list. Enable the host override to allow this pick.');return}const teams=state.teams.map(t=>t.id===team.id?{...t,picks:{...t.picks,[chosenCat]:p.id}}:t);update({teams,pick:state.pick+1,phase:state.pick+1===state.order.length?'lineups':'draft'});setSearch('');setSelected('');setChosenCat('');setAllow(false);setNotice('')}
function autoFillForTesting(){
  // Developer-only shortcut: preserve existing picks, ignore category eligibility,
  // and never draft the same player twice across the board.
  const pool=shuffle(players.filter(p=>!used.has(p.id)));
  const missing=state.teams.reduce((n,t)=>n+state.cats.filter(id=>!t.picks[id]).length,0);
  if(pool.length<missing){setNotice(`Not enough unique players to fill the board (${missing} needed, ${pool.length} available).`);return}
  let index=0;
  const filled=state.teams.map(t=>{
    const picks={...t.picks};
    for(const id of state.cats)if(!picks[id])picks[id]=pool[index++].id;
    return {...t,picks};
  });
  const lined=filled.map(t=>{
    const lineup=autoLineup(t);
    // Safety: if autoLineup failed, just assign in order
    const ids=Object.values(t.picks);
    for(const s of slots)if(!lineup[s]){const remaining=ids.find(id=>!Object.values(lineup).includes(id));if(remaining)lineup[s]=remaining}
    return {...t,lineup};
  });
  const result=regularSeason(lined);
  setPlaying(false);
  update({teams:lined,pick:state.order.length,phase:'season',standings:result.standings,series:[],champion:null,mvp:'',playoffSeriesIndex:0,playoffGameIndex:0,playoffMoment:0,playoffStarted:false});
  setSearch('');setSelected('');setChosenCat('');setAllow(false);setNotice('');
}
function autoLineup(t:Team){const ids=Object.values(t.picks);const positions=slots.slice(0,5);let best=-Infinity,bestMap:Record<string,string>={};function perm(arr:string[],idx:number){if(idx===5){let score=0;const map:Record<string,string>={};for(let i=0;i<5;i++){const p=findPlayer(arr[i]);map[positions[i]]=p.id;score+=fit(p,positions[i] as 'PG')*(p.overall)}if(score>best){best=score;bestMap={...map,'6TH':ids.find(id=>!arr.slice(0,5).includes(id))!}}return}for(let j=idx;j<ids.length;j++){[ids[idx],ids[j]]=[ids[j],ids[idx]];perm(ids,idx+1);[ids[idx],ids[j]]=[ids[j],ids[idx]]}}perm([...ids],0);return bestMap}
function assign(tid:number,slot:string,pid:string){setState(s=>({...s,teams:s.teams.map(t=>{if(t.id!==tid)return t;const next={...t.lineup};const oldSlot=Object.keys(next).find(k=>next[k]===pid);if(oldSlot&&oldSlot!==slot)next[oldSlot]=next[slot]||'';next[slot]=pid;return {...t,lineup:next}})}))}
function sim(){const result=regularSeason(state.teams);update({phase:'season',standings:result.standings})}
function simPlayoffs(){setPlaying(false);const result=playoffs(state.teams,state.standings);update({phase:'playoffs',series:result.series,champion:result.champion,mvp:finalsMvp(state.teams,result.series,result.champion).id,playoffSeriesIndex:0,playoffGameIndex:0,playoffMoment:0,playoffStarted:false})}
// Advance across active series in a round: Game 1 of each, then Game 2, etc.
const schedule=useMemo(()=>{const result:{si:number;gi:number}[]=[];const rounds=[...new Set(state.series.map(s=>s.round))];for(const r of rounds){const indices=state.series.map((s,i)=>s.round===r?i:-1).filter(i=>i>=0);const max=Math.max(0,...indices.map(i=>state.series[i].games.length));for(let g=0;g<max;g++)for(const si of indices)if(g<state.series[si].games.length)result.push({si,gi:g})}return result},[state.series]);
function simRound(){
  setPlaying(false);setHalfPaused(false);
  const curRound=currentSeries.round;
  let pos=schedule.findIndex(x=>x.si===state.playoffSeriesIndex&&x.gi===state.playoffGameIndex);
  // Advance through schedule while still in the same round
  let next=schedule[pos+1];
  while(next&&state.series[next.si].round===curRound){
    pos++;
    next=schedule[pos+1];
  }
  if(next)update({playoffSeriesIndex:next.si,playoffGameIndex:next.gi,playoffMoment:0,playoffStarted:false});
  else update({phase:'finished'});
}
function nextPlayoffGame(){setPlaying(false);setHalfPaused(false);const pos=schedule.findIndex(x=>x.si===state.playoffSeriesIndex&&x.gi===state.playoffGameIndex);const next=schedule[pos+1];if(next)update({playoffSeriesIndex:next.si,playoffGameIndex:next.gi,playoffMoment:0,playoffStarted:false});else update({phase:'finished'})}
const currentSeries=state.series[state.playoffSeriesIndex];const currentGame=currentSeries?.games[state.playoffGameIndex];const moments=useMemo(()=>currentGame?broadcast(currentGame,state.teams):[],[state.series,state.playoffSeriesIndex,state.playoffGameIndex,state.teams]);const revealed=state.playoffStarted?moments.slice(0,state.playoffMoment):[];const latest=revealed[revealed.length-1];const quarterOf=(m:{clock:string})=>Number(m.clock.match(/Q(\d)/)?.[1]||4);const currentQuarter=latest?quarterOf(latest):1;const currentSeconds=latest?Number(latest.clock.split(' ')[1]?.split(':')[0]||12)*60+Number(latest.clock.split(':')[1]||0):720;const interval=speed==='auto'?(currentQuarter===4&&currentSeconds<=180?1800:currentQuarter===4&&currentSeconds<=300?900:currentQuarter===2&&currentSeconds<=180?900:400):Number(speed);const gameDone=state.playoffStarted&&state.playoffMoment>=moments.length;const displayHome=latest?.homeScore??0;const displayAway=latest?.awayScore??0;
useEffect(()=>{if(!playing||state.phase!=='playoffs'||!state.playoffStarted||gameDone)return;const timer=window.setInterval(()=>setState(s=>({...s,playoffMoment:Math.min(moments.length,s.playoffMoment+1)})),interval);return ()=>window.clearInterval(timer)},[playing,interval,state.phase,state.playoffStarted,gameDone,moments.length]);useEffect(()=>{if(gameDone)setPlaying(false)},[gameDone]);
// Halftime: pause when Q3 begins, require click to continue
useEffect(()=>{
  if(!playing||!state.playoffStarted||gameDone||halfPaused)return;
  if(currentQuarter>=3&&state.playoffMoment>0){
    // Check if we just crossed into Q3
    const prevMoment=moments[state.playoffMoment-1];
    if(prevMoment&&quarterOf(prevMoment)<=2){
      setPlaying(false);setHalfPaused(true);
    }
  }
},[state.playoffMoment,playing]);
// When the draft ends, auto-set lineups for all CPU teams (covers drafts
// where the human made the last pick, so the CPU auto-pick effect never ran it)
useEffect(()=>{
  if(state.phase!=='lineups'||!state.cpuTeams.length)return;
  const needs=state.teams.filter(t=>state.cpuTeams.includes(t.id)&&!slots.every(s=>t.lineup[s]));
  if(!needs.length)return;
  setState(s=>({...s,teams:s.teams.map(t=>s.cpuTeams.includes(t.id)&&!slots.every(x=>t.lineup[x])?{...t,lineup:autoLineup(t)}:t)}));
},[state.phase]);
// Auto-draft for CPU teams with a slight delay so it feels natural
useEffect(()=>{
  if(state.phase!=='draft')return;
  const curId=state.order[state.pick];
  if(!state.cpuTeams.includes(curId))return;
  const t=state.teams.find(x=>x.id===curId);
  if(!t)return;
  // CPU picks which category to draft from based on difficulty
  const catId=cpuChooseCategory(t,state.cats,new Set(state.teams.flatMap(x=>Object.values(x.picks))),state.cpuDifficulty);
  if(!catId)return;
  const timer=setTimeout(()=>{
    const usedIds=new Set(state.teams.flatMap(x=>Object.values(x.picks)));
    const pid=cpuPick(t,catId,usedIds,state.cpuDifficulty);
    if(!pid)return;
    const teams=state.teams.map(x=>x.id===t.id?{...x,picks:{...x.picks,[catId]:pid}}:x);
    const npick=state.pick+1;
    const done=npick===state.order.length;
    const finalTeams=done?teams.map(x=>state.cpuTeams.includes(x.id)?{...x,lineup:autoLineup(x)}:x):teams;
    setState(s=>({...s,teams:finalTeams,pick:npick,phase:done?'lineups':'draft'}));
  },800);
  return ()=>clearTimeout(timer);
},[state.phase,state.pick,state.order,state.cpuTeams]);
const complete=state.teams.every(t=>slots.every(s=>t.lineup[s])&&new Set(Object.values(t.lineup)).size===6);
return <div className={showHome&&state.phase==='setup'?'app home-app':'app'}>{showHome&&state.phase==='setup'?<div className="oob-home">
<nav className="oob-nav">
<div className="oob-logo">OUT OF <span className="oob-pill">BOUNDS</span></div>
</nav>
<header className="oob-hero">
<div className="oob-heroinner">
<div className="oob-eyebrow">ALL-TIME NBA DRAFT SIMULATOR</div>
<h1 className="oob-title">Draft legends.<br/>Build your six.<br/><span>Win it all.</span></h1>
<p className="oob-desc">Inspired by the Enjoy BBall podcast's "Random Drafts", Out of Bounds is the ultimate all-time NBA draft simulator. Build your team from 60 unique categories, compete in custom tournaments, and see how your lineup stacks up against history&apos;s best.</p>
<div className="oob-actions">
<button className="oob-go" onClick={()=>{setShowHome(false);setShowModes(true)}}>START NEW GAME</button>
<button className="oob-ghost" onClick={()=>document.getElementById('oob-cards')?.scrollIntoView({behavior:'smooth'})}>HOW TO PLAY</button>
</div>
</div>
</header>
<div className="oob-stats">
<div className="oob-stat"><strong>2&ndash;6</strong><span>Players per draft</span></div>
<div className="oob-stat"><strong>60</strong><span>Unique categories</span></div>
<div className="oob-stat"><strong>6</strong><span>Rounds, snake draft</span></div>
<div className="oob-stat"><strong>82</strong><span>Game season sim</span></div>
</div>
<section className="oob-cards" id="oob-cards">
<article className="oob-card">
<div className="oob-cardnum">01</div>
<h2>DRAFT</h2>
<p>Take turns selecting players from six random categories. Every pick builds a one-of-a-kind team from NBA history.</p>
</article>
<article className="oob-card">
<div className="oob-cardnum">02</div>
<h2>SIMULATE</h2>
<p>Watch your team compete in a fully simulated 82-game season and playoffs with live game flow.</p>
</article>
<article className="oob-card">
<div className="oob-cardnum">03</div>
<h2>CHAMPION</h2>
<p>Only one team can win. Will your draft strategy lead to a championship?</p>
</article>
</section>
<footer className="oob-foot">OUT OF BOUNDS &mdash; Draft beyond the expected.</footer>
</div>:<>{showModes&&state.phase==='setup'?<div className="mode-select-screen"><div className="oob-logo mode-logo">OUT OF <span className="oob-pill">BOUNDS</span></div><div className="eyebrow">CHOOSE GAME MODE</div><h2>How are you playing?</h2><div className="mode-columns"><div className="mode-column singleplayer"><div className="mode-column-title">SINGLE PLAYER</div><button className="mode-card" onClick={()=>{setShowModes(false);setCpuSetup(true)}}><div className="mode-cardnum">01</div><h3>Vs CPU</h3><p>Draft against computer opponents at your chosen difficulty.</p><span className="mode-cta">Select →</span></button><button className="mode-card disabled" disabled><div className="mode-cardnum">02</div><h3>Daily Beat the Creator</h3><p>A new draft puzzle every day. Outdraft the creator's picks.</p><span className="coming-soon">COMING SOON</span></button></div><div className="mode-column multiplayer"><div className="mode-column-title">MULTIPLAYER</div><button className="mode-card" onClick={()=>setShowModes(false)}><div className="mode-cardnum">03</div><h3>One Device · Take Turns</h3><p>Everyone plays on this device, passing it around. Best for groups in the same room.</p><span className="mode-cta">Select →</span></button><button className="mode-card disabled" disabled><div className="mode-cardnum">04</div><h3>Invite Code Games</h3><p>Play with friends on their own devices using an invite code.</p><span className="coming-soon">COMING SOON</span></button></div></div><button className="ghost" onClick={()=>{setShowModes(false);setShowHome(true)}}>← Back</button></div>:cpuSetup&&state.phase==='setup'?<div className="mode-select-screen"><div className="oob-logo mode-logo">OUT OF <span className="oob-pill">BOUNDS</span></div><div className="eyebrow">VS CPU SETUP</div><h2>Set your matchup</h2><div className="panel narrow"><label>CPU OPPONENTS</label><div className="actions">{[1,2,3,4,5].map(n=><button key={n} className={cpuCount===n?'primary':'ghost'} onClick={()=>setCpuCount(n)}>{n}</button>)}</div><label style={{marginTop:12}}>DIFFICULTY</label><div className="actions"><button className={difficulty==='easy'?'primary':'ghost'} onClick={()=>setDifficulty('easy')}>Easy</button><button className={difficulty==='medium'?'primary':'ghost'} onClick={()=>setDifficulty('medium')}>Medium</button><button className={difficulty==='hard'?'primary':'ghost'} onClick={()=>setDifficulty('hard')}>Hard</button></div><p className="muted" style={{marginTop:8}}>{difficulty==='easy'?'Casual fan — takes obvious stars but reaches and ignores fit.':difficulty==='medium'?'Solid drafter — mostly best available with some mistakes.':'Sharp — drafts for value and positional fit.'}</p><div className="actions" style={{marginTop:12}}><button className="primary" onClick={startVsCpu}>Start Draft →</button></div></div><button className="ghost" onClick={()=>{setCpuSetup(false);setShowModes(true)}}>← Back</button></div>:<><header><div className="oob-logo" style={{cursor:'pointer'}} onClick={()=>{setShowHome(true);setShowModes(false)}} title="Back to home">OUT OF <span className="oob-pill">BOUNDS</span></div><button className="ghost right" onClick={()=>{if(confirm('Reset the draft and start over?')){setState(initial);setNotice('');setShowModes(true)}}}>New game ↻</button></header><nav>{['setup','draft','lineups','season','playoffs'].map((s,i)=><span key={s} className={state.phase===s||(s==='playoffs'&&state.phase==='finished')?'active':''}>{i+1}. {s==='lineups'?'Lineups':s==='season'?'Power Rankings':s[0].toUpperCase()+s.slice(1)}</span>)}</nav>
{state.phase==='setup'&&<main className="narrow"><div className="eyebrow">NEW GAME</div><h2>Who’s drafting?</h2><p className="muted">2–6 teams. Six random categories. Six rounds. Every team makes the playoffs.</p><div className="panel"><label>TEAMS</label>{names.map((n,i)=><div className="name-row" key={i}><span className="seed">{String(i+1).padStart(2,'0')}</span><input value={n} onChange={e=>setNames(ns=>ns.map((x,j)=>i===j?e.target.value:x))}/>{names.length>2&&<button className="iconbutton" onClick={()=>setNames(ns=>ns.filter((_,j)=>i!==j))}>×</button>}</div>)}<div className="actions">{names.length<6&&<button className="ghost" onClick={()=>setNames(ns=>[...ns,`Team ${ns.length+1}`])}>+ Add team</button>}<button className="primary" onClick={start}>Generate draft →</button></div></div><p className="footnote">Starter database: {players.length} manually seeded historical players and {categories.length} draft categories. Data and ratings are provisional; expand before treating this as a complete all-time NBA database.</p></main>}
{state.phase==='draft'&&team&&<main className="draft-main"><div className="draft-heading"><div><div className="eyebrow">ROUND {Math.floor(state.pick/state.teams.length)+1} / 6 · PICK {state.pick+1} / {state.order.length}</div><h2>Category Draft Board</h2><p className="muted">It's <strong>{team.name}</strong>'s turn. Select an empty square in their column to draft a player.</p></div><div className="draft-heading-actions"><button type="button" className="ghost test-autofill" onClick={autoFillForTesting} title="Fill all remaining draft slots with random players and skip to the simulation">⚡ Quick Fill</button><div className="draft-progress">{state.pick} / {state.order.length} picks</div></div></div><div className="draft-board-scroll"><div className="draft-board" style={{gridTemplateColumns:`minmax(200px,280px) repeat(${state.teams.length}, 1fr)`}}><div className="draft-corner">CATEGORY</div>{colOrder.map(tid=>{const t=state.teams.find(x=>x.id===tid)!;return <div key={t.id} className={'draft-column-head '+(t.id===current?'on-clock':'')}><strong>{t.name}</strong><small>{Object.keys(t.picks).length}/6 PICKED {t.id===current?' · ON THE CLOCK':''}</small></div>})}{state.cats.map(id=><Fragment key={id}><div className="draft-category"><strong>{cat(id).name}</strong><small>{cat(id).description}</small></div>{colOrder.map(tid=>{const t=state.teams.find(x=>x.id===tid)!;const pid=t.picks[id];const active=t.id===current;return <button key={t.id+'-'+id} type="button" disabled={!active||!!pid} className={'draft-cell '+(pid?'occupied ':'')+(active&&!pid?'available ':'')+(active&&chosenCat===id?'selected-cell':'')} onClick={()=>{setChosenCat(id);setSearch('');setSelected('');setAllow(false);setNotice('')}}>{pid?<><strong>{findPlayer(pid).name}</strong><small>✓ Drafted</small></>:active?<><span className="cell-plus">+</span><small>{chosenCat===id?'SELECTED':'CHOOSE CATEGORY'}</small></>:<span className="cell-empty">—</span>}</button>})}</Fragment>)}</div></div><div className="draft-bottom"><div className="panel draft-search-panel"><div className="eyebrow">{chosenCat?'SELECT PLAYER':'CHOOSE A CATEGORY'}</div><h3>{chosenCat?`${team.name} · ${cat(chosenCat).name}`:'Click an open square above'}</h3>{chosenCat&&<><label htmlFor="player-search">SEARCH ALL-TIME PLAYERS</label><input id="player-search" autoFocus placeholder="Type a player name…" value={search} onChange={e=>{setSearch(e.target.value);setSelected('');setNotice('')}}/><div className="results">{matches.map(p=>{const elig=cat(chosenCat).eligible(p)||cat(chosenCat).verification!=='host-review';return <div key={p.id} className={'result-row'+(used.has(p.id)?' used':'')}><button disabled={used.has(p.id)} className={selected===p.id?'picked':''} onClick={()=>{setSelected(p.id);setAllow(false);setNotice('')}}><span><b>{p.name}</b><small>{p.positions.join(' / ')} · OVR {p.overall}</small></span><span className="muted">{used.has(p.id)?'DRAFTED':cat(chosenCat).verification==='host-review'?'REVIEW':elig?'✓ ELIGIBLE':'REVIEW'}</span></button>{!used.has(p.id)&&(elig||allow)&&<button className="draft-btn" onClick={()=>draft(p.id)}>Draft →</button>}</div>})}</div>{selected&&!cat(chosenCat).eligible(findPlayer(selected))&&<label className="override"><input type="checkbox" checked={allow} onChange={e=>setAllow(e.target.checked)}/> Group decision: allow this player for this category</label>}{notice&&<p className="warning">{notice}</p>}</>}</div><div className="panel draft-up-next"><div className="eyebrow">COMING UP</div>{state.order.slice(state.pick+1,state.pick+6).map((id,i)=><p className="next" key={i}>#{state.pick+i+2} {state.teams.find(t=>t.id===id)?.name}</p>)}</div></div></main>}
{state.phase==='lineups'&&<main><div className="eyebrow">POST-DRAFT</div><h2>Set your starting five</h2><p className="muted">Assign five starters and a sixth man. Severe positional mismatches reduce effectiveness. Swapping players automatically exchanges their slots.</p><div className="lineup-grid">{state.teams.map(t=>{const isCpu=state.cpuTeams.includes(t.id);return <div className="panel" key={t.id}><div className="lineup-head"><h3>{t.name}{isCpu&&<small style={{marginLeft:8}}>CPU</small>}</h3>{!isCpu&&<button className="ghost small" onClick={()=>setState(s=>({...s,teams:s.teams.map(x=>x.id===t.id?{...x,lineup:autoLineup(x)}:x)}))}>Auto-fit</button>}</div>{slots.map(slot=>{const pid=t.lineup[slot],p=pid?findPlayer(pid):null;const suitability=p&&slot!=='6TH'?fit(p,slot as 'PG'):1;return <div className="slot" key={slot}><span className="slot-name">{slot}</span><select value={pid||''} onChange={e=>assign(t.id,slot,e.target.value)} disabled={isCpu}><option value="">Choose player</option>{Object.values(t.picks).map(id=><option key={id} value={id}>{findPlayer(id).name}</option>)}</select>{p&&slot!=='6TH'&&<span className={'fit '+(suitability>=.95?'good':suitability>=.75?'okay':'bad')}>{Math.round(suitability*100)}%</span>}</div>})}{slots.every(s=>t.lineup[s])&&<div className="strength">Team strength: {strength(t).toFixed(1)}</div>}</div>})}</div><div className="actions bottom"><button className="primary" disabled={!complete} onClick={sim}>Reveal power rankings →</button></div></main>}
{state.phase==='season'&&<main className="narrow"><div className="eyebrow">PRE-PLAYOFF PREVIEW</div><h2>Championship Power Rankings</h2><p className="muted">Projected 82-game records are estimates against a common historical benchmark—not completed games or guarantees. Every team makes the playoffs.</p><div className="rankings">{state.standings.map((st,i)=>{const t=state.teams.find(x=>x.id===st.team)!;const roster=Object.values(t.lineup).map(findPlayer);const scorer=[...roster].sort((a,b)=>b.offense-a.offense)[0];const shooter=[...roster].sort((a,b)=>b.shooting-a.shooting)[0];const stopper=[...roster].sort((a,b)=>b.defense-a.defense)[0];return <div className="ranking-card" key={t.id}><div className="ranking-number">#{i+1}</div><div><h3>{t.name}</h3><p>{scorer.name} leads the attack, while {stopper.name} anchors the defense. {shooter.name} gives this group another way to break a series open. {i===0?'The favorites have a target on their backs.':i===state.standings.length-1?'An underdog with a chance to shock the field.':'A dangerous matchup for anyone in the bracket.'}</p></div><div className="ranking-projection">Projected<br/><strong>{st.wins}–{st.losses}</strong></div></div>})}</div><div className="actions bottom"><button className="primary" onClick={simPlayoffs}>Reveal playoff bracket →</button></div></main>}
{state.phase==='playoffs'&&currentSeries&&currentGame&&<main className="playoff-main">
{!state.playoffStarted?<><div className="eyebrow">THE ROAD TO THE CHAMPIONSHIP</div><div className="playoff-topbar"><h2>Playoff Bracket</h2><div className="playoff-topbar-btns"><button className="primary" onClick={()=>{update({playoffStarted:true,playoffMoment:0});setPlaying(true);setHalfPaused(false)}}>▶ Begin Game {state.playoffGameIndex+1}: {state.teams.find(t=>t.id===currentGame.away)?.name} vs {state.teams.find(t=>t.id===currentGame.home)?.name}</button><button className="ghost" onClick={simRound}>⏩ Sim Round</button></div></div><p className="muted">Round-by-round schedule · Each active series takes its turn before the next set of games.</p><Bracket teams={state.teams} series={state.series} activeIndex={state.playoffSeriesIndex} gameIndex={state.playoffGameIndex} standings={state.standings}/><div className="bracket-round-list">{[...new Set(state.series.map(s=>s.round))].map(r=><div key={r}><b>{playoffRoundName(r,state.series)}</b>{state.series.filter(x=>x.round===r).map((x,i)=><p key={i}>{r<=currentSeries.round?`${state.teams.find(t=>t.id===x.higher)?.name} vs ${state.teams.find(t=>t.id===x.lower)?.name}`:"Awaiting previous round"}</p>)}</div>)}</div><h3 className="roster-title">All Team Rosters</h3><div className="roster-overview">{state.teams.map(t=><Roster key={t.id} team={t}/>)}</div><div className="next-game-card"><div><div className="eyebrow">UP NEXT · {playoffRoundName(currentSeries.round,state.series).toUpperCase()} · GAME {state.playoffGameIndex+1}</div><h3>{state.teams.find(t=>t.id===currentGame.away)?.name} vs {state.teams.find(t=>t.id===currentGame.home)?.name}</h3><p className="muted">Series: {currentSeries.games.slice(0,state.playoffGameIndex).filter(g=>g.winner===currentSeries.higher).length}–{currentSeries.games.slice(0,state.playoffGameIndex).filter(g=>g.winner===currentSeries.lower).length}</p></div></div></>:<><div className="eyebrow">{playoffRoundName(currentSeries.round,state.series).toUpperCase()} · GAME {state.playoffGameIndex+1} · BEST OF SEVEN</div><div className="game-three-column"><Roster team={state.teams.find(t=>t.id===currentGame.away)!} moments={revealed} side="away"/><section className="game-center"><div className="compact-score"><div><small>{state.teams.find(t=>t.id===currentGame.away)?.name}</small><strong>{displayAway}</strong></div><div className="compact-clock">{gameDone?'FINAL':latest?.clock||'TIPOFF'}<small>Series {currentSeries.games.slice(0,state.playoffGameIndex).filter(g=>g.winner===currentSeries.higher).length}–{currentSeries.games.slice(0,state.playoffGameIndex).filter(g=>g.winner===currentSeries.lower).length}</small></div><div><small>{state.teams.find(t=>t.id===currentGame.home)?.name}</small><strong>{displayHome}</strong></div></div><div className="compact-control"><label htmlFor="sim-speed">SIM SPEED</label><select id="sim-speed" value={speed} onChange={e=>setSpeed(e.target.value)}><option value="auto">Auto · Fast / Normal / Slow clutch</option><option value="1800">Slow</option><option value="900">Normal</option><option value="400">Fast</option><option value="100">Ultra</option></select><div className="compact-buttons"><button className="ghost small" disabled={gameDone} onClick={()=>setPlaying(v=>!v)}>{playing?'⏸ Pause':'▶ Resume'}</button><button className="ghost small" disabled={gameDone} onClick={()=>{setPlaying(false);update({playoffMoment:Math.min(moments.length,state.playoffMoment+1)})}}>Next play</button></div><div className="compact-buttons"><button className="ghost small" disabled={gameDone} onClick={()=>{setPlaying(false);const q=currentQuarter;const idx=moments.findIndex((m,i)=>i>=state.playoffMoment&&quarterOf(m)>q);update({playoffMoment:idx<0?moments.length:idx})}}>Sim Quarter</button><button className="ghost small" disabled={gameDone} onClick={()=>{setPlaying(false);const target=currentQuarter<=2?3:5;const idx=moments.findIndex((m,i)=>i>=state.playoffMoment&&quarterOf(m)>=target);update({playoffMoment:idx<0?moments.length:idx})}}>Sim Half</button><button className="ghost small" disabled={gameDone} onClick={()=>{setPlaying(false);update({playoffMoment:moments.length})}}>Sim Game</button></div></div>{halfPaused&&!gameDone&&<div className="halftime-overlay"><div className="halftime-card"><div className="eyebrow">HALFTIME</div><h3>{displayAway} – {displayHome}</h3><p className="muted">First half complete. Click to start the second half.</p><button className="primary" onClick={()=>{setHalfPaused(false);setPlaying(true)}}>▶ Start 2nd Half</button></div></div>}<div className="feed-heading">🎙 LIVE PLAY-BY-PLAY</div><div className="tall-feed">{[...revealed].reverse().map((m,i)=><div className={'broadcast-moment '+(i===0?'newest':'')} key={m.index}><span>{m.clock}</span><div><b>{m.headline}</b><p>{m.text}</p></div></div>)}{!revealed.length&&<p className="muted">The game is underway. Awaiting the opening basket…</p>}</div>{gameDone&&<div className="game-end"><strong>FINAL · {state.teams.find(t=>t.id===currentGame.winner)?.name} wins!</strong><button className="primary" onClick={nextPlayoffGame}>{schedule.findIndex(x=>x.si===state.playoffSeriesIndex&&x.gi===state.playoffGameIndex)===schedule.length-1?'Crown Champion →':'Return to Bracket →'}</button></div>}</section><Roster team={state.teams.find(t=>t.id===currentGame.home)!} moments={revealed} side="home"/></div></>}</main>}
{state.phase==='finished'&&<main className="narrow"><div className="eyebrow">POSTSEASON COMPLETE</div><h2>🏆 {state.teams.find(t=>t.id===state.champion)?.name} wins the title!</h2><ShareResults state={state}/><div className="champ"><span>FINALS MVP</span><strong>{state.mvp?findPlayer(state.mvp).name:'—'}</strong><small>{state.mvp?`${finalsMvp(state.teams,state.series,state.champion!).ppg.toFixed(1)} PPG · ${finalsMvp(state.teams,state.series,state.champion!).rpg.toFixed(1)} RPG · ${finalsMvp(state.teams,state.series,state.champion!).apg.toFixed(1)} APG`:""}</small></div><h3>Playoff series</h3>{Array.from(new Set(state.series.map(s=>s.round))).map(r=><div className="panel" key={r}><div className="eyebrow">{playoffRoundName(r,state.series).toUpperCase()}</div>{state.series.filter(s=>s.round===r).map((s,i)=><div key={i} className="series"><div><b>{state.teams.find(t=>t.id===s.higher)?.name}</b><span> {s.wins[0]} – {s.wins[1]} </span><b>{state.teams.find(t=>t.id===s.lower)?.name}</b></div><button className="ghost small" onClick={()=>setExpanded(expanded===r*100+i?null:r*100+i)}>{expanded===r*100+i?'Hide':'Games'}</button>{expanded===r*100+i&&<div className="game-list">{s.games.map((g,j)=><div key={j}>G{j+1}: {state.teams.find(t=>t.id===g.away)?.name} {g.as} @ {state.teams.find(t=>t.id===g.home)?.name} {g.hs}</div>)}</div>}</div>)}</div>)}<div className="actions bottom"><button className="primary" onClick={()=>{setState(initial);setExpanded(null);setShowModes(true);setShowHome(false)}}>Start another draft →</button></div></main>}<footer>OUT OF BOUNDS · PROTOTYPE V0.9 · Local pass-and-play</footer></>}</>}</div>}
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
