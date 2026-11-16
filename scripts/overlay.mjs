import {ID,all,soundAt} from './model.mjs';
import {read} from './store.mjs';
import {bounds,size} from './geometry.mjs';
let layer=null,badge=null;
export function destroy(){layer?.destroy({children:true});layer=null;badge?.remove();badge=null;}
export function draw(){destroy();const scene=canvas?.scene;if(!scene)return;
 if(!game.user.isGM){const p=game.settings.get(ID,'public');if(p?.sceneId!==scene.id)return;badge=document.createElement('div');badge.className='rd-feedback';badge.textContent=p.message;badge.setAttribute('role','status');document.body.append(badge);return;}
 if(!game.settings.get(ID,'heatmap')||!canvas.ready||!globalThis.PIXI)return;const s=read().scenes[scene.id];if(!s?.enabled)return;const b=bounds(scene),unit=Math.max(size(scene),Math.sqrt(b.w*b.h/700)),g=new PIXI.Graphics();layer=g;g.eventMode='none';canvas.stage.addChild(g);const walls=all(scene.walls);
 for(let y=b.y;y<b.y+b.h;y+=unit)for(let x=b.x;x<b.x+b.w;x+=unit){const p={x:x+unit/2,y:y+unit/2},pressure=Math.min(4,s.events.slice(-20).reduce((n,e)=>n+soundAt(e,p,s,walls,size(scene)),0));if(pressure<.05)continue;g.beginFill(pressure>2?0xcc4444:0xd4a350,Math.min(.38,pressure*.11));g.drawRect(x,y,Math.min(unit,b.x+b.w-x),Math.min(unit,b.y+b.h-y));g.endFill();}
 for(const e of s.events.slice(-20)){g.lineStyle(2,0xd4a350,Math.max(.08,.7*(1-e.age/e.life)));g.drawCircle(e.x,e.y,size(scene)*.3);}
 for(const z of s.zones){if(!z.enabled)continue;g.lineStyle(2,z.armed?0xd4b66f:0x81878a,.7);g.drawRect(z.x,z.y,z.w,z.h);}
}
