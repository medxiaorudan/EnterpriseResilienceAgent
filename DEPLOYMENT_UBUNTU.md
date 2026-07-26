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
  - `22` for SSH
  - `8080` for HTTP

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

```bash
sudo ufw allow OpenSSH
sudo ufw allow 8080/tcp
sudo ufw enable
sudo ufw status
```

## Clone The Repository

```bash
mkdir -p ~/apps
cd ~/apps
git clone https://github.com/medxiaorudan/EnterpriseResilienceAgent.git
cd EnterpriseResilienceAgent
git checkout main
git pull
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

DATABASE_URL=postgres://postgres:postgres@postgres:5432/enterprise_resilience_agent
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=enterprise_resilience_agent
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
WorkingDirectory=/home/deploy/apps/EnterpriseResilienceAgent
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

## Backups

Backup Postgres:

```bash
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U postgres enterprise_resilience_agent > backup.sql
```

Restore Postgres:

```bash
cat backup.sql | docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres enterprise_resilience_agent
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
