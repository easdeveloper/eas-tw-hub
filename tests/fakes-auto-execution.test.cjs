const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('services/fakes-execution.js', 'utf8');
const outgoingRow = require('./outgoing-dom.cjs').row;
const KEY = 'eas_tw_fakes_execution';
function fixture(size = 3, startTime = 100000) {
    let now = startTime, timerId = 0, preparations = 0, attacks = 0, confirmations = 0;
    const timers = new Map(), storage = new Map(), events = [];
    const read = () => JSON.parse(storage.get(KEY) || 'null');
    const write = value => storage.set(KEY, JSON.stringify(value));
    const nodes = new Map();
    function element(tag) {
        return { tag, dataset: {}, children: [], textContent: '', value: '', disabled: false,
            appendChild(child) { this.children.push(child); if(child.id) nodes.set(child.id,child); },
            remove() { nodes.delete(this.id); }, addEventListener(type, callback) { this[type] = callback; },
            focus(){},blur(){},closest(){return form;},getBoundingClientRect(){return {width:100,height:20};},
            dispatchEvent() {}, querySelector() { return null; } };
    }
    let outgoing = [], outgoingAvailable = true, resolved = true;
    let document, input, unit, attackButton, confirmButton, form, error = null;
    const window = { name:'auto-tab', location:{href:''}, HTMLInputElement:{prototype:{}}, Event:class {} };
    const sandbox = { window, URL, console:{debug(){},error(){}}, Date:class extends Date { static now(){return now;} },
        setTimeout(fn, ms) { const id=++timerId;timers.set(id,{fn,at:now+ms});return id; },
        clearTimeout(id) {timers.delete(id);},
        localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
        EAS:{ Utils:{parseCoordinate:value=>/^\d+\|\d+$/.test(value)?{coordinate:value}:null},
            CommandRules:{scanCommandRuleErrors:()=>[],validateCommandComposition:()=>({valid:true}),getWorld:()=> 'test'},
            Place:{getCommandForm:()=>form, readTargetReadiness:target=>({targetReady:resolved&&input.value===target,actualTarget:input.value,reason:'TARGET_RESOLUTION_MISSING'}), ensureCommandTarget:target=>({targetValidated:input.value===target}), fillCommandTarget(target){preparations++;events.push('prepare');assert.equal(read().queue[read().currentIndex].status,'preparing');input.value=target;return true;},
                buildPlaceUrl:id=>`https://test/game.php?screen=place&village=${id}`}}
    };
    function navigate(stage='place', village=9, sameDocument=false) {
        const previousDocument = document;
        nodes.clear();error=null;
        if (stage === 'success') outgoing.push(outgoingRow({id:String(1874818544 + read().currentIndex),source:String(village),target:read().queue[read().currentIndex].target}));
        document = {readyState:'complete',createElement:element,getElementById:id=>nodes.get(id)||null,body:element('body'),
            querySelector(selector){
                if(selector==='#commands_outgoings')return outgoingAvailable?{querySelectorAll:()=>outgoing}:null;
                if(selector==='#command-data-form' || selector==='#command-data-form, form[action*="screen=place"]') return form;
                if(selector==='.error_box, .error') return error;
                return null;
            }};
        input=element('input');unit=element('input');unit.dataset.allCount='100000';
        attackButton={disabled:false,click(){assert.ok(Array.isArray(read().queue[read().currentIndex].confirmationAttempt.outgoingSnapshot.beforeCommandIds));attacks++;events.push('attack');assert.equal(read().queue[read().currentIndex].status,'attacking');}};
        confirmButton={disabled:false,click(){assert.ok(Array.isArray(read().queue[read().currentIndex].confirmationAttempt.outgoingSnapshot.beforeCommandIds));confirmations++;events.push('confirm');assert.equal(read().queue[read().currentIndex].status,'confirming');}};
        form={querySelector(selector){
            if(selector==='#troop_confirm_submit')return stage==='confirm'?confirmButton:null;
            if(selector==='input[name="input"]')return input;
            if(selector==='input[name="spear"]')return unit;
            if(selector==='button[name="attack"]')return attackButton;
            return null;
        }};
        if (sameDocument && previousDocument) document = previousDocument;
        window.document=document;sandbox.document=document;
        window.location.href=`https://test/game.php?screen=place&village=${village}${stage==='confirm'?'&try=confirm':stage==='success'?'&command_id=123':''}`;
    }
    write({autoMode:true,executionTab:'auto-tab',createdAt:now,currentIndex:0,forwardingIndex:null,commandType:'attack',
        troopsPerTarget:{spear:1},queue:Array.from({length:size},(_,i)=>({villageId:9+i%2,target:'501|501',status:'pending'})),prepared:[],completed:[],skipped:[],errors:[]});
    navigate();vm.createContext(sandbox);vm.runInContext(source,sandbox);
    const api=()=>sandbox.EAS.FakesExecution;
    const tick=()=>{assert.ok(timers.size,'timer expected');const [id,t]=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];timers.delete(id);now=t.at;t.fn();};
    const reload=stage=>{navigate(stage,read()?.queue[read().currentIndex]?.villageId||9);vm.runInContext(source,sandbox);api().initialize();};
    return {resolveTarget:value=>{resolved=value;},outgoing:(rows,available=true)=>{outgoing=rows;outgoingAvailable=available;},read,write,tick,navigate,reload,window,storage,timers,events,api,sandbox,
        run:()=>api().initialize(),counts:()=>({preparations,attacks,confirmations}),
        unit:()=>unit,confirm:()=>confirmButton,input:()=>input,
        useNativeTarget(labels = null){
            form.querySelectorAll=selector=>labels ? selector==='.village-item .village-name' ? labels() : [] : selector.includes('#target_selection')?[{textContent:'001 (501|501)'}]:[];
            if(labels){const original=document.getElementById;document.getElementById=id=>id==='place_target'?{
                querySelectorAll:()=>labels().map(name=>({querySelectorAll:()=>[name]})),querySelector:()=>null
            }:original(id);}
            window.getComputedStyle=()=>({});document.defaultView=window;document.querySelectorAll=()=>[input];
            window.FormData=class{getAll(name){return name==='input'?[input.value]:[];}};
            sandbox.location={...window.location,host:'test',origin:'https://test'};sandbox.sessionStorage={removeItem(){}};sandbox.EAS.World={};
            vm.runInContext(fs.readFileSync('services/place.js','utf8'),sandbox);
        },error:value=>{error={textContent:value};},
        next(){const c=read();navigate('place',c.queue[c.currentIndex].villageId);api().initialize();},
        success(){const c=read();navigate('success',c.queue[c.currentIndex].villageId);api().initialize();tick();},
        confirmation(){const c=read();navigate('confirm',c.queue[c.currentIndex].villageId);api().initialize();tick();},
        summary:()=>JSON.parse(storage.get('eas_tw_fakes_execution_summary')||'null')};
}

test('pending prepares, then attacks after a separate delay; duplicate bootstrap creates one timer',()=>{
    const f=fixture();f.run();f.run();assert.equal(f.timers.size,1);assert.equal(f.counts().preparations,0);
    f.tick();assert.equal(f.read().queue[0].status,'prepared');assert.deepEqual(f.counts(),{preparations:1,attacks:0,confirmations:0});
    f.run();f.tick();assert.equal(f.read().queue[0].status,'attacking');assert.equal(f.counts().attacks,1);
    f.run();f.tick();assert.equal(f.counts().attacks,1);assert.equal(f.read().queue[1].status,'pending');
});
test('730 authorized commands execute sequentially, with one preparation/attack/confirmation each',()=>{
    const f=fixture(730);f.run();
    for(let i=0;i<730;i++) {
        assert.equal(f.read().currentIndex,i);f.tick();f.tick();f.confirmation();
        assert.equal(f.read().queue[i].status,'confirming');assert.equal(f.read().completed.length,i);
        f.success();if(i<729){assert.equal(f.read().completed.length,i+1);f.next();}
    }
    assert.equal(f.read(),null);assert.deepEqual(f.counts(),{preparations:730,attacks:730,confirmations:730});
    assert.deepEqual(f.summary().counts,{total:730,completed:730,skipped:0,errors:0,remaining:0});
    assert.equal(f.summary().queue.length,730);assert.equal(f.timers.size,0);
});
for(const state of ['preparing','prepared']) test(`reload during ${state} pauses without repeating preparation`,()=>{
    const f=fixture();const c=f.read();c.queue[0].status=state;f.write(c);f.reload('place');f.tick();
    assert.equal(f.read().paused,true);assert.equal(f.read().queue[0].status,'error');assert.equal(f.counts().preparations,0);assert.equal(f.counts().attacks,0);
    f.run();f.tick();assert.equal(f.counts().preparations,0);
});
test('reload attacking resumes confirmation without another initial attack',()=>{
    const f=fixture();f.run();f.tick();f.tick();f.reload('confirm');f.tick();f.run();f.tick();
    assert.deepEqual(f.counts(),{preparations:1,attacks:1,confirmations:1});
});
test('reload confirming never clicks again and accepts success',()=>{
    const f=fixture(1);f.run();f.tick();f.tick();f.confirmation();f.reload('confirm');f.tick();assert.equal(f.counts().confirmations,1);f.success();assert.equal(f.read(),null);
});
test('uncertain attacking response times out, pauses and cannot retry',()=>{
    const f=fixture();f.run();f.tick();f.tick();for(let i=0;i<50;i++)f.tick();
    assert.equal(f.read().paused,true);assert.equal(f.read().errors[0].state,'attacking');assert.equal(f.read().currentIndex,0);assert.equal(f.timers.size,0);
    f.run();f.tick();assert.equal(f.counts().attacks,1);
});
test('generic game error records identity and pauses without claiming success',()=>{
    const f=fixture();f.run();f.tick();f.tick();f.error('Troops unavailable');f.tick();
    assert.equal(f.read().paused,true);assert.equal(f.read().errors[0].commandKey,'0:9:501|501');assert.equal(f.read().errors[0].villageId,9);assert.equal(f.read().completed.length,0);
});
test('changing prepared troops pauses rather than sending a different command',()=>{
    const f=fixture();f.run();f.tick();f.unit().value=8;f.tick();assert.equal(f.counts().attacks,0);assert.equal(f.read().paused,true);
});
test('disabled confirmation waits and clicks once when enabled',()=>{
    const f=fixture();f.run();f.tick();f.tick();f.navigate('confirm');f.confirm().disabled=true;f.run();f.tick();assert.equal(f.counts().confirmations,0);f.confirm().disabled=false;f.tick();assert.equal(f.counts().confirmations,1);
});
test('completed commands are never resent',()=>{
    const f=fixture(1);const c=f.read();c.queue[0].status='completed';c.completed=['0:9:501|501'];f.write(c);f.run();f.tick();f.tick();assert.equal(f.counts().attacks,0);assert.equal(f.read(),null);
});
test('empty queue finishes and retains summary',()=>{const f=fixture(0);f.run();f.tick();assert.equal(f.read(),null);assert.equal(f.summary().counts.total,0);});
test('stop cancels the pending action and preserves audit',()=>{
    const f=fixture();f.run();f.tick();f.api().automaticControl(f.window,'stop');assert.equal(f.timers.size,0);assert.equal(f.read(),null);assert.equal(f.run(),false);assert.equal(f.counts().attacks,0);assert.equal(f.summary().stopped,true);
});
test('skip and error-skip continue at next command and keep counters correct',()=>{
    const f=fixture();f.run();f.api().automaticControl(f.window,'skip');f.next();f.api().automaticControl(f.window,'error');f.next();f.tick();f.tick();f.confirmation();f.success();
    assert.deepEqual(f.summary().counts,{total:3,completed:1,skipped:1,errors:1,remaining:0});assert.equal(f.summary().errors.length,1);assert.equal(f.counts().attacks,1);
});
test('active command cannot be skipped until paused for explicit recovery',()=>{
    const f=fixture();f.run();f.tick();f.tick();assert.equal(f.api().automaticControl(f.window,'skip'),false);assert.equal(f.read().currentIndex,0);
});
test('manual tab never acquires an automatic execution',()=>{const f=fixture();f.window.name='manual';assert.equal(f.run(),false);assert.equal(f.timers.size,0);});

test('start authorizes AUTO once and binds the village window before the first preparation',async()=>{
    const f=fixture(1);
    f.sandbox.setInterval=f.sandbox.setTimeout;f.sandbox.clearInterval=f.sandbox.clearTimeout;
    f.sandbox.EAS.Place.openVillagePlace=()=>f.window;
    const opening=f.api().start({queue:[{villageId:9,target:'501|501',status:'pending'}],troopsPerTarget:{spear:1},commandType:'attack'});
    assert.equal(f.read().autoMode,true);assert.equal(f.read().executionTab,f.window.name);assert.match(f.window.name,/^eas-fakes:/);
    f.tick();assert.equal(await opening,true);f.tick();f.tick();assert.equal(f.counts().attacks,1);
});
test('start with an empty authorized queue completes without opening a village',async()=>{
    const f=fixture();assert.equal(await f.api().start({queue:[]}),true);assert.equal(f.read(),null);assert.equal(f.summary().counts.total,0);
});
test('last command error completes with an error audit and no send',()=>{
    const f=fixture(1);f.run();f.tick();f.unit().value=9;f.tick();assert.equal(f.read(),null);assert.equal(f.summary().counts.errors,1);assert.equal(f.summary().errors[0].state,'prepared');assert.equal(f.counts().attacks,0);
});
test('a new execution invalidates the previous controller before any action',()=>{
    const f=fixture();f.run();const c=f.read();c.executionTab='replacement';f.write(c);f.tick();assert.equal(f.counts().preparations,0);assert.equal(f.timers.size,0);
});
test('storage failure before preparation blocks all game actions',()=>{
    const f=fixture();f.run();f.sandbox.localStorage.setItem=()=>{throw Error('quota');};f.tick();assert.equal(f.counts().preparations,0);assert.equal(f.counts().attacks,0);assert.equal(f.timers.size,0);
});

// Exercise the actual bootstrap cache guard, retaining the Window and Document
// across command transitions (the old fixture always replaced the Document).
function cachedBootstrap(f) {
    const index = fs.readFileSync('index.js', 'utf8');
    const start = index.indexOf('    const resumeEASRuntimeIfNeeded = async () => {');
    const end = index.indexOf('    window.resumeEASRuntimeIfNeeded = resumeEASRuntimeIfNeeded;', start);
    f.window.EAS = f.sandbox.EAS;
    f.window.__EAS_TW_RUNTIME_RESUMED__ = {active:true,type:'fakes'};
    vm.runInContext(index.slice(start,end) + '\nwindow.testBootstrap = resumeEASRuntimeIfNeeded;', f.sandbox);
    return () => f.window.testBootstrap();
}
test('three commands rearm confirmation through cached bootstrap; duplicate command2 bootstrap clicks once',async()=>{
    const f=fixture(3), bootstrap=cachedBootstrap(f), attempts=[];
    // Identical origins and targets still have distinct queue command identities.
    const c=f.read();c.queue.forEach(entry=>entry.villageId=9);f.write(c);
    await bootstrap();
    for(let i=0;i<3;i++) {
        f.tick();f.tick();
        f.navigate('confirm',9,true);
        await bootstrap();await bootstrap();assert.equal(f.timers.size,1);
        f.tick();
        const attempt=f.read().queue[i].confirmationAttempt;
        assert.equal(attempt.commandId,`${i}:9:501|501`);assert.equal(attempt.state,'confirming');attempts.push(attempt.attemptId);
        await bootstrap();await bootstrap();f.tick();assert.equal(f.counts().confirmations,i+1);
        if(i>0)assert.equal(f.read().queue[i-1].confirmationAttempt.state,'completed');
        f.navigate('success',9,true);await bootstrap();f.tick();
        if(i<2){f.navigate('place',9,true);await bootstrap();}
    }
    assert.equal(f.counts().confirmations,3);assert.equal(new Set(attempts).size,3);
    assert.equal(f.read(),null);assert.ok(f.summary().queue.every(entry=>entry.confirmationAttempt.state==='completed'));
});
test('a stale previous-command runtime cannot suppress or process the next confirmation',()=>{
    const f=fixture(3);f.run();f.tick();f.tick();f.confirmation();
    const oldRuntime=f.window.__easFakesAuto;
    const c=f.read();c.queue[0].status='completed';c.queue[0].confirmationAttempt={...c.queue[0].confirmationAttempt,state:'completed'};
    c.completed=['0:9:501|501'];c.currentIndex=1;c.forwardingIndex=1;c.queue[1].villageId=9;c.queue[1].status='attacking';f.write(c);
    f.run();assert.equal(oldRuntime.stopped,true);assert.notEqual(f.window.__easFakesAuto,oldRuntime);
    f.tick();assert.equal(f.counts().confirmations,2);assert.notEqual(f.read().queue[0].confirmationAttempt.attemptId,f.read().queue[1].confirmationAttempt.attemptId);
});
test('consumed command attempt blocks resubmit even if its status is accidentally reset',()=>{
    const f=fixture();f.run();f.tick();f.tick();f.confirmation();
    const c=f.read();const attemptId=c.queue[0].confirmationAttempt.attemptId;c.queue[0].status='confirm-page';f.write(c);
    f.api().resumeConfirmation(f.window);assert.equal(f.counts().confirmations,1);assert.equal(f.read().queue[0].confirmationAttempt.attemptId,attemptId);
});
test('completed attempt never confirms again when reopened',()=>{
    const f=fixture();f.run();f.tick();f.tick();f.confirmation();f.success();
    const c=f.read();c.currentIndex=0;c.forwardingIndex=0;f.write(c);f.navigate('confirm',9);f.api().resumeConfirmation(f.window);
    assert.equal(f.counts().confirmations,1);assert.equal(f.read().queue[0].confirmationAttempt.state,'completed');
});

test('manual diagnostic cannot mutate live runtime, bootstrap or a consumed attempt',()=>{
    const f=fixture();f.run();f.tick();f.tick();f.confirmation();
    f.window.__EAS_TW_RUNTIME_RESUMED__={active:true,type:'fakes'};
    const before=[...f.storage.entries()],timerCount=f.timers.size,counts=f.counts();
    const snapshot=f.window.EASFakeDebug();snapshot.runtime.stopped=true;snapshot.bootstrapState.active=false;snapshot.confirmationLock.state='pending';
    assert.equal(f.window.__easFakesAuto.stopped,false);assert.equal(f.window.__EAS_TW_RUNTIME_RESUMED__.active,true);
    assert.deepEqual([...f.storage.entries()],before);assert.equal(f.timers.size,timerCount);assert.deepEqual(f.counts(),counts);
});
test('bootstrap diagnostic records whether resume was actually called',async()=>{
    const f=fixture(),events=[];const bootstrap=cachedBootstrap(f);
    f.sandbox.console.log=(label,data)=>{if(label==='[EAS][FAKE][BOOTSTRAP]')events.push(data);};
    f.navigate('confirm');await bootstrap();
    assert.equal(events[0].resumeCalled,false);assert.equal(events.at(-1).resumeCalled,true);
    delete f.sandbox.EAS.FakesExecution.resume;events.length=0;await bootstrap();
    assert.equal(events.at(-1).event,'RESUME_EXIT');assert.equal(events.at(-1).resumeCalled,false);assert.equal(events.at(-1).resumeAvailable,false);
});

test('two commands survive replacement of the entire JavaScript realm using only persisted state and tab name',()=>{
 const first=fixture(2);first.run();first.tick();first.tick();
 const confirm1=fixture(2,101000);confirm1.write(first.read());confirm1.navigate('confirm',9);confirm1.run();confirm1.tick();confirm1.success();
 const second=fixture(2,102000);second.write(confirm1.read());second.navigate('place',10);second.run();second.tick();second.tick();
 const confirm2=fixture(2,103000);confirm2.write(second.read());confirm2.navigate('confirm',10);confirm2.run();confirm2.tick();confirm2.success();
 assert.equal(first.counts().attacks+second.counts().attacks,2);assert.equal(confirm1.counts().confirmations+confirm2.counts().confirmations,2);
 assert.equal(confirm2.read(),null);assert.equal(confirm2.summary().counts.completed,2);
});

test('target adapter failure blocks attack and pauses the queue without success',()=>{
 const f=fixture(2);f.sandbox.EAS.Place.ensureCommandTarget=()=>({targetValidated:false});
 f.run();f.tick();assert.equal(f.counts().attacks,0);assert.equal(f.read().paused,true);assert.equal(f.read().errors[0].code,'TARGET_NOT_APPLIED');assert.equal(f.read().completed.length,0);assert.equal(f.read().currentIndex,0);
 f.run();f.tick();assert.equal(f.counts().attacks,0);assert.equal(f.read().queue[1].status,'pending');
});
test('native missing-target response is classified as target failure, not successful confirmation',()=>{
 const f=fixture(2);f.run();f.tick();f.tick();f.error('Por favor, selecione uma aldeia alvo.');f.tick();
 assert.equal(f.read().errors[0].code,'TARGET_NOT_APPLIED');assert.equal(f.read().paused,true);assert.equal(f.read().completed.length,0);assert.equal(f.counts().confirmations,0);
});

test('real Place adapter validates and restores a coordinate with null ID before Fake attack',()=>{
 const f=fixture(2);f.useNativeTarget();const c=f.read();c.queue[0].targetVillageId=null;f.write(c);
 f.run();f.tick();assert.equal(f.input().value,'501|501');f.input().value='';f.tick();
 assert.equal(f.input().value,'501|501');assert.equal(f.counts().attacks,1);assert.equal(f.read().queue[0].status,'attacking');
 f.confirmation();assert.equal(f.counts().confirmations,1);assert.equal(f.read().queue[0].status,'confirming');
});

function readyReconciliation(f){f.run();f.tick();f.tick();f.confirmation();f.navigate('place',9);}
test('snapshot persists existing same-target ID in its own attempt and matches only the new ID',()=>{
 const f=fixture(2);f.outgoing([outgoingRow({id:'11'})]);readyReconciliation(f);
 const attempt=f.read().queue[0].confirmationAttempt;assert.deepEqual(attempt.outgoingSnapshot.beforeCommandIds,['11']);assert.equal(attempt.outgoingSnapshot.attemptId,attempt.attemptId);
 f.outgoing([outgoingRow({id:'11'}),outgoingRow({id:'12'})]);f.run();f.tick();
 assert.equal(f.read().currentIndex,1);assert.equal(f.read().completed.length,1);assert.equal(f.read().lastConfirmation.outgoingCommandId,'12');assert.equal(f.read().queue[0].confirmationAttempt.state,'completed');
 f.api().resumeConfirmation(f.window);assert.equal(f.read().currentIndex,1);assert.equal(f.read().completed.length,1);
});
for(const [kind,result] of [['old-only','NO_NEW_COMMAND'],['ambiguous','AMBIGUOUS'],['missing','SNAPSHOT_MISSING'],['source','SOURCE_OR_TYPE_MISMATCH'],['target','TARGET_MISMATCH'],['attempt','ATTEMPT_MISMATCH'],['dom','DOM_UNAVAILABLE'],['home','SOURCE_MISMATCH']])test(`reconciliation fails safely: ${kind}`,()=>{
 const f=fixture(2);f.outgoing([outgoingRow({id:'11'})]);readyReconciliation(f);const c=f.read();
 let rows=[outgoingRow({id:'11'}),outgoingRow({id:'12'})];
 if(kind==='old-only')rows=[outgoingRow({id:'11'})];
 if(kind==='ambiguous')rows.push(outgoingRow({id:'13'}));
 if(kind==='missing')delete c.queue[0].confirmationAttempt.outgoingSnapshot;
 if(kind==='source')rows=[outgoingRow({id:'12',source:'8'})];
 if(kind==='target')rows=[outgoingRow({id:'12',target:'502|502'})];
 if(kind==='attempt')c.queue[0].confirmationAttempt.outgoingSnapshot.attemptId='different';
 if(kind==='home')c.queue[0].confirmationAttempt.outgoingSnapshot.sourceVillageId='8';
 f.write(c);f.outgoing(rows,kind!=='dom');assert.equal(f.api().reconcileOutgoing(c,f.window).result,result);
 f.api().resumeConfirmation(f.window);assert.equal(f.read().currentIndex,0);assert.equal(f.read().completed.length,0);assert.equal(f.read().queue[0].confirmationAttempt.state,'confirming');assert.equal(f.counts().confirmations,1);
});
test('delayed outgoing DOM is reconciled within the existing bounded timer',()=>{
 const f=fixture(2);readyReconciliation(f);f.outgoing([],false);f.run();f.tick();f.tick();assert.equal(f.read().currentIndex,0);
 f.outgoing([outgoingRow({id:'12'})]);f.tick();assert.equal(f.read().currentIndex,1);assert.equal(f.counts().confirmations,1);
});
test('no positive evidence times out and never retries or advances',()=>{
 const f=fixture(2);readyReconciliation(f);f.outgoing([]);f.run();f.tick();for(let i=0;i<50;i++)f.tick();
 assert.equal(f.read().paused,true);assert.equal(f.read().currentIndex,0);assert.equal(f.read().completed.length,0);assert.equal(f.read().queue[0].confirmationAttempt.state,'confirming');assert.equal(f.timers.size,0);assert.equal(f.counts().confirmations,1);
});
test('confirmation without outgoing table uses persisted preparation snapshot',()=>{
 const f=fixture(2);f.outgoing([outgoingRow({id:'11'})]);f.run();f.tick();f.tick();f.outgoing([],false);f.confirmation();
 assert.deepEqual(f.read().queue[0].confirmationAttempt.outgoingSnapshot.beforeCommandIds,['11']);
 f.navigate('place',9);f.outgoing([outgoingRow({id:'11'}),outgoingRow({id:'12'})]);f.run();f.tick();assert.equal(f.read().currentIndex,1);
});
test('completed attempt reports ALREADY_RECONCILED without mutating counters',()=>{
 const f=fixture(2);readyReconciliation(f);f.outgoing([outgoingRow({id:'12'})]);f.api().resumeConfirmation(f.window);
 const c=f.read();c.currentIndex=0;const before=JSON.stringify(c);assert.equal(f.api().reconcileOutgoing(c,f.window).result,'ALREADY_RECONCILED');assert.equal(JSON.stringify(c),before);
});

test('real structured row adapter reads ID, home, type and coordinate independently of label language',()=>{
 const f=fixture();f.outgoing([outgoingRow({id:'1874818544',source:'13186',target:'604|379'})]);
 const observed=f.api().readOutgoingCommands(f.window);assert.equal(observed.available,true);assert.equal(JSON.stringify(observed.commands),JSON.stringify([{id:'1874818544',sourceVillageId:'13186',type:'attack',target:'604|379'}]));
});
test('conflicting structured IDs invalidate the outgoing DOM rather than guessing',()=>{
 const f=fixture();const row=outgoingRow({id:'12'}),query=row.querySelector;row.querySelector=selector=>selector==='.quickedit-out[data-id]'?{dataset:{id:'13'}}:query(selector);f.outgoing([row]);assert.equal(f.api().readOutgoingCommands(f.window).available,false);
});

test('snapshot is persisted before attack and survives JSON and a fresh bootstrap without a confirmation table',()=>{
 const f=fixture(2);f.outgoing([outgoingRow({id:'100'})]);f.run();f.tick();f.tick();
 const before=f.read().queue[0].confirmationAttempt;
 assert.equal(f.counts().attacks,1);assert.deepEqual(before.outgoingSnapshot.beforeCommandIds,['100']);
 assert.equal(before.outgoingSnapshot.attemptId,before.attemptId);
 const next=fixture(2,101000);next.write(JSON.parse(JSON.stringify(f.read())));next.outgoing([],false);next.navigate('confirm',9);
 const logs=[];next.sandbox.console.log=(label,data)=>{if(label==='[EAS][FAKE][SNAPSHOT]')logs.push(data);};
 next.run();next.tick();next.api().resumeConfirmation(next.window);
 const after=next.read().queue[0].confirmationAttempt;
 assert.equal(after.attemptId,before.attemptId);assert.deepEqual(after.outgoingSnapshot,before.outgoingSnapshot);
 assert.equal(next.counts().confirmations,1);assert.ok(logs.some(x=>x.persisted&&x.restoredAfterNavigation));
});
for(const baseline of [[],['100']])test(`snapshot set difference ${JSON.stringify(baseline)}`,()=>{
 const f=fixture(2);f.outgoing(baseline.map(id=>outgoingRow({id})));readyReconciliation(f);
 f.outgoing([...baseline,'200'].map(id=>outgoingRow({id})));
 const result=f.api().reconcileOutgoing(f.read(),f.window);
 assert.equal(result.result,'SUCCESS');assert.deepEqual(Array.from(result.newCommandIds),['200']);
});
test('missing real outgoing container blocks initial attack instead of inventing empty baseline',()=>{
 const f=fixture(2);f.outgoing([],false);f.run();f.tick();f.tick();
 assert.notEqual(f.read().paused,true);while(f.timers.size)f.tick();
 assert.equal(f.counts().attacks,0);assert.equal(f.counts().confirmations,0);assert.equal(f.read().paused,true);
});
for(const field of ['attemptId','sourceVillageId'])test(`confirmation cannot adopt snapshot with wrong ${field}`,()=>{
 const f=fixture(2);f.run();f.tick();f.tick();const c=f.read();c.queue[0].confirmationAttempt.outgoingSnapshot[field]='other';f.write(c);
 f.confirmation();assert.equal(f.counts().confirmations,0);
});
test('explicit null baseline never reconciles as success',()=>{
 const f=fixture(2);readyReconciliation(f);const c=f.read();c.queue[0].confirmationAttempt.outgoingSnapshot.beforeCommandIds=null;
 f.outgoing([outgoingRow({id:'200'})]);assert.equal(f.api().reconcileOutgoing(c,f.window).result,'SNAPSHOT_MISSING');
});
test('second command persists its own new baseline and identity',()=>{
 const f=fixture(2);f.outgoing([outgoingRow({id:'100'})]);f.run();f.tick();f.tick();const first=f.read().queue[0].confirmationAttempt;
 f.confirmation();f.success();f.next();f.outgoing([outgoingRow({id:'300',source:'10'})]);f.tick();f.tick();
 const second=f.read().queue[1].confirmationAttempt;
 assert.notEqual(second.attemptId,first.attemptId);assert.deepEqual(second.outgoingSnapshot.beforeCommandIds,['300']);
 assert.equal(second.outgoingSnapshot.sourceVillageId,'10');assert.notEqual(second.commandId,first.commandId);
 f.outgoing([],false);f.confirmation();assert.equal(f.counts().confirmations,2);
 assert.deepEqual(f.read().queue[1].confirmationAttempt.outgoingSnapshot,second.outgoingSnapshot);
});

for (const mode of ['throwing','quota','normal']) test(`diagnostic logger ${mode} cannot change two-command Fake behavior`,()=>{
 const f=fixture(2);const logs=[];
 if(mode==='throwing')f.sandbox.EAS.Logger={info(){throw Error('logger failure');}};
 else {
  f.window.localStorage=f.sandbox.localStorage;f.window.setTimeout=()=>999999;f.window.clearTimeout=()=>{};f.window.addEventListener=()=>{};
  const setter=f.sandbox.localStorage.setItem;f.sandbox.localStorage.setItem=(key,value)=>{if(mode==='quota'&&key==='eas_tw_diagnostics_v1')throw Error('quota');setter(key,value);};
  f.window.EAS=f.sandbox.EAS;vm.runInContext(fs.readFileSync('core/logger.js','utf8'),f.sandbox);
 }
 f.run();for(let i=0;i<2;i++){f.tick();f.tick();f.confirmation();f.api().resumeConfirmation(f.window);f.window.__EASLogger?.flush();f.success();if(i===0)f.next();}
 assert.deepEqual(f.counts(),{preparations:2,attacks:2,confirmations:2});assert.equal(f.summary().counts.completed,2);assert.equal(f.read(),null);
 if(mode==='normal')assert.equal(f.window.__EASLogger.entries().filter(e=>e.event==='EXECUTION_COMPLETE').length,1);
});

test('input filled while TW unresolved waits without troops or submit, then proceeds once',()=>{
 const f=fixture(2);f.resolveTarget(false);f.run();f.tick();
 assert.equal(f.input().value,'501|501');assert.equal(f.unit().value,'');assert.equal(f.counts().attacks,0);
 const attempt=f.read().queue[0].confirmationAttempt.attemptId;const deadline=f.read().queue[0].preparationWait.deadlineAt;
 f.run();f.tick();f.run();assert.equal(f.read().queue[0].preparationWait.deadlineAt,deadline);assert.equal(f.counts().preparations,1);
 f.resolveTarget(true);f.tick();assert.equal(f.unit().value,'1');f.tick();assert.equal(f.counts().attacks,1);
 assert.equal(f.read().queue[0].confirmationAttempt.attemptId,attempt);f.confirmation();assert.equal(f.counts().confirmations,1);
});
test('reinjected module during WAIT_TARGET retains deadline and sends only once',()=>{
 const f=fixture(2);f.resolveTarget(false);f.run();f.tick();const before=f.read().queue[0];
 vm.runInContext(source,f.sandbox);f.run();f.tick();f.resolveTarget(true);f.tick();f.tick();
 assert.equal(f.counts().preparations,1);assert.equal(f.counts().attacks,1);assert.equal(f.read().queue[0].confirmationAttempt.attemptId,before.confirmationAttempt.attemptId);
});
test('target timeout pauses with no troops, snapshot, attack or retry',()=>{
 const f=fixture(2);f.resolveTarget(false);f.run();while(f.timers.size)f.tick();
 assert.equal(f.read().paused,true);assert.equal(f.read().errors[0].code,'WAIT_TARGET_TIMEOUT');assert.equal(f.unit().value,'');assert.equal(f.counts().attacks,0);
 f.resolveTarget(true);f.run();if(f.timers.size)f.tick();assert.equal(f.counts().attacks,0);
});
test('snapshot arrives later and is read back before attack without preparing again',()=>{
 const f=fixture(2);f.outgoing([],false);f.run();f.tick();f.tick();const before=f.read().queue[0];
 assert.equal(before.preparationWait.phase,'WAIT_SNAPSHOT');assert.notEqual(f.read().paused,true);assert.equal(f.counts().attacks,0);
 vm.runInContext(source,f.sandbox);f.run();f.tick();f.outgoing([outgoingRow({id:'100'})]);f.tick();
 assert.equal(f.counts().attacks,1);assert.equal(f.counts().preparations,1);assert.equal(f.read().queue[0].confirmationAttempt.attemptId,before.confirmationAttempt.attemptId);
 assert.deepEqual(f.read().queue[0].confirmationAttempt.outgoingSnapshot.beforeCommandIds,['100']);
});
test('place loading and stale source DOM wait before applying target',()=>{
 const f=fixture(2);f.window.document.readyState='loading';f.window.game_data={village:{id:10}};f.run();f.tick();assert.equal(f.counts().preparations,0);
 f.window.document.readyState='complete';f.tick();assert.equal(f.counts().preparations,0);f.window.game_data.village.id=9;f.tick();f.tick();assert.equal(f.counts().attacks,1);
});
test('second source waits independently and captures its own snapshot after target readiness',()=>{
 const f=fixture(2);f.run();f.tick();f.tick();f.confirmation();f.success();const first=f.read().queue[0].confirmationAttempt;
 f.next();f.resolveTarget(false);f.tick();f.tick();assert.equal(f.counts().attacks,1);assert.equal(f.read().queue[1].villageId,10);
 f.resolveTarget(true);f.outgoing([outgoingRow({id:'888',source:'10'})]);f.tick();f.tick();
 const second=f.read().queue[1].confirmationAttempt;assert.notEqual(second.attemptId,first.attemptId);assert.deepEqual(second.outgoingSnapshot.beforeCommandIds,['888']);assert.equal(second.outgoingSnapshot.sourceVillageId,'10');
});
test('logger records target resolution before troops and snapshot before attack',()=>{
 const f=fixture(2),logs=[];f.sandbox.EAS.Logger={info:(module,event,data)=>logs.push({event,...data})};f.resolveTarget(false);f.run();f.tick();f.resolveTarget(true);f.tick();f.tick();
 const names=logs.map(x=>x.event);const expected=['PLACE_WAIT_START','PLACE_READY','TARGET_APPLY_START','TARGET_APPLIED','TARGET_WAIT_START','TARGET_READY','TARGET_VALIDATED','TROOPS_FILLED','TROOPS_VALIDATED','SNAPSHOT_CAPTURE_START','SNAPSHOT_CAPTURED','SNAPSHOT_READY','ATTACK_SUBMIT'];
 let index=-1;for(const event of expected){index=names.indexOf(event,index+1);assert.ok(index>=0,event);}
 for(const log of logs){assert.equal(log.executionId,'auto-tab');assert.equal(log.commandId,'0:9:501|501');assert.ok(log.attemptId);assert.equal(log.expectedTarget,'501|501');assert.ok(log.timestamp);}
});

test('application that leaves input empty never fills troops or attacks',()=>{
 const f=fixture(2);f.sandbox.EAS.Place.fillCommandTarget=()=>true;f.run();f.tick();assert.equal(f.counts().attacks,0);assert.equal(f.unit().value,'');assert.equal(f.read().errors[0].code,'TARGET_NOT_APPLIED');
});
test('snapshot timeout retains safety and a restart cannot extend the deadline',()=>{
 const f=fixture(2);f.outgoing([],false);f.run();f.tick();f.tick();const deadline=f.read().queue[0].preparationWait.deadlineAt;
 for(let i=0;i<5;i++){vm.runInContext(source,f.sandbox);f.run();f.tick();assert.equal(f.read().queue[0].preparationWait.deadlineAt,deadline);}
 while(f.timers.size)f.tick();assert.equal(f.read().errors[0].code,'WAIT_SNAPSHOT_TIMEOUT');assert.equal(f.counts().attacks,0);
 f.outgoing([]);f.run();if(f.timers.size)f.tick();assert.equal(f.counts().attacks,0);assert.equal(f.read().paused,true);
});

test('wait metadata from another attempt cannot authorize preparation or attack',()=>{
 for(const stage of ['target','snapshot']){
  const f=fixture(2);if(stage==='target')f.resolveTarget(false);else f.outgoing([],false);
  f.run();f.tick();if(stage==='snapshot')f.tick();const c=f.read();c.queue[0].preparationWait.attemptId='previous-command';f.write(c);
  f.resolveTarget(true);f.outgoing([]);f.tick();assert.equal(f.counts().attacks,0);assert.equal(f.read().paused,true);assert.equal(f.read().currentIndex,0);assert.equal(f.read().errors.length,1);
 }
});

test('typed coordinate with pending native validation waits for native readiness',()=>{
 const f=fixture(2);let nativeReady=false;f.resolveTarget(false);
 f.sandbox.EAS.Place.ensureCommandTarget=()=>({targetValidated:nativeReady,inputTarget:'501|501',actualTarget:nativeReady?'501|501':null});
 f.run();f.tick();assert.notEqual(f.read().paused,true);assert.equal(f.unit().value,'');assert.equal(f.counts().attacks,0);
 f.tick();nativeReady=true;f.resolveTarget(true);f.tick();f.tick();assert.equal(f.counts().attacks,1);assert.equal(f.counts().preparations,1);
});


test('real village-item adapter waits for late card through reinjection and submits once',()=>{
 const f=fixture(2),labels=[],logs=[];f.useNativeTarget(()=>labels);
 f.sandbox.EAS.Logger={info:(module,event,data)=>logs.push({event,...data})};
 f.run();f.tick();assert.equal(f.input().value,'501|501');assert.equal(f.unit().value,'');assert.equal(f.counts().attacks,0);
 const attempt=f.read().queue[0].confirmationAttempt.attemptId;
 vm.runInContext(source,f.sandbox);f.run();f.tick();assert.equal(f.counts().attacks,0);
 labels.push({textContent:'Old village (604|379)'});f.tick();assert.equal(f.counts().attacks,0);
 labels.push({textContent:'Renamed village (501|501)'});f.input().value='';f.tick();f.tick();f.run();
 assert.equal(f.counts().attacks,1);assert.equal(logs.filter(log=>log.event==='TARGET_APPLY_START').length,1);
 assert.equal(f.read().queue[0].confirmationAttempt.attemptId,attempt);
 const ready=logs.find(log=>log.event==='TARGET_READY');assert.equal(ready.resolutionSource,'#place_target .village-item .village-name');assert.equal(ready.resolvedCoordinate,'501|501');
 assert.equal(ready.matchedSelector,'#place_target .village-item .village-name');
 f.confirmation();assert.equal(f.counts().confirmations,1);
});


test('slow target gets independent persisted snapshot budget, then empty baseline sends once',()=>{
 const f=fixture(2),logs=[];f.sandbox.EAS.Logger={info:(module,event,data)=>logs.push({event,...data})};
 f.resolveTarget(false);f.outgoing([],false);f.run();f.tick();
 const targetDeadline=f.read().queue[0].preparationWait.deadlineAt;
 while(f.sandbox.Date.now()<targetDeadline-1800)f.tick();
 f.resolveTarget(true);f.tick();f.tick();
 const wait=f.read().queue[0].preparationWait;
 assert.equal(wait.targetPreparationDeadline,targetDeadline);assert.equal(wait.snapshotDeadlineAt-wait.snapshotStartedAt,10000);
 assert.ok(wait.snapshotDeadlineAt>targetDeadline+7000);assert.equal(f.counts().attacks,0);
 vm.runInContext(source,f.sandbox);f.run();f.tick();assert.equal(f.read().queue[0].preparationWait.snapshotDeadlineAt,wait.snapshotDeadlineAt);
 while(f.sandbox.Date.now()<=targetDeadline+1000)f.tick();
 f.outgoing([]);f.tick();assert.equal(f.counts().attacks,1);
 assert.deepEqual(f.read().queue[0].confirmationAttempt.outgoingSnapshot.beforeCommandIds,[]);
 const unavailable=logs.find(log=>log.event==='SNAPSHOT_SOURCE_CHECK'&&!log.snapshotAvailable);
 assert.equal(unavailable.snapshotReason,'CONTAINER_MISSING');assert.equal(unavailable.outgoingContainerFound,false);assert.equal(unavailable.outgoingCommandIds,null);
 const captured=logs.find(log=>log.event==='SNAPSHOT_CAPTURE_RESULT'&&log.snapshotAvailable);
 assert.deepEqual(Array.from(captured.outgoingCommandIds),[]);
 assert.ok(logs.findIndex(log=>log.event==='SNAPSHOT_READBACK_RESULT'&&log.readBackValid)<logs.findIndex(log=>log.event==='ATTACK_SUBMIT'));
});

test('snapshot deadline expiry logs source absence and never submits',()=>{
 const f=fixture(2),logs=[];f.sandbox.EAS.Logger={info:(module,event,data)=>logs.push({event,...data})};
 f.outgoing([],false);f.run();while(f.timers.size)f.tick();
 const expired=logs.find(log=>log.event==='PREPARATION_DEADLINE_EXPIRED');assert.ok(expired);assert.equal(expired.phase,'WAIT_SNAPSHOT');assert.equal(expired.remainingMs,0);
 assert.ok(logs.some(log=>log.event==='SNAPSHOT_WAIT'&&log.snapshotReason==='CONTAINER_MISSING'));assert.equal(f.counts().attacks,0);
});


test('source evidence inventories names only and missing DOM never becomes empty baseline',()=>{
 const f=fixture(2),logs=[];f.outgoing([],false);
 f.sandbox.EAS.Logger={info:(module,event,data)=>logs.push({event,...data})};
 f.window.game_data={village:{id:9,commands:[]},csrf:'secret'};
 let getterCalls=0;Object.defineProperty(f.window.game_data,'outgoing',{enumerable:true,get(){getterCalls++;throw Error('must not execute');}});
 f.window.document.querySelectorAll=selector=>selector==='form'?[{id:'command-data-form',method:'post',action:'https://test/game.php?screen=place&h=secret',elements:[{name:'h',value:'secret'}]}]:[];
 const evidence=f.api().snapshotSourceEvidence(f.window);
 assert.equal(evidence.authoritativeSourceAvailable,false);assert.ok(evidence.gameDataKeys.includes('outgoing'));
 assert.equal(JSON.stringify(evidence).includes('secret'),false);assert.equal(getterCalls,0);
 f.run();f.tick();f.tick();f.tick();assert.equal(f.counts().attacks,0);
 assert.equal(f.read().queue[0].confirmationAttempt.outgoingSnapshot,undefined);
 assert.equal(logs.filter(log=>log.event==='SNAPSHOT_SOURCE_EVIDENCE').length,1);
});

test('diagnostic DOM inventory failure cannot affect safe snapshot wait',()=>{
 const f=fixture(2);f.outgoing([],false);f.window.document.querySelectorAll=()=>{throw Error('diagnostic DOM failure');};
 assert.equal(f.api().snapshotSourceEvidence(f.window).diagnosticUnavailable,true);
 f.run();f.tick();f.tick();assert.equal(f.counts().attacks,0);assert.equal(f.read().queue[0].preparationWait.phase,'WAIT_SNAPSHOT');
});


test('global place rows capture and reconcile through the same parser without legacy container',()=>{
 const f=fixture(2),rows=[outgoingRow({id:'100'})];
 const globalSource=()=>{f.outgoing([],false);f.window.document.querySelectorAll=selector=>selector==='tr.command-row'?rows:[];};
 globalSource();f.run();f.tick();f.tick();
 assert.deepEqual(f.read().queue[0].confirmationAttempt.outgoingSnapshot.beforeCommandIds,['100']);
 f.confirmation();f.navigate('place',9);globalSource();rows.push(outgoingRow({id:'200'}));
 const result=f.api().reconcileOutgoing(f.read(),f.window);assert.equal(result.result,'SUCCESS');assert.deepEqual(Array.from(result.newCommandIds),['200']);assert.equal(result.matchedOutgoingCommandId,'200');
});

test('global outgoing rows deduplicate IDs but reject conflicting metadata',()=>{
 const f=fixture(),rows=[outgoingRow({id:'10'}),outgoingRow({id:'10'}),outgoingRow({id:'11'})];
 f.outgoing([],false);f.window.document.querySelectorAll=()=>rows;
 let r=f.api().readOutgoingCommands(f.window);assert.equal(r.available,true);assert.deepEqual(Array.from(r.commands,c=>c.id),['10','11']);
 rows.push(outgoingRow({id:'10',target:'600|600'}));r=f.api().readOutgoingCommands(f.window);assert.equal(r.available,false);assert.equal(r.reason,'CONFLICTING_DUPLICATE');
});
