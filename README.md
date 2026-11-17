# Company AI Workspace

A production-style, self-hosted AI workspace built on [LibreChat](https://www.librechat.ai): company sign-on (Entra ID, Google), approved models per role, per-user budgets, document search, MCP connectors to Microsoft 365, Google Workspace and ERPNext, a human approval queue for every write action, an audit log, and tested backups.

Built as a portfolio delivery. The requirements live in [docs/BRD-Company-AI-Workspace.md](docs/BRD-Company-AI-Workspace.md), and what LibreChat provides vs. what is custom is in [docs/DECISIONS.md](docs/DECISIONS.md).

## Status

| Milestone | State |
|---|---|
| Week 1: LibreChat stack, CI/CD, HTTPS over Tailscale, SSO, model allowlist, budgets, RAG | in progress |
| Week 2: ERPNext, governance-api (approvals, audit, spend, token vault), mcp-erpnext, mcp-analytics | planned |
| Week 3: mcp-m365, mcp-google, governance dashboard, backups and restore drill, go-live tests | planned |

## Layout

```
deploy/compose.yaml        pinned stack (LibreChat v0.8.8, Admin Panel, MongoDB, Meilisearch, pgvector, RAG API)
deploy/librechat.yaml      LibreChat config (retention, budgets, tool deny-list)
deploy/.env.example        every variable, documented; real .env exists only on the server
scripts/bootstrap-env.sh   one-time: create .env on the server with generated secrets
scripts/deploy.sh          pull, start, health-check (run by CI on the server)
.github/workflows/         validate on every push/PR, deploy on main
```

## How it is deployed

- Internal only: every port binds to the server's Tailscale IP; nothing is published on the public interface. HTTPS comes from `tailscale serve`.
- CI/CD: a push to `main` validates the config, uploads `deploy/` and `scripts/` to `/opt/company-ai` over SSH, and runs `deploy.sh`, which fails the job if LibreChat is unhealthy or rejects its config.
- Secrets: generated on the server by `bootstrap-env.sh`; GitHub holds only the deploy SSH key and host details.
