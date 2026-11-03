# D4 - Roteiro de integração Daily no LAB (2026-11-03)

Somente LAB `hmspabllgxqfzzricijv` e Preview `wind-theme-m2-lab-preview`. Nada de produção, Marketplace ou main.

## Estado verificado
- Branch `feat/d4-salas-privadas`, HEAD `749d265` na partida, worktree limpa.
- Funções publicadas no LAB: apenas `submit-appointment-request`. As duas funções da D4 não estão publicadas.
- Secrets no LAB: só os `SUPABASE_*` automáticos. **`DAILY_API_KEY`, `DAILY_DOMAIN` e `ROOM_ALLOWED_ORIGINS` ainda não existem.**
- `verify_jwt = true` nas duas funções (`supabase/config.toml`).
- Preview: URLs únicas de deployment respondem 302 para o SSO da Vercel com `X-Robots-Tag: noindex` (protegidas). O alias estável `wind-theme-m2-lab-preview.vercel.app` responde 200 sem SSO e serve uma versão antiga (sem a página da sala): ele não deve ser usado como origem e não foi alterado.

## Formato exato dos secrets
- `DAILY_DOMAIN`: só o subdomínio da conta (ex.: `institutopotala` para `institutopotala.daily.co`). A função exige `^[a-z0-9-]+$`: sem `https://`, sem `.daily.co`, sem barra. Deve ser do mesmo ambiente Daily da chave.
- `DAILY_API_KEY`: chave nova (a anterior foi substituída). Só existe como secret do Supabase.
- `ROOM_ALLOWED_ORIGINS`: lista separada por vírgula de origens exatas (`esquema://host[:porta]`, sem caminho nem barra final), comparadas por igualdade com o cabeçalho `Origin`. Sem coringa. Uso previsto: a URL única do deployment Preview que será testado + `http://localhost:<porta>` (teste local). Como o endereço único muda a cada deploy, a ordem é: publicar a Preview, ler a URL, depois definir/atualizar este secret.

## Como configurar sem expor valores
No seu computador, num arquivo fora do repositório (ex.: `C:\Users\vicel\daily-lab.env`, apagado depois):
```
DAILY_API_KEY=...
DAILY_DOMAIN=...
ROOM_ALLOWED_ORIGINS=https://wind-theme-m2-lab-preview-XXXX-potala.vercel.app,http://localhost:3000
```
`npx supabase secrets set --env-file C:\Users\vicel\daily-lab.env --remote=hmspabllgxqfzzricijv`. Eu confirmo só os nomes com `secrets list`.

## Gates antes de publicar
1. Os 3 nomes presentes no `secrets list`.
2. HEAD limpo e testes D4/Portal verdes (já aprovados em `749d265`).
3. Preview com o front da D4 publicada e URL única conhecida (autorização específica para o deploy Preview).
4. Autorização específica para publicar as duas funções.

## Publicação (LAB, JWT mantido)
`npx supabase functions deploy issue-appointment-room-token --remote=hmspabllgxqfzzricijv` e idem `close-appointment-room`, sem `--no-verify-jwt`. Conferir versão/estado com `functions list` e confirmar `verify_jwt` ativo.

## Testes na ordem (parar no primeiro defeito)
Cada item que deve ser negado também confirma que **nenhuma sala foi criada no Daily** (painel do Daily antes/depois).
1. Preflight `OPTIONS` sem JWT, origem permitida. Esperado: 204 com `Access-Control-Allow-Origin`. **Ponto de atenção:** com `verify_jwt=true` o gateway pode rejeitar o `OPTIONS` (sem `Authorization`) antes da função. Se acontecer, diagnosticar qual camada rejeita (cabeçalho/corpo da resposta, logs) e **parar**; não desligar o JWT sem decisão sua. Alternativas a apresentar: chamar via mesma origem (proxy) ou verificar o JWT dentro da função com `verify_jwt=false`.
2. `OPTIONS` com origem não listada: sem `Access-Control-Allow-Origin`.
3. `POST` sem `Authorization`: 401. `POST` com token inválido e com token expirado: 401.
4. `POST` com a chave pública (anon/publishable) como bearer, sem sessão de usuário: negado, sem Daily.
5. Usuário real não participante: 403, sem Daily.
6. Participante fora da janela (antes) e presencial: 409, sem Daily.
7. Cliente sintético em atendimento online confirmado dentro da janela: 200; URL do tipo `https://<domínio>.daily.co/potala-<32 hex>`. No painel do Daily: sala privada, 2 participantes, sem gravação, `exp` = fim da janela.
8. Resposta e logs da função sem token nem chave.
9. Navegador real, duas contas sintéticas (cliente e profissional), Preview protegida: câmera e áudio, chat, queda e reentrada, terceiro isolado.
10. Encerramento pelo profissional: `{closed:true, revoked:true}`; os conectados são desconectados; reentrada e token antigo recusados; nova emissão 409.
11. Falha forçada da revogação (se viável) e repetição pela tela.
12. Larguras 320, 375, 390, 768, 1366 e 1920 px, incluindo câmera, chat e controles.
13. Limpeza: dados sintéticos pelo manifesto e salas do Daily removidas (painel).

## Decisões em aberto
- Reconciliador periódico (não construído): ver `docs/d4-daily-integracao-2026-11-03.md`.
- Verificação direta da chave do Daily: só é feita pelo teste 7 (a chave não é legível depois de gravada no Supabase).
