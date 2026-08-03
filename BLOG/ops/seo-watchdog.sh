#!/bin/bash
# seo-watchdog — vigia a ESTEIRA, nao o container.
#
# Existe porque a esteira ficou 30 dias sem publicar nada com o container healthy,
# os crons disparando e todos os jobs retornando "job ok". O alerta interno do worker
# nao cobre o caso do proprio worker estar morto — este cobre, de fora.
#
# Roda 1x/dia as 11h (depois do cron de escrita das 09h).
# Instalar: crontab -e -> 0 11 * * * /root/seo-watchdog.sh >/dev/null 2>&1

set -u
LOG=/root/seo-watchdog.log
EVO=https://evolution.sinistro21go.site
DEST=5521992208062

log(){ echo "$(date '+%F %T') $*" >> "$LOG"; }

alerta(){
  log "ALERTA: $1"
  local INST KEY
  INST=$(grep -E "^CUR_INST=" /root/site-whatsapp-monitor.sh 2>/dev/null | cut -d= -f2)
  KEY=$(grep -E "^CUR_KEY=" /root/site-whatsapp-monitor.sh 2>/dev/null | cut -d= -f2)
  [ -z "${INST:-}" ] && return 0
  # best-effort: os chips caem sozinhos, entao o log acima e a fonte confiavel
  curl -s -m 20 -X POST "$EVO/message/sendText/$INST" \
    -H "apikey: $KEY" -H "Content-Type: application/json" \
    -d "{\"number\":\"$DEST\",\"text\":\"[esteira SEO 21Go] $1\"}" >/dev/null 2>&1
}

C=$(docker ps --filter name=seo-worker --format "{{.Names}}" | head -1)

if [ -z "$C" ]; then
  alerta "worker fora do ar (nenhum container seo-worker rodando em 167.71.31.77)."
  exit 1
fi

RESP=$(docker exec "$C" node -e '
fetch("http://127.0.0.1:8080/producao")
  .then(async r => { const b = await r.text(); console.log(r.status + " " + b); })
  .catch(e => { console.log("000 " + e.message); });
' 2>/dev/null)

CODE=$(echo "$RESP" | awk "{print \$1}")
BODY=$(echo "$RESP" | cut -d" " -f2-)

if [ "$CODE" = "200" ]; then
  log "ok | $BODY"
  exit 0
fi

HORAS=$(echo "$BODY" | grep -o '"horas_sem_produzir":[0-9.]*' | cut -d: -f2)
BRIEF=$(echo "$BODY" | grep -o '"briefings_disponiveis":[0-9]*' | cut -d: -f2)
alerta "blog parado ha ${HORAS:-?}h. Briefings em estoque: ${BRIEF:-?}. Checar logs do seo-worker."
log "503 | $BODY"
