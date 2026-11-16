import {ID,all} from './model.mjs';
import {activeGM,ensure,mutate,publish,processRequest,state,database} from './store.mjs';
import {emit,heartbeat} from './service.mjs';
import {OpenMenu,open,refresh,safe} from './ui.mjs';
import {tokenForm} from './forms.mjs';
import {seed,chat,itemUpdate,tokenUpdate,effectCreate} from './detectors.mjs';
import {destroy} from './overlay.mjs';
let executor=null;
async function boot(){if(!activeGM())return;await ensure();seed();await mutate(b=>{for(const scene of all(game.scenes))state(b,scene.id).lastTick=Date.now()/1000;});
 // Não reexecutar ações solicitadas em uma sessão anterior sem conferência.
 for(const m of all(game.messages).filter(m=>m.flags?.[ID]?.request&&m.flags[ID].status==='pending'))await m.update({['flags.'+ID+'.status']:'rejected',content:'<p>Ruído Dinâmico — solicitação antiga encerrada. Confira a cena antes de reenviar.</p>'});
}
Hooks.once('init',()=>{
 if(game.system.id!=='sangue-escuro')return;
 game.settings.register(ID,'database',{scope:'world',config:false,type:String,default:''});
 game.settings.register(ID,'public',{scope:'world',config:false,type:Object,default:null,onChange:()=>safe(refresh)()});
 game.settings.register(ID,'heatmap',{name:'Mapa de pressão sonora (somente Mestre)',hint:'Visualização aproximada das últimas fontes e zonas na cena atual.',scope:'client',config:true,type:Boolean,default:false,onChange:()=>safe(refresh)()});
 game.settings.registerMenu(ID,'panel',{name:'Ruído Dinâmico',label:'Abrir painel de ruído',icon:'fas fa-volume-high',type:OpenMenu,restricted:false});
 game.modules.get(ID).api=Object.freeze({version:1,open,emit:({kind,tokenUuid,sceneId,point}={})=>emit({kind,tokenUuid,sceneId,point})});
});
Hooks.on('getSceneControlButtons',config=>{if(game.system.id!=='sangue-escuro')return;const groups=Array.isArray(config)?config:Object.values(config??{}),g=groups.find(x=>['tokens','token'].includes(x.name))??groups[0];if(!g?.tools)return;const tool={name:'sangueEscuroRuido',title:'Ruído Dinâmico',icon:'fas fa-volume-high',button:true,visible:true,onChange:()=>safe(open)()};if(Array.isArray(g.tools)){if(!g.tools.some(x=>x.name===tool.name))g.tools.push(tool);}else g.tools[tool.name]={...tool,order:Object.keys(g.tools).length};});
Hooks.on('renderTokenHUD',(app,html)=>{if(game.system.id!=='sangue-escuro')return;const root=html?.querySelector?html:html?.[0],token=app.document??app.object?.document;if(!root||!token?.actor?.isOwner)return;const col=root.querySelector('.col.right')??root.querySelector('.col');if(!col||root.querySelector('[data-rd-hud]'))return;const b=document.createElement('button');b.type='button';b.className='control-icon';b.dataset.rdHud='attention';b.title='Chamar atenção';b.innerHTML='<i class="fas fa-volume-high" aria-hidden="true"></i>';b.addEventListener('click',safe(()=>emit({kind:'atencao',tokenUuid:token.uuid})));col.append(b);if(game.user.isGM){const c=document.createElement('button');c.type='button';c.className='control-icon';c.title='Ajustes de ruído da origem';c.innerHTML='<i class="fas fa-sliders" aria-hidden="true"></i>';c.addEventListener('click',safe(()=>tokenForm(token)));col.append(c);}});
Hooks.once('ready',async()=>{
 if(game.system.id!=='sangue-escuro')return;
 Hooks.on('createChatMessage',(m,o,u)=>{safe(()=>processRequest(m,o,u,emit))();safe(()=>chat(m,o,u))();});
 Hooks.on('updateItem',safe(itemUpdate));Hooks.on('createItem',()=>seed());Hooks.on('deleteItem',()=>seed());
 Hooks.on('updateToken',safe(tokenUpdate));Hooks.on('createActiveEffect',safe(effectCreate));
 Hooks.on('controlToken',()=>safe(refresh)());
 Hooks.on('canvasReady',()=>safe(refresh)());Hooks.on('canvasTearDown',destroy);Hooks.on('ruido.refresh',()=>safe(refresh)());
 Hooks.on('createScene',()=>safe(async()=>{if(activeGM())await mutate(b=>{for(const scene of all(game.scenes))state(b,scene.id);});})());
 Hooks.on('updateScene',()=>safe(async()=>{if(activeGM())await publish();await refresh();})());
 Hooks.on('updateJournalEntryPage',p=>{if(p.parent?.id===database()?.id)safe(refresh)();});
 for(const event of ['updateUser','createUser','deleteUser'])Hooks.on(event,()=>safe(async()=>{const current=game.users.activeGM?.id;if(current!==executor){executor=current;await boot();}await refresh();})());
 executor=game.users.activeGM?.id;await safe(boot)();await safe(refresh)();let ticking=false;setInterval(async()=>{if(ticking)return;ticking=true;try{await safe(heartbeat)();}finally{ticking=false;}},5000);
});
