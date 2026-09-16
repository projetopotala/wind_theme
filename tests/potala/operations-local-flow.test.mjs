import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPreviewServer} from '../../scripts/serve-outputs.mjs';

test('servidor local integra painel, API, persistência e regras de agenda',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'potala-flow-'));const server=createPreviewServer({databasePath:join(dir,'operation.sqlite')});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const admin=await fetch(base+'/admin');assert.equal(admin.status,200);assert.match(await admin.text(),/data-op-view="agenda"/);
    const session=await (await fetch(base+'/api/operations/session')).json();const headers={'Content-Type':'application/json','X-Potala-Token':session.token};
    const command=async(type,payload,revision,key)=>fetch(base+'/api/operations/command',{method:'POST',headers,body:JSON.stringify({type,payload,revision,idempotency_key:key})});
    assert.equal((await command('setup.rooms',{},0,'setup-rooms')).status,200);
    let state=await (await fetch(base+'/api/operations/state',{headers})).json();assert.equal(state.rooms.length,10);assert.ok(state.rooms.every(room=>room.status==='unconfirmed'));
    const room={...state.rooms[0],name:'Sala Térrea',capacity:2,accessible:true,status:'available',opens_at:'08:00',closes_at:'20:00'};
    assert.equal((await command('room.save',room,state.revision,'confirm-room')).status,200);
    state=await (await fetch(base+'/api/operations/state',{headers})).json();assert.equal(state.rooms[0].name,'Sala Térrea');assert.equal(state.audit_events.length,2);
  }finally{await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true});}
});
