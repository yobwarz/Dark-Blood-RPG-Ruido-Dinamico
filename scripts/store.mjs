import {ID,all,esc,fresh,sceneState,feedback,copy} from './model.mjs';
export const activeGM=()=>!!game.user?.isGM&&game.users.activeGM?.id===game.user.id;
export function guard(){if(!activeGM())throw Error('Esta operação exige o Mestre ativo.');}
let chain=Promise.resolve();export function queue(fn){const p=chain.catch(()=>{}).then(fn);chain=p;return p;}
const PAGE='Estado e recibos de ruído';
const encode=s=>'<pre>'+esc(JSON.stringify(s))+'</pre>';
const decode=s=>s.replace(/^\s*<pre[^>]*>/,'').replace(/<\/pre>\s*$/,'').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&amp;','&');
export const database=()=>game.journal.get(game.settings.get(ID,'database'));
function page(){const d=database();if(!d?.flags?.[ID]?.database)throw Error('Arquivo de ruído indisponível. Restaure o backup; não reinicie os recibos.');const p=all(d.pages).find(x=>x.name===PAGE);if(!p)throw Error('Página de ruído removida. Restaure o backup.');for(const doc of [d,p]){if((doc.ownership?.default??0)>0||all(game.users).some(u=>!u.isGM&&(doc.ownership?.[u.id]??0)>0))throw Error('Mantenha o arquivo e sua página privados aos Mestres.');}return p;}
export async function ensure(){guard();const id=game.settings.get(ID,'database');if(id){page();return;}const d=await JournalEntry.create({name:'Ruído Dinâmico — Arquivo privado do Mestre',ownership:{default:0},flags:{[ID]:{database:true}},pages:[{name:PAGE,type:'text',ownership:{default:-1},text:{format:1,content:encode(fresh())}}]});guard();await game.settings.set(ID,'database',d.id);page();}
export function read(){if(!game.user.isGM)throw Error('Dados reservados ao Mestre.');if(!game.settings.get(ID,'database'))return fresh();const s=JSON.parse(decode(page().text.content));if(s.schema!==1||!s.scenes||!s.receipts||!Number.isSafeInteger(s.revision))throw Error('Formato de ruído inválido.');return s;}
export async function save(s){guard();s.revision++;const target=s.revision;try{await page().update({'text.content':encode(s)});}catch(e){if(read().revision!==target)throw e;}if(read().revision!==target)throw Error('Gravação de ruído recusada.');await publish();Hooks.callAll('ruido.refresh');}
export async function publish(){guard();const s=read(),active=all(game.scenes).find(x=>x.active),data=feedback(s.scenes[active?.id]);if(JSON.stringify(game.settings.get(ID,'public'))!==JSON.stringify(data))await game.settings.set(ID,'public',data);}
export const state=(book,id)=>book.scenes[id]??(book.scenes[id]=sceneState(id,Date.now()/1000));
export async function mutate(fn){return queue(async()=>{guard();await ensure();const b=read();const result=await fn(b);if(result!==false)await save(b);return result;});}
export function owner(token,user){return !!token?.actor&&(user.isGM||token.actor.testUserPermission(user,'OWNER'));}
export async function request(data){if(!game.users.activeGM)throw Error('É necessário um Mestre conectado.');return ChatMessage.create({user:game.user.id,whisper:[...new Set([game.user.id,game.users.activeGM.id])],content:'<p>Ruído Dinâmico — solicitação enviada.</p>',flags:{[ID]:{request:{...copy(data),nonce:foundry.utils.randomID()},status:'pending'}}});}
export async function processRequest(message,options,creator,emit){if(!activeGM())return;const m=game.messages.get(message?.id),r=m?.flags?.[ID]?.request;if(!r||m.uuid!==message.uuid||m.author?.id!==creator)return;const u=game.users.get(creator);try{
 if(!u?.active||Object.keys(r).some(k=>!['kind','tokenUuid','nonce'].includes(k))||!/^[A-Za-z0-9_-]{8,80}$/.test(r.nonce??'')||JSON.stringify(r).length>500)throw Error('Pedido de ruído inválido.');
 const token=await fromUuid(r.tokenUuid);if(token?.documentName!=='Token'||!owner(token,u)||!token.parent?.active&&!u.isGM)throw Error('Escolha um token seu na cena ativa.');
 await emit({kind:r.kind,tokenUuid:token.uuid,key:'request:'+u.id+':'+r.nonce,requester:u.id},u);
 await m.update({['flags.'+ID+'.status']:'done',content:'<p>Ruído Dinâmico — processado.</p>'});
 }catch(e){await m.update({['flags.'+ID+'.status']:'rejected',content:'<p>Ruído Dinâmico — '+esc(e.message)+'</p>'});}}
