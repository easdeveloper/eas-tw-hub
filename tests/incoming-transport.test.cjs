const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
test('webhook allowlist accepts only HTTPS official hosts and complete exact paths', async () => {
    const source=fs.readFileSync('eas-discord-transport.user.js','utf8');
    for(const host of ['discord.com','discordapp.com']) {
        assert.ok(source.includes('// @connect      '+host+'\n'));
    }
    const cases=[
        ['https://discord.com/api/webhooks/123/fixture-token',true],
        ['https://discordapp.com/api/webhooks/123/fixture-token',true],
        ['http://discord.com/api/webhooks/123/fixture-token',false],
        ['http://discordapp.com/api/webhooks/123/fixture-token',false],
        ['https://example.com/api/webhooks/123/fixture-token',false],
        ['https://discord.com.evil.test/api/webhooks/123/fixture-token',false],
        ['https://discordapp.com@evil.test/api/webhooks/123/fixture-token',false],
        ['https://discord.com/api/webhooks/123',false],
        ['https://discord.com/api/webhooks/123/',false],
        ['https://discord.com/api/webhooks/no-id/fixture-token',false],
        ['https://discord.com/api/v10/webhooks/123/fixture-token',false],
        ['https://discord.com/api/webhooks/123/fixture-token?extra=1',false],
        ['https://discord.com/api/webhooks/123/fixture-token#fragment',false],
        ['https://discord.com/api/webhooks/123/fixture-token\n',false]
    ];
    for(const [url,expected] of cases) {
        let requests=[],stored=[],alerts=[],menu;
        const unsafeWindow={},ctx=vm.createContext({unsafeWindow,location:{hostname:'br143.tribalwars.com.br'},
            GM_getValue:()=>url,GM_setValue:(key,value)=>stored.push(value),
            GM_registerMenuCommand:(label,fn)=>menu=fn,prompt:()=>url,alert:value=>alerts.push(value),
            GM_xmlhttpRequest:options=>{requests.push(options);options.onload({status:200,responseText:'{"id":"987"}'})}});
        vm.runInContext(source,ctx);
        assert.equal(unsafeWindow.EASDiscordBridge.configured(),expected);
        if(expected) {
            await unsafeWindow.EASDiscordBridge.send({payload:{content:'fixture'}});
            assert.equal(requests[0].url,url+'?wait=true');
            menu();assert.deepEqual(stored,[url]);
        } else {
            await assert.rejects(unsafeWindow.EASDiscordBridge.send({payload:{content:'fixture'}}),/DISCORD_TRANSPORT_NOT_READY/);
            assert.equal(requests.length,0);
            if(!url.endsWith('\n')) {menu();assert.equal(stored.length,0);assert.equal(alerts.length,1);}
            assert.ok(alerts.every(text=>!text.includes('fixture-token')));
        }
    }
});
test('label requires dynamic token, uses real endpoint, does not log credentials; travel shares cached map_info', async () => {
    let calls=0,maps=0,last;
    const window={game_data:{village:{id:75233}}};
    const EAS={IncomingStore:{scope:()=> 'br143:7'},ArrivalPlanner:{mapInfo:async()=>{maps++;return {ram:1000}}}};
    const ctx=vm.createContext({window,EAS,URL,URLSearchParams,AbortController,location:{origin:'https://br143.tribalwars.com.br'},fetch:async(url,options)=>{calls++;last={url,options};return {ok:true,status:200}},setTimeout,clearTimeout});
    vm.runInContext(fs.readFileSync('services/incoming-transport.js','utf8'),ctx);
    const attack={commandId:'1992212583',source:{id:'5411'},target:{id:'2593',coords:'520|452'}};
    await assert.rejects(EAS.IncomingTransport.rename(attack,'test'),/DYNAMIC_TOKEN/);assert.equal(calls,0);
    window.csrf_token='fixture-dynamic';await EAS.IncomingTransport.rename(attack,'Aríete');
    assert.equal(last.url.searchParams.get('ajaxaction'),'edit_other_comment');assert.equal(last.url.searchParams.get('id'),attack.commandId);
    assert.equal(last.options.body.get('h'),'fixture-dynamic');assert.equal(last.options.body.get('text'),'Aríete');
    const a=EAS.IncomingTransport.travel(attack),b=EAS.IncomingTransport.travel(attack);assert.equal(a,b);await a;assert.equal(maps,1);
});
test('Discord GM transport requests response ID, PATCHes same message, restricts host and suppresses mentions', async () => {
    let now=1000,request,menu,value='https://discord.com/api/webhooks/123/fixture-secret';
    const unsafeWindow={},ctx=vm.createContext({unsafeWindow,location:{hostname:'br143.tribalwars.com.br'},Date:class extends Date{static now(){return now;}},
        GM_getValue:()=>value,GM_setValue:(k,v)=>value=v,GM_registerMenuCommand:(label,fn)=>menu=fn,
        GM_xmlhttpRequest:options=>{request=options;options.onload({status:200,responseText:'{"id":"987"}'})},prompt:()=>'',alert:()=>{}});
    vm.runInContext(fs.readFileSync('eas-discord-transport.user.js','utf8'),ctx);
    const bridge=unsafeWindow.EASDiscordBridge;assert.equal(bridge.configured(),true);
    const created=await bridge.send({payload:{content:'test',allowed_mentions:{parse:['everyone']}}});assert.equal(created.id,'987');
    assert.ok(request.url.endsWith('?wait=true'));assert.equal(request.method,'POST');assert.deepEqual(JSON.parse(request.data).allowed_mentions.parse,[]);
    now+=1100;await bridge.send({messageId:'987',payload:{content:'updated'}});assert.equal(request.method,'PATCH');assert.ok(request.url.endsWith('/messages/987'));
    value='https://example.com/api/webhooks/123/token';assert.equal(bridge.configured(),false);await assert.rejects(bridge.send({payload:{content:'bad'}}));
    menu();assert.equal(value,'');
});
test('Discord HTTP error and timeout return sanitized errors with no automatic retry', async () => {
    let calls=0;
    const unsafeWindow={},ctx=vm.createContext({unsafeWindow,location:{hostname:'br143.tribalwars.com.br'},GM_getValue:()=> 'https://discord.com/api/webhooks/123/fixture-secret',GM_setValue(){},GM_registerMenuCommand(){},GM_xmlhttpRequest:options=>{calls++;options.ontimeout({secret:'fixture-secret'});}});
    vm.runInContext(fs.readFileSync('eas-discord-transport.user.js','utf8'),ctx);
    await assert.rejects(unsafeWindow.EASDiscordBridge.send({payload:{content:'test'}}),/DISCORD_RESULT_UNCERTAIN/);assert.equal(calls,1);
});
