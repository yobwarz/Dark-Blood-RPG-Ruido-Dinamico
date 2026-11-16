import {ID,all} from './model.mjs';
import {activeGM,owner,read} from './store.mjs';
import {emit} from './service.mjs';
import {tokenOrigin} from './geometry.mjs';
const snapshots=new Map(),candidates=[];
const L4D='sangue-escuro-left-4-dead',TLOU='sangue-escuro-the-last-of-us';
const snap=i=>({ammo:Number(i.system?.municaoAtual),quantity:Number(i.system?.quantidade),fuel:Number(i.flags?.[L4D]?.combustivel)});
export function seed(){snapshots.clear();for(const a of [...all(game.actors),...all(game.scenes).flatMap(s=>all(s.tokens).map(t=>t.actor))].filter(Boolean))for(const i of all(a.items))snapshots.set(i.uuid,snap(i));candidates.length=0;}
function rule(item,scene){return read().scenes[scene.id]?.itemRules[item.uuid]??{};}
function silencer(item){return all(item.parent?.items).some(i=>i.flags?.[TLOU]?.tipo==='silenciador'&&i.flags[TLOU].arma===item.id&&Number(i.system?.usos)>0);}
function origin(actor,speaker={}){return tokenOrigin(actor,speaker.scene,speaker.token);}
function enabled(scene){const s=read().scenes[scene.id];return s?.enabled&&s.auto;}
function canonical(message,creator){const m=game.messages.get(message?.id),user=game.users.get(creator);return m?.uuid===message.uuid&&m.author?.id===creator&&user?.active?{m,user}:{};}
async function actualItem(m,f,user){const item=f.itemUuid?await fromUuid(f.itemUuid):null,actor=f.origem?await fromUuid(f.origem):item?.parent;if(!actor||!item||item.parent?.uuid!==actor.uuid||!(user.isGM||actor.testUserPermission(user,'OWNER')))return {};const src=origin(actor,m.speaker);if(!owner(src.token,user))return {};return {item,...src};}
export async function chat(message,options,creator){if(!activeGM())return;const {m,user}=canonical(message,creator);if(!m)return;const attack=m.flags?.['sangue-escuro']?.teste;
 if(attack?.kind==='ataque'&&!attack.repetido){const synchronous=globalThis.fromUuidSync?.(attack.itemUuid),suppressed=synchronous?silencer(synchronous):null;const src=await actualItem(m,attack,user);if(!src.item||!enabled(src.scene))return;const cfg=rule(src.item,src.scene);if(cfg.kind==='silencioso')return;const managed=src.item.flags?.[L4D]?.tipo;if(['m60','granadas','motosserra'].includes(managed)||cfg.ammoFallback)return;
  const kind=cfg.kind&&cfg.kind!=='auto'?cfg.kind:src.item.type==='arma'&&String(src.item.system?.tipoDano??'').toLowerCase()==='explosivo'?'explosao':src.item.type==='arma'&&src.item.system?.categoria==='fogo'?'tiro':null;if(!kind)return;await emit({kind,tokenUuid:src.token.uuid,key:'native:'+m.uuid,quiet:Math.min(2,Number(cfg.quiet??0)+(kind==='tiro'&&(suppressed??silencer(src.item))?1:0))});return;
 }
 // TLOU não oferece metadados do item na carta de consumível: exigimos também consumo recente real.
 if(m.flags?.[TLOU]?.cartao){const actor=game.scenes.get(m.speaker?.scene)?.tokens.get(m.speaker?.token)?.actor??await fromUuid(m.speaker?.actor?`Actor.${m.speaker.actor}`:'').catch(()=>null);let src;try{src=actor?origin(actor,m.speaker):null;}catch{return;}if(!src||!owner(src.token,user)||!enabled(src.scene))return;
  const title=(m.content.match(/<h3[^>]*>([^<]*)<\/h3>/i)?.[1]??'').trim(),kinds={'Bomba de pregos':'explosao','Bomba de atordoamento':'explosao','Distração sonora':'distracao'},kind=kinds[title];if(!kind)return;
  const entry=[...candidates].reverse().find(c=>!c.used&&c.actor===src.token.actor?.uuid&&c.user===creator&&Date.now()-c.at<5000&&((kind==='distracao'&&['garrafa','tijolo'].includes(c.type))||(title==='Bomba de pregos'&&c.type==='pregos')||(title==='Bomba de atordoamento'&&c.type==='atordoamento')));if(!entry)return;entry.used=true;await emit({kind,tokenUuid:src.token.uuid,key:'native:'+m.uuid});
 }
}
export async function itemUpdate(item,changes,options,creator){const before=snapshots.get(item.uuid),after=snap(item);snapshots.set(item.uuid,after);if(!activeGM()||!before||!item.parent||options?.saquesTransaction||options?.ruidoReaction)return;const user=game.users.get(creator);if(!user?.active||!(user.isGM||item.parent.testUserPermission(user,'OWNER')))return;
 const type=item.flags?.[TLOU]?.tipo;if(['pregos','atordoamento','garrafa','tijolo'].includes(type)&&Number.isFinite(before.quantity)&&after.quantity<before.quantity){candidates.push({actor:item.parent.uuid,user:creator,type,at:Date.now(),used:false});while(candidates.length>100)candidates.shift();}
 let src;try{src=origin(item.parent);}catch{return;}if(!enabled(src.scene)||!owner(src.token,user))return;const cfg=rule(item,src.scene),special=item.flags?.[L4D]?.tipo;let kind=null;
 if(cfg.kind==='silencioso')return;
 if(Number.isFinite(before.ammo)&&after.ammo<before.ammo&&(['m60','granadas'].includes(special)||cfg.ammoFallback))kind=cfg.kind&&cfg.kind!=='auto'?cfg.kind:special==='granadas'?'explosao':'tiro';
 if(special==='motosserra'&&Number.isFinite(before.fuel)&&after.fuel<before.fuel)kind='pesada';
 if(kind)await emit({kind,tokenUuid:src.token.uuid,key:options?.l4dPedido?'native:l4d:'+options.l4dPedido+':'+item.uuid:'native:item:'+item.uuid+':'+foundry.utils.randomID(),quiet:Number(cfg.quiet??0)});
}
export async function tokenUpdate(token,changes,options,creator){if(!activeGM()||options?.ruidoReaction||!('x'in changes||'y'in changes))return;const user=game.users.get(creator),s=read().scenes[token.parent.id];if(!user?.active||!owner(token,user)||!s?.enabled||!s.auto||!s.tokens[token.id]?.vehicle)return;
 // Veículos são habilitados individualmente. Um movimento gera no máximo um pulso a cada 5 s.
 const key='vehicle:'+token.uuid+':'+Math.floor(Date.now()/5000);await emit({kind:'veiculo',tokenUuid:token.uuid,key});
}
export async function effectCreate(effect,options,creator){if(!activeGM()||effect.flags?.[ID]?.event!=='quebra'||effect.disabled)return;const actor=effect.parent,user=game.users.get(creator);if(!actor||!user?.active||!(user.isGM||actor.testUserPermission(user,'OWNER')))return;let src;try{src=origin(actor);}catch{return;}if(enabled(src.scene))await emit({kind:'quebra',tokenUuid:src.token.uuid,key:'native:'+effect.uuid});}
