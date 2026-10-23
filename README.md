# Aurel — QR Atelier

Static React + Tailwind app. No server, no database.

## Files
- `index.html` — page shell, SEO tags, security policy (CSP)
- `src/main.tsx` — the whole app (QR engine, state, router, pages)
- `src/styles.css` — design tokens & animations
- `vite.config.ts`, `package.json`, `tsconfig.json` — build config
- `.github/workflows/deploy.yml` — auto deploy to GitHub Pages

## Deploy (GitHub Pages)
1. Push all files to the `main` branch.
2. Repo → Settings → Pages → Source: **GitHub Actions**.
3. Push again (or Actions → Deploy → Run workflow). Site goes live at `https://<user>.github.io/<repo>/`.

## Local
```
npm install
npm run dev
npm run build
```
