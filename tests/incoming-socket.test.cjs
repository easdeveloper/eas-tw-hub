const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function emitter(){
 const listeners=new Map();
 return {nsp:'/game',connected:true,
  on(event,fn){if(!listeners.has(event))listeners.set(event,new Set());listeners.get(event).add(fn);},
  off(event,fn){assert.equal(typeof fn,'function','never remove game listeners wholesale');listeners.get(event)?.delete(fn);},
  emit(event,data){for(const fn of [...listeners.get(event)||[]])fn(data);},
  count(event){return listeners.get(event)?.size||0;}
 };
}
function fixture(){
 const timers=new Map(),events=[],logs=[];let id=0;
 const window={Connection:{},addEventListener(){},removeEventListener(){},setTimeout(fn,delay){timers.set(++id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id)};
 const document={addEventListener(){},removeEventListener(){}};
 const EAS={Logger:{info:(...args)=>logs.push(args)}};
 const context=vm.createContext({window,document,EAS,clearTimeout:window.clearTimeout,clearInterval(){}});
 const load=()=>vm.runInContext(fs.readFileSync('services/incoming-socket.js','utf8'),context);
 vm.runInContext(fs.readFileSync('core/runtime.js','utf8'),context);load();
 return {window,EAS,events,timers,logs,load,start:()=>EAS.IncomingSocket.start((...args)=>events.push(args)),tick(){const [id,t]=timers.entries().next().value;timers.delete(id);t.fn();}};
}
test('native connected socket is reused once; game listeners survive duplicate bootstrap and cleanup',()=>{
 const f=fixture(),s=emitter();let native=0;s.on('attack',()=>native++);f.window.Connection.socket=s;
 f.start();f.start();f.load();f.start();assert.equal(s.count('attack'),2);assert.equal(s.count('command_count'),1);
 s.emit('attack',{target_village_name:'Village (507|495)'});assert.equal(f.events.length,1);assert.equal(native,1);
 f.EAS.IncomingSocket.stop();assert.equal(s.count('attack'),1);s.emit('attack',{});assert.equal(native,2);assert.equal(f.events.length,1);assert.equal(f.timers.size,0);
});
test('late socket, disconnected socket and reconnect attach once without calling connect/emit',()=>{
 const f=fixture();f.start();assert.equal(f.EAS.IncomingSocket.status().state,'waiting');assert.equal(f.timers.size,1);
 f.tick();const s=emitter();s.connected=false;f.window.Connection.socket=s;f.tick();assert.equal(s.count('attack'),1);assert.equal(f.EAS.IncomingSocket.status().state,'disconnected');
 s.connected=true;s.emit('connect');s.emit('connect');assert.equal(s.count('attack'),1);assert.equal(f.EAS.IncomingSocket.status().state,'connected');
 s.connected=false;s.emit('disconnect');assert.equal(f.EAS.IncomingSocket.status().state,'disconnected');assert.equal(f.timers.size,1);
});
test('socket replacement detaches only old EAS handlers; stale callbacks are ignored',()=>{
 const f=fixture(),old=emitter(),next=emitter();let native=0;old.on('attack',()=>native++);f.window.Connection.socket=old;f.start();
 f.window.Connection.socket=next;old.emit('attack',{});assert.equal(f.events.length,0);
 f.tick();assert.equal(old.count('attack'),1);assert.equal(next.count('attack'),1);assert.equal(f.timers.size,1);
 assert.equal(f.events[0][0],'reconnect');next.emit('attack',{});assert.equal(f.events.length,2);assert.equal(native,1);
 f.EAS.IncomingSocket.stop();f.start();assert.equal(next.count('attack'),1);
});
test('command_count zero is a hint, supports observed types and ignores unrelated counts',()=>{
 const f=fixture(),s=emitter();f.window.Connection.socket=s;f.start();
 for(const command_type of ['incoming_attack','attack','support'])s.emit('command_count',{command_type,count:'0',target_village:{id:'2252',x:'514',y:'456'}});
 assert.equal(f.events.length,2);assert.equal(f.events[0][0],'command_count');assert.equal(f.events[0][1].count,'0');
 assert.equal(s.count('command_count'),1);
});
test('wrong namespace never binds; logger and consumer failures do not break game dispatch',()=>{
 const f=fixture(),s=emitter();f.window.Connection.socket=s;s.nsp='/other';f.start();assert.equal(s.count('attack'),0);
 s.nsp='/game';f.EAS.Logger.info=()=>{throw Error('logger')};f.tick();assert.equal(s.count('attack'),1);
 f.EAS.IncomingSocket.stop();f.EAS.IncomingSocket.start(()=>{throw Error('handler')});assert.doesNotThrow(()=>s.emit('attack',{}));
});
