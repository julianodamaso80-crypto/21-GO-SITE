#!/bin/bash
# blog-autodeploy — reconstroi o site quando a esteira SEO commita conteudo novo.
#
# Por que existe: o Agente 09 commita o MDX na master, mas nada reconstruia o site.
# Os posts ficavam no GitHub e nunca no ar. A tentativa anterior (spawn ssh de dentro
# do container do worker) derrubava o worker a cada publicacao.
#
# Roda de 10 em 10 min. Faz build APENAS quando 21go-website/ mudou de verdade.
# Instalar: crontab -e -> */10 * * * * /root/blog-autodeploy.sh >/dev/null 2>&1

set -u
DIR=/opt/site21go-src
LOG=/var/log/blog-autodeploy.log
LOCK=/tmp/blog-autodeploy.lock
IMG=easypanel/social-21go/site:latest
CONTAINER=site21go

exec 9>"$LOCK" || exit 0
flock -n 9 || exit 0   # build anterior ainda rodando

log(){ echo "$(date '+%F %T') $*" >> "$LOG"; }

sudo -n true 2>/dev/null; cd "$DIR" 2>/dev/null || { log "ERRO: $DIR nao existe"; exit 1; }

ANTES=$(git rev-parse HEAD 2>/dev/null)
git fetch origin master -q 2>>"$LOG" || { log "ERRO: git fetch falhou"; exit 1; }
DEPOIS=$(git rev-parse origin/master 2>/dev/null)

[ "$ANTES" = "$DEPOIS" ] && exit 0

# So reconstroi se o que mudou toca o site (ignora commits do worker, docs, etc)
MUDOU=$(git diff --name-only "$ANTES" "$DEPOIS" -- 21go-website/ | head -1)
if [ -z "$MUDOU" ]; then
  git reset --hard origin/master -q
  log "commits novos sem impacto no site — so atualizou o codigo ($(echo "$DEPOIS" | cut -c1-7))"
  exit 0
fi

N=$(git diff --name-only "$ANTES" "$DEPOIS" -- 21go-website/content/blog/ | wc -l)
log "mudanca detectada ($ANTES -> $(echo "$DEPOIS" | cut -c1-7)) | arquivos de blog: $N — iniciando build"

git reset --hard origin/master -q || { log "ERRO: reset falhou"; exit 1; }

cd "$DIR/21go-website" || { log "ERRO: 21go-website nao existe"; exit 1; }
if ! docker buildx build -t "$IMG" --load . >> "$LOG" 2>&1; then
  log "ERRO: build falhou — site segue no ar com a imagem anterior"
  exit 1
fi

docker stop "$CONTAINER" >/dev/null 2>&1; docker rm "$CONTAINER" >/dev/null 2>&1; docker run -d --name "$CONTAINER" --restart unless-stopped -p 127.0.0.1:3100:3000 --env-file /opt/site21go.env "$IMG" >> "$LOG" 2>&1

# Confere que o site voltou (nunca deixar cair sem avisar)
sleep 45
CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3100/ --max-time 20)
log "deploy concluido | HTTP=$CODE | commit=$(echo "$DEPOIS" | cut -c1-7)"

if [ "$CODE" != "200" ] && [ "$CODE" != "301" ] && [ "$CODE" != "308" ]; then
  log "ALERTA: site respondeu $CODE apos deploy"
fi
