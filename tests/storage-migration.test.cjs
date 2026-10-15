const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('old V2 migration entry point cannot create archives or bypass explicit backup',()=>{
 const data=new Map(),storage={get length(){return data.size},key:i=>[...data.keys()][i],getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 const box={EAS:{},localStorage:storage,Date};vm.createContext(box);for(const path of ['core/storage.js','services/storage-migration.js'])vm.runInContext(fs.readFileSync(path,'utf8'),box);
 assert.equal(box.EAS.StorageMigration.run()[0].reason,'EXTERNAL_BACKUP_AND_AUTHORIZATION_REQUIRED');assert.equal(data.size,0);
});
