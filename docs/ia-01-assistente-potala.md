# IA-01 — Assistente Potala

Assistente de orientação para visitantes do portal público, ligado à OpenAI por um backend seguro.

## Arquitetura

```
Navegador (bolinha flutuante, chave PUBLICÁVEL)
   │  POST {mensagens}
   ▼
Supabase Edge Function  assistente-potala
   ├─ valida origem (CORS), tamanho e formato da conversa
   ├─ reserva uso no banco (RPC ia_reservar_uso, só service_role)  → limites por visitante + teto diário
   ├─ lê conhecimento PÚBLICO: /ia/conhecimento.json do site + Blog publicado (chave publicável)
   └─ OpenAI Responses API (OPENAI_API_KEY só aqui) → JSON estruturado {resposta, links}
         └─ links revalidados (só páginas do portal que existem); URLs removidas do texto
```

- **Modelo:** `gpt-6-luna`, por padrão. A OpenAI o descreve como o modelo mais eficiente para tarefas focadas e de alto volume. Custa US$ 0,10 por 1 milhão de tokens de entrada e US$ 0,50 por 1 milhão de saída. Pode ser trocado por `IA_MODELO`, sem mexer no código.
- **Custo estimado:** cerca de 4–6 mil tokens de entrada e até 600 de saída por pergunta, o que dá menos de US$ 0,001 por pergunta. Com o teto padrão de 800 perguntas por dia, o custo máximo diário fica perto de US$ 0,80.
- **Nada é guardado:**
  - `store: false` na OpenAI;
  - o banco só recebe contadores, sem pergunta nem resposta;
  - os logs só têm métricas;
  - a conversa fica apenas na aba do visitante (`sessionStorage`).

## Configuração (proprietário) — sem colocar a chave no Git

Os passos abaixo são feitos **no painel do Supabase**, primeiro no LAB, e em Production só quando houver autorização.

1. **Aplicar a migration** `supabase/migrations/202611130001_ia_assistente_uso.sql`. Use o procedimento controlado: uma versão por vez, sem `db push`.
2. **Publicar a função:** `supabase functions deploy assistente-potala --project-ref <projeto>`.
3. **Cadastrar os segredos.** Abra o painel do projeto → **Edge Functions → Secrets** (página *Edge Function Secrets*), preencha **Key** e **Value** e clique em **Save**:

   | Key | Value |
   |---|---|
   | `OPENAI_API_KEY` | a chave da OpenAI (cole direto no painel; nunca em arquivo, chat ou commit) |
   | `IA_SEGREDO_HASH` | um texto aleatório longo (ex.: gerado por um gerenciador de senhas) |
   | `IA_ORIGENS_PERMITIDAS` | `https://wind-theme.vercel.app` (no LAB: o endereço da Preview do LAB) |
   | `IA_SITE_URL` | `https://wind-theme.vercel.app` (de onde a função lê `/ia/conhecimento.json`) |
   | `IA_ATIVO` | `true` — **liga** o assistente; qualquer outro valor desliga na hora |

   A documentação do Supabase confirma que funções já publicadas leem segredos novos imediatamente, sem precisar republicar. Alterar segredos de Production exige o papel Owner ou Administrator no Supabase.

4. **Opcionais**, com os valores padrão entre parênteses:
   - `IA_MODELO` (`gpt-6-luna`);
   - `IA_ESFORCO` (`none`);
   - `IA_MAX_TOKENS_SAIDA` (600);
   - `IA_TIMEOUT_MS` (20000);
   - `IA_LIMITE_MINUTO` (5 por visitante);
   - `IA_LIMITE_DIA` (40 por visitante);
   - `IA_LIMITE_GLOBAL_DIA` (800 perguntas no total);
   - `IA_LIMITE_TOKENS_DIA` (1.500.000).

## Desligar em emergência

- **Na hora:** mude `IA_ATIVO` para `false` no painel. A bolinha some de Production na próxima página carregada, porque o `GET` da função passa a responder `{ativo:false}`.
- **Automático:** ao atingir o teto diário de perguntas ou de tokens, a função responde "limite de uso de hoje" até o dia seguinte.
- **Total:** rodar o rollback `supabase/rollbacks/202611130001_rollback_ia_assistente_uso.sql`. Sem os contadores, a função fica fechada.

## Onde o assistente aparece

- **Páginas públicas:** uma linha `<script type="module" src="/js/assistente/assistente-boot.js"></script>` em 25 páginas. Admin, Mesa, Meu Potala, sala de atendimento e as telas de conta ficam fora.
- **Production:** a bolinha só aparece quando a função está ativa.
- **Fora de Production** (Preview, local): aparece em **modo de demonstração**, rotulado e sem IA, mostrando páginas do portal relacionadas à pergunta.

## Atualizar o conhecimento

```
node scripts/prepare-ia-conhecimento.mjs
```

Esse comando regenera `outputs/ia/conhecimento.json` a partir das páginas públicas. Um teste falha se o arquivo estiver desatualizado. Artigos e perfis do Blog são lidos ao vivo, com cache de 10 minutos.

## Identificação do visitante e custo (revisão de homologação)

- `IA_FONTE_IP` (opcional): `x-forwarded-for-ultimo` (padrão; usa o último valor, que é o acrescentado pelo proxy, e não o primeiro, que o cliente pode forjar), `cf-connecting-ip` ou `x-real-ip`. Valor inválido ou ausente vira o balde comum `sem-ip` (mais restritivo; o teto global continua valendo). Confirmar no LAB qual cabeçalho a plataforma preenche.
- O IP nunca é gravado: só um hash SHA-256 de `IA_SEGREDO_HASH | dia | ip` (32 caracteres), apagado após 1 dia.
- Custo é **estimativa** (`gpt-6-luna`: US$ 0,10 por milhão de tokens de entrada e US$ 0,50 de saída, conforme a página de preços na data da revisão). O teto de tokens é conferido antes de cada pedido e somado depois; com pedidos simultâneos ele pode ser ultrapassado em, no máximo, (pedidos em andamento × ~3.000 tokens).
- **Recomendação ao proprietário:** usar uma chave de **projeto dedicado** na OpenAI, com limite mensal de gasto (*budget*) e alertas de uso configurados no painel da OpenAI. Esse limite é a última barreira, independente do código.

### Escolha da fonte de IP (obrigatória) e modo ensaio

- Nenhum cabeçalho é presumido confiável. `IA_FONTE_IP` passou a ser **obrigatório**: sem ele (ou com valor fora da lista), o assistente fica desligado.
- `IA_ENSAIO=true` só tem efeito com `IA_ATIVO=false`: o POST valida o pedido, calcula a identidade e **reserva a cota real no banco**, mas nunca chama a OpenAI e não precisa de `OPENAI_API_KEY`. A resposta traz só marcas de 8 caracteres (hash com segredo e dia) de cada fonte candidata, a quantidade de valores em X-Forwarded-For e a marca do balde `sem-ip` — nunca o IP.
- A fonte escolhida no LAB é a que (a) não muda quando o cliente forja o cabeçalho, (b) é igual em chamadas seguidas do mesmo visitante e (c) é diferente para redes diferentes. Se nenhuma cumprir (c), o limite por visitante vira um balde comum; a proteção financeira continua no teto global do banco.
- Depois da escolha: `IA_ENSAIO` removido ou `false`.
