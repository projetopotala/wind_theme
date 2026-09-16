import test from 'node:test';
import assert from 'node:assert/strict';
import {collections} from '../../scripts/operations-store.mjs';
const mod=await import('../../outputs/js/admin/operations/views.js').catch(()=>({}));
const state=()=>Object.fromEntries(collections.map(name=>[name,[]]));
test('visão inicial apresenta dados vazios reais e preparação das salas',()=>{
 assert.equal(typeof mod.renderView,'function');
 const html=mod.renderView('dashboard',state(),{date:'2026-09-16',view:'day'});
 assert.match(html,/Preparar as 10 salas/);assert.doesNotMatch(html,/Helena|R\$ 12/);
});
test('títulos e nomes cadastrados não podem inserir HTML na agenda e nas salas',()=>{
 assert.equal(typeof mod.renderView,'function');const s=state();
 s.rooms.push({id:'r',name:'<img src=x onerror=alert(1)>',code:'S01',status:'unconfirmed'});
 const html=mod.renderView('rooms',s,{date:'2026-09-16',view:'day'});
 assert.doesNotMatch(html,/<img src=x/);assert.match(html,/&lt;img/);
});
