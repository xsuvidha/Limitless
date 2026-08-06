/* Local dev: serves ./public and mounts the same handler at /api/symphony.
   Run:  npm run dev     →  http://localhost:8787                     */
import express from 'express';
import handler from './api/symphony.js';

const app = express();
app.use(express.json());
app.post('/api/symphony', handler);
app.use(express.static('public'));

const port = process.env.PORT || 8787;
app.listen(port, () => console.log(`◈ Symphony on http://localhost:${port}`));
