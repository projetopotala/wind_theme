# UX-02 — Protótipo da Travessia Guiada

## Escopo

Protótipo navegável, isolado em `outputs/ux02-travessia.html`. Não substitui `transcender.html` nem `travessia.html` e não altera autenticação, Supabase, IA-01, cursos ou agendamentos.

Preview protegida: https://wind-theme-fqdn1hwv6-potala.vercel.app/ux02-travessia.html

## Decisões de UX

- A primeira pergunta é cotidiana: “O que você procura hoje?”.
- Há dois modos claros: encontrar algo ou explorar a paisagem.
- Os três pontos usam necessidades (“Quero cuidar de mim”, “Quero aprender”, “Quero participar”), não nomes poéticos de regiões.
- Ao tocar em um ponto, a pessoa recebe uma explicação breve do que encontrará e até duas ações públicas reais.
- “Conhecer o Potala”, “Pedir orientação” e “Ver a Travessia original” permanecem disponíveis sem criar conta.
- O Assistente Potala continua opcional e é reutilizado pela arquitetura IA-01.

## Antes e depois

| Experiência anterior | Protótipo UX-02 |
| --- | --- |
| “Tempo”, “Presença” e “Fluxo” exigem interpretação | “Quero cuidar de mim” explica a intenção antes do clique |
| Cartão editorial pode parecer apenas conteúdo | Legenda contextual diz o que será encontrado |
| O visitante precisa descobrir o próximo passo | Cada região oferece ações nomeadas, como “Conhecer atendimentos” |
| A Travessia é o caminho principal | Explorar e orientação prática são escolhas equivalentes |

## Limites da avaliação

Os testes automatizados específicos passaram 3/3. `validate:portal`, lint e `git diff --check` passaram. A Preview foi criada e está protegida pelo SSO do projeto Vercel.

Screenshots e teste com visitante leigo ainda dependem de navegador autorizado nesta sessão. O navegador CUA ficou indisponível; portanto a aprovação visual não foi declarada.
