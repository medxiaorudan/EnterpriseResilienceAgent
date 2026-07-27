# Ubuntu Deployment Guide

This guide explains how to deploy Enterprise Resilience Agent on an Ubuntu server with Docker Compose.

## What You Get

- Web dashboard on port `8080`
- API under `/api`
- Postgres for incidents, approvals, runbooks, and audit history
- Redis for idempotency and execution locks

## Recommended Server

- Ubuntu `22.04` or `24.04`
- `2 vCPU`
- `4 GB RAM`
- `20 GB` disk
- Open ports:
  - your SSH port (`22` by default)
  - `8080` for HTTP

**Those figures are for running the stack, not building it.** `docker compose up --build` runs two
`npm ci` installs over a five-workspace monorepo, which needs materially more memory than serving does.
On a `4 GB` box, build one service at a time rather than in parallel:

```bash
docker compose -f docker-compose.prod.yml build api
docker compose -f docker-compose.prod.yml build web
```

## Install System Packages

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg git ufw
```

Optional:

```bash
sudo timedatectl set-timezone UTC
```

## Install Docker

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
```

```bash
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Verify:

```bash
docker --version
docker compose version
```

Allow Docker for your current user:

```bash
sudo usermod -aG docker $USER
newgrp docker
```

## Open Firewall

⚠️ **Check your SSH port before enabling this.** `ufw allow OpenSSH` opens port `22` only. If your
`sshd` listens anywhere else, enabling a default-deny firewall will lock you out of your own server —
confirm with `grep -i '^port' /etc/ssh/sshd_config` and allow that port instead.

⚠️ **If you reach this host through a VPN, a tunnel or a reverse proxy, that path can be cut too.**
A default-deny policy applies to those interfaces as well. Verify you still have a way in before you
disconnect.

```bash
sudo ufw allow OpenSSH          # port 22 — change if your sshd uses another
sudo ufw allow 8080/tcp
sudo ufw --force enable         # --force: plain `enable` prompts y/n and stalls a script
sudo ufw status
```

## Clone The Repository

```bash
mkdir -p ~/apps
cd ~/apps
git clone https://github.com/medxiaorudan/EnterpriseResilienceAgent.git
cd EnterpriseResilienceAgent
```

## Create `.env`

```bash
cp .env.example .env
nano .env
```

Use values like these:

```env
APP_ENVIRONMENT=production
DEPLOYMENT_MODE=container
APP_BASE_URL=http://YOUR_SERVER_IP:8080
API_PUBLIC_URL=http://YOUR_SERVER_IP:8080/api

# Required. Compose fails to start if this is unset, and it is the password the
# postgres container is created with. Use something generated, not a word:
#   openssl rand -base64 24 | tr -d '/+=' | head -c 24
DB_PASSWORD=CHANGE_ME

# DATABASE_URL is derived from DB_PASSWORD in docker-compose.prod.yml, so it does
# not need setting here for a container run. The DB_* values below apply only
# when you run the API outside Docker against a local Postgres.
DB_HOST=postgres
DB_PORT=5432
DB_USER=resilience
DB_NAME=resilience
DB_SSL=false

REDIS_URL=redis://redis:6379
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

AWS_ECS_LIVE_EXECUTION=false
AWS_EXECUTION_ROLE_ARN=
AWS_EXECUTION_EXTERNAL_ID=
AWS_ECS_ALLOWED_TARGETS=[{"serviceId":"checkout-api","clusterArn":"arn:aws:ecs:eu-west-1:123456789012:cluster/checkout-production","ecsServiceName":"checkout-api","region":"eu-west-1","minDesiredCount":2,"maxDesiredCount":8,"scaleStep":2,"rollbackRunbookId":"aws-ecs-restore-service-count","environments":["production"]}]

VITE_API_BASE_URL=/api
```

Important:

- inside Docker Compose, Postgres host must be `postgres`
- inside Docker Compose, Redis host must be `redis`
- keep `AWS_ECS_LIVE_EXECUTION=false` until live guardrails are verified

## Start The Stack

```bash
docker compose -f docker-compose.prod.yml --env-file .env up --build -d
```

Check status:

```bash
docker compose -f docker-compose.prod.yml ps
```

## Check Logs

```bash
docker compose -f docker-compose.prod.yml logs -f
```

Per service:

```bash
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f web
docker compose -f docker-compose.prod.yml logs -f postgres
docker compose -f docker-compose.prod.yml logs -f redis
```

## Verify Deployment

Open:

- `http://YOUR_SERVER_IP:8080/overview`
- `http://YOUR_SERVER_IP:8080/platform`
- `http://YOUR_SERVER_IP:8080/approvals`
- `http://YOUR_SERVER_IP:8080/audit`

Check the API:

```bash
curl http://YOUR_SERVER_IP:8080/api/platform/status
```

## Update Deployment

```bash
cd ~/apps/EnterpriseResilienceAgent
git pull
docker compose -f docker-compose.prod.yml --env-file .env up --build -d
```

## Restart Or Stop

```bash
docker compose -f docker-compose.prod.yml restart
docker compose -f docker-compose.prod.yml down
```

## Start On Reboot

Create:

```bash
sudo nano /etc/systemd/system/enterprise-resilience-agent.service
```

Use:

```ini
[Unit]
Description=Enterprise Resilience Agent
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
# Must match where you cloned the repo, and must run as the user who owns it —
# `docker compose` resolves .env and the compose files relative to this path.
User=YOUR_USER
WorkingDirectory=/home/YOUR_USER/apps/EnterpriseResilienceAgent
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml --env-file .env up -d
ExecStop=/usr/bin/docker compose -f docker-compose.prod.yml down
RemainAfterExit=yes
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

Then enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable enterprise-resilience-agent
sudo systemctl start enterprise-resilience-agent
sudo systemctl status enterprise-resilience-agent
```

If your repo path is different, update `WorkingDirectory`.

## HTTPS Later

For production use, place Nginx or Caddy in front and serve:

- `https://your-domain.com`
- `https://your-domain.com/api`

After that, update:

```env
APP_BASE_URL=https://your-domain.com
API_PUBLIC_URL=https://your-domain.com/api
```

Then redeploy:

```bash
docker compose -f docker-compose.prod.yml --env-file .env up --build -d
```

## Reverse Proxy For MCP HTTP

If you expose the remote MCP HTTP transport, proxy both the MCP path and the OAuth discovery routes.

Example Nginx configuration:

```nginx
server {
    listen 443 ssl http2;
    server_name ops.example.com;

    location /mcp {
        proxy_pass http://127.0.0.1:3101/mcp;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Authorization $http_authorization;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
    }

    location /.well-known/oauth-authorization-server {
        proxy_pass http://127.0.0.1:3101/.well-known/oauth-authorization-server;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /.well-known/oauth-protected-resource/ {
        proxy_pass http://127.0.0.1:3101/.well-known/oauth-protected-resource/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /healthz {
        proxy_pass http://127.0.0.1:3101/healthz;
    }
}
```

Recommended MCP environment variables for reverse-proxied production use:

```env
ERA_MCP_PUBLIC_URL=https://ops.example.com/mcp
ERA_MCP_OIDC_ISSUER=https://login.example.com/realms/platform
ERA_MCP_OIDC_AUDIENCE=enterprise-resilience-mcp
ERA_MCP_OIDC_JWKS_URL=https://login.example.com/realms/platform/protocol/openid-connect/certs
ERA_MCP_OIDC_AUTHORIZATION_ENDPOINT=https://login.example.com/realms/platform/protocol/openid-connect/auth
ERA_MCP_OIDC_TOKEN_ENDPOINT=https://login.example.com/realms/platform/protocol/openid-connect/token
ERA_MCP_HTTP_PORT=3101
ERA_MCP_HTTP_HOST=127.0.0.1
```

## Backups

⚠️ **Your database is not inside the repo directory.** `postgres_data` and `redis_data` are Docker
named volumes, which live under `/var/lib/docker/volumes` — so backing up your home directory, or the
cloned repo, captures **none** of your data. A dump is the only thing here that protects it.

Run it on a schedule rather than by hand. A systemd timer calling the command below, writing to a
directory your existing backups already cover, is enough. Verify a dump restores into a scratch
database before trusting it.

Backup Postgres:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U resilience resilience > backup.sql
```

Restore Postgres:

```bash
cat backup.sql | docker compose -f docker-compose.prod.yml exec -T postgres psql -U resilience resilience
```

## Security Checklist

- change the default Postgres password
- use HTTPS before production rollout
- do not expose Postgres or Redis publicly
- keep Ubuntu and Docker patched
- keep `AWS_ECS_LIVE_EXECUTION=false` until tested
- use a bounded AWS execution role for live mode

## Troubleshooting

If the web page loads but API calls fail:

```bash
docker compose -f docker-compose.prod.yml logs -f web
docker compose -f docker-compose.prod.yml logs -f api
```

If Postgres or Redis connection fails, confirm the container hostnames in `.env` are `postgres` and `redis`.
