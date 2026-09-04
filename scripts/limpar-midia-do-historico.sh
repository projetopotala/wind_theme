#!/usr/bin/env bash
#
# Tira do HISTÓRICO do Git a mídia que não existe mais no projeto.
#
# O repositório carrega ~300 MB, dos quais ~225 MB são arquivos que ninguém
# usa há meses: quatro versões antigas do vídeo de fundo (cada tentativa de
# melhorar a qualidade virou um commit com o arquivo inteiro), o modelo 3D que
# testamos e apagamos, dois vídeos de uma versão anterior do site e alguns
# HTMLs gigantes de antes do projeto ser dividido em módulos.
#
# Apagar um arquivo num commit novo NÃO o remove do histórico — ele continua
# em cada clone, para sempre. A única forma de tirá-lo é reescrever os commits,
# e é isso que este script faz.
#
# O QUE ISSO CUSTA
#
#   - Todos os SHAs de commit mudam. O histórico publicado no GitHub é
#     substituído, e o push seguinte precisa de --force.
#   - Qualquer outro clone do repositório para de bater com o remoto e precisa
#     ser refeito. Se só você trabalha nele, isso não custa nada.
#   - O Vercel vai reconstruir, porque o topo da branch muda.
#
# O QUE ISSO NÃO MUDA
#
#   Nenhum arquivo do projeto. O conteúdo do último commit fica idêntico — o
#   script confere isso e aborta se não ficar. O site publicado é o mesmo.
#
# COMO VOLTAR ATRÁS
#
#   Existe um bundle com o repositório inteiro antes da reescrita. O caminho
#   dele é impresso no fim, e restaurar é:
#       git fetch <caminho-do-bundle> 'refs/*:refs/*' --force
#
set -euo pipefail

cd "$(dirname "$0")/.."
RAIZ="$(pwd)"
echo "Repositório: $RAIZ"
echo

# ------------------------------------------------------------------
# 0. Nada pendente, senão a reescrita levaria trabalho não salvo junto.
# ------------------------------------------------------------------
if [ -n "$(git status --porcelain)" ]; then
  echo "ERRO: há alterações não commitadas. Salve ou descarte antes." >&2
  git status --short >&2
  exit 1
fi

REMOTO="$(git remote get-url origin 2>/dev/null || echo '')"
BRANCH="$(git branch --show-current)"
echo "Remoto: ${REMOTO:-(nenhum)}"
echo "Branch: $BRANCH"
echo

# ------------------------------------------------------------------
# 1. Backup. Antes de qualquer coisa, e num bundle que contém tudo.
# ------------------------------------------------------------------
BACKUP="${TMPDIR:-/tmp}/potala-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"
echo "Gravando backup completo em $BACKUP ..."
git bundle create "$BACKUP/antes-da-reescrita.bundle" --all
git ls-tree -r HEAD --format='%(objectname) %(path)' | sort > "$BACKUP/arvore-antes.txt"
git rev-parse HEAD > "$BACKUP/HEAD-antes.txt"
echo "Backup pronto."
echo

# ------------------------------------------------------------------
# 2. Quais blobs sair.
#
# Por IDENTIDADE, e não por tamanho ou por caminho.
#
# Por tamanho apagaria também o vídeo ATUAL de 25 MB, que está em uso. Por
# caminho apagaria todas as versões de `home-travessia.mp4`, inclusive a boa —
# o caminho é o mesmo, o que muda é o conteúdo.
#
# A regra certa é: sai todo blob grande que NÃO está na árvore do último
# commit. O que o projeto usa hoje está lá por definição, e sobrevive.
# ------------------------------------------------------------------
VIVOS="$BACKUP/blobs-vivos.txt"
MORTOS="$BACKUP/blobs-mortos.txt"
LIMITE=1000000   # 1 MB: abaixo disso não paga o custo de reescrever.

git ls-tree -r HEAD --format='%(objectname)' | sort -u > "$VIVOS"

git rev-list --objects --all \
  | git cat-file --batch-check='%(objecttype) %(objectsize) %(objectname) %(rest)' 2>/dev/null \
  | awk -v limite="$LIMITE" '$1=="blob" && $2>limite {print $2"\t"$3"\t"$4}' \
  | sort -rn \
  | awk -F'\t' -v vivos="$VIVOS" -v saida="$MORTOS" '
      BEGIN { while ((getline linha < vivos) > 0) vivo[linha] }
      !($2 in vivo) { print $2 > saida; printf "  %7.1f MB  %s\n", $1/1048576, $3; total += $1; n += 1 }
      END { printf "\n  == %.1f MB em %d blobs ==\n", total/1048576, n }
    '

if [ ! -s "$MORTOS" ]; then
  echo "Nada a remover. O histórico já está limpo."
  exit 0
fi

# A conferência que impede o desastre: nenhum blob vivo pode ter entrado na
# lista. Se entrou, a conta acima está errada e é melhor parar aqui.
if [ -n "$(comm -12 <(sort -u "$MORTOS") "$VIVOS")" ]; then
  echo "ERRO: a lista inclui arquivos em uso. Abortando." >&2
  exit 1
fi

echo
read -r -p "Reescrever o histórico removendo esses blobs? (digite 'sim') " RESPOSTA
[ "$RESPOSTA" = "sim" ] || { echo "Cancelado. Nada foi alterado."; exit 0; }
echo

# ------------------------------------------------------------------
# 3. A reescrita.
# ------------------------------------------------------------------
python3 -m git_filter_repo --force --strip-blobs-with-ids "$MORTOS"

# `git-filter-repo` remove o remoto de propósito, para evitar um push
# acidental por cima do que ainda não foi conferido. Devolvemos o endereço,
# mas o push continua sendo passo separado e manual.
if [ -n "$REMOTO" ]; then
  git remote add origin "$REMOTO" 2>/dev/null || git remote set-url origin "$REMOTO"
fi

# ------------------------------------------------------------------
# 4. Conferir que o PROJETO não mudou — só o histórico.
# ------------------------------------------------------------------
git ls-tree -r HEAD --format='%(objectname) %(path)' | sort > "$BACKUP/arvore-depois.txt"
if diff -q "$BACKUP/arvore-antes.txt" "$BACKUP/arvore-depois.txt" > /dev/null; then
  echo
  echo "OK: o conteúdo do último commit está idêntico ao de antes."
else
  echo
  echo "ATENÇÃO: a árvore do último commit MUDOU. Isso não devia acontecer." >&2
  diff "$BACKUP/arvore-antes.txt" "$BACKUP/arvore-depois.txt" | head -20 >&2
  echo "Restaure com: git fetch \"$BACKUP/antes-da-reescrita.bundle\" 'refs/*:refs/*' --force" >&2
  exit 1
fi

echo
echo "Tamanho do .git agora:"
du -sh .git
echo
echo "--------------------------------------------------------------"
echo "O histórico local foi reescrito. O GitHub ainda tem o antigo."
echo
echo "Para publicar (isto substitui o histórico remoto):"
echo "    git push --force origin $BRANCH"
echo
echo "Para voltar atrás, a qualquer momento antes ou depois do push:"
echo "    git fetch \"$BACKUP/antes-da-reescrita.bundle\" 'refs/*:refs/*' --force"
echo "    git reset --hard $(cat "$BACKUP/HEAD-antes.txt")"
echo
echo "Backup completo em: $BACKUP"
echo "--------------------------------------------------------------"
