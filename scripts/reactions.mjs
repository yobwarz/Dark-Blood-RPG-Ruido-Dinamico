import {ID,all,copy} from './model.mjs';
import {guard,read,save,queue} from './store.mjs';
import {movePoint,clearPath,spawnPositions} from './geometry.mjs';
const marker=t=>t.flags?.[ID]?.receipt;
const snapshot=t=>({x:t.x,y:t.y,hidden:!!t.hidden,dormant:!!t.flags?.[ID]?.dormant});
function same(t,before){return JSON.stringify(snapshot(t))===JSON.stringify(before);}
function movable(t){const a=t.actor;if(!a)throw Error('Token sem ator.');const statuses=new Set([...a.statuses??[]]);if(['morto','dead','incapacitado','paralisado','unconscious','inconsciente','imobilizado','petrificado'].some(x=>statuses.has(x)||a.system?.condicoes?.[x]))throw Error('Ameaça incapaz de mover: '+t.name+'. Confira suas condições.');}
export async function plan(book,scene,r){const s=book.scenes[scene.id],z=s.zones.find(x=>x.id===r.zoneId);if(!s.enabled||!z?.enabled)throw Error('Zona removida ou desativada.');if(book.pending)throw Error('Confira a reação pendente antes de aplicar outra.');if(r.status!=='aguardando'||r.readyAt>Date.now()/1000)throw Error('Reação indisponível ou ainda em deslocamento narrativo.');const steps=[];
 if(z.action==='criar'){
  if(s.spawned+z.count>s.spawnLimit||z.spawned+z.count>z.limit)throw Error('Limite de criação da cena ou zona alcançado.');const actor=game.actors.get(z.actorId);if(!actor||actor.type!=='criatura')throw Error('Escolha um ator de criatura do mundo para a zona.');const proto=await actor.getTokenDocument();const positions=spawnPositions(scene,z,proto.width,proto.height);
  for(const pos of positions){const id=foundry.utils.randomID(),data=proto.toObject();Object.assign(data,{_id:id,...pos,actorId:actor.id,actorLink:false,hidden:z.spawnHidden});data.flags??={};data.flags[ID]={...(data.flags[ID]??{}),receipt:r.id,zone:z.id};steps.push({kind:'create',id,data});}
 }else if(z.action!=='alertar'){
  const ids=[...new Set(z.tokenIds)];if(!ids.length)throw Error('Associe tokens a esta zona.');for(const id of ids){const t=scene.tokens.get(id);if(!t)throw Error('Token associado não existe mais: '+id);if(t.actor?.hasPlayerOwner)throw Error('A zona não pode comandar personagens de jogadores.');const data={['flags.'+ID+'.receipt']:r.id};if(z.action==='acordar'){data['flags.'+ID+'.dormant']=false;if(z.reveal)data.hidden=false;}else{movable(t);const to=movePoint(scene,t,r.point,z.steps);if(!to)continue;if(!clearPath(scene,t,to))throw Error('Movimento bloqueado por parede, limite ou token: '+t.name);Object.assign(data,to);}steps.push({kind:'update',id,before:snapshot(t),data});}
 }
 book.pending={sceneId:scene.id,zoneId:z.id,reactionId:r.id,action:z.action,steps};r.status='revisar';await save(book);return resume(book);
}
async function applied(scene,step,id){const t=scene.tokens.get(step.id);if(!t)return false;if(marker(t)!==id)return false;if(step.kind==='create')return true;return Object.entries(step.data).every(([k,v])=>k==='x'||k==='y'||k==='hidden'?t[k]===v:k.endsWith('.dormant')?!!t.flags?.[ID]?.dormant===v:true);}
export async function resume(book){guard();const p=book.pending;if(!p)throw Error('Sem reação pendente.');const scene=game.scenes.get(p.sceneId),s=book.scenes[p.sceneId],z=s?.zones.find(x=>x.id===p.zoneId),r=s?.reactions.find(x=>x.id===p.reactionId);if(!scene||!z||!r)throw Error('Cena ou zona da pendência removida. Confira manualmente.');
 for(const step of p.steps){guard();if(await applied(scene,step,r.id))continue;
  if(!s.enabled||!z.enabled)throw Error('Cena ou zona desativada; confira a reação pendente.');
  if(step.kind==='create'){if(scene.tokens.get(step.id))throw Error('ID de token ocupado sem recibo. Confira manualmente.');const ghost={...step.data,id:step.id};if(!clearPath(scene,ghost,step.data))throw Error('Local de criação agora ocupado. Confira a pendência.');await scene.createEmbeddedDocuments('Token',[copy(step.data)],{keepId:true,ruidoReaction:r.id});}
  else {const t=scene.tokens.get(step.id);if(!t||!same(t,step.before))throw Error('Token mudou desde a preparação. Confira manualmente; não haverá reaplicação cega.');if(p.action==='mover'){movable(t);if(!clearPath(scene,t,step.data))throw Error('Caminho agora bloqueado.');}await t.update(step.data,{ruidoReaction:r.id});}
  if(!await applied(scene,step,r.id))throw Error('Efeito não confirmado. A reação permanece para conferência.');
 }
 if(p.action==='criar'){s.spawned+=p.steps.length;z.spawned+=p.steps.length;}r.status='concluida';r.finished=Date.now()/1000;book.pending=null;await save(book);return true;
}
export async function recover(action){return queue(async()=>{guard();const b=read(),p=b.pending;if(!p)throw Error('Sem pendência.');if(action==='resume')return resume(b);if(action==='cancel'){const sc=game.scenes.get(p.sceneId);for(const step of p.steps)if(sc?.tokens.get(step.id)&&(marker(sc.tokens.get(step.id))===p.reactionId||step.kind==='create'||!same(sc.tokens.get(step.id),step.before)))throw Error('Há efeitos aplicados. Confira os tokens e encerre após ajuste manual.');}else if(action!=='close')throw Error('Ação inválida.');const r=b.scenes[p.sceneId]?.reactions.find(x=>x.id===p.reactionId);if(r)r.status=action==='cancel'?'recusada':'conferida';b.pending=null;await save(b);});}
