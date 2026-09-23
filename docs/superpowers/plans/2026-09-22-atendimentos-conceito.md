# Atendimentos Conceito Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar uma página isolada que preserve a visão completa de Atendimentos e aplique a organização editorial refinada da referência sem modificar as páginas atuais.

**Architecture:** HTML semântico estático, CSS isolado e um módulo JavaScript sem dependências. As interações trabalham apenas no cliente e deixam explícito quando um fluxo é demonstrativo. Assets fornecidos são copiados para um diretório próprio.

**Tech Stack:** HTML5, CSS custom properties, JavaScript ES modules, Node test runner.

**Spec:** `docs/design/2026-09-22-atendimentos-tironi-mesclagem.md`

## Global Constraints

- Não modificar `outputs/transcendido.html`, `outputs/index.html` nem `outputs/atendimentos.html`.
- Não criar dependência nova.
- Não enviar dados demonstrativos a qualquer backend.
- Respeitar `prefers-reduced-motion` e navegação por teclado.
- Usar a marca real do Portal Potala.

## Review Focus

- Termos de busca com acento devem encontrar o mesmo conteúdo sem acento.
- Uma Praça sem resultados deve anunciar estado vazio legível.
- O formulário demonstrativo nunca deve parecer uma reserva concluída.
- Navegação lateral não pode prender o foco ao ser fechada.
- A linha de jornada deve desaparecer/simplificar sob movimento reduzido.

---

### Task 1: Contrato e assets isolados

**Files:**
- Create: `tests/potala/atendimentos-conceito.test.mjs`
- Create: `outputs/media/atendimentos-conceito/ambiente.png`
- Create: `outputs/media/atendimentos-conceito/ambiente-camadas.webp`

**Interfaces:**
- Produces: caminhos locais estáveis e contrato do DOM.

- [ ] Escrever testes que exijam a nova rota, arquivos isolados, capítulos, aviso demonstrativo, alt, reduced motion e ausência de referência nova nas páginas antigas.
- [ ] Executar o teste e verificar a falha pela ausência da página.
- [ ] Copiar os assets fornecidos sem modificar a origem.

### Task 2: Estrutura semântica da jornada

**Files:**
- Create: `outputs/atendimentos-conceito.html`

**Interfaces:**
- Produces: IDs `inicio`, `saude`, `vivemos`, `investigar`, `papel`, `praca`, `oraculos`, `profissionais`, `especiais`, `virtual`, `agendar` e `encerramento`.

- [ ] Construir header, hero, índice e landmarks.
- [ ] Incluir os conteúdos obrigatórios de todos os capítulos.
- [ ] Rotular conteúdo, profissionais e agenda demonstrativos.
- [ ] Ligar folhas e módulo por caminhos relativos.

### Task 3: Sistema visual e responsivo

**Files:**
- Create: `outputs/css/atendimentos-conceito.css`

**Interfaces:**
- Consumes: contrato de classes e IDs do HTML.
- Produces: composição desktop/tablet/mobile e estados `is-visible`, `is-open`, `is-selected` e `is-empty`.

- [ ] Definir tokens, tipografia, grid e foco.
- [ ] Compor ambientes com ritmos distintos e espaço negativo.
- [ ] Implementar fio da jornada com variável `--journey-progress`.
- [ ] Implementar breakpoints e modo de movimento reduzido.

### Task 4: Interações com função

**Files:**
- Create: `outputs/js/atendimentos-conceito.js`

**Interfaces:**
- Consumes: atributos `data-*` do HTML.
- Produces: busca/filtro, mapa, expandir leitura, perguntas, menu e resumo demonstrativo.

- [ ] Criar normalização de busca sem acento.
- [ ] Atualizar resultados e estado vazio da Praça.
- [ ] Trocar o painel de naturezas com `aria-selected`.
- [ ] Implementar expansão de leitura e Banco Vivo com foco controlado.
- [ ] Atualizar resumo de agendamento sem persistir/enviar dados.
- [ ] Atualizar fio e reveals via `requestAnimationFrame`/`IntersectionObserver`.

### Task 5: Validação funcional e visual

**Files:**
- Modify only if required: files created in Tasks 1–4.

**Interfaces:**
- Produces: página validada em desktop e mobile.

- [ ] Executar teste dedicado.
- [ ] Executar `npm run validate:portal`.
- [ ] Abrir rota local e verificar console.
- [ ] Testar busca, filtro, mapa, perguntas e agendamento.
- [ ] Capturar desktop e mobile, corrigir overflow/legibilidade.

