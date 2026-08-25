import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Activity, ArrowUpRight, Check, ChevronLeft, Copy, ExternalLink, LayoutDashboard, Lock, LogOut, MoreHorizontal, Pencil, Plus, Search, Settings, ShieldCheck, Sparkles, Trash2, Upload, UserRound, X } from 'lucide-react';
import logoUrl from './assets/pageflow-logo.png';
import type { ExtraButton, LandingPage, PageDraft } from './types';
import { ApiError, apiRequest, clearToken, getToken, setToken, siteUrl, trackEvent } from './api';

type AnalyticsSummary = {
  totals: { page_view: number; cta1_click: number; cta2_click: number };
  byPage: Record<string, { page_view: number; cta1_click: number; cta2_click: number }>;
};

function PageFlowLogo({ compact = false, showTagline = false }: { compact?: boolean; showTagline?: boolean }) {
  return (
    <div className={compact ? 'pageflow-brand compact' : 'pageflow-brand'}>
      <img src={logoUrl} className="pageflow-mark" alt="PageFlow" />
      {!compact && showTagline && (
        <div className="pageflow-lockup">
          <div className="pageflow-tagline">Create. Customize. Share.</div>
        </div>
      )}
    </div>
  );
}

const blank: PageDraft = { creator_name: '', slug: '', profile_image_url: '', title: '', heading: '', description: '', button1_text: '', button1_url: '', button2_text: '', button2_url: '', extra_buttons: [], status: 'active' };

const newButtonId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `btn-${Date.now()}-${Math.random().toString(16).slice(2)}`);

/** Instagram-style blue verified badge: scalloped starburst with a white check. */
const VERIFIED_POINTS = (() => {
  const spikes = 12;
  const outer = 19;
  const inner = 15.6;
  const points: string[] = [];
  for (let i = 0; i < spikes * 2; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / spikes) * i - Math.PI / 2;
    points.push(`${(20 + r * Math.cos(a)).toFixed(2)},${(20 + r * Math.sin(a)).toFixed(2)}`);
  }
  return points.join(' ');
})();

function VerifiedBadge({ size = 26 }: { size?: number }) {
  return (
    <span className="verified-badge" style={{ width: size, height: size }}>
      <svg viewBox="0 0 40 40" width={size} height={size} role="img" aria-label="Verified" focusable="false">
        <title>Verified</title>
        <polygon
          points={VERIFIED_POINTS}
          fill="url(#verifiedBlue)"
          stroke="url(#verifiedBlue)"
          strokeWidth="2.6"
          strokeLinejoin="round"
        />
        <path
          d="M13.6 20.4l4.3 4.2 8.4-8.6"
          fill="none"
          stroke="#fff"
          strokeWidth="3.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="verifiedBlue" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#25a3f5" />
            <stop offset="100%" stopColor="#0b74d9" />
          </linearGradient>
        </defs>
      </svg>
    </span>
  );
}

function usePages() {
  const [pages, setPages] = useState<LandingPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setPages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await apiRequest<LandingPage[]>('/pages');
      setPages(data);
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load pages.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { pages, setPages, loading, loadError, refresh };
}

type Store = ReturnType<typeof usePages>;

function App() {
  const store = usePages();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<AdminShell store={store} />} />
      <Route path="/create" element={<AdminShell store={store} />} />
      <Route path="/edit/:id" element={<AdminShell store={store} />} />
      <Route path="/settings" element={<AdminShell store={store} />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/:slug" element={<PublicPage />} />
      <Route path="*" element={<PublicMessage title="Page not found" text="This creator page may have moved or the link may be incomplete." />} />
    </Routes>
  );
}

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || password.length < 6) {
      return setError('Enter your email and password to continue.');
    }

    setBusy(true);
    try {
      const response = await apiRequest<{ token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });

      setToken(response.token);
      navigate('/dashboard');
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <div className="brand-hero">
        <PageFlowLogo showTagline />
      </div>
      <div className="login-card">
        <div className="brand-row auth-brand-row">
          <PageFlowLogo compact />
        </div>

        <div className="auth-header">
          <h2>Welcome back</h2>
          <p className="muted">Sign in with your PageFlow admin account.</p>
        </div>

        {error && <div className="alert error">{error}</div>}

        <form onSubmit={submit} className="auth-form">
          <label>
            Email
            <input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" />
          </label>
          <label>
            Password
            <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" />
          </label>

          <button type="submit" className="button primary full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
            <ArrowUpRight size={17} />
          </button>
        </form>

        <p className="auth-footer">
          Accounts are created by your workspace administrator. Public sign-up is disabled.
        </p>

        <p className="fine-print">
          <Lock size={14} /> Protected by secure login policies.
        </p>
      </div>
    </div>
  );
}

function AdminShell({ store }: { store: Store }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [account, setAccount] = useState<{ email: string; role: string } | null>(null);
  const [authState, setAuthState] = useState<'checking' | 'ok' | 'denied'>(getToken() ? 'checking' : 'denied');

  useEffect(() => {
    if (!getToken()) return setAuthState('denied');
    apiRequest<{ user: { email: string; role: string } }>('/auth/me')
      .then(({ user }) => {
        setAccount(user);
        setAuthState('ok');
      })
      .catch(() => {
        clearToken();
        setAuthState('denied');
      });
  }, []);

  if (authState === 'denied') return <Navigate to="/login" replace />;

  const editing = location.pathname.startsWith('/edit/');
  const creating = location.pathname === '/create';
  const active = location.pathname.includes('settings') ? 'settings' : (editing || creating ? 'pages' : 'dashboard');

  const signOut = () => {
    clearToken();
    navigate('/login');
  };

  const renderMain = () => {
    if (authState === 'checking') return <div className="empty-state">Loading workspace…</div>;
    if (location.pathname === '/settings') return <SettingsPage email={account?.email || ''} />;
    if (creating || editing) return <Editor store={store} />;
    return <Dashboard store={store} />;
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-row brand-side">
          <PageFlowLogo compact />
        </div>
        <div className="side-label">Workspace</div>
        <nav>
          <Link className={active === 'dashboard' ? 'nav-link active' : 'nav-link'} to="/dashboard"><LayoutDashboard size={18} /> Overview</Link>
          <Link className={active === 'pages' ? 'nav-link active' : 'nav-link'} to="/dashboard"><Sparkles size={18} /> Landing pages</Link>
          <Link className={active === 'settings' ? 'nav-link active' : 'nav-link'} to="/settings"><Settings size={18} /> Settings</Link>
        </nav>
        <div className="side-bottom">
          <div className="admin-chip">
            <div className="avatar">{(account?.email || 'AD').slice(0, 2).toUpperCase()}</div>
            <div><strong>Admin workspace</strong><span>{account?.email || '—'}</span></div>
          </div>
          <button className="nav-link logout" onClick={signOut}><LogOut size={18} /> Log out</button>
        </div>
      </aside>
      <main className="main-content">{renderMain()}</main>
    </div>
  );
}

function Dashboard({ store }: { store: Store }) {
  const { pages, setPages, loading, loadError } = store;
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [toast, setToast] = useState('');
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadAnalytics = async () => {
      try {
        const data = await apiRequest<AnalyticsSummary>('/analytics/summary');
        if (!cancelled) {
          setAnalytics(data);
        }
      } catch {
        if (!cancelled) {
          setAnalytics(null);
        }
      }
    };

    void loadAnalytics();

    const interval = window.setInterval(() => {
      void loadAnalytics();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const filtered = useMemo(
    () =>
      pages
        .filter(p => statusFilter === 'all' || p.status === statusFilter)
        .filter(p => `${p.creator_name} ${p.slug} ${p.title}`.toLowerCase().includes(query.toLowerCase())),
    [pages, query, statusFilter]
  );

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(''), 2200);
  };

  const copy = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(`${siteUrl}/${slug}`);
      showToast('Public link copied');
    } catch {
      showToast('Copy failed. Copy the link manually.');
    }
  };

  const toggle = async (id: string) => {
    const target = pages.find(page => page.id === id);
    if (!target) return;

    const nextStatus = target.status === 'active' ? 'inactive' : 'active';
    setPages(current => current.map(page => (page.id === id ? { ...page, status: nextStatus } : page)));

    try {
      const updated = await apiRequest<LandingPage>(`/pages/${id}`, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) });
      setPages(current => current.map(page => (page.id === id ? updated : page)));
      showToast(nextStatus === 'active' ? 'Page activated.' : 'Page deactivated.');
    } catch (error) {
      setPages(current => current.map(page => (page.id === id ? target : page)));
      showToast(error instanceof Error ? error.message : 'Could not update status.');
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this landing page?')) return;

    const before = pages;
    setPages(current => current.filter(page => page.id !== id));

    try {
      await apiRequest<void>(`/pages/${id}`, { method: 'DELETE' });
      showToast('Page deleted.');
    } catch (error) {
      setPages(before);
      showToast(error instanceof Error ? error.message : 'Could not delete page.');
    }
  };

  return (
    <>
      <Topbar
        title="Overview"
        subtitle="Keep your creator pages fresh and ready to share."
        action={<Link className="button primary" to="/create"><Plus size={18} /> Create landing page</Link>}
      />

      <section className="stats-grid">
        <Stat label="Total pages" value={pages.length} hint="Across your workspace" icon={<LayoutDashboard />} />
        <Stat label="Active pages" value={pages.filter(p => p.status === 'active').length} hint="Ready to be shared" icon={<Check />} accent />
        <Stat label="Inactive pages" value={pages.filter(p => p.status === 'inactive').length} hint="Hidden from public view" icon={<X />} />
        <Stat label="Page views" value={analytics?.totals.page_view ?? 0} hint={`CTA clicks: ${(analytics?.totals.cta1_click ?? 0) + (analytics?.totals.cta2_click ?? 0)}`} icon={<Activity />} />
      </section>

      <section className="content-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Your library</p>
            <h2>Landing pages</h2>
          </div>
          <div className="panel-tools">
            <div className="search-box">
              <Search size={17} />
              <input placeholder="Search creators or slugs" value={query} onChange={e => setQuery(e.target.value)} />
            </div>
            <select className="status-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {loadError && <div className="alert error">{loadError}</div>}

        <div className="page-table">
          <div className="table-head">
            <span>Creator</span>
            <span>Page details</span>
            <span>Status</span>
            <span>Created</span>
            <span />
          </div>

          {filtered.map(page => (
            <div className="table-row" key={page.id}>
              <div className="creator-cell">
                {page.profile_image_url ? <img src={page.profile_image_url} alt="" /> : <div className="avatar">{page.creator_name.slice(0, 2).toUpperCase()}</div>}
                <div><strong>{page.creator_name}</strong><span>/{page.slug}</span></div>
              </div>
              <div className="detail-cell">
                <strong>{page.title}</strong>
                <span>{page.heading}</span>
              </div>
              <span className={`status ${page.status}`}>{page.status}</span>
              <span className="date">{new Date(page.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              <div className="row-actions">
                <Link to={`/edit/${page.id}`} title="Edit"><Pencil size={16} /></Link>
                <a href={`${siteUrl}/${page.slug}`} target="_blank" rel="noreferrer" title="Preview"><ExternalLink size={16} /></a>
                <button onClick={() => copy(page.slug)} title="Copy link"><Copy size={16} /></button>
                <button onClick={() => toggle(page.id)} title={page.status === 'active' ? 'Deactivate' : 'Activate'}><MoreHorizontal size={17} /></button>
                <button onClick={() => remove(page.id)} title="Delete"><Trash2 size={16} /></button>
              </div>
            </div>
          ))}

          {loading && <div className="empty-state">Loading pages…</div>}
          {!loading && !filtered.length && <div className="empty-state">No pages match your search.</div>}
        </div>
      </section>

      {toast && <div className="toast"><Check size={16} /> {toast}</div>}
    </>
  );
}

function Stat({ label, value, hint, icon, accent }: { label: string; value: number; hint: string; icon: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`stat-card ${accent ? 'accent' : ''}`}>
      <div className="stat-icon">{icon}</div>
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{hint}</span>
    </div>
  );
}

function Editor({ store }: { store: Store }) {
  const { pages, setPages } = store;
  const navigate = useNavigate();
  const { id } = useParams();
  const existing = pages.find(p => p.id === id);
  const [draft, setDraft] = useState<PageDraft>(existing ? { ...existing } : blank);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (existing) setDraft({ ...existing });
  }, [id, existing]);

  const update = (key: keyof PageDraft, value: string) => setDraft(d => ({ ...d, [key]: value }));

  const extraButtons: ExtraButton[] = draft.extra_buttons ?? [];

  const setExtraButtons = (next: ExtraButton[]) => setDraft(d => ({ ...d, extra_buttons: next }));

  const addExtraButton = () => setExtraButtons([...extraButtons, { id: newButtonId(), text: '', url: '' }]);

  const updateExtraButton = (id: string, key: 'text' | 'url', value: string) =>
    setExtraButtons(extraButtons.map(button => (button.id === id ? { ...button, [key]: value } : button)));

  const removeExtraButton = (id: string) => setExtraButtons(extraButtons.filter(button => button.id !== id));

  const upload = async (file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) {
      return setError('Use a JPG, PNG, or WEBP image under 3MB.');
    }

    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await apiRequest<{ url: string }>('/uploads', { method: 'POST', body: formData });
      update('profile_image_url', response.url);
      setError('');
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Could not upload image.');
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!draft.creator_name || !draft.slug || !draft.title || !draft.heading || !draft.button1_text || !draft.button1_url || !draft.button2_text || !draft.button2_url) {
      return setError('Complete all required fields before saving.');
    }

    const cleanedExtras = extraButtons
      .map(button => ({ ...button, text: button.text.trim(), url: button.url.trim() }))
      .filter(button => button.text || button.url);

    if (cleanedExtras.some(button => !button.text || !button.url)) {
      return setError('Every custom button needs both a name and a link.');
    }

    if (cleanedExtras.some(button => !/^https?:\/\//i.test(button.url))) {
      return setError('Custom button links must start with http:// or https://.');
    }

    const sanitized: PageDraft = {
      ...draft,
      slug: draft.slug.trim().toLowerCase(),
      button1_url: draft.button1_url.trim(),
      button2_url: draft.button2_url.trim(),
      extra_buttons: cleanedExtras
    };

    try {
      const payload = existing
        ? await apiRequest<LandingPage>(`/pages/${id}`, { method: 'PATCH', body: JSON.stringify(sanitized) })
        : await apiRequest<LandingPage>('/pages', { method: 'POST', body: JSON.stringify(sanitized) });

      setPages(current => (existing ? current.map(page => (page.id === id ? payload : page)) : [payload, ...current]));
      setSaved(true);
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.status === 409) return setError('That slug is already in use.');
      setError(saveError instanceof Error ? saveError.message : 'Could not save page.');
    }
  };

  const publicUrl = `${siteUrl}/${draft.slug}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <Topbar
        title={existing ? 'Edit landing page' : 'Create landing page'}
        subtitle="Craft a focused page your audience can act on."
        action={<Link className="button ghost" to="/dashboard"><ChevronLeft size={18} /> Back to pages</Link>}
      />

      <div className="editor-layout">
        <form className="editor-form" onSubmit={save}>
          {error && <div className="alert error">{error}</div>}

          <div className="form-section">
            <div className="section-title">
              <span>01</span>
              <div><p className="eyebrow">Profile information</p><h2>Make it unmistakably theirs</h2></div>
            </div>
            <div className="upload-zone">
              <div className="profile-upload">{draft.profile_image_url ? <img src={draft.profile_image_url} alt="Preview" /> : <UserRound size={28} />}</div>
              <div>
                <strong>Profile photo</strong>
                <p className="muted">JPG, PNG or WEBP. Max 3MB.</p>
                <label className="button secondary upload-button">
                  <Upload size={16} /> Upload image
                  <input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => upload(e.target.files?.[0])} />
                </label>
              </div>
            </div>
            <div className="form-grid">
              <Field label="Creator name" value={draft.creator_name} onChange={v => update('creator_name', v)} placeholder="e.g. Ayesha" required />
              <Field label="Username / slug" value={draft.slug} onChange={v => update('slug', v.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="e.g. ayesha" required />
            </div>
            <Field label="Main title" value={draft.title} onChange={v => update('title', v)} placeholder="Ayesha Reversal Type 2 Protocol" required />
            <Field label="Main heading" value={draft.heading} onChange={v => update('heading', v)} placeholder="Uncontrolled Diabetes - Treatment Information" required />
            <label>
              Description
              <textarea value={draft.description} onChange={e => update('description', e.target.value)} placeholder="Add a little context to help visitors take the next step." rows={4} />
            </label>
            <label>
              Status
              <select value={draft.status} onChange={e => update('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>

          <div className="form-section">
            <div className="section-title">
              <span>02</span>
              <div><p className="eyebrow">Calls to action</p><h2>Give visitors a clear next step</h2></div>
            </div>
            <CtaFields number="01" text={draft.button1_text} url={draft.button1_url} onText={v => update('button1_text', v)} onUrl={v => update('button1_url', v)} />
            <CtaFields number="02" text={draft.button2_text} url={draft.button2_url} onText={v => update('button2_text', v)} onUrl={v => update('button2_url', v)} />

            <p className="muted min-buttons-note">These two buttons are always required. Add as many extra buttons as you like below.</p>

            {extraButtons.map((button, index) => (
              <div className="cta-block" key={button.id}>
                <div className="cta-number">{String(index + 3).padStart(2, '0')}</div>
                <div className="cta-fields">
                  <Field label="Button text" value={button.text} onChange={v => updateExtraButton(button.id, 'text', v)} placeholder="Join My Community" />
                  <Field label="Button URL" value={button.url} onChange={v => updateExtraButton(button.id, 'url', v)} placeholder="https://example.com/community" />
                </div>
                <button type="button" className="cta-remove" onClick={() => removeExtraButton(button.id)} title="Delete button">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}

            <button type="button" className="button secondary add-button" onClick={addExtraButton}>
              <Plus size={16} /> Add button
            </button>
          </div>

          <div className="form-footer">
            <button type="button" className="button ghost" onClick={() => navigate('/dashboard')}>Cancel</button>
            <button className="button primary" type="submit">{existing ? 'Save changes' : 'Publish page'} <ArrowUpRight size={17} /></button>
          </div>
        </form>

        <div className="preview-column">
          <div className="preview-label"><span>Live preview</span><span className="live-dot">Live</span></div>
          <PhonePreview page={draft} />
        </div>
      </div>

      {saved && (
        <div className="modal-backdrop">
          <div className="success-modal">
            <div className="success-icon"><Check /></div>
            <p className="eyebrow">{existing ? 'Saved successfully' : 'Published successfully'}</p>
            <h2>Landing Page Created Successfully</h2>
            <p className="muted">Share this public link with {draft.creator_name}'s audience.</p>
            <div className="link-box">
              {publicUrl}
              <button type="button" onClick={copyLink} title="Copy link"><Copy size={16} /></button>
            </div>
            {copied && <p className="muted">Link copied to clipboard.</p>}
            <div className="modal-actions">
              <Link className="button ghost" to="/dashboard">Done</Link>
              <a className="button primary" href={publicUrl} target="_blank" rel="noreferrer">Open page <ExternalLink size={16} /></a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, value, onChange, placeholder, required }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; required?: boolean }) {
  return (
    <label>
      {label}{required && <span className="required"> *</span>}
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required} />
    </label>
  );
}

function CtaFields({ number, text, url, onText, onUrl }: { number: string; text: string; url: string; onText: (v: string) => void; onUrl: (v: string) => void }) {
  return (
    <div className="cta-block">
      <div className="cta-number">{number}</div>
      <div className="cta-fields">
        <Field label="Button text" value={text} onChange={onText} placeholder="Apply for Treatment" required />
        <Field label="Button URL" value={url} onChange={onUrl} placeholder="https://yourgate.org/treatment" required />
      </div>
    </div>
  );
}

function PhonePreview({ page }: { page: PageDraft }) {
  return (
    <div className="phone">
      <div className="phone-notch" />
      <div className="phone-screen">
        <div className="preview-top"><span>09:41</span><span>●●●</span></div>
        <div className="public-brand"><div className="mini-mark">PF</div><span>PageFlow</span></div>
        {page.profile_image_url
          ? <img className="preview-photo" src={page.profile_image_url} alt="" />
          : <div className="preview-photo placeholder"><UserRound size={26} /></div>}
        <p className="preview-name">{page.creator_name || 'Creator name'} <VerifiedBadge size={14} /></p>
        <p className="preview-title">{page.title || 'Your thoughtful page title'}</p>
        <h3>{page.heading || 'Your main heading will appear here'}</h3>
        {page.description && <p className="preview-description">{page.description}</p>}
        <div className="preview-buttons">
          <span className="preview-cta">{page.button1_text || 'Primary action'} <ArrowUpRight size={16} /></span>
          <span className="preview-cta outline">{page.button2_text || 'Secondary action'} <ArrowUpRight size={16} /></span>
          {(page.extra_buttons ?? [])
            .filter(button => button.text.trim())
            .map((button, index) => (
              <span className={index % 2 === 0 ? 'preview-cta' : 'preview-cta outline'} key={button.id}>
                {button.text} <ArrowUpRight size={16} />
              </span>
            ))}
        </div>
        <p className="preview-footer">Create. Customize. Share.</p>
      </div>
    </div>
  );
}

const setMeta = (name: string, content: string, property = false) => {
  const selector = property ? `meta[property="${name}"]` : `meta[name="${name}"]`;
  let tag = document.head.querySelector(selector);
  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(property ? 'property' : 'name', name);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
};

function PublicPage() {
  const { slug = '' } = useParams();
  const [page, setPage] = useState<LandingPage | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'inactive' | 'missing'>('loading');

  useEffect(() => {
    let cancelled = false;
    setState('loading');

    apiRequest<LandingPage>(`/public/pages/${encodeURIComponent(slug)}`)
      .then(data => {
        if (cancelled) return;
        setPage(data);
        setState('ready');
        trackEvent(slug, 'page_view');
      })
      .catch(error => {
        if (cancelled) return;
        setState(error instanceof ApiError && error.status === 403 ? 'inactive' : 'missing');
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!page) return;
    const title = `${page.creator_name} | ${page.title}`;
    const description = page.description || page.heading;
    document.title = title;
    setMeta('description', description);
    setMeta('og:title', title, true);
    setMeta('og:description', description, true);
    setMeta('og:type', 'website', true);
    setMeta('og:url', `${siteUrl}/${page.slug}`, true);
    if (page.profile_image_url) setMeta('og:image', page.profile_image_url, true);
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:title', title);
    setMeta('twitter:description', description);
  }, [page]);

  if (state === 'loading') return <div className="public-wrap"><div className="public-message"><div className="mini-mark">PF</div><p>Loading…</p></div></div>;
  if (state === 'missing') return <PublicMessage title="Page not found" text="This creator page may have moved or the link may be incomplete." />;
  if (state === 'inactive' || !page) return <PublicMessage title="This page is currently unavailable" text="Please check back soon or return to the main site." />;

  return (
    <div className="public-wrap">
      <div className="public-page">
        <div className="public-brand"><div className="mini-mark">PF</div><span>PageFlow</span></div>

        <div className="profile-hero">
          {page.profile_image_url
            ? <img className="profile-portrait" src={page.profile_image_url} alt={page.creator_name} />
            : <div className="profile-portrait placeholder"><UserRound size={44} /></div>}
        </div>

        <div className="profile-identity">
          <h1 className="profile-name">
            <span>{page.creator_name}</span>
            <VerifiedBadge />
          </h1>
          {page.title && <p className="profile-title">{page.title}</p>}
          {page.heading && <p className="profile-heading">{page.heading}</p>}
          {page.description && <p className="public-description">{page.description}</p>}
        </div>

        <div className="public-buttons">
          <a href={page.button1_url} target="_blank" rel="noreferrer noopener" onClick={() => trackEvent(page.slug, 'cta1_click')}>
            {page.button1_text}<ArrowUpRight size={18} />
          </a>
          <a className="outline" href={page.button2_url} target="_blank" rel="noreferrer noopener" onClick={() => trackEvent(page.slug, 'cta2_click')}>
            {page.button2_text}<ArrowUpRight size={18} />
          </a>
          {(page.extra_buttons ?? [])
            .filter(button => button.text?.trim() && button.url?.trim())
            .map((button, index) => (
              <a
                key={button.id}
                className={index % 2 === 0 ? undefined : 'outline'}
                href={button.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                {button.text}<ArrowUpRight size={18} />
              </a>
            ))}
        </div>

        <div className="trust-note"><ShieldCheck size={18} /><span>Shared with care by {page.creator_name}</span></div>
      </div>
    </div>
  );
}

function PublicMessage({ title, text }: { title: string; text: string }) {
  return (
    <div className="public-wrap">
      <div className="public-message">
        <div className="mini-mark">PF</div>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
    </div>
  );
}

function Topbar({ title, subtitle, action }: { title: string; subtitle: string; action: React.ReactNode }) {
  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">Workspace / {title}</p>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
      </div>
      <div>{action}</div>
    </header>
  );
}

function SettingsPage({ email }: { email: string }) {
  return (
    <>
      <Topbar title="Settings" subtitle="Keep your workspace identity and access details in order." action={<Link className="button ghost" to="/dashboard"><ChevronLeft size={18} /> Back to overview</Link>} />
      <section className="settings-panel">
        <div className="settings-icon"><Settings /></div>
        <p className="eyebrow">Workspace profile</p>
        <h2>Admin workspace</h2>
        <p className="muted">PageFlow — Create. Customize. Share. Accounts, storage and data are managed through your Supabase project.</p>
        <div className="settings-list">
          <div><span>Account</span><strong>{email || '—'}</strong></div>
          <div><span>Public site</span><strong>{siteUrl}</strong></div>
          <div><span>Storage</span><strong>Supabase Storage</strong></div>
        </div>
      </section>
    </>
  );
}

export default App;
