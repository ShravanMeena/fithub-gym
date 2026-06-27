# Deploying FitHub to GCP (Compute Engine)

One small VM runs everything in Docker: the **API**, the **web panels**
(landing / admin / platform), the **SQLite DB** and **uploaded files**, with
**automatic HTTPS** via Caddy. Cost: **free** on `e2-micro`, ~$13/mo on `e2-small`.

---

## 0. Prerequisites
- A GCP account + a project (billing enabled).
- A **domain** (or subdomain) you can point at the server, e.g. `api.yourgym.com`.
  HTTPS needs a domain — iOS won't talk to a raw-IP HTTP server in release builds.
- The `gcloud` CLI installed locally (optional — you can do everything in the web console).

---

## 1. Create the VM (free tier)
In **Compute Engine → VM instances → Create**, or via CLI:

```bash
gcloud compute instances create fithub \
  --machine-type=e2-micro \
  --zone=us-central1-a \
  --image-family=debian-12 --image-project=debian-cloud \
  --boot-disk-size=20GB \
  --tags=http-server,https-server
```

> `e2-micro` in `us-central1`/`us-west1`/`us-east1` is in the always-free tier.
> Use `e2-small` for more headroom. The 20 GB disk holds the OS + your DB + uploads.

Allow web traffic (the `http-server`/`https-server` tags usually add these; if not):
```bash
gcloud compute firewall-rules create allow-web --allow=tcp:80,tcp:443 --target-tags=http-server,https-server
```

---

## 2. Point your domain at the VM
Copy the VM's **External IP** (from the VM list), then at your DNS provider add:

```
A   api.yourgym.com   ->   <VM_EXTERNAL_IP>
```

Wait a couple of minutes for it to propagate.

---

## 3. SSH in and install Docker
```bash
gcloud compute ssh fithub --zone=us-central1-a
# then on the VM:
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin git
sudo usermod -aG docker $USER && newgrp docker   # run docker without sudo
```

---

## 4. Get the code onto the VM
Easiest is git (push this repo to GitHub first), or `scp` it up:
```bash
git clone <your-repo-url> fithub && cd fithub
# (or)  gcloud compute scp --recurse ./gym fithub:~/fithub --zone=us-central1-a
```

---

## 5. Configure secrets
```bash
cp .env.production.example .env.production
nano .env.production
```
Fill in:
- `DOMAIN=api.yourgym.com`
- `JWT_SECRET=` a long random string (`openssl rand -hex 32`)
- `AWS_REGION / AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / BEDROCK_MODEL_ID`, `MOCK_AI=0`
- `SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD` (your platform login)

---

## 6. Launch 🚀
```bash
docker compose up -d --build
```
Caddy automatically fetches a Let's Encrypt certificate for your domain. Check it:
```bash
curl https://api.yourgym.com/health      # {"ok":true,"ai":"bedrock"}
```
Your panels are now live:
- Landing / gym signup → `https://api.yourgym.com/`
- Gym-owner panel       → `https://api.yourgym.com/admin.html`
- Platform (you)        → `https://api.yourgym.com/platform.html`

---

## 7. Point the app at production
In `GymApp/src/api/config.ts` set:
```ts
export const PROD_API_URL = 'https://api.yourgym.com/api';
```
Then rebuild the app (`npm run ios` / `run-android`, or your release build). Done —
the app now uses the live server from anywhere (no Wi-Fi requirement).

---

## Updating later (redeploy)
```bash
cd ~/fithub && git pull && docker compose up -d --build
```
or use the helper: `./deploy.sh`

## Your data is safe across deploys
SQLite + all uploaded photos/videos live in the Docker volume **`gymdata`**
(`/app/backend/data`). Rebuilds/restarts do **not** touch it.

**Back it up** periodically:
```bash
docker run --rm -v fithub_gymdata:/data -v $PWD:/backup busybox \
  tar czf /backup/fithub-backup-$(date +%F).tgz -C /data .
```

---

## Notes & next steps
- **No domain yet, just testing?** You can run the API on the IP over HTTP
  (`docker run -p 80:4000 ...`), but iOS release builds won't connect over plain
  HTTP — get a domain for anything real. A `.com` is ~₹800/yr; subdomains are free.
- **AWS keys on GCP:** keep them as env vars in `.env.production` (you can't use an
  AWS IAM role off-AWS). Scope the key to `bedrock:InvokeModel` only.
- **Scaling later:** when one VM isn't enough, migrate SQLite → Cloud SQL (Postgres)
  and disk uploads → a GCS bucket; then Cloud Run becomes an option.
