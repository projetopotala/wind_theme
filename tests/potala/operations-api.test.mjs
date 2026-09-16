import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer,request} from 'node:http';
import {createOperationalStore} from '../../scripts/operations-store.mjs';
const api=await import('../../scripts/operations-api.mjs').catch(()=>({}));
test('API local fornece fronteira de sessão para comandos',()=>assert.equal(typeof api.createOperationsApi,'function'));
test('API recusa origem externa, Host falso e gravação sem token', {skip:!api.createOperationsApi},async()=>{
 const store=createOperationalStore({path:':memory:',handlers:[(state,cmd,ctx)=>{if(cmd.type==='person.save'){const row={id:ctx.id(),...cmd.payload};state.profiles.push(row);return row;}}]});
 const handler=api.createOperationsApi({store});
 const server=createServer(handler);await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
  assert.equal((await fetch(base+'/api/operations/session',{headers:{Origin:'https://evil.test'}})).status,403);
  const forged=await new Promise(resolve=>{const req=request(base+'/api/operations/session',{headers:{Host:'evil.test'}},res=>{res.resume();resolve(res.statusCode);});req.end();});
  assert.equal(forged,403);
  const session=await (await fetch(base+'/api/operations/session')).json();
  assert.equal((await fetch(base+'/api/operations/state')).status,403);
  const payload={type:'person.save',payload:{display_name:'Ana'},revision:0,idempotency_key:'api-ana'};
  assert.equal((await fetch(base+'/api/operations/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})).status,403);
  const headers={'Content-Type':'application/json','X-Potala-Token':session.token};
  const response=await fetch(base+'/api/operations/command',{method:'POST',headers,body:JSON.stringify(payload)});
  assert.equal(response.status,200);assert.equal((await response.json()).revision,1);
  const snapshot=await (await fetch(base+'/api/operations/state',{headers})).json();assert.equal(snapshot.profiles[0].display_name,'Ana');
 }finally{await new Promise(r=>server.close(r));store.close();}
});
