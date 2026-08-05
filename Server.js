// server.js
const path = require('path');
const express = require('express');
const app = express();

// (Optional) serve static files from ./public
app.use(express.static(path.join(__dirname, 'public')));

// Example route (remove if not needed)
app.get('/api/health', (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
// IMPORTANT: bind to 0.0.0.0 so other devices (incl. ZeroTier) can reach it
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});
