# Comercial e pagamentos do portal: diagnóstico e desenho

Status: proposta e protótipo de demonstração. Nada aqui altera Production, grava dados ou cobra.

## 1. O que já existe em Production

O modelo operacional guarda coleções em `op_records` (JSON): `activity_definitions`, `activity_offerings` (modo, capacidade, profissional), `enrollments`, `schedule_items` (`price_cents`, modo, profissional, `starts_at`), `financial_entries` (`amount_cents`), `profiles`, `rooms`, `audit_events`. Há também as tabelas `appointment_slots` e `appointment_requests` e as RPCs `submit_appointment_request`, `list_appointment_offerings`, `list_available_appointment_slots`, `confirm_appointment_request_reservation`, `op_turma_capacidade` e `my_course_enrollments`.

Lacunas: não existem tabelas de pedidos nem de pagamentos; `financial_entries` é lançamento contábil interno, não cobrança. O Marketplace é um projeto separado e permanece assim.

## 2. Modalidades e ação de cada uma

| Modalidade | Exemplo | Ação | Pagamento online |
|---|---|---|---|
| Curso ou workshop presencial | Reiki Usui 1 | Inscrever-se | sim |
| Evento ou vivência | Oficina de Cristais | Reservar vaga | sim, se houver preço |
| Atividade recorrente | Yoga (mensal), Roda (por encontro) | Reservar vaga / Pagar | sim |
| Atendimento pago, horário a combinar | Acupuntura | Solicitar agendamento | não (cobrança após confirmar) |
| Atendimento pago, agenda aberta | Leitura de Búzios | Agendar | sim |
| Solidário ou gratuito | Regeneração Celular | Participar gratuitamente | não |
| Solidário com vagas limitadas | Cirurgias Espirituais (50) | Reservar vaga | não |
| Atendimento humano | Dança Cigana, Benzimento | Falar com a Recepção | não |
| Produto físico | Marketplace | Ver no Marketplace | no Marketplace |

O protótipo está em `outputs/ofertas.html`, com dados de `outputs/ofertas/catalogo-demonstracao.json` (programação pública do site antigo, consultada em 14/11/2026) e regras puras em `outputs/js/ofertas/ofertas-modelo.js`, cobertas por `tests/potala/ofertas-demo.test.mjs`.

## 3. Mercado Pago Checkout Pro (avaliação)

Checkout Pro redireciona o cliente para a página do Mercado Pago, que cobre Pix, cartão de crédito e débito e saldo em conta. Vantagens: o portal nunca toca em dados de cartão (escopo PCI mínimo), menos código, Pix nativo. Custos: experiência sai do site; taxas por método; conciliação depende do webhook.

### Ciclo de vida do pedido

`criado` → `aguardando_pagamento` → `pago` | `recusado` | `expirado` → (`cancelado` | `reembolsado`). Para ofertas gratuitas: `criado` → `confirmado`, sem passar por pagamento.

### Componentes (todos no servidor)

1. Edge Function `criar-checkout`: valida a oferta e a disponibilidade, reserva a vaga com prazo (ex.: 15 min), cria o pedido e a preferência de pagamento com `external_reference = id do pedido`, devolve só a URL do checkout. O token de acesso fica em segredo do Supabase, nunca no navegador.
2. Edge Function `webhook-mercadopago`: valida a assinatura (`x-signature` com segredo próprio), consulta o pagamento na API usando o id recebido (nunca confia no corpo), e aplica a transição de estado.
3. Idempotência: tabela de eventos com chave única `(provedor, id_do_pagamento, status)`; repetição de webhook não duplica efeito.
4. Reserva e duplicidade: vaga reservada por pedido com expiração; restrição única `(oferta, pessoa)` para pedidos ativos; contagem de vagas pela RPC já existente `op_turma_capacidade`.
5. Cancelamento e reembolso: ação restrita à Recepção ou ao Owner, chamando a API de reembolso; o estado só muda após confirmação do provedor.
6. Conciliação: rotina diária compara pedidos `aguardando_pagamento` com a API do provedor e fecha divergências; gera `financial_entries` apenas para pagamentos aprovados.

### Permissões e privacidade

Cliente vê apenas os próprios pedidos (RLS por `auth.uid()`). Profissional vê inscritos das próprias ofertas, sem dados de pagamento. Recepção e Owner veem pedidos e conciliação. Apenas o Owner existente é administrador; nenhuma conta nova de admin. Dados pessoais mínimos (nome, e-mail), finalidade informada, retenção definida, sem dados de cartão armazenados (LGPD).

### Separação do Marketplace

Pedidos de produtos físicos continuam no Marketplace. O portal só encaminha (ação "Ver no Marketplace"). Tabelas, credenciais e webhooks são distintos.

## 4. Migração proposta (NÃO aplicada)

Tabelas `pedidos`, `pagamentos`, `eventos_pagamento` e `reservas_vaga`, com RLS por dono, índices únicos de idempotência e duplicidade, e funções `SECURITY DEFINER` para as transições. Antes de aplicar em Production: backup validado, plano de reversão, testes em LAB e aprovação explícita do Owner.

## 5. Dependências reais para ir ao ar

1. Conta Mercado Pago do Instituto e credenciais de teste, depois de produção, cadastradas pelo Owner direto no painel do Supabase (nunca em chat).
2. Aprovação e aplicação da migração.
3. Edge Functions `criar-checkout` e `webhook-mercadopago` com URL pública cadastrada no Mercado Pago.
4. Decisão do Instituto sobre política de cancelamento e reembolso, taxas e quem recebe (Instituto ou profissional).
5. Catálogo oficial de ofertas com preços e datas (hoje o protótipo usa o catálogo de demonstração).
6. Ensaio ponta a ponta em sandbox antes de qualquer cobrança real.
