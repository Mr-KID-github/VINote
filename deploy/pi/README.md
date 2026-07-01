# Raspberry Pi Deployment

VINote now supports two Raspberry Pi deployment paths:

- Manual deployment from a developer machine
- Automatic deployment on the Pi itself through a GitHub Actions self-hosted runner

Use the automatic path for the shared `dev` test environment. Keep the manual scripts as the fallback for emergency redeploys and local debugging.

## Manual deployment from a developer machine

Recommended order:

1. Create the root `.env` from `.env.example`
2. Copy `deploy/pi/local.env.example` to `deploy/pi/local.env`
3. Run bootstrap once to prepare Docker, Docker Compose, and the remote app directory
4. Run the deploy script

### Bootstrap

PowerShell:

```powershell
.\deploy\pi\bootstrap-pi.ps1
```

Bash:

```bash
./deploy/pi/bootstrap-pi.sh
```

Bootstrap will:

- install Docker Engine if it is missing
- install the Docker Compose plugin, with `docker-compose` as a fallback
- enable and start the Docker service
- add the target user to the `docker` group
- create the remote app directory plus `data/` and `output/`

If bootstrap adds the user to the `docker` group, open a new SSH session before the first deploy.

### Deploy

Interactive PowerShell:

```powershell
.\deploy\pi\deploy-pi-interactive.ps1
```

Interactive Bash:

```bash
./deploy/pi/deploy-pi-interactive.sh
```

Non-interactive PowerShell:

```powershell
.\deploy\pi\deploy-pi.ps1
```

Non-interactive Bash:

```bash
./deploy/pi/deploy-pi.sh
```

### Current manual deploy behavior

- detects both `docker compose` and `docker-compose`
- can launch bootstrap from the interactive flow when Docker checks fail
- preserves `PI_REMOTE_DIR` and `PI_ENV_FILE` in `deploy/pi/local.env`
- accepts UTF-8 BOM `local.env` files created by PowerShell

## Automatic deployment from GitHub Actions

The automatic `dev` deployment no longer depends on a developer laptop. The Raspberry Pi runs a GitHub Actions self-hosted runner and deploys the checked-out repository locally.

### Design

- Workflow file: `.github/workflows/deploy-pi-dev.yml`
- Trigger: `push` to `dev` and `workflow_dispatch`
- Runner labels: `self-hosted`, `linux`, `arm`, `pi`, `vinote-test`
- GitHub Environment: `pi-test`
- Deploy script: `deploy/pi/deploy-from-checkout.sh`
- App directory on the Pi: `/home/zouyu/vinote` by default

### One-time setup on the Pi

1. Install Docker and Docker Compose
2. Create a dedicated GitHub Actions runner directory, for example `/home/zouyu/actions-runner`
3. Register the runner against this repository with the labels `self-hosted,linux,arm,pi,vinote-test`
4. Install the runner as a service so it stays online after reboots
5. Add the runner user to the `docker` group
6. Keep the runner work directory separate from the app directory `/home/zouyu/vinote`

If you add the runner user to the `docker` group, restart the runner service or log in again before the first workflow run.

### Step-by-step setup checklist

Follow this order on the Raspberry Pi:

1. Log in to the Pi with the account that should own both the runner and the app directory.
2. Install Docker and Docker Compose if they are not already present.
3. Ensure the target app directory exists:

```bash
mkdir -p /home/zouyu/vinote/data /home/zouyu/vinote/output
```

4. Create a runner working directory that is separate from the app directory:

```bash
mkdir -p /home/zouyu/actions-runner
cd /home/zouyu/actions-runner
```

5. In GitHub, open this repository and go to:
   `Settings -> Actions -> Runners -> New self-hosted runner`
6. Choose Linux and ARM, then copy the download and configuration commands shown by GitHub.
7. Run the commands on the Pi and add these labels during configuration:
   `self-hosted,linux,arm,pi,vinote-test`
8. Install the runner as a service and start it:

```bash
sudo ./svc.sh install
sudo ./svc.sh start
```

9. Add the runner user to the `docker` group:

```bash
sudo usermod -aG docker zouyu
```

10. Restart the runner service after the group change:

```bash
sudo ./svc.sh stop
sudo ./svc.sh start
```

11. In GitHub, create the `pi-test` Environment and fill in the required secret and variables listed below.
12. Merge a PR into `dev` or trigger the workflow manually from the Actions tab.

Verification on the Pi:

```bash
docker --version
docker compose version || docker-compose version
id -nG
sudo ./svc.sh status
```

Expected result:

- the runner shows as `Idle` or `Active` in GitHub
- the user groups include `docker`
- `/home/zouyu/vinote/data` and `/home/zouyu/vinote/output` still exist after deploys

### GitHub Environment configuration

Create a GitHub Environment named `pi-test` and set:

- Secret `PI_TEST_ENV_FILE`
  - value: the full root `.env` file contents for the Pi test environment
- Variable `PI_REMOTE_DIR`
  - default: `/home/zouyu/vinote`
- Variable `FRONTEND_PORT`
  - default: `3100`
- Variable `BACKEND_PORT`
  - default: `8900`
- Variable `DOCS_PORT`
  - default: `3101`

The workflow writes `PI_TEST_ENV_FILE` into the checked-out workspace as `.env`, then `deploy-from-checkout.sh` refreshes the target directory and copies that `.env` into `/home/zouyu/vinote/.env`.

### GitHub-side checklist

1. Open the repository on GitHub.
2. Go to `Settings -> Environments`.
3. Create an environment named `pi-test`.
4. Add secret `PI_TEST_ENV_FILE`.
   - Paste the full contents of your production-like root `.env` for the Pi test environment.
5. Add variable `PI_REMOTE_DIR` with value `/home/zouyu/vinote`.
6. Add variable `FRONTEND_PORT` with value `3100`.
7. Add variable `BACKEND_PORT` with value `8900`.
8. Add variable `DOCS_PORT` with value `3101`.
9. Do not enable a reviewer gate if you want `dev` merges to deploy immediately.
10. Open `Actions` and confirm the `Deploy Pi Test Environment` workflow is visible.

If the workflow fails before deploy starts, check:

- the runner is online
- the runner labels match exactly
- `PI_TEST_ENV_FILE` is not empty
- the runner user is still in the `docker` group

### What the workflow does

1. Checks out the merge result on the self-hosted runner
2. Writes `.env` from `PI_TEST_ENV_FILE`
3. Verifies Docker, Docker Compose, `curl`, and docker-group membership
4. Runs `deploy/pi/deploy-from-checkout.sh`
5. Rebuilds and restarts the stack with `docker compose up -d --build --remove-orphans`
6. Smoke-checks backend, frontend, and docs on `127.0.0.1`
7. Dumps service logs if the deployment fails

### Manual trigger flow

If you do not want every merge to `dev` to deploy immediately, the safest operating mode is to keep only `workflow_dispatch` enabled and trigger the workflow manually after you finish local checks and CI checks.

Manual trigger in GitHub means:

1. Open the repository on GitHub
2. Go to `Actions`
3. Open the workflow `Deploy Pi Test Environment`
4. Click `Run workflow`
5. Choose the target branch, usually `dev`
6. Confirm the run

You do not need to SSH into the Pi or run deployment commands from your laptop for that path. GitHub schedules the job, the Pi runner picks it up, and the Pi deploys locally.

If you later enable Environment reviewers, GitHub will wait for approval before the deploy job starts. Without reviewers, manual trigger is simply a button in the Actions UI.

### What `deploy-from-checkout.sh` preserves

The script refreshes the target app directory while keeping:

- `data/`
- `output/`

It also rewrites `.env` from the GitHub Environment secret so the deployed config stays in sync with repository automation.

### Data retention and safety notes

Under the current deployment design, a normal deploy should preserve existing team data, notes, and generated artifacts.

Why data is retained:

- Postgres uses a named Docker volume in `docker-compose.yml`
- the deploy script refreshes the app checkout but keeps `data/` and `output/`
- the workflow runs `docker compose up -d --build --remove-orphans`
- the workflow does not run `docker compose down -v`

What is normally preserved after deploy:

- database-backed users, teams, notes, and settings
- existing files under `/home/zouyu/vinote/data`
- existing files under `/home/zouyu/vinote/output`

What can still cause data loss or an unsafe deploy:

- manually running `docker compose down -v`
- manually deleting Docker volumes
- manually deleting `/home/zouyu/vinote/data` or `/home/zouyu/vinote/output`
- changing `PI_REMOTE_DIR` to a different app directory by mistake
- changing `COMPOSE_PROJECT_NAME` in a way that points Compose at a different project
- introducing destructive database migrations

Recommended practice for a shared LAN environment:

- do local validation first
- let PR CI complete
- trigger Pi deployment manually when you decide the shared environment can be updated
- treat `docker compose down -v` as a destructive recovery command, not a normal deployment command

## Troubleshooting

- Runner offline: the workflow will stay queued or fail before checkout. Check the GitHub Actions runner service on the Pi.
- Docker unavailable: rerun the manual bootstrap scripts or verify Docker is installed and the service is running.
- Docker permission errors: confirm the runner user is in the `docker` group.
- Bad `.env`: update the `PI_TEST_ENV_FILE` secret and rerun the workflow through `workflow_dispatch`.
- Emergency rollback or quick retry: use the manual scripts from a developer machine as a fallback.
