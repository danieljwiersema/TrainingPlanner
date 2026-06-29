# Launch Checklist — Before Going Public

The app currently calls the Groq API **directly from the browser** using
`VITE_GROQ_API_KEY`, which Vite inlines into the JS bundle at build time.

**This is safe ONLY for a private / trusted audience.** Anyone who opens the
deployed site can read the key from the bundle (DevTools → Sources) and use it.

Before giving **public / "everyone"** access, complete the steps below.

---

## 1. Move the key server-side (Netlify Functions proxy)

1. Create `netlify/functions/groq.ts`:
   - Read `GROQ_API_KEY` from `process.env` — **no `VITE_` prefix** (server-only,
     never bundled).
   - Accept `{ messages, temperature }`, validate shape, cap message size.
   - Forward to `https://api.groq.com/openai/v1/chat/completions` and return the
     response.

2. In the Netlify dashboard, rename the env var:
   - `VITE_GROQ_API_KEY` → `GROQ_API_KEY`

3. In `src/lib/aiPlanner.ts`, change `callGroq()`:
   - Fetch `/.netlify/functions/groq` instead of `api.groq.com`.
   - Remove the `Authorization` header and all `import.meta.env.VITE_GROQ_API_KEY`
     references.

4. Delete the Groq typing from `src/vite-env.d.ts`.

5. Local dev now needs `netlify dev` (so the function runs) instead of `npm run dev`.

## 2. Rate limiting (cost control)

Add per-IP rate limiting in the function. Intended limit: **~20 AI calls / hour / IP**.
Return `429` with a friendly message when exceeded. Netlify exposes the client IP
via the `x-nf-client-connection-ip` header.

## 3. Verify

- Build the app, open DevTools → Sources, confirm the key is **not** present.
- Confirm AI optimise + design still work through the proxy.
- Confirm the 429 path shows a clean message in the UI.

---

Until all three are done, keep the deployed URL private.
