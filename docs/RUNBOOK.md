# RUNBOOK

Operating the Company AI Workspace. Server facts and the reasons behind each choice are in [DECISIONS.md](DECISIONS.md).

| Item | Value |
|---|---|
| Server | Ubuntu 24.04 VPS, shared with another project (never touch `ee-*`, `lead-demo-*`, `/opt/eagleseye`) |
| App directory | `/opt/company-ai` (compose project `company-ai`) |
| LibreChat | `https://<host>.<tailnet>.ts.net:8443` (tailnet only) |
| Admin Panel | `https://<host>.<tailnet>.ts.net:8444` (tailnet only) |
| Container ports | bound to the Tailscale IP only: 3480 (LibreChat), 3481 (Admin Panel) |
| Secrets | `/opt/company-ai/.env` on the server only (mode 600, owner uid 1000) |

---

## 1. Deploy

Normal path: **push to `main`**. GitHub Actions validates (compose config, YAML, shellcheck, no tracked secrets), uploads `deploy/` and `scripts/` to `/opt/company-ai`, and runs `deploy.sh`.

`deploy.sh` pulls pinned images, starts the stack, restarts app containers if `.env` or `librechat.yaml` changed, waits for LibreChat to be healthy, and fails if LibreChat rejected `librechat.yaml`.

Manual deploy on the server (same script):

```bash
bash /opt/company-ai/deploy.sh
```

Check state:

```bash
cd /opt/company-ai
docker compose ps
docker compose logs --since 15m api
```

## 2. Change configuration

| What | Where | How it takes effect |
|---|---|---|
| Models, retention, budgets, MCP servers, tool rules | `deploy/librechat.yaml` in git | push to `main` |
| Secrets, API keys, sign-in settings | `/opt/company-ai/.env` on the server | **not in git, not managed by CI** |

**Rule: after editing `.env` by hand, run `bash /opt/company-ai/deploy.sh`.** The file is read only when containers start; until then nothing changes. (Seen 2026-11-17: Google button missing until restart.)

**Rule: when `deploy/.env.example` gains a variable, add it to the server `.env` by hand.** CI never overwrites the server `.env`.

Edit the server `.env` safely:

```bash
cd /opt/company-ai
cp .env ".env.bak-$(date +%s)" && chmod 600 .env.bak-* && chown 1000:1000 .env.bak-*
nano .env
bash deploy.sh
```

Never `source .env` in a shell: values such as `SESSION_EXPIRY=1000 * 60 * 15` are not shell-safe. Read single values with `grep '^NAME=' .env | cut -d= -f2-`.

## 3. First install on a new server

```bash
# 1. Tailscale admin console > DNS: MagicDNS on, HTTPS Certificates on.
# 2. Let CI upload the files once (push to main, or copy deploy/* and scripts/* to /opt/company-ai).
cd /opt/company-ai
bash bootstrap-env.sh          # creates .env with generated secrets (refuses if .env exists)
nano .env                      # BIND_IP=<tailscale ip>, DOMAIN_*, ADMIN_PANEL_URL, API keys, SSO ids
bash deploy.sh
bash tailscale-serve.sh        # HTTPS on :8443 / :8444, persists across reboots
```

Then bootstrap the first admin (section 4).

## 4. Admin accounts

Production is **SSO only** (`ALLOW_EMAIL_LOGIN=false`). The first admin is created once with a password, then moved to SSO.

```bash
cd /opt/company-ai
# a) temporarily allow email login: ALLOW_EMAIL_LOGIN=true in .env, then
bash deploy.sh
# b) create the user. --email-verified=true is required, otherwise the script waits for input forever.
docker exec company-ai-api node config/create-user.js admin@example.com "Full Name" username "$(openssl rand -base64 18)" --email-verified=true
# The first user on the instance becomes ADMIN.
```

**Moving a password account to SSO.** LibreChat refuses an SSO login for an email that already exists with another provider (log: `already exists with provider local`). This is deliberate: it stops account takeover through a different login method. Switch the account explicitly:

```bash
docker exec company-ai-mongodb mongosh --quiet LibreChat --eval '
  db.users.updateOne({email:"admin@example.com", provider:"local"}, {$set:{provider:"google"}, $unset:{password:1}})'
# provider: "google" or "openid" (Entra)
```

Then set `ALLOW_EMAIL_LOGIN=false` and run `deploy.sh`. Check: `curl -s https://<host>:8443/api/config` shows `"emailLoginEnabled":false`, and a password login returns 403.

List users:

```bash
docker exec company-ai-mongodb mongosh --quiet LibreChat --eval 'printjson(db.users.find({},{email:1,provider:1,role:1,_id:0}).toArray())'
```

**Break-glass (SSO provider down):** SSH to the server, set `ALLOW_EMAIL_LOGIN=true`, create a temporary admin as above, fix the problem, delete the temporary user, set `ALLOW_EMAIL_LOGIN=false`, `deploy.sh`. Record it in the change log.

## 5. Sign-in providers

**Google** (Google Cloud project `company-ai-workspace`, Google Auth Platform):
- Consent screen in **Testing**: only listed test users can sign in. Add users under Audience > Test users.
- Web client redirect URIs: `https://<host>:8443/oauth/google/callback` and `https://<host>:8443/api/admin/oauth/google/callback`.
- `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ALLOW_SOCIAL_LOGIN=true`, `ALLOW_SOCIAL_REGISTRATION=true`.
- `librechat.yaml`: `registration.allowedDomains` limits which email domains may sign in at all.

**Entra ID:** pending (needs an Azure tenant). Settings are prepared in `.env.example` (`OPENID_*`, role sync).

## 6. Models

| Provider | Where configured | Notes |
|---|---|---|
| Groq | `librechat.yaml` custom endpoint, key `GROQ_API_KEY` | explicit model list, `fetch: false` |
| Google Gemini | `ENDPOINTS` includes `google`, `GOOGLE_KEY`, `GOOGLE_MODELS` | free tier; Pro models are paid-only (429). Free tier can return 503 "high demand": retry or use flash-lite |
| Anthropic / OpenAI | `ANTHROPIC_API_KEY` / `OPENAI_API_KEY`, `*_MODELS` | hidden until a key is set |

**Add a model:** add it to the provider's list (`*_MODELS` in `.env`, or `models.default` in `librechat.yaml` for custom endpoints), deploy, then confirm it answers. Only listed models appear.

Free-tier keys: prompts may be used by the provider. Demo data only.

## 7. File search (RAG)

- Embeddings: Gemini `gemini-embedding-001` via the RAG API (`EMBEDDINGS_PROVIDER=google_genai`, reads `GOOGLE_KEY`). Vectors in pgvector (`company-ai-vectordb`).
- **Files must be added in an agent's File Search tool** (Agent Builder > Tools > File Search > upload). The chat paperclip sends the raw file to the model ("Upload to Provider"); Groq rejects PDFs with a 400, and the file then stays in that conversation and breaks every later reply. Fix for a user: start a new chat.
- Company documents should come from Drive/SharePoint connectors, not uploads (DECISIONS D8).

Verify ingestion:

```bash
cd /opt/company-ai
docker compose logs --since 1h rag_api | grep -E 'Ingestion completed|/query'
docker exec company-ai-mongodb mongosh --quiet LibreChat --eval 'printjson(db.files.find({embedded:true},{filename:1,context:1,_id:0}).toArray())'
```

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Change in `.env` has no effect | containers not restarted | `bash deploy.sh` |
| Google login: "Authentication failed" | email exists with another provider | section 4, move account to SSO |
| No "Continue with Google" button, only "OR" | `GOOGLE_CLIENT_SECRET` empty or not restarted | fill it, `deploy.sh`; `/api/config` must show `googleLoginEnabled: true` |
| Model error 400 mentioning `document` / `file` content type | PDF sent to a text-only model | section 7; new chat |
| Gemini 503 "high demand" | free-tier capacity | retry, or flash-lite |
| `create-user` hangs | waiting for "Email verified?" prompt | pass `--email-verified=true` |
| `rag_api` restarting | missing embeddings key | check `GOOGLE_KEY` / `EMBEDDINGS_PROVIDER` |
| `[schedules] scheduler NOT started` | multi-replica guard | `SCHEDULES_SINGLE_PROCESS=true` (single replica) |
| `tailscale serve` HTTPS fails from the server itself | server does not use MagicDNS for its own name | test with `curl --resolve <host>:8443:<tailscale ip>` or from another tailnet device |

## 9. Backup and restore

To be written in Week 3 (restic to off-server storage, tested restore).

## 10. Change log

| Date | Change |
|---|---|
| 2026-11-17 | Stack deployed (LibreChat v0.8.8), CI/CD, Tailscale HTTPS |
| 2026-11-17 | Google SSO; admin moved to SSO; email login disabled |
| 2026-11-17 | Groq and Gemini models; Gemini embeddings; file search verified |
