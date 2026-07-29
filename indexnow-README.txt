IndexNow key file location
==========================

O protocolo IndexNow exige que o site sirva um arquivo .txt cujo NOME e o
valor da chave (UUID v4) e cujo CONTEUDO tambem e a chave.

Exemplo: se a key for 7e3b2b9f-9c5e-4d8a-9d3c-c5a3f8a8b1d2, o site deve servir:
    https://21go.site/7e3b2b9f-9c5e-4d8a-9d3c-c5a3f8a8b1d2.txt
com conteudo exatamente:
    7e3b2b9f-9c5e-4d8a-9d3c-c5a3f8a8b1d2

Como configurar:
1. Gerar UUID v4 (ex: `node -e "console.log(crypto.randomUUID())"`)
2. Criar arquivo `public/{KEY}.txt` com a propria KEY como conteudo
3. Configurar no EasyPanel (seo-worker):
     INDEXNOW_KEY={KEY}
     INDEXNOW_KEY_LOCATION=https://21go.site/{KEY}.txt
4. Validar com: `curl -fsS https://21go.site/{KEY}.txt`

Depois de configurado, o Agente 12 (BingIndexNow) submete URLs novas via
POST https://api.indexnow.org/indexnow.

NAO commitar a key real aqui — gere no momento de configurar EasyPanel.
Este arquivo e somente documental.
