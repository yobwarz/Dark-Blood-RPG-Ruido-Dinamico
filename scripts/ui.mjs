import {ID,all,LEVELS,PRESETS,sceneState} from './model.mjs';
import {read,activeGM} from './store.mjs';
import {emit,configure,approve} from './service.mjs';
import {recover} from './reactions.mjs';
import {sceneForm,zoneForm,routeForm,itemForm,sourceForm,routeTargets,confirm} from './forms.mjs';
import {draw} from './overlay.mjs';
const {ApplicationV2,HandlebarsApplicationMixin}=foundry.applications.api;
export const safe=fn=>async(...args)=>{try{return await fn(...args);}catch(e){console.error(ID,e);ui.notifications.warn(e.message);}};
export class NoisePanel extends HandlebarsApplicationMixin(ApplicationV2){
 static DEFAULT_OPTIONS={id:'se-ruido',classes:['sangue-escuro','rd-window'],window:{title:'Ruído Dinâmico',resizable:true},position:{width:760,height:780},actions:{ruido:NoisePanel.action}};
 static PARTS={main:{template:`modules/${ID}/templates/panel.hbs`,scrollable:['.rd-body']}};
 constructor(options={}){super(options);this.sceneId=canvas?.scene?.id??game.scenes.active?.id;}
 async _prepareContext(){const gm=game.user.isGM;if(!gm)return {gm:false,canAttention:!!canvas.tokens?.controlled?.some(t=>t.actor?.isOwner),feedback:game.settings.get(ID,'public')?.sceneId===canvas?.scene?.id?game.settings.get(ID,'public')?.message:'O indicador está oculto pelo Mestre.'};const b=read();if(!game.scenes.get(this.sceneId))this.sceneId=all(game.scenes)[0]?.id;const scene=game.scenes.get(this.sceneId),s=b.scenes[scene?.id]??sceneState(scene?.id,Date.now()/1000);this.current=s;
 return {gm:true,canRoute:!!scene&&Object.keys(routeTargets(scene)).length>0,canEdit:activeGM(),hasScene:!!scene,scenes:all(game.scenes).map(x=>({id:x.id,name:x.name,selected:x.id===this.sceneId})),name:scene?.name,level:LEVELS[s.level],percent:s.level*25,enabled:s.enabled,decay:s.decay,heat:game.settings.get(ID,'heatmap'),pending:b.pending,spawned:s.spawned,spawnLimit:s.spawnLimit,zones:s.zones.map(z=>({...z,alertText:Number(z.alert).toFixed(1),modeText:z.mode==='automatico'?'Automática':'Confirmar com o Mestre',actionText:{alertar:'Alerta',acordar:'Acordar',mover:'Aproximar',criar:'Criar criaturas'}[z.action]})),reactions:s.reactions.filter(r=>['aguardando','revisar'].includes(r.status)).map(r=>({...r,waiting:r.status==='aguardando',delayed:r.readyAt>Date.now()/1000,time:Math.max(0,Math.ceil(r.readyAt-Date.now()/1000))})),routes:s.routes.map(r=>({...r,name:game.scenes.get(r.sceneId)?.name??'Cena removida'})),history:s.history.slice(-8).reverse(),presets:Object.entries(PRESETS).map(([id,p])=>({id,name:p.name})),connected:!!game.users.activeGM};}
 _onRender(context,options){super._onRender?.(context,options);this.element.querySelector('[data-rd-scene]')?.addEventListener('change',safe(async e=>{this.sceneId=e.target.value;await this.render(false);}));}
 static async action(e,b){b.disabled=true;try{await this.perform(b.dataset.op,b.dataset);}catch(error){console.error(ID,error);ui.notifications.warn(error.message);}finally{if(b.isConnected)b.disabled=false;}}
 async perform(op,d){const scene=game.scenes.get(this.sceneId),s=this.current;if(op==='attention'){const t=canvas.tokens?.controlled?.find(t=>t.actor?.isOwner);if(!t){ui.notifications.info('Selecione um token seu no canvas para chamar atenção.');return;}await emit({kind:'atencao',tokenUuid:t.document.uuid});return;}
 if(!activeGM())throw Error('Use o Mestre ativo para alterar esta cena.');
 if(op==='settings')await sceneForm(scene,s);
 else if(op==='level')await configure('level',{sceneId:scene.id,level:Math.max(0,Math.min(4,d.value==='zero'?0:s.level+Number(d.value)))});
 else if(op==='heat'){await game.settings.set(ID,'heatmap',!game.settings.get(ID,'heatmap'));draw();}
 else if(op==='zone')await zoneForm(scene,s.zones.find(z=>z.id===d.id));
 else if(op==='rearm')await configure('rearm',{sceneId:scene.id,id:d.id});
 else if(op==='zoneDelete'){if(await confirm('Excluir zona','Remover a zona e recusar suas reações ainda não aplicadas?'))await configure('zoneDelete',{sceneId:scene.id,id:d.id});}
 else if(op==='immediate')await configure('reactionNow',{sceneId:scene.id,id:d.id});
 else if(op==='approve'){if(await confirm('Aplicar reação','Executar a ação configurada na zona? Criações e movimentos alteram os tokens da cena.'))await approve(scene.id,d.id);}
 else if(op==='reject')await configure('reactionReject',{sceneId:scene.id,id:d.id});
 else if(op==='resume')await recover('resume');
 else if(op==='cancel'){if(await confirm('Cancelar pendência','Cancelar somente se nenhum efeito foi aplicado?'))await recover('cancel');}
 else if(op==='close'){if(await confirm('Encerrar após conferência','Confirme que conferiu e ajustou os tokens manualmente. Isso só encerra o registro, sem aplicar ou desfazer efeitos.'))await recover('close');}
 else if(op==='route')await routeForm(scene);
 else if(op==='routeDelete')await configure('routeDelete',{sceneId:scene.id,id:d.id});
 else if(op==='item')await itemForm(scene);
 else if(op==='emit'){const t=canvas.scene?.id===scene.id&&canvas.tokens?.controlled?.length===1?canvas.tokens.controlled[0].document:null;if(t)await emit({kind:d.kind,tokenUuid:t.uuid});else await sourceForm(scene,d.kind);}
 else throw Error('Ação não reconhecida.');await this.render(false);
 }
}
let panel;export async function open(){if(!panel||!panel.rendered)panel=new NoisePanel();return panel.render(true);}
export async function refresh(){draw();if(panel?.rendered)await panel.render(false);}
export class OpenMenu extends ApplicationV2{async render(){await open();return this;}}
