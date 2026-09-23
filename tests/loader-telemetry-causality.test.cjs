const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('tests/fixtures/loader/native-telemetry-excerpt.js','utf8');
function fixture(options={}){const c=vm.createContext({btoa});vm.runInContext(source,c);return c.installTelemetryExcerpt(options);}
const script=(src,textContent='identical code')=>({tagName:'SCRIPT',src,textContent});
const add=(f,node)=>f.consume([{addedNodes:[node]}]);
test('source branch deduplicates reinserted URL and changing query, not changing blob UUID',()=>{
 const f=fixture();add(f,script('https://test/a.js?v=1'));add(f,script('https://test/a.js?v=2'));assert.equal(f.stats.emissions,1);
 add(f,script('blob:https://test/uuid-1'));add(f,script('blob:https://test/uuid-1'));add(f,script('blob:https://test/uuid-2'));
 assert.equal(f.stats.emissions,3);
});
test('33 distinct legacy blobs cause 33 source-branch emissions, not thousands',()=>{
 const f=fixture();for(let i=0;i<33;i++)add(f,script('blob:https://test/'+i));
 assert.equal(f.stats.emissions,33);
 for(let i=0;i<33;i++)add(f,{tagName:'IMG',src:f.pending[i].pixel});
 assert.equal(f.stats.emissions,33);assert.equal(f.stats.calls,33);assert.equal(f.stats.imageNodes,33);
});
test('identical data URLs are cached; variable content produces a distinct key',()=>{
 const f=fixture();add(f,script('data:text/javascript;base64,YQ=='));add(f,script('data:text/javascript;base64,YQ=='));
 add(f,script('data:text/javascript;base64,Yg=='));assert.equal(f.stats.emissions,2);
});
test('cache suffix uses only the first 50 characters of t',()=>{
 const f=fixture();f.process('https://test/a.js','a'.repeat(50)+'one');f.process('https://test/a.js','a'.repeat(50)+'two');
 assert.equal(f.stats.emissions,1);f.process('https://test/a.js','b'.repeat(50));assert.equal(f.stats.emissions,2);
});
test('inline tc extractors can create different values but duplicate results share cache',()=>{
 const f=fixture({tc:{first:()=> 'one',second:()=> 'two',third:()=> 'one'}});add(f,script(''));
 assert.equal(f.stats.calls,3);assert.equal(f.stats.emissions,2);add(f,script(''));assert.equal(f.stats.emissions,2);
});
test('new cache instance can emit the same key again; not evidence that real cache resets',()=>{
 const a=fixture(),b=fixture();add(a,script('blob:https://test/same'));add(b,script('blob:https://test/same'));
 assert.equal(a.stats.emissions+b.stats.emissions,2);
});
