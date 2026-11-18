# DECISIONS: what LibreChat gives us vs. what we build

Date: 2026-11-17. Based on librechat.ai docs read on this date (BRD v1.1, section 13 step 1).

**Target version:** LibreChat **v0.8.8** (latest stable, 2026-09-30). v0.8.9 is at rc1 only. Pin the image tag in `docker-compose.override.yml`; never use `latest`.

Status key: **Built-in** = use LibreChat as is. **Partial** = LibreChat covers part, we add the rest. **Ours** = we build it. **Verify** = docs unclear; confirm on the running v0.8.8 before relying on it.

## Summary

| BRD item | Status | Decision |
|---|---|---|
| FR-01 Entra ID sign-in | Built-in | OpenID with `OPENID_*` vars, `OPENID_USE_END_SESSION_ENDPOINT=true` for real sign-out |
| FR-01 Google sign-in | Built-in | `GOOGLE_CLIENT_ID/SECRET`, `registration.allowedDomains` in `librechat.yaml` (also applies to social/SSO logins) |
| FR-01 No local passwords | Built-in | `ALLOW_EMAIL_LOGIN=false`, `ALLOW_REGISTRATION=false` (Verify exact names in `.env.example`) |
| FR-02 Role mapping (Entra) | Built-in, Verify | `OPENID_ROLE_SYNC_*` (merged June 2026, should be in v0.8.8). Maps a claim to **one** LibreChat role by priority, with a fallback role. ADMIN only via `OPENID_ADMIN_ROLE` |
| FR-02 Role mapping (Google) | Ours | Google login carries no groups. Google users get the fallback role (Staff); Admin promotes them in the Admin Panel |
| FR-02 Role refresh ~15 min | Built-in | `OPENID_REUSE_TOKENS=true` with `OPENID_REUSE_MAX_SESSION_AGE_MS` (default 900000 = 15 min) |
| FR-02 Admin forces sign-out | Gap | Not documented. Workaround: revoke sessions in Entra; reuse-token refresh fails within 15 min. Ban via Admin Panel if needed (Verify) |
| FR-03 Models per role | Built-in, Verify | Admin Panel **config overrides** per role/group (endpoints and model lists). Server-side rejection of an unlisted model must be proven by go-live test 5 |
| FR-04 Per-user budget | Built-in | `balance:` block (global start/refill) + `npm run set-balance <email> <amount>` per user. No per-role balance documented |
| FR-04 Spend report | Partial | LibreChat writes every model call to the **Transactions** collection (MongoDB). governance-api reads it with a read-only Mongo user. 1,000,000 credits = $1 |
| FR-05 Multi-model, Artifacts, Agents | Built-in | Default features |
| FR-06 RAG with citations | Built-in | RAG API + pgvector from the default compose. Files stay in the owner's account. Isolation proved by go-live test 1 |
| FR-07/08/09/10 Connectors | Ours | MCP servers over `streamable-http` |
| FR-11 Approval queue | Ours (see D1) | LibreChat has in-chat **tool approval** (`endpoints.agents.toolApproval`), but MCP servers cannot verify that approval happened, and it has no risk levels, before/after view, freshness check or multi-step approval |
| FR-12 Audit: model calls | Partial | From the Transactions collection |
| FR-12 Audit: tool calls, approvals | Ours | governance-api records them |
| FR-12 LibreChat's own audit log | Built-in (admin only) | Covers grants and admin changes only (`read:audit_log`). Link it from our docs; not a replacement |
| FR-13 Connector revocation | Ours | Token vault (FR-17) |
| FR-14 Offboarding | Partial | Entra/Google blocks sign-in; we delete vault credentials (scheduled check against the identity provider, or Admin action) |
| FR-15 Chat retention | Built-in | `interface.retentionMode: all` + `generalChatRetention` (MongoDB TTL). Applies only to records saved after the change, so set it before go-live. Memories never expire |
| FR-15 File retention | Built-in, Verify | `FILE_RETENTION_SWEEP_INTERVAL_MS` exists; find the matching retention period key |
| FR-16 Admin area | Partial | LibreChat **Admin Panel** (v0.8.5+, service `admin-panel`, needs `ADMIN_PANEL_SESSION_SECRET`) handles users, roles, groups, config overrides. Our dashboard covers only spend, approvals, audit search, connector health |
| FR-16 User area | Ours | My pending actions, My connections, My usage |
| FR-17 Token vault | Ours | As in BRD |

## Decisions that change the BRD

### D1. Approval gate stays in governance-api; LibreChat tool approval is optional
LibreChat v0.8.x can pause an agent tool call and show an Approve/Reject card in chat (`toolApproval` with globs like `mcp:erpnext:create_*`). It is tempting for the MVP self-confirm, but:
- the MCP server cannot prove the user approved (signed approvals exist only in an unmerged fork), so "no write without an approval record" could not be enforced by our code;
- the card has no before/after view, freshness check, expiry record or Phase 2 multi-approver support;
- approvals are not exported to our audit log.

**Decision:** keep the BRD design (write tool → pending request in governance-api → confirm on My pending actions). Use `toolApproval` with `deny` rules only as an extra safety net (e.g. `deny: ['mcp:*:send_*', 'mcp:*:submit_*', 'mcp:*:delete_*']`), with no `ask` rules so users don't confirm twice.

### D2. User identity key across systems
MCP servers receive the caller through header placeholders: `{{LIBRECHAT_USER_ID}}`, `{{LIBRECHAT_USER_EMAIL}}`, `{{LIBRECHAT_USER_ROLE}}` and other `{{LIBRECHAT_USER_*}}` fields. `requestHeaders` are resolved only during a real chat request.
**Decision:** governance-api keys users by **lower-cased email**, which both Entra and Google provide and `allowedDomains` restricts. It also stores the LibreChat user ID on first contact. MCP config sends `X-User-Email`, `X-User-Id` and `X-User-Role` plus the service secret (`${GOVERNANCE_SERVICE_SECRET}`). MCP servers also re-check the role in governance-api (60 s cache, FR-02); they don't trust the header role alone.

### D3. Microsoft Graph tokens: vault, not LibreChat OBO
LibreChat can hand MCP servers an Entra token (`{{LIBRECHAT_GRAPH_ACCESS_TOKEN}}`, or `obo:` token exchange). That only works while the user is in chat and only for Entra users, but governance-api executes approved actions later.
**Decision:** use the FR-17 vault for Microsoft, Google and ERPNext alike. One flow, testable, works for Google sign-in users too.

### D4. MCP network allow-list
LibreChat blocks private hosts by default. Add the MCP container hosts to `mcpSettings.allowedAddresses` (exact `host:port`).

### D5. Per-role model lists via Admin Panel, documented as config
Per-role endpoint/model overrides live in the Admin Panel database, not in git. To keep the "changelog of configuration changes" requirement, export the role profiles after each change into `config/admin-overrides/` and note it in RUNBOOK.

### D6. HTTPS on the Tailscale-only instance: `tailscale serve`, no Caddy
Entra needs an exact HTTPS redirect URI. The VPS is shared with another project whose Caddy already owns ports 80/443, so we do not add a second reverse proxy.
**Decision:** containers bind to the Tailscale IP only (LibreChat 3480, Admin Panel 3481). `tailscale serve` terminates HTTPS with the tailnet certificate on the MagicDNS name: LibreChat on `:8443`, Admin Panel on `:8444`, governance dashboard on `:8445`. `DOMAIN_CLIENT`/`DOMAIN_SERVER` use that name. This replaces Caddy in BRD section 7. Requires "HTTPS Certificates" enabled in the Tailscale admin console.

### D8. Where agents get company knowledge
- **Company documents: live connectors with the user's own permissions (main pattern).** Agents search SharePoint/OneDrive (mcp-m365) and Google Drive (mcp-google) at question time with the asking user's delegated token. Results are limited to files that user can already open, always current, never copied. FR-07/FR-08.
- **Upload (FR-06): only for a user's own, one-off files**, stored privately per user in LibreChat RAG.
- **Folder sync (Phase 2 department assistants): only for folders everyone may read** (e.g. "Company Policies"), indexed by a sync job, never uploaded by hand. Not used for restricted content, because copying permissions into an index is where leaks happen.

### D9. File search: agent File Search, not chat attachments
Verified 2026-11-17: in v0.8.8 the chat paperclip sends files to the model directly ("Upload to Provider"). Groq models accept only text, so a PDF returns 400 and the PDF stays in the conversation history, breaking every later turn. Files must be added in the agent's **File Search** tool, which sends them to the RAG API. Pipeline proven: Gemini `gemini-embedding-001` (3072 dims) → pgvector → `/query` → only matching chunks reach the model, with a source citation.
- 3072-dim vectors run without an ANN index (pgvector HNSW/IVFFlat cap at 2000 dims). Fine at demo scale; for large corpora switch to a smaller output dimension.
- Users get file search through prepared agents (e.g. "Company Docs"), so they never choose between upload modes.

### D10. Read-only connectors use LibreChat's per-user MCP OAuth; the token vault comes with write actions
`mcp-google` (Drive search/read) is the first connector, brought forward from Week 3 (D8). LibreChat v0.8.8 runs the OAuth flow per user (`mcpServers.<name>.oauth`), stores the user's tokens encrypted (`encryptV2`) and sends the access token as `Authorization: Bearer` on each call. The MCP server is stateless: it calls Drive with that token and stores nothing.
- This refines D3. Read tools act only while the user is in chat, so LibreChat's own token store is enough. The governance-api vault (FR-17) is still needed for **write** actions executed later, after approval (Gmail drafts, ERPNext). It arrives with governance-api in Week 2.
- Guard on every request: shared `X-Service-Secret` (403 without it) and a user Bearer token (401 + `WWW-Authenticate` without it, which starts the OAuth flow). Internal network only, no published port, read-only container, all capabilities dropped.
- Scope `drive.readonly`. Google OAuth redirect URI: `DOMAIN_SERVER/api/mcp/google-workspace/oauth/callback`.
- 403 and 404 from Drive return the same message, so the tool never confirms that a file the user cannot open exists.
- One JSON log line per tool call (user, tool, parameter summary, outcome, duration; never tokens or contents) until governance-api's audit log exists.

### D7. CI/CD
GitHub Actions validates on every push and PR (compose config, YAML, shellcheck, no tracked secrets). On `main` it uploads `deploy/` and `scripts/` to `/opt/company-ai` over SSH with a dedicated deploy key and runs `deploy.sh`. Secrets are generated on the server (`bootstrap-env.sh`) and never pass through GitHub. Images are pinned: LibreChat `v0.8.8`, Admin Panel `1.0.0`, RAG API `v0.9.0`.

## Check on the running v0.8.8 (Week 1, first day)

1. ~~`OPENID_ROLE_SYNC_*` exists~~ Confirmed in v0.8.8 `.env.example`: `OPENID_ROLE_SYNC_ENABLED`, `_API_ENABLED`, `_SOURCE`, `_CLAIM`, `_ROLE_PRIORITY`, `_FALLBACK_ROLE`. Also confirmed: `ALLOW_EMAIL_LOGIN`, `ALLOW_SOCIAL_REGISTRATION`, `toolApproval`, `retentionMode: all` (covers files too), `generalChatRetention` in hours.
2. Admin Panel config overrides can restrict models per role, and the API rejects a non-listed model (go-live test 5).
3. Balance can be overridden per role/group in the Admin Panel; otherwise per-user `set-balance` only.
4. Exact names: `ALLOW_EMAIL_LOGIN`, `ALLOW_SOCIAL_REGISTRATION`, file retention period key, `generalChatRetention` unit.
5. Which `{{LIBRECHAT_USER_*}}` fields are available (email, role, openidId).
6. Whether an Admin can end another user's session or ban them.
7. Transactions collection field names (user, model, tokenType, rawAmount, tokenValue, rate, conversationId, createdAt).

## Sources

- MCP servers: https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/mcp_servers
- Agents / toolApproval: https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/agents
- Admin Panel: https://www.librechat.ai/docs/configuration/admin_panel and https://www.librechat.ai/docs/features/admin_panel
- Access Control: https://www.librechat.ai/docs/configuration/access_control
- Entra ID: https://www.librechat.ai/docs/configuration/authentication/OAuth2-OIDC/azure
- Token reuse: https://www.librechat.ai/docs/configuration/authentication/OAuth2-OIDC/token-reuse
- OpenID role sync PR #13415: https://github.com/danny-avila/LibreChat/pull/13415
- Google: https://www.librechat.ai/docs/configuration/authentication/OAuth2-OIDC/google
- Registration / allowedDomains: https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/registration
- Balance: https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/balance
- Token usage / Transactions: https://www.librechat.ai/docs/configuration/token_usage
- Data retention: https://www.librechat.ai/docs/configuration/data_retention
- Model specs: https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/model_specs
- RAG API: https://www.librechat.ai/docs/features/rag_api
- Docker: https://www.librechat.ai/docs/local/docker
- Changelog: https://www.librechat.ai/changelog
