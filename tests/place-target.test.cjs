const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('services/place.js','utf8');
function fixture({split=true,typed='',nativeX='',nativeY='',targetId=''}={}){
 const events=[];
 const node=(name,value)=>({name,value,disabled:false,readOnly:false,dataset:{},focus(){events.push('focus');},blur(){events.push('blur');},dispatchEvent(e){events.push(name+':'+e.type);},closest(){return form;},getBoundingClientRect(){return {width:100,height:20};}});
 const input=node('input',typed),x=node('x',nativeX),y=node('y',nativeY),id=node('target_id',targetId);
 const fields=[input,...split?[x,y]:[],id];
 const form={querySelector(selector){return selector.includes('target_id')?id:fields.find(f=>selector===`input[name="${f.name}"]`)||null;}};
 const doc={querySelector:()=>form,querySelectorAll:()=>[input]};
 const w={document:doc,location:{href:'https://test/game.php?screen=place&village=9'},getComputedStyle:()=>({}),HTMLInputElement:{prototype:{}},Event:class{constructor(type){this.type=type;}},KeyboardEvent:class{constructor(type){this.type=type;}},FormData:class{getAll(name){return fields.filter(f=>f.name===name&&!f.disabled).map(f=>f.value);}}};doc.defaultView=w;
 const sandbox={window:w,document:doc,location:w.location,URL,sessionStorage:{removeItem(){}},localStorage:{removeItem(){}},EAS:{World:{},Utils:{parseCoordinate:v=>/^\d{1,3}\|\d{1,3}$/.test(v||'')?{coordinate:v}:null}}};vm.createContext(sandbox);vm.runInContext(source,sandbox);
 return {api:sandbox.EAS.Place,w,input,x,y,id,events,fields};
}
test('existing adapter fills coordinate and native x/y with events; null village ID works',()=>{
 const f=fixture();const result=f.api.ensureCommandTarget('604|379',f.w,null);
 assert.equal(result.targetValidated,true);assert.equal(f.input.value,'604|379');assert.equal(f.x.value,'604');assert.equal(f.y.value,'379');assert.equal(f.id.value,'');assert.ok(f.events.includes('input:keyup'));assert.ok(f.events.includes('blur'));
});
test('direct coordinate form accepts null ID and valid submitted coordinate',()=>{
 const f=fixture({split:false,typed:'604|379'});const r=f.api.ensureCommandTarget('604|379',f.w,null);assert.equal(r.targetValidated,true);assert.equal(r.applyTarget,false);
});
test('visible text alone cannot hide empty submitted coordinates',()=>{
 const f=fixture({typed:'604|379'});assert.equal(f.api.readCommandTarget(f.w).actualTarget,null);
 f.x.readOnly=true;f.y.readOnly=true;assert.equal(f.api.ensureCommandTarget('604|379',f.w).targetValidated,false);
});
test('empty or wrong target after failed repair blocks validation',()=>{
 for(const value of ['', '500|500']){const f=fixture({split:false,typed:value});f.api.fillCommandTarget=()=>false;const r=f.api.ensureCommandTarget('604|379',f.w);assert.equal(r.targetValidated,false);assert.equal(r.code,'TARGET_NOT_APPLIED');}
});
test('one repair restores a changed target before validation',()=>{
 const f=fixture({typed:'500|500',nativeX:'500',nativeY:'500'});const r=f.api.ensureCommandTarget('604|379',f.w);assert.equal(r.targetValidated,true);assert.equal(r.inputValueBefore,'500|500');assert.equal(r.inputValueAfter,'604|379');
});
test('disabled coordinate fields and conflicting selected village IDs block submission',()=>{
 const f=fixture({typed:'604|379',nativeX:'604',nativeY:'379'});f.x.disabled=true;assert.equal(f.api.ensureCommandTarget('604|379',f.w).targetValidated,false);
 const other=fixture({split:false,typed:'604|379',targetId:'99'});assert.equal(other.api.ensureCommandTarget('604|379',other.w,null).targetValidated,false);assert.equal(other.id.value,'99');
});
test('duplicate successful coordinate controls do not validate an ambiguous payload',()=>{
 const f=fixture({typed:'604|379',nativeX:'604',nativeY:'379'});f.fields.push({...f.x,value:'100'});assert.equal(f.api.ensureCommandTarget('604|379',f.w).targetValidated,false);
});
