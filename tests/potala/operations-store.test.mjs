import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const storeModule = await import('../../scripts/operations-store.mjs').catch(() => ({}));
test('persistência operacional disponibiliza transações locais', () => assert.equal(typeof storeModule.createOperationalStore, 'function'));
const handler = (state, { type, payload }, ctx) => {
  if(type === 'person.save') { state.profiles.push({id:ctx.id(),...payload}); return state.profiles.at(-1); }
  if(type === 'fail') { state.profiles.length=0; throw new Error('Falha de domínio'); }
};
test('gravação persiste após reabrir e falha não apaga dados nem gera auditoria', {skip:!storeModule.createOperationalStore}, () => {
  const dir=mkdtempSync(join(tmpdir(),'potala-test-')); const path=join(dir,'operation.sqlite');
  let store=storeModule.createOperationalStore({path,handlers:[handler]});
  try {
    store.command({type:'person.save',payload:{display_name:'Ana'},revision:0,idempotency_key:'create-ana',actor:'Paulo'});
    assert.throws(()=>store.command({type:'fail',payload:{},revision:1,idempotency_key:'fail'}),/Falha/);
    store.close(); store=storeModule.createOperationalStore({path,handlers:[handler]});
    assert.equal(store.snapshot().profiles[0].display_name,'Ana');
    assert.equal(store.snapshot().audit_events.length,1);
    assert.equal(store.snapshot().audit_events[0].actor,'Paulo');
    assert.equal(store.snapshot().revision,1);
  } finally {store.close();rmSync(dir,{recursive:true,force:true});}
});
test('repetição é idempotente e edição desatualizada é recusada sem perder alterações', {skip:!storeModule.createOperationalStore}, () => {
  const store=storeModule.createOperationalStore({path:':memory:',handlers:[handler]});
  try {
    const command={type:'person.save',payload:{display_name:'Ana'},revision:0,idempotency_key:'one'};
    const first=store.command(command); const repeat=store.command(command);
    assert.equal(first.result.id,repeat.result.id);
    assert.equal(store.snapshot().profiles.length,1);
    assert.throws(()=>store.command({...command,idempotency_key:'two'}),/atualiz/i);
    assert.throws(()=>store.command({...command,payload:{display_name:'Outra'}}),/reutiliz/i);
  } finally {store.close();}
});
