#!/bin/bash
# allowlist-power-watch — vigia a lista de veiculos que a 21Go faz.
#
# Por que existe: em 03/08/2026 uma cliente recebeu orcamento de um Fiat Linea Essence Dualogic
# que o PowerCRM nao cota (so aparece Monitoramento la). A allowlist do site
# (21go-website/src/data/vehicle-allowlist.ts) e uma extracao das tabelas de preco do painel —
# e extracao congelada envelhece: vinculo novo, carro novo, tabela editada.
#
# Roda 1x por semana. NAO altera producao sozinho: reextrai, compara com o que esta no repo e
# avisa no WhatsApp interno quando mudou, deixando o arquivo pronto em /opt/allowlist-out/.
# Quem aprova e commita e uma pessoa (mesma politica do deploy do site).
#
# Instalar: sudo crontab -e -> 30 6 * * 0 /opt/allowlist-power-watch.sh >/dev/null 2>&1
#
# Credenciais: lidas do container do CRM, que ja tem POWER_LOGIN_*. De proposito — nao criar
# uma segunda copia da senha do painel no disco.

set -u
SRC=/opt/allowlist-src
OUT=/opt/allowlist-out
LOG=/var/log/allowlist-power.log
LOCK=/tmp/allowlist-power.lock
REPO=https://github.com/julianodamaso80-crypto/21-GO-SITE.git
CRM_CONTAINER=crm
IMG_FALLBACK=node:22-alpine
EVO=https://evolution.sinistro21go.site
DEST=5521992208062

exec 9>"$LOCK" || exit 0
flock -n 9 || exit 0

log(){ echo "$(date '+%F %T') $*" >> "$LOG"; }

alerta(){
  log "ALERTA: $1"
  local INST KEY
  INST=$(grep -E "^CUR_INST=" /root/site-whatsapp-monitor.sh 2>/dev/null | cut -d= -f2)
  KEY=$(grep -E "^CUR_KEY=" /root/site-whatsapp-monitor.sh 2>/dev/null | cut -d= -f2)
  [ -z "${INST:-}" ] && return 0
  curl -s -m 20 -X POST "$EVO/message/sendText/$INST" \
    -H "apikey: $KEY" -H "Content-Type: application/json" \
    -d "{\"number\":\"$DEST\",\"text\":\"[allowlist 21Go] $1\"}" >/dev/null 2>&1
}

# 1) Codigo fresco do repo. Clone proprio: o /opt/site21go-src e do autodeploy e leva
#    reset --hard a cada 10 min.
if [ ! -d "$SRC/.git" ]; then
  git clone --depth 1 "$REPO" "$SRC" >>"$LOG" 2>&1 || { alerta "clone do repo falhou"; exit 1; }
else
  git -C "$SRC" fetch origin master -q >>"$LOG" 2>&1 && git -C "$SRC" reset --hard origin/master -q >>"$LOG" 2>&1 \
    || { alerta "git pull da allowlist falhou"; exit 1; }
fi

# 2) Credenciais do painel, direto do container do CRM (nunca escritas em log).
ENVFILE=$(mktemp /tmp/allowlist-env.XXXXXX)
chmod 600 "$ENVFILE"
trap 'rm -f "$ENVFILE"' EXIT
docker inspect "$CRM_CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
  | grep -E '^POWER_(LOGIN_USERNAME|LOGIN_PASSWORD|COMPANY_ID|APP_BASE_URL)=' > "$ENVFILE"
if ! grep -q '^POWER_LOGIN_PASSWORD=' "$ENVFILE"; then
  alerta "nao achei as credenciais do painel no container $CRM_CONTAINER — allowlist nao foi conferida"
  exit 1
fi

IMG=$(docker images --format '{{.Repository}}:{{.Tag}}' | grep -m1 'social-21go/site' || echo "$IMG_FALLBACK")

rodar(){  # $1 = argumentos extras do extrator
  docker run --rm --env-file "$ENVFILE" \
    -v "$SRC":/work -w /work/21go-website --entrypoint node \
    "$IMG" scripts/extrair-allowlist-power.mjs $1 2>&1
}

SAIDA=$(rodar --check); CODE=$?

if [ "$CODE" -eq 0 ]; then
  log "sem mudanca na allowlist"
  exit 0
fi

if [ "$CODE" -ge 2 ]; then
  log "$SAIDA"
  alerta "extracao da allowlist FALHOU (login do painel ou tabela vazia). Site segue com a lista do repo."
  exit 1
fi

# 3) Mudou: gera o arquivo novo e guarda pra revisao. Producao nao muda sem gente.
mkdir -p "$OUT"
rodar "" >>"$LOG" 2>&1
CARIMBO=$(date '+%Y%m%d')
cp "$SRC/21go-website/src/data/vehicle-allowlist.ts" "$OUT/vehicle-allowlist-$CARIMBO.ts" 2>/dev/null
DIFF=$(echo "$SAIDA" | grep -m1 '^MUDOU:')
log "$DIFF — arquivo em $OUT/vehicle-allowlist-$CARIMBO.ts"
alerta "tabela de precos do Power mudou. $DIFF. Arquivo novo em $OUT/vehicle-allowlist-$CARIMBO.ts — precisa commit pra entrar no site."
