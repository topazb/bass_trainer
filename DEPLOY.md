# Deployment Guide

CI/CD is handled by GitHub Actions + GitHub Container Registry (ghcr.io).  
Every push to `master` builds both images, pushes them to ghcr.io, and deploys to the OCI server.

Everything here is **free**:
- GitHub Actions: 2,000 min/month on free plan (builds take ~3–5 min each)
- ghcr.io: free for public packages; free up to 500 MB storage for private
- OCI VM: Always Free tier (provisioned via `oci-infra/`)

---

## How the pipeline works

```
git push master
       │
       ▼
  GitHub Actions
  ├── Build backend image  → ghcr.io/topazb/bass-trainer-backend:latest
  ├── Build frontend image → ghcr.io/topazb/bass-trainer-frontend:latest
  │
  └── SSH into OCI server
       ├── git pull (gets latest docker-compose.prod.yml)
       ├── docker compose pull (downloads new images)
       ├── docker compose up -d (restarts changed containers)
       └── docker image prune (cleans up old layers)
```

---

## One-time setup

### 1. Create a GitHub Personal Access Token (PAT)

The server uses this to pull images and do `git pull`.

1. Go to **github.com/settings/tokens/new** (classic token)
2. Name: `bass-trainer-deploy`
3. Scopes: check `repo` + `read:packages`
4. Generate and **copy the token**

---

### 2. Add GitHub Actions secrets

Go to **github.com/topazb/bass_trainer/settings/secrets/actions** and add:

| Secret | Value |
|--------|-------|
| `OCI_HOST` | Your server's public IP (from `terraform output public_ip`) |
| `OCI_SSH_KEY` | Contents of the private key that accesses the server (e.g. `cat ~/.ssh/id_ed25519`) |
| `GHCR_TOKEN` | The PAT you created in step 1 |

---

### 3. First-time server setup

SSH into your server once to clone the repo and create the env file:

```bash
ssh ubuntu@<your-server-ip>
```

```bash
# Clone the repo
git clone https://github.com/topazb/bass_trainer.git ~/bass_trainer

# Create environment file (Docker Compose picks this up automatically)
cat > ~/bass_trainer/.env <<'EOF'
FRONTEND_URL=http://<your-server-ip>
BACKEND_URL=http://<your-server-ip>:8000
ALLOWED_ORIGINS=http://<your-server-ip>
ADMIN_SECRET=pick_a_strong_secret_here
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
EOF

# Add your audio files (optional)
mkdir -p ~/bass_trainer/audio/rhythm ~/bass_trainer/audio/improv
# scp your mp3s here, or skip if you don't have any

# First manual deploy (just to verify everything works)
echo "<your-ghcr-token>" | docker login ghcr.io -u topazb --password-stdin
docker compose -f ~/bass_trainer/docker-compose.prod.yml pull
docker compose -f ~/bass_trainer/docker-compose.prod.yml up -d
```

After this, every `git push master` handles deployments automatically.

---

### 4. (Optional) Make packages public

If you'd rather skip `GHCR_TOKEN` entirely:

1. Push to master once (this creates the packages)
2. Go to **github.com/topazb?tab=packages**
3. Open each package → **Package settings** → Change visibility → **Public**
4. Remove the `docker login` line from the deploy script in `.github/workflows/deploy.yml`

---

## Useful commands

```bash
# Check running containers
ssh ubuntu@<ip> 'docker compose -f ~/bass_trainer/docker-compose.prod.yml ps'

# Follow logs
ssh ubuntu@<ip> 'docker compose -f ~/bass_trainer/docker-compose.prod.yml logs -f'

# Manually trigger a redeploy (same steps CI runs)
ssh ubuntu@<ip> 'cd ~/bass_trainer && git pull && docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d'
```

---

## Troubleshooting

**Build fails with "permission denied" on packages**  
→ Check the workflow has `permissions: packages: write` (it does by default in this repo)

**Deploy fails with "Host key verification failed"**  
→ The server's host key isn't known yet. Add this to the ssh-action step:
```yaml
        with:
          host_key_checking: false  # only safe for known-IP servers
```

**`docker compose pull` shows "unauthorized"**  
→ The `GHCR_TOKEN` secret is missing or expired — recreate it and update the GitHub secret

**App not responding after deploy**  
→ Check logs: `docker compose -f ~/bass_trainer/docker-compose.prod.yml logs backend`
