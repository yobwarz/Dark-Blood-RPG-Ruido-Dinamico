import {ID,all,noise,tick,PRESETS,num,text,validZone,copy} from './model.mjs';
import {activeGM,guard,mutate,state,owner,request,read,queue,save} from './store.mjs';
import {center,size,bounds} from './geometry.mjs';
import {plan} from './reactions.mjs';
export const now=()=>Date.now()/1000;
const uid=()=>foundry.utils.randomID();
export function environment(scene){return {now:now(),uid,size:size(scene),walls:all(scene.walls)};}
function quietFor(s,t,kind){const c=s.tokens[t.id]??{};return Number(kind==='tiro'?c.quietGun??0:['atencao','veiculo','pesada'].includes(kind)?c.quietMovement??0:0);}
export async function emit(input,user=game.user){
 if(!activeGM())return request({kind:input.kind,tokenUuid:input.tokenUuid});
 if(!Object.hasOwn(PRESETS,input.kind))throw Error('Tipo de ruído inválido.');
 let token=null,scene,point;if(input.tokenUuid){token=await fromUuid(input.tokenUuid);if(token?.documentName!=='Token'||!owner(token,user))throw Error('Sem controle da origem do ruído.');scene=token.parent;point=center(token,scene);}else{if(!user.isGM)throw Error('Escolha um token seu.');scene=game.scenes.get(input.sceneId);point=input.point;}
 if(!scene||!user.isGM&&!scene.active)throw Error('Cena de origem indisponível.');const bnd=bounds(scene);if(!point||point.x<bnd.x||point.y<bnd.y||point.x>bnd.x+bnd.w||point.y>bnd.y+bnd.h)throw Error('Origem fora da cena.');
 const key=input.key??'manual:'+uid();await mutate(b=>{if(Object.hasOwn(b.receipts,key))return false;const s=state(b,scene.id);if(!user.isGM){const stamp=s.lastSource[user.id]??0;if(now()-stamp<2)throw Error('Aguarde dois segundos entre solicitações de barulho.');s.lastSource[user.id]=now();}
 const e=environment(scene),quiet=quietFor(s,token??{},input.kind)+(user.isGM?num(input.quiet??0,0,3):0);const added=noise(s,input.kind,point,e,{key,quiet,label:PRESETS[input.kind].name});b.receipts[key]={at:e.now};
 // Rotas são vínculos narrativos explícitos, sempre sujeitos à confirmação no destino.
 if(s.enabled)for(const route of s.routes){if(!route.enabled||s.level<route.threshold||e.now-(route.last??-Infinity)<route.cooldown)continue;const target=game.scenes.get(route.sceneId),dest=target&&state(b,target.id),z=dest?.zones.find(x=>x.id===route.zoneId);if(!dest?.enabled||!z?.enabled||dest.reactions.some(r=>r.routeId===route.id&&['aguardando','revisar'].includes(r.status)))continue;dest.reactions.push({id:uid(),zoneId:z.id,routeId:route.id,label:z.name+' · aproximação entre cenas',point:{x:z.x+z.w/2,y:z.y+z.h/2},status:'aguardando',at:e.now,readyAt:e.now+route.delay,forceConfirm:true});route.last=e.now;}
 return added;});await automatic();
}
export async function configure(op,data){guard();return mutate(async b=>{
 const scene=game.scenes.get(data.sceneId);if(!scene)throw Error('Cena indisponível.');const s=state(b,scene.id);if(op==='config'){
 for(const k of ['enabled','night','feedback','auto'])s[k]=!!data[k];for(const [k,min,max] of [['decay',0,3600],['memory',10,3600],['nightFactor',1,3],['rain',.1,1],['wind',.1,1],['open',.5,2],['wallLoss',0,1],['spawnLimit',0,200]])s[k]=num(data[k],min,max,k==='spawnLimit');
 }else if(op==='level'){s.level=num(data.level,0,4,true);s.elapsed=0;}
 else if(op==='zone'){if(s.zones.length>=60&&!data.id)throw Error('Máximo de 60 zonas por cena.');const old=s.zones.find(x=>x.id===data.id);if(data.id&&!old)throw Error('Zona removida.');if(b.pending?.sceneId===scene.id&&b.pending.zoneId===data.id)throw Error('Confira a pendência antes de editar esta zona.');const z=validZone(data,old);z.id=old?.id??uid();if(!z.tokenIds.every(id=>scene.tokens.get(id)))throw Error('Há tokens ausentes na zona.');if(old)s.zones[s.zones.indexOf(old)]=z;else s.zones.push(z);}
 else if(op==='zoneDelete'){if(b.pending?.zoneId===data.id)throw Error('Confira a reação pendente primeiro.');s.zones=s.zones.filter(z=>z.id!==data.id);for(const r of s.reactions)if(r.zoneId===data.id&&r.status==='aguardando')r.status='recusada';}
 else if(op==='rearm'){const z=s.zones.find(z=>z.id===data.id);if(!z)throw Error('Zona removida.');z.armed=true;z.alert=0;}
 else if(op==='token'){const t=scene.tokens.get(data.id);if(!t)throw Error('Token removido.');s.tokens[t.id]={vehicle:!!data.vehicle,quietGun:num(data.quietGun,0,2,true),quietMovement:num(data.quietMovement,0,2,true)};}
 else if(op==='item'){const item=await fromUuid(data.uuid);if(item?.documentName!=='Item')throw Error('Item indisponível.');if(!['auto','silencioso','tiro','explosao','pesada'].includes(data.kind))throw Error('Tipo inválido.');s.itemRules[item.uuid]={kind:data.kind,quiet:num(data.quiet,0,2,true),ammoFallback:!!data.ammoFallback};}
 else if(op==='route'){const dst=game.scenes.get(data.targetSceneId),z=state(b,dst?.id??'').zones.find(z=>z.id===data.zoneId);if(!dst||dst.id===scene.id||!z)throw Error('Escolha uma zona de outra cena já configurada.');if(s.routes.length>=20)throw Error('Limite de 20 rotas.');s.routes.push({id:uid(),sceneId:dst.id,zoneId:z.id,enabled:true,threshold:num(data.threshold,1,4,true),delay:num(data.delay,0,3600),cooldown:num(data.cooldown,10,3600),last:null});}
 else if(op==='routeDelete')s.routes=s.routes.filter(x=>x.id!==data.id);
 else if(op==='reactionReject'){const r=s.reactions.find(x=>x.id===data.id);if(r?.status==='aguardando')r.status='recusada';}
 else if(op==='reactionNow'){const z=s.zones.find(x=>x.id===data.id);if(!z?.enabled)throw Error('Escolha uma zona ativa.');if(s.reactions.some(r=>r.zoneId===z.id&&['aguardando','revisar'].includes(r.status)))throw Error('Esta zona já tem uma reação aguardando conferência.');s.reactions.push({id:uid(),zoneId:z.id,label:z.name,point:s.events.at(-1)??{x:z.x+z.w/2,y:z.y+z.h/2},status:'aguardando',at:now(),readyAt:now(),forceConfirm:true});}
 else throw Error('Operação inválida.');
 });}
export async function approve(sceneId,id){return queue(async()=>{guard();const b=read(),scene=game.scenes.get(sceneId),r=b.scenes[sceneId]?.reactions.find(x=>x.id===id);if(!scene||!r)throw Error('Reação ausente.');await plan(b,scene,r);});}
export async function automatic(){if(!activeGM())return;const b=read();if(b.pending||game.paused)return;for(const s of Object.values(b.scenes)){if(!s.enabled)continue;for(const r of s.reactions){const z=s.zones.find(z=>z.id===r.zoneId);if(r.status==='aguardando'&&r.readyAt<=now()&&!r.forceConfirm&&z?.enabled&&z.mode==='automatico'&&(z.action!=='criar'||z.allowAutoSpawn)){try{await approve(s.id,r.id);}catch(e){ui.notifications.warn('Ruído: '+e.message);return;}}}}}
export async function heartbeat(){if(!activeGM())return;await mutate(b=>{let changed=false;for(const s of Object.values(b.scenes))changed=tick(s,now(),game.paused)||changed;return changed;});await automatic();}
