# PageFlow deployment checklist

## Local
- [ ] Copy `.env.example` to `.env` in the project root (or create `backend/.env`) and fill Supabase values.
- [ ] `npm install`
- [ ] `npm run dev`
- [ ] Open `http://localhost:5173`
- [ ] Check `http://localhost:4000/api/health`
- [ ] Create/login with an admin Auth user.
- [ ] Confirm `public.users.role = 'admin'`.
- [ ] Create, edit, deactivate, activate and delete a page.
- [ ] Upload a JPG/PNG/WEBP under 3 MB.
- [ ] Open `/your-slug` directly and refresh.
- [ ] Confirm analytics counters update.

## Production backend
- [ ] `NODE_ENV=production`
- [ ] Set `FRONTEND_URL` to the exact deployed frontend origin.
- [ ] Set `SUPABASE_URL`.
- [ ] Set `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Keep `ENABLE_DEMO_AUTH=false`.
- [ ] Verify `/api/health` is healthy.

## Production frontend
- [ ] Set `VITE_API_URL=https://YOUR-BACKEND/api`.
- [ ] Set `VITE_PUBLIC_SITE_URL=https://YOUR-FRONTEND`.
- [ ] Build and deploy.
- [ ] Verify direct refreshes on `/slug`.

## Security
- [ ] Never commit `.env`.
- [ ] Never expose `SUPABASE_SERVICE_ROLE_KEY` as `VITE_*`.
- [ ] Rotate any secret that was ever accidentally committed to Git.
