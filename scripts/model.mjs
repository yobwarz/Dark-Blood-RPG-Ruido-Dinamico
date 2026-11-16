export const ID='sangue-escuro-ruido';
export const LEVELS=['Silêncio','Baixo','Médio','Alto','Crítico'];
export const PRESETS={tiro:{name:'Disparo',floor:3,delta:1,range:12},explosao:{name:'Explosão',floor:4,delta:2,range:20},quebra:{name:'Quebra de objeto',floor:3,delta:2,range:7},pesada:{name:'Arma corpo a corpo barulhenta',floor:2,delta:1,range:5},veiculo:{name:'Veículo',floor:2,delta:1,range:12},atencao:{name:'Chamar atenção',floor:3,delta:1,range:8},distracao:{name:'Distração sonora',floor:2,delta:1,range:6}};
export const copy=x=>structuredClone(x);
export const all=c=>c?.contents??Array.from(c?.values?.()??c??[]);
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function num(v,min,max,integer=false){const n=Number(v);if(typeof v==='boolean'||typeof v==='object'||typeof v==='string'&&!v.trim()||v===''||v==null||!Number.isFinite(n)||n<min||n>max||integer&&!Number.isSafeInteger(n))throw Error(`Informe ${integer?'um inteiro':'um número'} entre ${min} e ${max}.`);return n;}
export function text(v,max=160,required=false){if(typeof v!=='string'||v.length>max||required&&!v.trim())throw Error(`Texto inválido (máximo ${max} caracteres).`);return v.trim();}
export const fresh=()=>({schema:1,revision:0,scenes:{},receipts:{},pending:null});
export function sceneState(id,now){return {id,enabled:true,level:0,decay:30,elapsed:0,lastTick:now,memory:120,night:false,nightFactor:1.5,rain:1,wind:1,open:1,wallLoss:.55,feedback:false,auto:true,spawnLimit:40,spawned:0,zones:[],routes:[],events:[],reactions:[],tokens:{},itemRules:{},history:[],lastSource:{}};}
export function segmentCross(a,b,c,d){const cross=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x),eps=1e-7;const on=(p,q,r)=>Math.abs(cross(p,q,r))<eps&&r.x>=Math.min(p.x,q.x)-eps&&r.x<=Math.max(p.x,q.x)+eps&&r.y>=Math.min(p.y,q.y)-eps&&r.y<=Math.max(p.y,q.y)+eps;const x=cross(a,b,c),y=cross(a,b,d),u=cross(c,d,a),v=cross(c,d,b);return x*y<0&&u*v<0||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);}

export function soundAt(event,point,cfg,walls=[],size=100){
 const range=event.range*size*(cfg.night?cfg.nightFactor:1)*cfg.rain*cfg.wind*cfg.open;if(range<=0)return 0;
 const distance=Math.hypot(event.x-point.x,event.y-point.y);if(distance>=range)return 0;
 let strength=event.level*(1-distance/range)**2*Math.max(0,1-event.age/event.life);
 for(const w of walls){if(w.sound<=0||w.door>0&&w.ds===1)continue;const c=w.c;if(c?.length===4&&segmentCross(event,point,{x:c[0],y:c[1]},{x:c[2],y:c[3]}))strength*=1-cfg.wallLoss;}
 return Math.max(0,Math.min(4,strength));
}
export function noise(s,kind,point,env,{quiet=0,key='',label=''}={}){
 if(!Object.hasOwn(PRESETS,kind))throw Error('Tipo de ruído não reconhecido.');if(!s.enabled)return [];
 const p=PRESETS[kind],level=Math.max(0,p.floor-quiet);if(level===0)return [];
 if(!Number.isFinite(point.x)||!Number.isFinite(point.y))throw Error('Origem do ruído inválida.');
 const event={id:env.uid(),key,kind,label:label||p.name,level,range:p.range*Math.max(.15,1-quiet*.25),x:point.x,y:point.y,age:0,life:Math.max(20,s.memory),at:env.now};
 s.level=Math.min(4,Math.max(level,s.level+Math.max(0,p.delta-quiet)));s.elapsed=0;s.events=[...s.events,event].slice(-80);s.history=[...s.history,{id:event.id,kind,label:event.label,level:s.level,at:env.now}].slice(-100);
 const created=[];
 for(const z of s.zones){if(!z.enabled)continue;const heard=soundAt(event,{x:z.x+z.w/2,y:z.y+z.h/2},s,env.walls,env.size)*z.sensitivity;z.alert=Math.min(4,(z.alert??0)+heard);if(!z.armed||z.alert<z.threshold||env.now-(z.lastReaction??-Infinity)<z.cooldown||s.reactions.some(r=>r.zoneId===z.id&&['aguardando','revisar'].includes(r.status)))continue;
  const r={id:env.uid(),zoneId:z.id,eventId:event.id,label:z.name,point:{x:event.x,y:event.y},status:'aguardando',at:env.now,readyAt:env.now,forceConfirm:false};s.reactions.push(r);z.lastReaction=env.now;if(z.once)z.armed=false;created.push(r);
 }
 s.reactions=s.reactions.slice(-200);return created;
}
export function tick(s,now,paused=false){const dt=Math.max(0,Math.min(15,now-(s.lastTick??now)));s.lastTick=now;if(paused||!s.enabled||dt===0)return false;
 if(s.decay>0){s.elapsed+=dt;const drop=Math.floor(s.elapsed/s.decay);s.elapsed%=s.decay;s.level=Math.max(0,s.level-drop);}
 s.events=s.events.map(e=>({...e,age:e.age+dt})).filter(e=>e.age<e.life);
 for(const z of s.zones)z.alert=Math.max(0,(z.alert??0)-dt*4/Math.max(10,s.memory));return true;
}
export function feedback(s){if(!s?.enabled||!s.feedback)return null;return {sceneId:s.id,band:s.level<=1?'calmo':s.level===2?'atencao':'perigo',message:s.level<=1?'O ambiente está silencioso.':s.level===2?'Há ruídos distantes.':'O barulho pode atrair atenção.'};}
export function validZone(raw,old,users){
 const z={id:old?.id,name:text(raw.name,100,true),x:num(raw.x,-100000,100000),y:num(raw.y,-100000,100000),w:num(raw.w,10,100000),h:num(raw.h,10,100000),threshold:num(raw.threshold,1,4),sensitivity:num(raw.sensitivity,.1,3),cooldown:num(raw.cooldown,5,3600),enabled:!!raw.enabled,armed:old?.armed??true,once:!!raw.once,mode:raw.mode,action:raw.action,tokenIds:Array.isArray(raw.tokenIds)?[...new Set(raw.tokenIds.map(x=>text(x,80,true)))]:[],reveal:!!raw.reveal,steps:num(raw.steps??2,1,10),actorId:text(raw.actorId??'',80),count:num(raw.count??1,1,5,true),limit:num(raw.limit??20,1,60,true),spawnHidden:!!raw.spawnHidden,allowAutoSpawn:!!raw.allowAutoSpawn,spawned:old?.spawned??0,alert:old?.alert??0,lastReaction:old?.lastReaction??null};
 if(!['confirmar','automatico'].includes(z.mode)||!['alertar','acordar','mover','criar'].includes(z.action))throw Error('Reação inválida.');if(z.mode==='automatico'&&z.action==='criar'&&!z.allowAutoSpawn)throw Error('Confirme explicitamente a criação automática de tokens nesta zona.');return z;
}
