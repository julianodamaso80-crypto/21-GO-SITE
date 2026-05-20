/**
 * CLI: gera GOOGLE_REFRESH_TOKEN via OAuth Authorization Code flow.
 *
 * Uso:
 *   npm run google:auth
 *   (ou: tsx src/scripts/google-auth.ts)
 *
 * O que faz:
 *   1. Le GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET do ambiente
 *   2. Sobe servidor HTTP local em http://localhost:9876/callback
 *   3. Imprime URL de autorizacao com scopes GSC + GA4 readonly
 *   4. Voce abre no navegador, autoriza com a conta Google que tem acesso
 *   5. Google redireciona pra http://localhost:9876/callback?code=...
 *   6. Script troca code por refresh_token e imprime no terminal
 *   7. Voce copia o refresh_token e cola em GOOGLE_REFRESH_TOKEN do .env / EasyPanel
 *
 * NAO grava o refresh_token em disco — voce copia do output.
 *
 * Pre-requisitos no Google Cloud Console:
 *   - Projeto com Search Console API + Analytics Data API habilitadas
 *   - OAuth 2.0 Client ID tipo "Web application"
 *   - Authorized redirect URI: http://localhost:9876/callback
 *
 * Porta padrao 9876; troca com --port=NNNN se ocupada.
 */
import http from 'http';
import { URL } from 'url';

const SCOPES = [
  'https://www.googleapis.com/auth/webmasters',           // GSC (Search Analytics + URL Inspection)
  'https://www.googleapis.com/auth/analytics.readonly',   // GA4 Data API
].join(' ');

function getArg(name: string, fallback: string): string {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.split('=')[1]! : fallback;
}

async function main(): Promise<void> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('ERRO: defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no ambiente antes de rodar.');
    console.error('Exemplo:');
    console.error('  GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com \\');
    console.error('  GOOGLE_CLIENT_SECRET=yyy \\');
    console.error('    npm run google:auth');
    process.exit(1);
  }

  const port = parseInt(getArg('port', '9876'), 10);
  const redirectUri = `http://localhost:${port}/callback`;

  // 1) URL de autorizacao
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('access_type', 'offline');           // pede refresh_token
  authUrl.searchParams.set('prompt', 'consent');                // forca novo refresh_token (se ja tem um, gera outro)
  authUrl.searchParams.set('include_granted_scopes', 'true');

  console.log('');
  console.log('=== Google OAuth — geracao de refresh_token ===');
  console.log('');
  console.log('1. Abra esta URL no navegador (com a conta Google que tem acesso ao GSC + GA4):');
  console.log('');
  console.log('   ' + authUrl.toString());
  console.log('');
  console.log('2. Autorize os scopes:');
  console.log('   - Search Console: read/write (webmasters)');
  console.log('   - Analytics: readonly');
  console.log('');
  console.log(`3. O Google vai redirecionar pra http://localhost:${port}/callback`);
  console.log('   (este script ja esta escutando)');
  console.log('');

  // 2) Servidor temporario aguardando callback
  const server = http.createServer(async (req, res) => {
    if (!req.url) return;
    const reqUrl = new URL(req.url, `http://localhost:${port}`);

    if (reqUrl.pathname !== '/callback') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Nao encontrado. Acesse /callback.');
      return;
    }

    const code = reqUrl.searchParams.get('code');
    const error = reqUrl.searchParams.get('error');

    if (error) {
      console.error('ERRO no consentimento:', error);
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Erro no consentimento: ${error}`);
      server.close();
      process.exit(1);
      return;
    }
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Sem code na query string.');
      return;
    }

    // 3) Troca code por refresh_token
    try {
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      const tokenJson = (await tokenRes.json()) as { refresh_token?: string; access_token?: string; expires_in?: number; scope?: string; error?: string };
      if (!tokenRes.ok || !tokenJson.refresh_token) {
        console.error('FALHA ao trocar code por token:', tokenJson);
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Falha: ${JSON.stringify(tokenJson)}`);
        server.close();
        process.exit(1);
        return;
      }

      console.log('');
      console.log('=== SUCESSO ===');
      console.log('');
      console.log('Copie este valor pro .env do projeto E pro EasyPanel (servico seo-worker):');
      console.log('');
      console.log('GOOGLE_REFRESH_TOKEN=' + tokenJson.refresh_token);
      console.log('');
      console.log('Scopes autorizados:', tokenJson.scope ?? '(nao retornado)');
      console.log('Access token expira em:', tokenJson.expires_in ?? '?', 'segundos (renova sozinho)');
      console.log('');

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <html><body style="font-family: sans-serif; padding: 40px;">
          <h1>OK — refresh_token gerado</h1>
          <p>Volte pro terminal e copie o valor de <code>GOOGLE_REFRESH_TOKEN</code>.</p>
          <p>Pode fechar esta aba.</p>
        </body></html>
      `);
      server.close();
      setTimeout(() => process.exit(0), 100);
    } catch (e) {
      console.error('Erro ao chamar token endpoint:', (e as Error).message);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Erro: ${(e as Error).message}`);
      server.close();
      process.exit(1);
    }
  });

  server.listen(port, () => {
    console.log(`Servidor escutando em http://localhost:${port} (aguardando /callback)`);
    console.log('');
  });

  server.on('error', (err) => {
    if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      console.error(`Porta ${port} ocupada. Use --port=NNNN pra trocar.`);
    } else {
      console.error('Erro no servidor:', err.message);
    }
    process.exit(1);
  });
}

main().catch((e) => {
  console.error('FATAL:', (e as Error).message);
  process.exit(99);
});
