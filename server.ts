import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to parse JSON
  app.use(express.json());

  // API Routes
  const router = express.Router();

  router.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  router.get('/auth/discord/url', (req, res) => {
    console.log('Request to /api/auth/discord/url');
    const clientId = process.env.DISCORD_CLIENT_ID;
    const appUrl = process.env.VITE_APP_URL || `https://${req.get('host')}`;
    const redirectUri = `${appUrl}/auth/callback`;

    if (!clientId) {
      console.error('DISCORD_CLIENT_ID missing');
      return res.status(500).json({ 
        error: 'DISCORD_CLIENT_ID not configured',
        message: 'Please set DISCORD_CLIENT_ID in the Settings menu.'
      });
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'identify email',
    });

    const authUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`;
    res.json({ url: authUrl });
  });

  app.use('/api', router);

  app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
    const { code } = req.query;
    console.log('Discord callback received', { code: code ? 'present' : 'missing' });
    if (!code) {
      return res.status(400).send('No code provided');
    }

    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    const appUrl = process.env.VITE_APP_URL || `https://${req.get('host')}`;
    const redirectUri = `${appUrl}/auth/callback`;

    try {
      if (!clientId || !clientSecret) {
        throw new Error('Discord credentials missing');
      }

      // Exchange code for token
      const tokenResponse = await axios.post(
        'https://discord.com/api/oauth2/token',
        new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code: code as string,
          redirect_uri: redirectUri,
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const { access_token } = tokenResponse.data;

      // Fetch user info
      const userResponse = await axios.get('https://discord.com/api/users/@me', {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });

      const discordUser = userResponse.data;

      // Send success message and close popup
      res.send(`
        <html>
          <body style="background: #000; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif;">
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'DISCORD_AUTH_SUCCESS', 
                  data: ${JSON.stringify(discordUser)} 
                }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Conexão realizada com sucesso! Fechando janela...</p>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error('Discord Auth Error:', error.response?.data || error.message);
      res.status(500).send(`
        <html>
          <body style="background: #000; color: #ff4444; display: flex; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif;">
            <div>
              <h2>Erro na Autenticação</h2>
              <p>${error.response?.data?.error_description || 'Ocorreu um erro ao conectar com o Discord.'}</p>
              <button onclick="window.close()">Fechar Janela</button>
            </div>
          </body>
        </html>
      `);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
