const express = require('express');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'appuser',
  password: process.env.DB_PASSWORD || 'apppass',
  database: process.env.DB_NAME || 'appdb',
});

// Health check endpoints used by Kubernetes probes
app.get('/health/live', (req, res) => res.status(200).json({ status: 'ok' }));

app.get('/health/ready', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ status: 'ready' });
  } catch (err) {
    res.status(503).json({ status: 'not ready', error: err.message });
  }
});

app.get('/api/items', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, created_at FROM items ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/items', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const result = await pool.query(
      'INSERT INTO items (name) VALUES ($1) RETURNING id, name, created_at',
      [name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`API listening on port ${PORT}`));

module.exports = app;
