import {players} from './data';
import type {Player,Pos} from './data';
export type Team={id:number;name:string;picks:Record<string,string>;lineup:Record<string,string>};
export const slots:('PG'|'SG'|'SF'|'PF'|'C'|'6TH')[]=['PG','SG','SF','PF','C','6TH'];
export const findPlayer=(id:string)=>players.find(p=>p.id===id)!;
export function fit(p:Player,pos:Pos):number{if(p.positions[0]===pos)return 1;if(p.positions.includes(pos))return .97;const idx=['PG','SG','SF','PF','C'].indexOf(pos);const d=Math.min(...p.positions.map(x=>Math.abs(['PG','SG','SF','PF','C'].indexOf(x)-idx)));return [1,.83,.60,.38,.22][d]}
export function strength(team:Team){const starters=slots.slice(0,5).map(s=>({p:findPlayer(team.lineup[s]),s:s as Pos})).filter(x=>x.p);const bench=findPlayer(team.lineup['6TH']);if(starters.length!==5||!bench)return 0;
const ratings=starters.map(({p,s})=>{const f=fit(p,s);return (.33*p.offense+.28*p.defense+.12*p.shooting+.12*p.passing+.1*p.rebounding+.05*p.stamina)*(.68+.32*f)});
const avg=ratings.reduce((a,b)=>a+b,0)/5;
const all=[...starters.map(x=>x.p),bench];const shooting=all.reduce((a,p)=>a+p.shooting,0)/6;const passing=all.reduce((a,p)=>a+p.passing,0)/6;const defense=all.reduce((a,p)=>a+p.defense,0)/6;const stamina=all.reduce((a,p)=>a+p.stamina,0)/6;
const spacing=(shooting-72)*.065;const creation=(passing-72)*.045;const defenseBonus=(defense-78)*.035;const endurance=(stamina-88)*.045;const benchImpact=(bench.overall-85)*.14;
return avg+spacing+creation+defenseBonus+endurance+benchImpact}
export type Game={home:number;away:number;hs:number;as:number;winner:number};
export type Stand={team:number;wins:number;losses:number;pf:number;pa:number};
export function game(a:Team,b:Team):Game{const diff=strength(a)-strength(b);const hs=Math.max(75,Math.round(111+diff*.95+Math.random()*23-11+1.8));let as=Math.max(75,Math.round(111-diff*.95+Math.random()*23-11));if(hs===as)as+=1+Math.floor(Math.random()*7);return {home:a.id,away:b.id,hs,as,winner:hs>as?a.id:b.id}}
// 2015-16 Golden State Warriors benchmark. This is a calibrated *team-level*
// approximation of their 73-win roster (Curry, Thompson, Barnes, Green,
// Bogut, Iguodala, Livingston, Barbosa, Speights, Ezeli), not a full player-level
// recreation. Their historical 73-9 mark is context, NOT a fixed win probability.
const LEAGUE_BASELINE_STRENGTH=76;
function normal():number {
  const u=Math.max(1e-12,Math.random());
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*Math.random());
}
function seasonGame(t:Team,home:boolean):Game {
  // One game vs a league-average baseline. Each result varies naturally.
  // 1 strength point is about 1.2 expected scoreboard points. The 14-point
  // game-to-game margin SD includes variation in both teams' performances.
  const margin=(strength(t)-LEAGUE_BASELINE_STRENGTH)*1.2+(home?2.2:-2.2)+normal()*14;
  const total=226+normal()*15;
  let userScore=Math.max(75,Math.round((total+margin)/2));
  let warriorsScore=Math.max(75,Math.round((total-margin)/2));
  if(userScore===warriorsScore){if(Math.random()<.5)userScore++;else warriorsScore++;}
  const hs=home?userScore:warriorsScore;
  const as=home?warriorsScore:userScore;
  return {home:home?t.id:-1,away:home?-1:t.id,hs,as,winner:userScore>warriorsScore?t.id:-1};
}
export function regularSeason(teams:Team[]){
  const standings:Stand[]=teams.map(t=>({team:t.id,wins:0,losses:0,pf:0,pa:0}));
  const games:Game[]=[];
  // Every drafted team plays 82 games vs a league-average baseline opponent,
  // split evenly between home and away. Records reflect team quality with
  // enough variance that even elite teams drop games. Drafted teams meet in playoffs only.
  for(const t of teams){
    const row=standings.find(s=>s.team===t.id)!;
    for(let i=0;i<82;i++){
      const home=i%2===0;
      const g=seasonGame(t,home);
      games.push(g);
      row.pf+=home?g.hs:g.as;
      row.pa+=home?g.as:g.hs;
      if(g.winner===t.id)row.wins++;else row.losses++;
    }
  }
  standings.sort((a,b)=>b.wins-a.wins||(b.pf-b.pa)-(a.pf-a.pa)||a.team-b.team);
  return {standings,games};
}
export type Series={round:number;higher:number;lower:number;winner:number;wins:[number,number];games:Game[]};
export function playoffs(teams:Team[],standings:Stand[]){let active=standings.map(s=>s.team);const seed=new Map(active.map((id,i)=>[id,i+1]));const series:Series[]=[];let round=1;
while(active.length>1){
 active.sort((a,b)=>seed.get(a)!-seed.get(b)!);
 // The first round trims the bracket to the next lower power of two.
 // When already a power of two, everybody plays (no infinite loop).
 const lowerPower=2**Math.floor(Math.log2(active.length));
 const playing=active.length===lowerPower?active.length:2*(active.length-lowerPower);
 const bye=active.slice(0,active.length-playing);
 const contenders=active.slice(active.length-playing);
 const winners=[...bye];
 for(let i=0;i<playing/2;i++){
  const a=contenders[i],b=contenders[playing-1-i];
  let wa=0,wb=0;const gs:Game[]=[];
  while(wa<4&&wb<4){
   const home=(gs.length%7<2||gs.length%7===4||gs.length%7===6)?teams.find(t=>t.id===a)!:teams.find(t=>t.id===b)!;
   const away=teams.find(t=>t.id===(home.id===a?b:a))!;
   const g=game(home,away);gs.push(g);
   if(g.winner===a)wa++;else wb++;
  }
  const winner=wa===4?a:b;
  winners.push(winner);
  series.push({round,higher:a,lower:b,winner,wins:[wa,wb],games:gs});
 }
 active=winners;round++;
}
const finals=series[series.length-1];const champion=active[0];const championTeam=teams.find(t=>t.id===champion)!;const finalists=finals?[teams.find(t=>t.id===finals.higher)!,teams.find(t=>t.id===finals.lower)!]:[championTeam];return {series,champion,finalists:finalists.map(t=>t.id),mvp:''}}
