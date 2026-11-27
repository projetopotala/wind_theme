import { test } from "node:test";
import assert from "node:assert/strict";
import { renderizarPrecos } from "../../outputs/js/admin/pagamentos-pix-admin.js";
import atendimentos from "../../outputs/js/conta/spa/vistas/atendimentos.js";

test("Central mostra opt-in por oferta sem controle da trava global",()=>{
 const html=renderizarPrecos([{offering_id:"o",title:"Atendimento",published:true,professional_name:"Profissional",professional_eligible:true,test_or_demo:false,amount_cents:15000,currency:"BRL",price_active:true,payments_enabled:false}]);
 assert.match(html,/Habilitar Pix nesta oferta/); assert.match(html,/trava global continua obrigatória/); assert.doesNotMatch(html,/Habilitar cobranças globais/);
});

test("consulta confirmada mostra valor sem CTA ou cobranca retroativa",()=>{
 const id="11111111-1111-4111-8111-111111111111";
 const html=atendimentos.renderizar({atendimentos:[{id,servico:"Meditação",modalidade:"online",status:"encerrada",reservaId:"r",inicio:"2027-01-10T15:00:00Z",fim:"2027-01-10T16:00:00Z"}],agora:new Date("2027-01-01T12:00:00Z"),pagamentosPix:{ativo:false,opcoes:{[id]:{amount_cents:15000,currency:"BRL",confirmed:true}},porPedido:{}}});
 assert.match(html,/Preço atual da oferta:.*150,00/); assert.match(html,/Informação de referência/); assert.match(html,/nenhuma cobrança retroativa/); assert.doesNotMatch(html,/Pagar com Pix|pagamento pendente/i);
});
