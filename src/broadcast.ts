import type {Game,Team} from './sim';
import {findPlayer} from './sim';
export type BroadcastMoment={index:number;clock:string;headline:string;text:string;homeScore:number;awayScore:number;scorerId:string;points:number;assisterId:string;rebounderId:string};
function seeded(seed:number){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
function hash(s:string){let n=2166136261;for(const c of s)n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0}
export function broadcast(g:Game,teams:Team[]):BroadcastMoment[]{
 const home=teams.find(t=>t.id===g.home)!;const away=teams.find(t=>t.id===g.away)!;
 const random=seeded(hash(`${g.home}-${g.away}-${g.hs}-${g.as}-${Object.values(home.lineup).join('-')}`));
 const roster=(t:Team)=>Object.values(t.lineup).map(findPlayer).filter(Boolean);
 const hp=roster(home),ap=roster(away);
 // Distribute the already-simulated final score into individual made baskets.
 // The broadcast never invents points that disagree with the game result.
 const baskets=(total:number)=>{const pts:number[]=[];let left=total;while(left>0){const p=left===1?1:left===2?2:random()<.32?3:2;pts.push(p);left-=p}return pts};
 const h=baskets(g.hs),a=baskets(g.as);const events:{home:boolean;pts:number;time:number}[]=[];
 // Spread scoring events across 48 minutes; keep alternating possessions loosely balanced.
 let hi=0,ai=0;const total=h.length+a.length;
 let homePts=0,awayPts=0;
 for(let i=0;i<total;i++){
  const remainingHome=h.slice(hi).reduce((x,y)=>x+y,0),remainingAway=a.slice(ai).reduce((x,y)=>x+y,0);
  const progress=(i+1)/total;
  // Keep a realistic back-and-forth score trajectory, with occasional organic
  // streaks, while still landing exactly on the predetermined final result.
  const finalMargin=g.hs-g.as;
  const expectedMargin=finalMargin*progress;
  const currentMargin=homePts-awayPts;
  const available=remainingHome+remainingAway;
  const base=available?remainingHome/available:.5;
  const correction=Math.max(-.19,Math.min(.19,(expectedMargin-currentMargin)/24));
  const homeChance=Math.max(.14,Math.min(.86,base+correction));
  const side=hi>=h.length?false:ai>=a.length?true:random()<homeChance;
  const pts=side?h[hi++]:a[ai++];if(side)homePts+=pts;else awayPts+=pts;
  events.push({home:side,pts,time:Math.max(0,2880-Math.round((i+1)*2880/(total+1)))});
 }
 let hs=0,as=0;
 return events.map((e,i)=>{if(e.home)hs+=e.pts;else as+=e.pts;const team=e.home?home:away;const pool=e.home?hp:ap;const weighted=pool.map(p=>Math.max(1,p.offense+(e.pts===3?p.shooting*.7:0)-70));const sum=weighted.reduce((x,y)=>x+y,0);let pick=random()*sum;let player=pool[0];for(let j=0;j<pool.length;j++){pick-=weighted[j];if(pick<=0){player=pool[j];break}}const q=Math.min(4,Math.floor((2880-e.time)/720)+1);const remaining=e.time-(4-q)*720;const clock=`Q${q} ${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')}`;const close=Math.abs(hs-as)<=3;const headline=e.pts===3?`${player?.name??team.name} hits from deep!`:e.pts===1?`${player?.name??team.name} at the line`:`${player?.name??team.name} scores!`;const text=e.pts===3?`${player?.name} buries the three for ${team.name}! ${close?'This game is on a knife edge!':''}`:e.pts===1?`${player?.name} knocks down a free throw. ${team.name} keeps adding points.`:`${player?.name} gets the bucket for ${team.name}. ${close?'Neither team can pull away!':''}`;// Approximate per-possession supporting stats, allocated deterministically.
 // Assists are assigned on a portion of made field goals; rebounds are modeled
 // from an implicit missed-shot possession before each scoring event.
 const others=pool.filter(p=>p.id!==player?.id);
 const assistChance=e.pts===1?0:e.pts===3?.72:.57;
 const chooseWeighted=(ps:typeof pool,key:'passing'|'rebounding')=>{const weights=ps.map(p=>Math.max(1,p[key]-45));const sum=weights.reduce((a,b)=>a+b,0);let roll=random()*sum;return ps.find((p,j)=>(roll-=weights[j])<=0)||ps[ps.length-1]};
 const assisterId=others.length&&random()<assistChance?chooseWeighted(others,'passing')?.id||'':'';
 const reboundPool=random()<.77?pool:(e.home?ap:hp);
 const rebounderId=reboundPool.length&&random()<.64?chooseWeighted(reboundPool,'rebounding')?.id||'':'';
 return {index:i,clock,headline,text,homeScore:hs,awayScore:as,scorerId:player?.id??"",points:e.pts,assisterId,rebounderId}});
}
