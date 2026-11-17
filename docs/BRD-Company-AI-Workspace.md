# BRD: Company AI Workspace (self-hosted LibreChat)

Owner: Moataz Noaman
Version: 1.1 (November 2026)
Purpose of this file: business requirements for a portfolio-grade, production-style deployment of LibreChat as a company AI workspace. It is written to be handed to Claude Code as the starting brief.

---

## 1. Why this project

Companies are rolling out self-hosted AI workspaces so staff can use several models (Claude, OpenAI, others) safely, with company sign-on, access to internal systems, cost control and an audit trail. Freelance and job posts now ask for exactly this (example: a US manufacturer hiring a LibreChat expert to deploy it on-prem with Entra ID SSO, Microsoft Graph, SharePoint, an ERP MCP server, approved actions, per-user spend limits, backups and go-live tests).

Goal: build that same system end to end on my own VPS, document it like a real client delivery, and use it as public proof (GitHub repo, demo video, case study).

## 2. What the market actually uses (research summary)

These findings drive the technology choices below, instead of only using tools I already know.

1. **Identity providers.** Microsoft Entra ID is the most common primary identity provider in companies (about 44% share), then Okta (about 29%) and Google Workspace (about 17%). For 50 to 200 employee companies, Google Workspace is the most requested (54%), and for 200 to 1,000 employees Entra ID leads (68%). Source: SSOJet 2025 report (vendor data).
   Decision: support **Entra ID (OpenID Connect) as primary** and **Google Workspace sign-in** as secondary. Keycloak only as a local fallback for development.
2. **Integrations companies connect first.** Google Workspace (Drive, Gmail, Calendar), Microsoft 365 (Outlook, SharePoint via Microsoft Graph), Slack, Jira, CRM (HubSpot, Salesforce), internal knowledge (Notion, Confluence) and read-only databases. Source: Metorial "Best MCP servers for enterprise teams 2026" (editorial).
   Decision: build **Microsoft 365** and **Google Workspace** connectors, one **ERP connector (ERPNext, built on Frappe)**, and one **read-only database analytics connector**. These cover the most common requests plus my ERP niche. ERPNext is chosen for the MVP because it is fully open source with no licence fees, popular with MENA businesses, and exposes a REST API for every document type out of the box. The connector sits behind a common ERP interface so Odoo can be added later with the same tools.
3. **Enterprise portal requirements.** SSO and role-based access, multi-model routing, shared department assistants, agents, a full audit trail with cost, deployment flexibility (on-prem or private cloud), PII handling. Source: Gosign "Enterprise AI chat interface".
4. **LibreChat itself.** Supports many providers, Agents, MCP servers, Artifacts, file handling, and sharing of agents and prompts with access controls. Its 2026 roadmap adds an admin panel, role-based configuration profiles, human-in-the-loop approval gates, file retention policies and usage metrics. Source: LibreChat 2026 roadmap.
   Decision: use LibreChat's built-in features where they exist today, and build what is missing (approval queue, audit log, spend reports) as my own small services so the project does not depend on roadmap timing.

Note for Claude Code: LibreChat changes quickly. **Verify every LibreChat configuration key against the current official docs (librechat.ai/docs) before using it.** Where this BRD names a LibreChat feature, treat it as "use if available in the installed version, otherwise implement in our own service".

## 3. Scope

### 3.1 In scope (MVP, target 2 to 3 weeks)
- LibreChat deployed with Docker Compose on my VPS, behind HTTPS.
- Internal-only access through a private network (Tailscale), plus an optional separate public demo instance.
- Sign-on with Entra ID (OIDC) and Google; MFA enforced by the identity provider.
- Models: Anthropic (Claude), OpenAI, and one local model via Ollama.
- Approved model list per role, per-user usage limits, and a spend report.
- File search over uploaded documents (RAG).
- MCP connectors:
  - Microsoft 365 via Microsoft Graph: read own mail and calendar, create **draft** replies (never send automatically), SharePoint/OneDrive file search limited to files the user can already open.
  - Google Workspace: Drive search, Gmail read and draft, Calendar read.
  - ERPNext (Frappe): read sales orders, stock levels, customer balances; write actions (create a draft quotation, update a draft sales order) only after human approval.
  - Read-only analytics database (PostgreSQL views).
- Approval queue: any write action creates a pending request that the user confirms; every request and decision is recorded.
- Audit log: who used which model, which tool, which action, cost, timestamp.
- Governance dashboard (small Next.js app): spend per user and per model, approval history, connector status.
- Backups off the server (encrypted), with a tested restore.
- Go-live test checklist, runbook and training material.

### 3.2 Phase 2 (after MVP)
- Slack and Jira connectors.
- HubSpot (free CRM) connector.
- Odoo connector, implementing the same ERP interface as ERPNext.
- Approval matrix with risk levels, department approvers, two-step approvals and delegation (see FR-11).
- Department assistants (HR policy bot, sales assistant) with their own documents.
- PII detection and redaction before sending prompts to cloud models.
- Embedding LibreChat inside another web app with shared sign-on.

### 3.3 Out of scope
- Building a chat UI from scratch (LibreChat is the UI).
- Training or fine-tuning models.
- Public internet exposure of the internal instance.

## 4. Users and roles

| Role | Who | Can do |
|---|---|---|
| Staff | Regular employee | Chat with approved models, use connectors for their own data, upload files, request actions |
| Power user | Team lead | Everything Staff can do, plus create and share agents and prompts with their department |
| Approver | Manager | Approve or reject actions requested by others (Phase 2; in MVP the requester approves their own drafts) |
| Admin | IT | Manage models, limits, connectors, users and roles; view audit logs and spend; run backups and restores |
| Finance approver (Phase 2) | Finance manager | Second approval on High-risk actions (see FR-11) |

Roles come from identity provider groups (Entra ID groups, Google groups) and map to LibreChat roles and to permissions in our services.

## 5. Functional requirements

Each requirement has an ID and acceptance criteria (AC) so it can be tested.

### FR-01 Sign-in
- Users sign in with Entra ID (OIDC) or Google. No local password accounts in production.
- AC: a user outside the allowed tenant or domain cannot sign in. MFA is enforced by the identity provider. Signing out ends the session.

### FR-02 Role mapping
- Identity provider groups map to Staff, Power user, Approver, Admin.
- Permission changes take effect within the same session, in two layers:
  - Our services (MCP connectors and governance-api) check the user's current role on every request, using a role cache with a short lifetime (60 seconds) that Admin can clear instantly. Tool access and approvals therefore change almost immediately.
  - LibreChat's own UI permissions (for example which models appear) come from the sign-in token, so sessions use short-lived tokens with refresh (about 15 minutes), and Admin can force a user's session to end, which applies the new role straight away.
- AC: after a user is moved to a lower role, their next tool call or approval is checked against the new role within 60 seconds without signing out; their model list updates at the next token refresh or immediately if Admin ends the session; a role change is recorded in the audit log.

### FR-03 Model access control
- Admin defines the approved model list; access can differ per role.
- AC: an unapproved model never appears in the UI and calls to it are rejected server-side.

### FR-04 Usage limits and spend
- Each user has a token or credit budget per period; Admin can change it.
- AC: a user over budget is blocked with a clear message. The dashboard shows spend per user, per model and per day.

### FR-05 Multi-model work
- Users can switch models mid-conversation and use Artifacts. Agents can use tools and hand work between models where LibreChat supports it.
- AC: a demo conversation uses Claude for drafting and an OpenAI model for review in the same chat.

### FR-06 Document search (RAG)
- Users upload documents and ask questions over them.
- AC: answers cite the uploaded file; one user cannot search another user's private files.

### FR-07 Microsoft 365 connector
- Read own mail and calendar; create draft replies in the user's Outlook; search SharePoint/OneDrive.
- Uses delegated (per-user) permissions, so results are limited to what the user can already access.
- AC: the connector cannot send mail; a draft appears in the user's Drafts folder; a file the user has no access to is never returned.

### FR-08 Google Workspace connector
- Same pattern as FR-07 for Gmail, Calendar and Drive.
- AC: same as FR-07.

### FR-09 ERPNext connector (Frappe)
- Read tools: list Sales Orders by status, items below their reorder level, customer outstanding balance, recent Sales Invoices.
- Write tools: create a draft Quotation, update fields on a draft Sales Order (for example delivery date). Write tools go through the approval queue (FR-11). The connector never submits or cancels documents; submission stays a human step inside ERPNext.
- Each chat user is mapped to an ERPNext user and calls the Frappe REST API with that user's own credentials (API key and secret, or Frappe OAuth), so ERPNext role permissions and user permissions still apply.
- MVP limits on write tools:
  - createQuotation: refused if the total is above `MVP_SELF_CONFIRM_LIMIT` (one global limit in `.env`, for example 50000 in the company currency), with a message that larger quotations need an approver (Phase 2).
  - updateOrder: only allowed on a draft Sales Order whose ERPNext `owner` is the requester; anything else is refused.
- Phase 2 adds a tool to change a customer's contact or delivery details (updateCustomerDetails), which is Medium risk.
- The connector implements a small common ERP interface (listOrders, lowStock, customerBalance, createQuotation, updateOrder) so an Odoo adapter can be added in Phase 2 without changing the tools.
- AC: a user whose ERPNext roles cannot see a record cannot get it through chat; no document is ever submitted by the connector.

### FR-10 Analytics database connector
- Read-only queries against prepared PostgreSQL views.
- AC: write statements are impossible (read-only database role); queries time out after a set limit.

### FR-11 Approval queue for actions
- Any write action creates a pending request showing exactly what will change (a before and after view).
- Nothing executes until the required approval is given. Who must approve depends on the action's risk level.

**MVP (build now):**
- Only Low-risk actions exist, and the requester confirms their own request.
- Where the user confirms: the write tool's reply in chat includes a link to the request on the **My pending actions** page of the governance dashboard (FR-16). The page shows the before and after view with Confirm and Reject buttons.
- Low-risk actions in the MVP: draft reply in your own Outlook or Gmail; draft ERPNext quotation up to `MVP_SELF_CONFIRM_LIMIT`; updating your own draft Sales Order. Anything else is refused, not queued.
- Expiry and freshness check apply from the MVP (see Approval rules below).
- The database schema already includes the Phase 2 fields (risk level, approval steps, approver, delegate), so Phase 2 needs no migration. Only the self-confirm flow is built now.

**Phase 2: approval matrix (who approves what)**

| Risk level | Example actions | Who approves | Rules |
|---|---|---|---|
| Low | Draft reply in your own Outlook or Gmail; draft calendar invite in your own calendar (Phase 2 tool); draft ERPNext quotation up to the department limit | The requester (self-confirm) | Only touches the requester's own data or a draft nobody else sees yet |
| Medium | Draft ERPNext quotation above the department limit (for example 50,000 EGP, set by Admin); editing a draft sales order owned by someone else; changing a customer's contact or delivery details | One Approver from the same department | No self-approval; the approver must also hold permission for that action in ERPNext |
| High | Any action above the finance limit (for example 250,000 EGP); bulk actions on more than 10 records; actions on behalf of another user | Two approvals: department Approver, then Admin or a Finance approver | Both approvals required, in order; neither may be the requester |
| Never via chat | Sending email, submitting or cancelling ERPNext documents, deleting records, changing permissions | Not available | These tools do not exist in the connectors; they stay manual inside the source system |

Example flow (medium):
1. Ahmed (Sales, Staff) asks: "Create a quotation for Customer X, 120 units, total 80,000 EGP."
2. mcp-erpnext builds the quotation payload and sends it to governance-api instead of ERPNext. The amount is above the Sales limit, so governance-api marks it Medium.
3. The request appears in the Approvals inbox (governance dashboard) for Sales approvers, and Mona (Sales Manager, Approver) is notified by email.
4. Mona sees the before and after view, then approves (or rejects with a required reason).
5. governance-api executes the action in ERPNext using Ahmed's credentials, so ERPNext's own permissions still apply to the person who asked, records the result and the ERPNext document link, and notifies Ahmed in chat.

Approval rules:
- Expiry (MVP): pending requests expire after 24 hours and must be requested again.
- Freshness check (MVP): when a request targets an existing record, governance-api stores the record's last-modified value (for ERPNext, the `modified` field). If it differs at confirm time, the request is cancelled and must be recreated, so nobody confirms or approves stale data.
- Separation of duties (Phase 2): nobody can approve their own Medium or High request.
- Delegation (Phase 2): Admin can set a temporary delegate for an approver who is away, with start and end dates; delegated approvals are marked as such in the log.
- Limits and approver lists (Phase 2) are configured per department by Admin in the governance dashboard.

- AC (MVP): no write reaches Outlook, Google or ERPNext without a recorded approval; rejected, expired or stale requests never execute; a quotation above `MVP_SELF_CONFIRM_LIMIT` is refused; updating another user's draft order is refused; each request stores requester, approver(s), risk level, payload, before and after view, decision, reason, result and timestamps.
- AC (Phase 2): a Medium request cannot be approved by its requester; a High request does not execute after only one approval; a delegated approval shows both the delegate and the original approver.

### FR-12 Audit log
- Record model calls (user, model, tokens, cost), tool calls (user, connector, tool, parameters summary) and approvals.
- AC: Admin can filter by user, date, connector and export to CSV.

### FR-13 Connector revocation
- Admin can disable a connector globally or for one user; a user can disconnect their own account.
- AC: after revocation, calls fail immediately, the user's stored credentials for that connector are deleted from the token vault (FR-17), and refresh tokens are revoked at the provider where the provider supports it.

### FR-14 Offboarding
- Removing a user from the identity provider removes access.
- AC: a removed user cannot sign in; all their credentials in the token vault are deleted and revoked at the provider; their data follows the retention policy.

### FR-15 Retention and deletion
- Configurable retention for conversations and files (for example 90 days); users can delete their own chats; Admin can delete a user's data.
- AC: data older than the retention period is removed by a scheduled job; deleted data is not restorable from the live system.

### FR-16 Governance dashboard
- Next.js app, signed in through the same identity provider. Two areas:
  - **User area (every signed-in user):** My pending actions (confirm or reject, FR-11), My connections (connect or disconnect Microsoft, Google and ERPNext accounts, FR-17), My usage.
  - **Admin area (Admin only):** spend overview, per-user usage, approvals log, audit search, connector health, connector revocation.
- Phase 2: My pending actions grows into the Approvals inbox for approvers, with email notifications.
- AC: a Staff user can open only the user area; every page checks the role on the server, not only in the UI.

### FR-17 Connected accounts and token vault
- Because governance-api executes approved actions later, it must hold each user's connector credentials. It is the only place that stores them.
- Connecting: the user connects each account from **My connections** (OAuth consent for Microsoft Graph and Google; Frappe OAuth for ERPNext, or a per-user API key and secret provisioned by Admin if OAuth is not set up).
- Storage: credentials encrypted at rest with AES-256-GCM, a random IV per record, a master key from a Docker secret (never in the database or git), and a key version field so the key can be rotated.
- Use: MCP servers never store long-lived credentials. For each call they ask governance-api, over the internal Docker network and authenticated with a service secret, for a short-lived access token for that user and connector. governance-api refreshes tokens as needed.
- Identity: MCP servers learn which user is calling from LibreChat's per-user request headers (verify the mechanism in the current docs), accept requests only from the internal network with the service secret, and never trust a user ID sent from the browser.
- Writes: after approval, governance-api executes the action with the requester's stored credentials and records the result.
- Tokens and secrets never appear in logs or audit records.
- AC: the database dump contains no readable tokens; disconnecting an account deletes its credentials immediately; an MCP request without the service secret is rejected.

## 6. Non-functional requirements

| Area | Requirement |
|---|---|
| Security | HTTPS everywhere; internal instance reachable only over Tailscale; secrets in a `.env` file outside the repo (or Docker secrets); API keys never sent to the browser; least-privilege scopes for Microsoft Graph and Google |
| Privacy | Per-user data isolation; delegated permissions for connectors; retention policy enforced |
| Reliability | Containers restart automatically; health checks; uptime monitoring (Uptime Kuma) |
| Backups | Nightly encrypted backups of MongoDB, PostgreSQL (vector store, audit, approvals) and uploaded files to off-server storage (Backblaze B2 or Cloudflare R2) using restic; keep 7 daily and 4 weekly |
| Recovery | Documented restore procedure; full restore tested on a clean server; target recovery time under 1 hour |
| Performance | Normal chat latency limited by the model provider; connector calls time out after 30 seconds with a clear error |
| Maintainability | Pinned image versions; one command to update; changelog of configuration changes |
| Cost | Under $15 per month for hosting extras plus model usage during testing |

## 7. Architecture

```
Users (browser) --Tailscale--> Caddy (HTTPS)
                                 |-- LibreChat (api + client)
                                 |      |-- MongoDB (chats, users)
                                 |      |-- Meilisearch (chat search)
                                 |      |-- RAG API + PostgreSQL/pgvector (file search)
                                 |      |-- Model providers: Anthropic, OpenAI, Ollama (local)
                                 |      '-- MCP servers (our code):
                                 |             |-- mcp-m365 (Microsoft Graph)
                                 |             |-- mcp-google (Gmail, Drive, Calendar)
                                 |             |-- mcp-erpnext (ERP, Frappe REST API)
                                 |             '-- mcp-analytics (read-only Postgres)
                                 |-- governance-api (Node.js/TypeScript): approvals, audit, spend, token vault
                                 |      '-- PostgreSQL (audit, approvals, spend, encrypted credentials)
                                 '-- governance-dashboard (Next.js)
Backups: restic -> Backblaze B2 / Cloudflare R2
Identity: Entra ID (OIDC), Google; Keycloak only in local dev
```

Design rules:
- Each MCP server is its own container, written in TypeScript (Node.js) with the official MCP SDK.
- MCP servers identify the calling user (via LibreChat's per-user headers; verify in current docs) and get **that user's** short-lived token from governance-api's token vault (FR-17) on every call. Never a shared admin token, and no long-lived tokens stored in MCP servers.
- All write tools call `governance-api` to create an approval request instead of executing directly.
- `governance-api` executes the action only after approval and records the result.

## 8. Go-live test plan

The deployment is "done" only when all of these pass and results are recorded in `docs/go-live-report.md`:

1. Restricted records: user A cannot see user B's chats, files or ERP records they lack access to.
2. Chat isolation: shared links and agents respect sharing settings.
3. Offboarding: removed user cannot sign in; tokens revoked.
4. Connector revocation: disabled connector fails immediately.
5. Approved providers only: an unapproved model is rejected server-side.
6. Per-person spend: a user over budget is blocked; dashboard numbers match provider usage within 5%.
7. Deletion: deleted chats and files are gone from the live system.
8. Retention: the scheduled job removes data older than the limit.
9. Backup and restore: restore onto a fresh server and verify chats, files and audit log.
10. Approved actions: every write in Outlook, Google and ERPNext has a matching approval record; a rejected action never executes.
11. Internal only: the instance is not reachable from the public internet.
12. Self-confirm limit: a quotation above `MVP_SELF_CONFIRM_LIMIT` is refused.
13. Ownership: updating another user's draft Sales Order is refused.
14. Expiry and freshness: a request older than 24 hours, or whose record changed after it was created, cannot be confirmed.
15. Token vault: the database contains no readable tokens; disconnecting an account deletes its credentials; an MCP request without the service secret is rejected.

## 9. Deliverables

- GitHub repository (public, without secrets) containing:
  - `docker-compose.yml`, `librechat.yaml`, `Caddyfile`, `.env.example`
  - `services/mcp-m365`, `services/mcp-google`, `services/mcp-erpnext`, `services/mcp-analytics`
  - `services/governance-api`, `apps/governance-dashboard`
  - `scripts/backup.sh`, `scripts/restore.sh`, `scripts/update.sh`
  - `docs/ARCHITECTURE.md`, `docs/RUNBOOK.md` (deploy, update, backup, restore, add a model, add a connector), `docs/ADMIN-GUIDE.md`, `docs/USER-TRAINING.md` (for non-developers), `docs/go-live-report.md`
- A 3 to 5 minute demo video: sign in with Entra ID, ask a question over a document, ask ERPNext for low stock, ask for a draft quotation, confirm it on My pending actions, open it in ERPNext, then show it in the audit log and spend dashboard.
- A short case study for Upwork and LinkedIn.

## 10. Milestones

| Week | Work |
|---|---|
| Week 1 | VPS hardening, Docker Compose, Caddy, Tailscale, LibreChat with Claude, OpenAI and Ollama; Entra ID and Google sign-in; model allowlist and limits; RAG |
| Week 2 | ERPNext running with demo data; governance-api (approvals, audit, spend, token vault); My pending actions and My connections pages; mcp-erpnext and mcp-analytics; self-confirm flow end to end |
| Week 3 | mcp-m365 and mcp-google; governance dashboard admin area; backups and restore drill; go-live tests; docs and demo video |

## 11. Prerequisites I need to prepare

- VPS (have it): Ubuntu LTS with Docker installed. LibreChat plus ERPNext needs about 8 GB RAM; add more if running Ollama locally, or run ERPNext on a second small server.
- Domain or subdomain for the demo instance.
- Tailscale account (free).
- Microsoft Entra ID tenant (free tier) with an app registration; Microsoft 365 mailbox for Graph testing (a developer or trial tenant).
- Google Cloud project with OAuth client and Gmail, Drive, Calendar APIs enabled; a test Google account.
- ERPNext instance with demo data, using the official frappe_docker setup. Create two or three test users with different roles to test permissions.
- Anthropic and OpenAI API keys with small spending limits.
- Backblaze B2 or Cloudflare R2 bucket for backups.

## 12. Risks and open questions

- LibreChat feature availability (approval gates, per-user MCP auth, balance settings) depends on version. Mitigation: check the installed version's docs first; implement gaps in governance-api.
- Microsoft 365 test tenant access can be limited. Mitigation: start with Google Workspace connector; add Graph once a tenant is available.
- VPS memory with ERPNext and Ollama on the same server. Mitigation: skip local models, use a small one, or move ERPNext to its own server.
- Cost of model APIs during testing. Mitigation: hard spending limits at the provider and in LibreChat.

## 13. Instructions for Claude Code

1. Read this BRD fully. Then read the current LibreChat docs for: Docker deployment, `librechat.yaml` custom endpoints, OpenID and Google auth, balance and token limits, RAG API, Agents, and MCP servers configuration. Write a short `docs/DECISIONS.md` noting which features exist in the installed version and which we build ourselves.
2. Work milestone by milestone (section 10). Do not start a milestone until the previous one's acceptance criteria pass.
3. Keep secrets out of git. Provide `.env.example` with every variable documented, including `MVP_SELF_CONFIRM_LIMIT`, the service secret and the token vault master key reference.
4. Write TypeScript for all custom services, with tests for the approval flow and permission checks.
5. After each milestone, update `docs/RUNBOOK.md` and add the matching go-live tests.
6. Never let a connector perform a write without an approval record. This rule has no exceptions.

## 14. Sources

- SSOJet, Enterprise SSO adoption report: https://ssojet.com/research-reports/enterprise-sso-adoption-2026
- Metorial, Best MCP servers for enterprise teams (2026): https://metorial.com/answers/best-mcp-servers-enterprise
- Gosign, Enterprise AI chat interface requirements: https://www.gosign.de/en/magazine/enterprise-ai-chat-interface/
- LibreChat 2026 roadmap: https://www.librechat.ai/blog/2026-02-18_2026_roadmap
- LibreChat docs: https://www.librechat.ai/docs
