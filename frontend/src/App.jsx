import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom';

const API = 'http://localhost:5000';

async function api(path, { method = 'GET', body, token } = {}) {
  try {
    const res = await fetch(API + path, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Something went wrong');
    return json.data;
  } catch (e) {
    if (e instanceof TypeError) throw new Error('Unable to connect to server');
    throw e;
  }
}

const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);

function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));

  const login = (t, u) => {
    localStorage.setItem('token', t);
    localStorage.setItem('user', JSON.stringify(u));
    setToken(t);
    setUser(u);
  };
  const logout = () => {
    localStorage.clear();
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

function Nav() {
  const { user, logout } = useAuth();
  return (
    <nav className="nav">
      <Link to="/" className="brand">ShortLink</Link>
      <div className="nav-links">
        <Link to="/about">About</Link>
        {user ? (
          <>
            <Link to="/dashboard">My Links</Link>
            <button className="btn btn-light" onClick={logout}>Logout</button>
          </>
        ) : (
          <>
            <Link to="/login">Login</Link>
            <Link to="/register" className="btn">Sign up</Link>
          </>
        )}
      </div>
    </nav>
  );
}

function Home() {
  const { user } = useAuth();
  return (
    <div className="container hero">
      <h1>Turn long links into short ones</h1>
      <p>
        ShortLink helps students, creators and small businesses share clean links
        and see how many people click them.
      </p>
      <Link to={user ? '/dashboard' : '/register'} className="btn btn-big">
        {user ? 'Go to my links' : 'Get started free'}
      </Link>
      <div className="steps">
        <div className="card"><b>1. Sign up</b><p>Create a free account.</p></div>
        <div className="card"><b>2. Paste a link</b><p>We give you a short one.</p></div>
        <div className="card"><b>3. Track clicks</b><p>See how many people used it.</p></div>
      </div>
    </div>
  );
}

function About() {
  return (
    <div className="container">
      <div className="card">
        <h2>About ShortLink</h2>
        <p>
          Long links are hard to share and easy to break. ShortLink makes them short,
          lets you edit or delete them anytime, and counts every click.
        </p>
        <p>Who is it for? Anyone who shares links: students, creators, small businesses.</p>
      </div>
    </div>
  );
}

function AuthPage({ mode }) {
  const isRegister = mode === 'register';
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const change = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegister) await api('/api/auth/register', { method: 'POST', body: form });
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: { email: form.email, password: form.password },
      });
      login(data.token, data.user);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container small">
      <form className="card" onSubmit={submit}>
        <h2>{isRegister ? 'Create account' : 'Welcome back'}</h2>
        {error && <div className="error">{error}</div>}
        {isRegister && (
          <input className="input" name="name" placeholder="Your name" value={form.name} onChange={change} />
        )}
        <input className="input" name="email" type="email" placeholder="Email" value={form.email} onChange={change} />
        <input className="input" name="password" type="password" placeholder="Password (min 6 characters)" value={form.password} onChange={change} />
        <button className="btn btn-big" disabled={loading}>
          {loading ? 'Please wait...' : isRegister ? 'Sign up' : 'Login'}
        </button>
        <p className="muted">
          {isRegister ? (
            <>Already have an account? <Link to="/login">Login</Link></>
          ) : (
            <>New here? <Link to="/register">Create an account</Link></>
          )}
        </p>
      </form>
    </div>
  );
}

function Dashboard() {
  const { token, user } = useAuth();
  const [links, setLinks] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editUrl, setEditUrl] = useState('');
  const [copied, setCopied] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api(
        `/api/links?search=${encodeURIComponent(search)}&page=${page}&limit=5`,
        { token }
      );
      setLinks(data.links);
      setTotalPages(data.totalPages || 1);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [search, page, token]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      await api('/api/links', { method: 'POST', body: { originalUrl: newUrl }, token });
      setNewUrl('');
      setPage(1);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const saveEdit = async (id) => {
    setError('');
    try {
      await api(`/api/links/${id}`, { method: 'PUT', body: { originalUrl: editUrl }, token });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this link?')) return;
    setError('');
    try {
      await api(`/api/links/${id}`, { method: 'DELETE', token });
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const copy = (code) => {
    navigator.clipboard.writeText(`${API}/${code}`);
    setCopied(code);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="container">
      <h2>Hi {user?.name}, here are your links</h2>

      <form className="card row" onSubmit={create}>
        <input
          className="input grow"
          placeholder="Paste a long link, e.g. https://example.com/very/long/page"
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
        />
        <button className="btn" disabled={creating}>
          {creating ? 'Shortening...' : 'Shorten'}
        </button>
      </form>

      {error && <div className="error">{error}</div>}

      <input
        className="input"
        placeholder="Search your links..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
      />

      {loading ? (
        <p className="muted">Loading...</p>
      ) : links.length === 0 ? (
        <p className="muted">No links yet. Paste one above to get started.</p>
      ) : (
        links.map((l) => (
          <div className="card link" key={l.id}>
            <div className="grow">
              <a href={`${API}/${l.code}`} target="_blank" rel="noreferrer" className="short">
                {API}/{l.code}
              </a>
              {editingId === l.id ? (
                <div className="row">
                  <input className="input grow" value={editUrl} onChange={(e) => setEditUrl(e.target.value)} />
                  <button className="btn" onClick={() => saveEdit(l.id)}>Save</button>
                  <button className="btn btn-light" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              ) : (
                <p className="original">{l.originalUrl}</p>
              )}
              <small className="muted">{l.clicks} clicks</small>
            </div>
            <div className="actions">
              <button className="btn btn-light" onClick={() => copy(l.code)}>
                {copied === l.code ? 'Copied!' : 'Copy'}
              </button>
              <button
                className="btn btn-light"
                onClick={() => {
                  setEditingId(l.id);
                  setEditUrl(l.originalUrl);
                }}
              >
                Edit
              </button>
              <button className="btn btn-danger" onClick={() => remove(l.id)}>Delete</button>
            </div>
          </div>
        ))
      )}

      <div className="row center">
        <button className="btn btn-light" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span className="muted">Page {page} of {totalPages}</span>
        <button className="btn btn-light" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </div>
  );
}

function Protected({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Nav />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/login" element={<AuthPage mode="login" />} />
          <Route path="/register" element={<AuthPage mode="register" />} />
          <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
          <Route path="*" element={<div className="container"><h2>Page not found</h2></div>} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}