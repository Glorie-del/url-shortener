require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const app = express();
app.use(cors());
app.use(express.json());

const db = new DatabaseSync('data.db');
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  original_url TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  clicks INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

const send = (res, status, message, data = null) =>
  res.status(status).json({ success: status < 400, message, data });

const isValidUrl = (value) => {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

const makeCode = () =>
  crypto.randomBytes(5).toString('base64url').replace(/[-_]/g, 'x').slice(0, 6);

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return send(res, 401, 'Please log in first');
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    send(res, 401, 'Session expired, please log in again');
  }
}

// ---------- AUTH ----------
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password)
    return send(res, 400, 'Name, email and password are required');
  if (!/^\S+@\S+\.\S+$/.test(email))
    return send(res, 400, 'Please enter a valid email');
  if (password.length < 6)
    return send(res, 400, 'Password must be at least 6 characters');

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (exists) return send(res, 409, 'Email already registered');

  const hash = await bcrypt.hash(password, 10);
  const result = db
    .prepare('INSERT INTO users (name, email, password) VALUES (?, ?, ?)')
    .run(name, email.toLowerCase(), hash);
  send(res, 201, 'Account created successfully', {
    id: Number(result.lastInsertRowid),
    name,
    email: email.toLowerCase(),
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return send(res, 400, 'Email and password are required');

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user || !(await bcrypt.compare(password, user.password)))
    return send(res, 401, 'Invalid email or password');

  const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
  send(res, 200, 'Login successful', {
    token,
    user: { id: user.id, name: user.name, email: user.email },
  });
});

// ---------- LINKS (CRUD) ----------
app.post('/api/links', auth, (req, res) => {
  const { originalUrl } = req.body || {};
  if (!originalUrl || !isValidUrl(originalUrl))
    return send(res, 400, 'Please enter a valid URL starting with http:// or https://');

  const code = makeCode();
  const result = db
    .prepare('INSERT INTO links (user_id, original_url, code) VALUES (?, ?, ?)')
    .run(req.user.id, originalUrl, code);
  send(res, 201, 'Short link created', {
    id: Number(result.lastInsertRowid),
    originalUrl,
    code,
    clicks: 0,
  });
});

app.get('/api/links', auth, (req, res) => {
  const search = `%${req.query.search || ''}%`;
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);
  const offset = (page - 1) * limit;

  const total = db
    .prepare('SELECT COUNT(*) AS n FROM links WHERE user_id = ? AND original_url LIKE ?')
    .get(req.user.id, search).n;
  const rows = db
    .prepare(
      'SELECT id, original_url AS originalUrl, code, clicks, created_at AS createdAt FROM links WHERE user_id = ? AND original_url LIKE ? ORDER BY id DESC LIMIT ? OFFSET ?'
    )
    .all(req.user.id, search, limit, offset);

  send(res, 200, 'Links fetched', {
    links: rows,
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

app.put('/api/links/:id', auth, (req, res) => {
  const { originalUrl } = req.body || {};
  if (!originalUrl || !isValidUrl(originalUrl))
    return send(res, 400, 'Please enter a valid URL starting with http:// or https://');

  const result = db
    .prepare('UPDATE links SET original_url = ? WHERE id = ? AND user_id = ?')
    .run(originalUrl, req.params.id, req.user.id);
  if (result.changes === 0) return send(res, 404, 'Link not found');
  send(res, 200, 'Link updated', { id: Number(req.params.id), originalUrl });
});

app.delete('/api/links/:id', auth, (req, res) => {
  const result = db
    .prepare('DELETE FROM links WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (result.changes === 0) return send(res, 404, 'Link not found');
  send(res, 200, 'Link deleted');
});

// ---------- REDIRECT ----------
app.get('/:code', (req, res) => {
  const link = db.prepare('SELECT * FROM links WHERE code = ?').get(req.params.code);
  if (!link) return send(res, 404, 'Short link not found');
  db.prepare('UPDATE links SET clicks = clicks + 1 WHERE id = ?').run(link.id);
  res.redirect(link.original_url);
});

// ---------- ERRORS ----------
app.use((err, req, res, next) => {
  console.error(err);
  send(res, 500, 'Something went wrong on the server');
});

const PORT = process.env.PORT || 5000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
module.exports = app;