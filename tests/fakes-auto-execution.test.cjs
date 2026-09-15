const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('services/fakes-execution.js', 'utf8');
const KEY = 'eas_tw_fakes_execution';
function fixture(size = 3) {
    let now = 100000, timerId = 0, preparations = 0, attacks = 0, confirmations = 0;
    const timers = new Map(), storage = new Map(), events = [];
    const read = () => JSON.parse(storage.get(KEY) || 'null');
    const write = value => storage.set(KEY, JSON.stringify(value));
    const nodes = new Map();
    function element(tag) {
        return { tag, dataset: {}, children: [], textContent: '', value: '', disabled: false,
            appendChild(child) { this.children.push(child); if(child.id) nodes.set(child.id,child); },
            remove() { nodes.delete(this.id); }, addEventListener(type, callback) { this[type] = callback; },
            dispatchEvent() {}, querySelector() { return null; } };
    }
    let document, input, unit, attackButton, confirmButton, form, error = null;
    const window = { name:'auto-tab', location:{href:''}, HTMLInputElement:{prototype:{}}, Event:class {} };
    const sandbox = { window, URL, console:{debug(){},error(){}}, Date:class extends Date { static now(){return now;} },
        setTimeout(fn, ms) { const id=++timerId;timers.set(id,{fn,at:now+ms});return id; },
        clearTimeout(id) {timers.delete(id);},
        localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
        EAS:{ Utils:{parseCoordinate:value=>/^\d+\|\d+$/.test(value)?{coordinate:value}:null},
            CommandRules:{scanCommandRuleErrors:()=>[],validateCommandComposition:()=>({valid:true}),getWorld:()=> 'test'},
            Place:{getCommandForm:()=>form, fillCommandTarget(target){preparations++;events.push('prepare');assert.equal(read().queue[read().currentIndex].status,'preparing');input.value=target;return true;},
                buildPlaceUrl:id=>`https://test/game.php?screen=place&village=${id}`}}
    };
    function navigate(stage='place', village=9, sameDocument=false) {
        const previousDocument = document;
        nodes.clear();error=null;
        document = {readyState:'complete',createElement:element,getElementById:id=>nodes.get(id)||null,body:element('body'),
            querySelector(selector){
                if(selector==='#command-data-form') return form;
                if(selector==='.error_box, .error') return error;
                return null;
            }};
        input=element('input');unit=element('input');unit.dataset.allCount='100000';
        attackButton={disabled:false,click(){attacks++;events.push('attack');assert.equal(read().queue[read().currentIndex].status,'attacking');}};
        confirmButton={disabled:false,click(){confirmations++;events.push('confirm');assert.equal(read().queue[read().currentIndex].status,'confirming');}};
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
    return {read,write,tick,navigate,reload,window,storage,timers,events,api,sandbox,
        run:()=>api().initialize(),counts:()=>({preparations,attacks,confirmations}),
        unit:()=>unit,confirm:()=>confirmButton,error:value=>{error={textContent:value};},
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
