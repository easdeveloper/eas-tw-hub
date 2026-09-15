const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const outgoingRow = require('./outgoing-dom.cjs').row;
const source = fs.readFileSync('services/fakes-execution.js', 'utf8');
function fixture(status = 'forwarding') {
    let clicks = 0;
    const storage = new Map();
    const button = { disabled: false, click() { clicks++; assert.equal(read().queue[0].status, 'confirming'); } };
    const form = { querySelector: () => button };
    const document = { createElement: () => ({}), getElementById: () => null, body: { appendChild() {} }, querySelector: selector => selector === '#commands_outgoings' ? {querySelectorAll:()=>window.location.href.includes('command_id=123')?[outgoingRow()]:[]} : selector === '#command-data-form' ? form : null };
    const window = { name: 'test-tab', document, location: { href: 'https://test/game.php?screen=place&village=9&try=confirm' } };
    const sandbox = { window, document, URL, console: { debug() {} }, localStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) }, EAS: { Place: { buildPlaceUrl: id => `https://test/game.php?screen=place&village=${id}` } } };
    const context = { executionTab: 'test-tab', currentIndex: 0, forwardingIndex: 0, forwardingCommandType: 'attack', queue: [{villageId:9,target:'501|501',status}], completed: [] };
    const write = value => storage.set('eas_tw_fakes_execution', JSON.stringify(value));
    const read = () => JSON.parse(storage.get('eas_tw_fakes_execution') || 'null');
    write(context);
    vm.createContext(sandbox); vm.runInContext(source,sandbox);
    return { sandbox, window, document, button, form, read, write, run: () => sandbox.EAS.FakesExecution.resumeConfirmation(window), clicks: () => clicks, reload: () => vm.runInContext(source,sandbox) };
}
test('valid confirmation clicks once, persisting before click; repeated bootstrap/reload cannot repeat', () => {
    const f=fixture(); f.run(); f.run(); f.reload(); f.run(); assert.equal(f.clicks(),1);
});
for (const status of ['confirming','submitted','completed','pending','error']) test(`${status} never clicks`,()=>{const f=fixture(status);f.run();assert.equal(f.clicks(),0);});
for (const scenario of ['inactive','manual-tab','wrong-village','wrong-page','missing-form','missing-button','disabled','storage-failure','no-current']) test(`${scenario} never clicks`,()=>{
    const f=fixture();
    if(scenario==='inactive') f.write(null);
    if(scenario==='manual-tab') f.window.name='manual';
    if(scenario==='wrong-village') f.window.location.href=f.window.location.href.replace('village=9','village=10');
    if(scenario==='wrong-page') f.window.location.href=f.window.location.href.replace('try=confirm','try=other');
    if(scenario==='missing-form') f.document.querySelector=()=>null;
    if(scenario==='missing-button') f.form.querySelector=()=>null;
    if(scenario==='disabled') f.button.disabled=true;
    if(scenario==='storage-failure') f.sandbox.localStorage.setItem=()=>{throw Error('quota');};
    if(scenario==='no-current') {const c=f.read();c.forwardingIndex=null;f.write(c);}
    f.run();assert.equal(f.clicks(),0);
});
test('confirmation alone does not complete; successful response advances exactly one entry',()=>{
    const f=fixture();const c=f.read();c.queue.push({villageId:10,target:'502|502',status:'pending'});f.write(c);
    f.run();assert.equal(f.read().currentIndex,0);assert.equal(f.read().completed.length,0);
    f.window.location.href='https://test/game.php?screen=place&village=9&command_id=123';f.run();
    assert.equal(f.read().currentIndex,1);assert.equal(f.read().completed.length,1);assert.equal(f.read().queue[0].status,'completed');assert.equal(f.read().continueQueue,true);assert.match(f.window.location.href,/village=10/);f.run();assert.equal(f.read().currentIndex,1);
});
test('last successful command removes active execution',()=>{const f=fixture();f.run();f.window.location.href='https://test/game.php?screen=place&village=9&command_id=123';f.run();assert.equal(f.read(),null);f.run();assert.equal(f.clicks(),1);});
test('unrecognized response does not advance or retry',()=>{const f=fixture();f.run();f.window.location.href='https://test/game.php?screen=place&village=9';f.run();assert.equal(f.read().currentIndex,0);assert.equal(f.clicks(),1);});

test('EASFakeDebug is read-only, including nested returned state, storage and clicks',()=>{
    const f=fixture();
    const before=f.read();let writes=0;
    f.sandbox.localStorage.setItem=()=>{writes++;throw Error('diagnostic must not write');};
    f.sandbox.localStorage.removeItem=()=>{writes++;throw Error('diagnostic must not remove');};
    const snapshot=f.window.EASFakeDebug();
    assert.equal(snapshot.executionFound,true);assert.equal(snapshot.tabAuthorized,true);
    assert.equal(snapshot.currentCommandId,'0:9:501|501');assert.equal(snapshot.commandState,'forwarding');
    assert.equal(snapshot.formFound,true);assert.equal(snapshot.buttonFound,true);assert.equal(snapshot.canConfirm,true);
    snapshot.currentCommand.status='completed';
    assert.deepEqual(f.read(),before);assert.equal(writes,0);assert.equal(f.clicks(),0);
});
for(const [scenario,reason] of [['inactive','NO_ACTIVE_EXECUTION'],['tab','TAB_NOT_AUTHORIZED'],['no-forwarding','NO_FORWARDING_COMMAND'],['missing-form','FORM_NOT_FOUND'],['missing-button','BUTTON_NOT_FOUND'],['disabled','BUTTON_DISABLED'],['consumed','COMMAND_ALREADY_SUBMITTED'],['lock','CONFIRMATION_LOCK']])test(`diagnostic names exact guard: ${reason}`,()=>{
    const f=fixture();
    if(scenario==='inactive')f.write(null);
    if(scenario==='tab')f.window.name='manual';
    if(scenario==='no-forwarding'){const c=f.read();c.forwardingIndex=null;f.write(c);}
    if(scenario==='missing-form')f.document.querySelector=()=>null;
    if(scenario==='missing-button')f.form.querySelector=()=>null;
    if(scenario==='disabled')f.button.disabled=true;
    if(scenario==='consumed'){const c=f.read();c.queue[0].status='confirming';f.write(c);}
    if(scenario==='lock'){const c=f.read();c.queue[0].confirmationAttempt={commandId:'0:9:501|501',attemptId:'A',state:'confirming'};f.write(c);}
    const snapshot=f.window.EASFakeDebug();assert.equal(snapshot.blockedReason,reason);assert.equal(snapshot.canConfirm,false);assert.equal(f.clicks(),0);
});
test('confirmation logs ALLOWED, CLICKING and CLICK_DISPATCHED around one native click',()=>{
    const f=fixture(),events=[];f.sandbox.console.log=(label)=>{if(label.startsWith('[EAS][FAKE][CONFIRM]'))events.push(label);};
    const click=f.button.click;f.button.click=()=>{events.push('native click');click();};f.run();
    assert.deepEqual(events,['[EAS][FAKE][CONFIRM] ALLOWED','[EAS][FAKE][CONFIRM] CLICKING','native click','[EAS][FAKE][CONFIRM] CLICK_DISPATCHED']);
    assert.equal(f.clicks(),1);
});

test('image audit is read-only and strips resource query strings',()=>{
 const f=fixture(),before=f.read();
 f.document.querySelectorAll=()=>[{src:'https://test/pixel.gif?private=value',complete:true,naturalWidth:0,id:'image',className:'',parentElement:{id:'container'},closest:()=>null}];
 f.window.performance={getEntriesByType:()=>[{name:'https://test/pixel.gif?private=value',initiatorType:'img',responseStatus:429,startTime:1,duration:2}]};
 const data=f.window.EASFakeImageDebug();assert.equal(data.images[0].src,'https://test/pixel.gif');assert.equal(data.resources[0].responseStatus,429);assert.deepEqual(f.read(),before);assert.equal(f.clicks(),0);
});
