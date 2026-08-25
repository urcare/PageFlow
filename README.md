# PageFlow — production-ready full-stack landing page builder

PageFlow is a React/Vite frontend + Node/Express backend + Supabase Auth/Postgres/Storage application.

## Architecture

- **Frontend:** React 19 + Vite + TypeScript + React Router
- **Backend:** Node.js + Express + TypeScript
- **Database/Auth/Storage:** Supabase
- **Authentication:** Supabase Auth access tokens, validated server-side
- **RBAC:** `public.users.role` (`admin` / `creator`), with admin-only write APIs
- **Uploads:** Supabase Storage bucket `profile-images`
- **Analytics:** page views and CTA clicks
- **Hosting:** Vercel/Netlify for frontend; Render/Railway/any Node host for backend

## 1. Supabase setup

1. Create a Supabase project.
2. Open **SQL Editor** and run `supabase/schema.sql`.
3. In **Authentication → Providers**, enable Email/Password.
4. Create your admin user in Supabase Auth.
5. Promote that exact user to admin:

```sql
update public.users
set role = 'admin'
where email = 'YOUR_ADMIN_EMAIL';
```

The auth trigger automatically creates a least-privileged `creator` row for new Auth users. Never make the trigger grant admin automatically.

The SQL also creates the `profile-images` public bucket and its public-read policy. Uploads are performed by the backend with the service-role key.

## 2. Environment variables

Copy `.env.example` to `.env` in the project root for local development. The backend also accepts `backend/.env` if you prefer keeping server variables there.

### Frontend

```env
VITE_API_URL=http://localhost:4000/api
VITE_PUBLIC_SITE_URL=http://localhost:5173
```

Only `VITE_*` values belong in the frontend. **Never put `SUPABASE_SERVICE_ROLE_KEY` in frontend variables.**

### Backend

The backend automatically loads either the project-root `.env` or `backend/.env`, so `npm run dev` works correctly with npm workspaces.

```env
NODE_ENV=development
PORT=4000
FRONTEND_URL=http://localhost:5173
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
ENABLE_DEMO_AUTH=false
DEMO_ADMIN_EMAIL=
DEMO_ADMIN_PASSWORD=
```

In production, the backend exits at startup if `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, or `FRONTEND_URL` is missing.

## 3. Local run

From the project root:

```bash
npm install
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`
- Health: `http://localhost:4000/api/health`

The health endpoint returns a diagnostic error when Supabase is not reachable. If it says `42P01`, run `supabase/schema.sql` in Supabase SQL Editor. If it reports missing variables, fix the root `.env` and restart the backend.

Production build:

```bash
npm run build
```

Backend production start:

```bash
npm start
```

## 4. Vercel frontend

Set these project environment variables:

```env
VITE_API_URL=https://YOUR-RENDER-BACKEND.onrender.com/api
VITE_PUBLIC_SITE_URL=https://YOUR-VERCEL-DOMAIN.vercel.app
```

The included `frontend/vercel.json` keeps React Router routes working on refresh.

## 5. Netlify frontend

Set:

```env
VITE_API_URL=https://YOUR-RENDER-BACKEND.onrender.com/api
VITE_PUBLIC_SITE_URL=https://YOUR-NETLIFY-DOMAIN.netlify.app
```

The included `netlify.toml` rewrites all frontend routes to `index.html`.

## 6. Render backend

Create a Render Web Service using:

- Root directory: `backend`
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Health check: `/api/health`

Set:

```env
NODE_ENV=production
FRONTEND_URL=https://YOUR-FRONTEND-DOMAIN
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
ENABLE_DEMO_AUTH=false
```

`render.yaml` is included as a starting blueprint.

After deploying the frontend, put its exact origin in Render's `FRONTEND_URL`. Multiple origins can be comma-separated.

## 7. Security

- Service-role key is backend-only.
- Production demo authentication is forcibly disabled.
- Admin API routes validate Supabase bearer tokens server-side.
- Admin role is checked on every protected request.
- Request body sizes are limited.
- Login, upload, and API rate limits are enabled.
- Helmet and strict CORS are enabled.
- CTA URLs only allow `http://` and `https://`.
- Uploads are limited to JPG/PNG/WEBP and 3 MB.
- Database RLS is enabled.
- New Auth users default to `creator`.
- No secret `.env` files should be committed.

## 8. Main API

- `GET /api/health`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/public/pages/:slug`
- `POST /api/public/pages/:slug/events`
- `GET /api/pages`
- `POST /api/pages`
- `PATCH /api/pages/:id`
- `DELETE /api/pages/:id`
- `POST /api/uploads`
- `GET /api/analytics/summary`

## 9. Troubleshooting

### Login says authentication is required

Check that:
1. The user exists in Supabase Auth.
2. `public.users` contains the same Auth UUID.
3. That row has `role = 'admin'`.
4. The backend has the correct Supabase URL and service-role key.

### Browser shows a CORS error

Set the exact frontend origin in backend `FRONTEND_URL`, redeploy the backend, and make sure there is no trailing-path mismatch.

Correct:

```env
FRONTEND_URL=https://example.vercel.app
```

### Frontend calls the wrong API

Check `VITE_API_URL`. It may include `/api` or omit it; the frontend normalizes both forms.

### Refreshing `/ayesha` gives 404 on hosting

Use the included Vercel or Netlify routing configuration. Static hosting must rewrite unknown routes to `index.html`.

### Images upload but do not display

Confirm that the Supabase bucket is named `profile-images`, is public for reads, and that the backend is using the service-role key.

## 10. Important deployment rule

Deploy the backend and frontend as separate services when using Render + Vercel/Netlify. The browser must only receive:

- `VITE_API_URL`
- `VITE_PUBLIC_SITE_URL`

Never expose:

- `SUPABASE_SERVICE_ROLE_KEY`
- database passwords
- private server tokens

The supplied project has been cleaned so real `.env` files are not included in the distributable package.

## Existing Supabase project compatibility

If an existing Supabase project already works for login but page creation returns HTTP 500, run `supabase/migrations/001_pageflow_compatibility.sql` in the Supabase SQL Editor once. It adds any missing PageFlow columns and refreshes the PostgREST schema cache. The migration is safe to re-run.
