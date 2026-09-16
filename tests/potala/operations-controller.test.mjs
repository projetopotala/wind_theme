import test from 'node:test';
import assert from 'node:assert/strict';
const mod=await import('../../outputs/js/admin/operations/controller.js').catch(()=>({}));

test('formulário converte dinheiro e várias necessidades sem duplicar entidades',()=>{
  assert.equal(typeof mod.payloadFromForm,'function');
  const payload=mod.payloadFromForm('schedule',{title:'Ciclo',kind:'event',mode:'presencial',room_id:'sala',starts_at:'2026-09-16T19:00',ends_at:'2026-09-16T21:00',participants:'30',setup_minutes:'0',teardown_minutes:'0',price_reais:'125,50',requirement__cadeira:'30',requirement__projetor:'1',extra_name_0:'Coffee break',extra_quantity_0:'1',extra_price_reais_0:'25,00',extra_name_1:'Preparação especial',extra_quantity_1:'2',extra_price_reais_1:'10',scope:'occurrence'});
  assert.equal(payload.price_cents,12550);
  assert.deepEqual(payload.requirements,[{item_id:'cadeira',quantity:30},{item_id:'projetor',quantity:1}]);
  assert.deepEqual(payload.extras,[{name:'Coffee break',quantity:1,unit_price_cents:2500},{name:'Preparação especial',quantity:2,unit_price_cents:1000}]);
});

test('valor monetário rejeita texto ambíguo em vez de cobrar errado',()=>{
  assert.equal(typeof mod.moneyToCents,'function');
  assert.equal(mod.moneyToCents('1.234,56'),123456);
  assert.throws(()=>mod.moneyToCents('12 reais'),/valor/i);
});
