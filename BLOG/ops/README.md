# ops/ — scripts que fazem a esteira chegar no ar

Os dois scripts aqui rodam por cron nos servidores. Estão versionados porque em
2026-08-03 eles existiam só no disco das máquinas — se o servidor caísse, ninguém
saberia reconstruir o caminho entre "artigo commitado" e "artigo publicado".

## Onde cada um roda

| Script | Servidor | Cron | O que faz |
|---|---|---|---|
| `blog-autodeploy-lightsail.sh` | Lightsail `56.126.48.234` (`/opt/blog-autodeploy.sh`) | `*/10 * * * *` | Detecta commit tocando `21go-website/`, reconstrói a imagem e recria o container `site21go` |
| `seo-watchdog.sh` | Droplet `167.71.31.77` (`/root/seo-watchdog.sh`) | `0 11 * * *` | Consulta `/producao` do worker e alerta se o blog parou |

## Quem serve o quê (foi o que mais confundiu)

- **`21go.site` e `21goconsultoraleticya.site` são servidos pelo Lightsail**, container
  `site21go` na `127.0.0.1:3100`, atrás do Cloudflare. O Lightsail só aceita conexão
  vinda do Cloudflare — testar direto do laptop dá timeout, o que faz parecer que ele
  está fora do ar.
- O droplet `167.71.31.77` tem uma cópia do site (`social-21go_site`) que responde 200
  se você forçar o `Host`, **mas não é a origem do tráfego público**. Reconstruir lá não
  muda nada para o visitante.
- O droplet roda o `seo-worker` (esteira SEO) e o Easypanel.

Antes desta correção, o Agente 09 tentava reconstruir o **droplet** via `spawn('ssh')`
de dentro do container — servidor errado, sem binário `ssh`, e com a chave privada do
laptop do dev hardcoded. O erro chegava pelo evento `error` do ChildProcess, escapava
do `.catch()` e derrubava o worker a cada publicação.

## Deploy manual (quando precisar)

```bash
# site (Lightsail)
ssh -i ~/.ssh/claude_21go ubuntu@56.126.48.234 'sudo /opt/blog-autodeploy.sh'
tail -f /var/log/blog-autodeploy.log     # no servidor

# worker (droplet)
ssh -i ~/.ssh/claude_21go root@167.71.31.77 \
  'cd /opt/seo-worker/code && git fetch origin master -q && git reset --hard origin/master -q \
   && cd BLOG/seo-worker && docker build -t seo-worker:latest . \
   && docker service update --force --image seo-worker:latest seo-worker'
```

## Saber se a esteira está viva

```bash
ssh -i ~/.ssh/claude_21go root@167.71.31.77 \
  'C=$(docker ps --filter name=seo-worker --format "{{.Names}}" | head -1); \
   docker exec $C node -e "fetch(\"http://127.0.0.1:8080/producao\").then(async r=>console.log(r.status, await r.text()))"'
```

`/healthz` responde 200 mesmo com a esteira parada há um mês — foi exatamente o que
aconteceu. Use `/producao`: ele devolve **503** quando passam 48h sem artigo novo nem
update aplicado.
