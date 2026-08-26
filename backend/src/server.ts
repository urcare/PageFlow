import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import multer from 'multer';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

// Load environment variables from either backend/.env or the project-root .env.
// npm workspaces may execute this script with backend/ as the working directory.
const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../.env'),
  path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../.env'),
  path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../.env')
];
for (const envPath of [...new Set(envCandidates)]) {
  dotenv.config({ path: envPath, override: false });
}

const app = express();
const port = Number(process.env.PORT || 4000);
const isProduction = process.env.NODE_ENV === 'production';
const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (isProduction && (!supabaseUrl || !serviceKey)) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in production.');
  process.exit(1);
}

if (isProduction && !process.env.FRONTEND_URL) {
  console.error('Missing FRONTEND_URL in production.');
  process.exit(1);
}

const normalizeOrigin = (value: string) =>
  value.trim().replace(/\/+$/, '');

const allowedOrigins = new Set(
  [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://page-flow-frontend.vercel.app',
    'https://page-flow-frontend-blue.vercel.app',
    ...(process.env.FRONTEND_URL || '').split(','),
  ]
    .map(normalizeOrigin)
    .filter(Boolean)
);

console.log('CORS allowed origins:', [...allowedOrigins]);



const supabase: SupabaseClient | null =
  supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } }) : null;

const authSupabase: SupabaseClient | null =
  supabaseUrl && (anonKey || serviceKey)
    ? createClient(supabaseUrl, anonKey || serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    : null;

/**
 * Development-only demo auth.
 * Never enabled in production: it requires NODE_ENV !== 'production',
 * ENABLE_DEMO_AUTH=true and explicit demo credentials in the environment.
 * No credentials are hardcoded and the demo token is random per process.
 */
const demoAuthEnabled =
  !isProduction &&
  process.env.ENABLE_DEMO_AUTH === 'true' &&
  Boolean(process.env.DEMO_ADMIN_EMAIL) &&
  Boolean(process.env.DEMO_ADMIN_PASSWORD);

const demoAdmin = demoAuthEnabled
  ? {
      id: '00000000-0000-4000-8000-000000000001',
      email: String(process.env.DEMO_ADMIN_EMAIL).toLowerCase(),
      password: String(process.env.DEMO_ADMIN_PASSWORD),
      role: 'admin' as const,
      token: crypto.randomBytes(32).toString('hex')
    }
  : null;

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
const corsOptions = {
  origin(origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) {
    if (!origin || allowedOrigins.has(normalizeOrigin(origin))) {
      return callback(null, true);
    }

    console.warn(`CORS blocked origin: ${origin}`);
    return callback(new Error('Origin not allowed.'));
  },

  credentials: true,

  methods: [
    'GET',
    'POST',
    'PATCH',
    'DELETE',
    'OPTIONS'
  ],

  allowedHeaders: [
    'Content-Type',
    'Authorization'
  ],

  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ extended: false, limit: '200kb' }));
app.use(morgan(isProduction ? 'combined' : 'tiny', { skip: () => false }));
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const uploadLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false });

const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp'];

const urlIsSafe = (value: string) => {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
};

const safeUrl = z
  .string()
  .trim()
  .min(1)
  .max(2000)
  .refine(urlIsSafe, 'Only http:// and https:// links are allowed.');

const pageSchema = z.object({
  creator_name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be lowercase and URL safe.'),
  profile_image_url: z
    .string()
    .trim()
    .max(2000)
    .default('')
    .refine((value) => value === '' || urlIsSafe(value), 'Invalid image URL.'),
  title: z.string().trim().min(1).max(180),
  heading: z.string().trim().min(1).max(240),
  description: z.string().trim().max(1200).default(''),
  button1_text: z.string().trim().min(1).max(80),
  button1_url: safeUrl,
  button2_text: z.string().trim().min(1).max(80),
  button2_url: safeUrl,
  extra_buttons: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(60),
        text: z.string().trim().min(1).max(80),
        url: safeUrl
      })
    )
    .max(20)
    .default([]),
  status: z.enum(['active', 'inactive']).default('active')
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(6).max(200)
});

const analyticsSchema = z.object({
  event_type: z.enum(['page_view', 'cta1_click', 'cta2_click'])
});

const pageIdSchema = z.string().uuid('Invalid page id.');

type AuthUser = { id: string; email: string; role: 'admin' | 'creator'; demo?: boolean };

const authenticate = async (req: Request): Promise<AuthUser | null> => {
  const header = req.headers.authorization || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;

  if (demoAdmin && token.length === demoAdmin.token.length) {
    const match = crypto.timingSafeEqual(Buffer.from(token), Buffer.from(demoAdmin.token));
    if (match) return { id: demoAdmin.id, email: demoAdmin.email, role: 'admin', demo: true };
  }

  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('id,email,role')
    .eq('id', data.user.id)
    .maybeSingle();

  if (userError || !userRow) return null;
  return { id: userRow.id, email: userRow.email, role: userRow.role === 'admin' ? 'admin' : 'creator' };
};

const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Authentication required.' });
  res.locals.user = user;
  next();
};

const requireRole =
  (...roles: Array<AuthUser['role']>) =>
  (_req: Request, res: Response, next: NextFunction) => {
    const user = res.locals.user as AuthUser | undefined;
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    if (!roles.includes(user.role)) return res.status(403).json({ error: 'You do not have access to this resource.' });
    next();
  };

const requireAdmin = [requireAuth, requireRole('admin')];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const extension = (file.originalname.split('.').pop() || '').toLowerCase();
    cb(null, ALLOWED_MIME.includes(file.mimetype) && ALLOWED_EXT.includes(extension));
  }
});

const requireDatabase = (res: Response) => {
  if (supabase) return true;
  res.status(503).json({ error: 'Service temporarily unavailable.' });
  return false;
};

const healthCheck = async (_req: Request, res: Response) => {
  if (!supabase) {
    return res.status(503).json({
      ok: true,
      database: false,
      configuration: false,
      missing: [
        ...(!supabaseUrl ? ['SUPABASE_URL'] : []),
        ...(!serviceKey ? ['SUPABASE_SERVICE_ROLE_KEY'] : [])
      ]
    });
  }

  try {
    const usersCheck = await supabase.from('users').select('id').limit(1);
    const pagesCheck = await supabase.from('landing_pages').select('id').limit(1);

    if (usersCheck.error || pagesCheck.error) {
      const errors = [usersCheck.error, pagesCheck.error].filter(Boolean).map((e: any) => ({
        message: e.message,
        code: e.code,
        details: e.details,
        hint: e.hint
      }));
      console.error('Health database check failed:', errors);
      return res.status(503).json({
        ok: true,
        database: false,
        configuration: true,
        errors: isProduction ? undefined : errors
      });
    }

    return res.json({ ok: true, database: true, configuration: true });
  } catch (error) {
    console.error('Health check failed:', error);
    return res.status(503).json({
      ok: true,
      database: false,
      configuration: true,
      error: isProduction ? undefined : String(error instanceof Error ? error.message : error)
    });
  }
};

app.get('/health', healthCheck);
app.get('/api/health', healthCheck);

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Please provide a valid email and password.' });
  }

  const { email, password } = parsed.data;

  if (demoAdmin && email === demoAdmin.email && password === demoAdmin.password) {
    return res.json({ token: demoAdmin.token, user: { id: demoAdmin.id, email: demoAdmin.email, role: 'admin' } });
  }

  if (!requireDatabase(res)) return;

  if (!authSupabase) return res.status(503).json({ error: 'Supabase Auth is not configured on the backend.' });

  const { data, error } = await authSupabase.auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.session) {
    console.error('[Auth] Supabase sign-in failed:', error?.message || 'No session returned');
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const { data: userRow, error: userError } = await supabase!
    .from('users')
    .select('id,email,role')
    .eq('id', data.user.id)
    .maybeSingle();

  if (userError || !userRow || userRow.role !== 'admin') {
    return res.status(403).json({ error: 'This account does not have admin access.' });
  }

  return res.json({
    token: data.session.access_token,
    user: { id: userRow.id, email: userRow.email, role: userRow.role }
  });
});

app.get('/api/auth/me', ...requireAdmin, (_req, res) => {
  const user = res.locals.user as AuthUser;
  res.json({ user: { id: user.id, email: user.email, role: user.role } });
});

/** Public page lookup: active -> page, inactive -> 403 unavailable, missing -> 404. */
app.get('/api/public/pages/:slug', async (req, res) => {
  if (!requireDatabase(res)) return;

  const slug = String(req.params.slug || '').toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return res.status(404).json({ error: 'Page not found.' });
  }

  const { data, error } = await supabase!
    .from('landing_pages')
    .select(
      'id,creator_name,slug,profile_image_url,title,heading,description,button1_text,button1_url,button2_text,button2_url,extra_buttons,status,created_at,updated_at'
    )
    .eq('slug', slug)
    .maybeSingle();

  if (error) { console.error('Supabase select error (public page):', error); return res.status(500).json({ error: 'Could not load page.' }); }
  if (!data) return res.status(404).json({ error: 'Page not found.' });
  if (data.status !== 'active') return res.status(403).json({ error: 'This page is currently unavailable.' });
  res.json(data);
});

app.post('/api/public/pages/:slug/events', async (req, res) => {
  if (!requireDatabase(res)) return;

  const parsed = analyticsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid analytics event.' });

  const slug = String(req.params.slug || '').toLowerCase();
  const { data: page } = await supabase!
    .from('landing_pages')
    .select('id,status')
    .eq('slug', slug)
    .maybeSingle();

  if (!page || page.status !== 'active') return res.status(204).end();

  const { error } = await supabase!
    .from('page_analytics')
    .insert({
      landing_page_id: page.id,
      event_type: parsed.data.event_type
    });

  if (error) {
    console.error('Analytics insert error:', error);
    return res.status(500).json({ error: 'Could not record analytics event.' });
  }

  res.status(204).end();
});

app.get('/api/pages', ...requireAdmin, async (_req, res) => {
  if (!requireDatabase(res)) return;

  const { data, error } = await supabase!
    .from('landing_pages')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { console.error('Supabase select error (list pages):', error); return res.status(500).json({ error: 'Could not load pages.', ...(isProduction ? {} : { details: String(error.message || error.details || error.hint || 'Unknown database error') }) }); }
  res.json(data);
});

app.get('/api/analytics/summary', ...requireAdmin, async (_req, res) => {
  if (!requireDatabase(res)) return;

  const { data, error } = await supabase!.from('page_analytics').select('landing_page_id,event_type');
  if (error) return res.status(500).json({ error: 'Could not load analytics.' });

  const totals = { page_view: 0, cta1_click: 0, cta2_click: 0 };
  const byPage: Record<string, { page_view: number; cta1_click: number; cta2_click: number }> = {};

  for (const row of data || []) {
    const type = row.event_type as keyof typeof totals;
    if (!(type in totals)) continue;
    totals[type] += 1;
    const bucket = (byPage[row.landing_page_id] ||= { page_view: 0, cta1_click: 0, cta2_click: 0 });
    bucket[type] += 1;
  }

  res.json({ totals, byPage });
});

app.post('/api/pages', ...requireAdmin, async (req, res) => {
  const parsed = pageSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Check the required fields and CTA URLs.' });
  }

  if (!requireDatabase(res)) return;

  const payload = {
    ...parsed.data,
    created_by: (res.locals.user as AuthUser).demo ? null : (res.locals.user as AuthUser).id,
    updated_at: new Date().toISOString()
  };

  // Be tolerant of an older Supabase schema/cache. The app's schema includes
  // extra_buttons/created_by/updated_at, but existing projects may have been
  // created before those columns were added. Retry only when PostgREST reports
  // a missing column; never hide other database errors.
  let insertPayload: Record<string, unknown> = { ...payload };
  let data: any = null;
  let error: any = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const result = await supabase!.from('landing_pages').insert(insertPayload).select().single();
    data = result.data;
    error = result.error;
    if (!error) break;

    const message = String(error.message || '');
    const missingColumnMatch =
      message.match(/column [\"']?([a-zA-Z0-9_]+)[\"']? does not exist/i) ||
      message.match(/Could not find the [\"']?([a-zA-Z0-9_]+)[\"']? column/i);

    const missingColumn = missingColumnMatch?.[1];
    if ((error.code === '42703' || error.code === 'PGRST204') && missingColumn && missingColumn in insertPayload) {
      console.warn(`Supabase schema is missing ${missingColumn}; retrying without that field.`);
      delete insertPayload[missingColumn];
      continue;
    }
    break;
  }

  if (error?.code === '23505') return res.status(409).json({ error: 'That slug is already in use.' });
  if (error) {
    console.error('Supabase insert error:', error);
    const details = isProduction ? undefined : String(error.message || error.details || error.hint || 'Unknown database error');
    return res.status(500).json({ error: 'Could not create page.', ...(details ? { details } : {}) });
  }
  res.status(201).json(data);
});

app.patch('/api/pages/:id', ...requireAdmin, async (req, res) => {
  const idParsed = pageIdSchema.safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ error: 'Invalid page id.' });

  const parsed = pageSchema.partial().safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return res.status(400).json({ error: 'Check the supplied fields and CTA URLs.' });
  }

  if (!requireDatabase(res)) return;

  const { data, error } = await supabase!
    .from('landing_pages')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .maybeSingle();

  if (error?.code === '23505') return res.status(409).json({ error: 'That slug is already in use.' });
  if (error) { console.error('Supabase update error:', error); return res.status(500).json({ error: 'Could not update page.', ...(isProduction ? {} : { details: String(error.message || error.details || error.hint || 'Unknown database error') }) }); }
  if (!data) return res.status(404).json({ error: 'Page not found.' });
  res.json(data);
});

app.delete('/api/pages/:id', ...requireAdmin, async (req, res) => {
  const idParsed = pageIdSchema.safeParse(req.params.id);
  if (!idParsed.success) return res.status(400).json({ error: 'Invalid page id.' });

  if (!requireDatabase(res)) return;

  const { error } = await supabase!.from('landing_pages').delete().eq('id', req.params.id);
  if (error) { console.error('Supabase delete error:', error); return res.status(500).json({ error: 'Could not delete page.' }); }
  res.status(204).end();
});

app.post('/api/uploads', uploadLimiter, ...requireAdmin, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Use a JPG, PNG or WEBP image under 3MB.' });
  }

  if (!ALLOWED_MIME.includes(req.file.mimetype) || req.file.size > MAX_UPLOAD_BYTES) {
    return res.status(400).json({ error: 'Use a JPG, PNG or WEBP image under 3MB.' });
  }

  if (!requireDatabase(res)) return;

  const extension = req.file.mimetype === 'image/png' ? 'png' : req.file.mimetype === 'image/webp' ? 'webp' : 'jpg';
  const path = `${(res.locals.user as AuthUser).id}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase!.storage.from('profile-images').upload(path, req.file.buffer, {
    contentType: req.file.mimetype,
    upsert: false
  });

  if (error) {
  console.error('Supabase upload error:', error);
  return res.status(500).json({ error: error.message });
}

  const { data } = supabase!.storage.from('profile-images').getPublicUrl(path);
  res.status(201).json({ path, url: data.publicUrl });
});

app.use((_req, res) => res.status(404).json({ error: 'Route not found.' }));

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: 'Image upload failed. Use one image under 3MB.' });
  }
  if (error instanceof SyntaxError) {
    return res.status(400).json({ error: 'Invalid request body.' });
  }
  if (error instanceof Error && error.message === 'Origin not allowed.') {
    return res.status(403).json({ error: 'Origin not allowed.' });
  }
  console.error('Unhandled API error');
  res.status(500).json({ error: 'Unexpected server error.' });
});

const server = app.listen(port, () => console.log(`PageFlow API listening on ${port}`));

const shutdown = () => {
  server.close(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
