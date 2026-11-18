# Auto-deploy: the servers deploy themselves from GitHub (AD, 18 Nov 2026)

Each instance on cp2 (staging and production) deploys itself. A cron job runs every 2 minutes as the app user (`najamussaqib`, never root). It looks at its branch on GitHub, and when there is a new commit it builds and tests it in a **new release folder**. It switches to the new release only if everything passes. No GitHub Actions are involved, and nobody deploys by hand any more: **merging is the only way to deploy.**

This replaces the old in-place `scripts/auto-deploy.sh` / `scripts/deploy.sh` and CI's SSH deploy jobs. The scripts are in `scripts/autodeploy/`.

## Branches

| Instance | Follows | How a change gets there |
|---|---|---|
| staging (`staging.flatmeta.io`) | `v2` | Merge (or push) to `v2`: live on staging within about 10 minutes |
| production (`www.flatmeta.io`) | `production` | **The owner approves** by merging `v2` into `production` on GitHub: open a pull request from `v2` to `production` and press **Merge**. The very first time, create the branch: GitHub → Branches → **New branch** → name `production`, source `v2` |

Production never takes a commit from `v2` directly. Until the branch `production` exists, the production cron waits, and says so once in its log.

## What a deploy does

Every new commit on the branch goes through these steps:
1. `git clone` into `releases/<sha>.tmp` from the server's read-only copy of the repo (`repo.git`).
2. Link `.env` and `logs/` to `shared/`.
3. `npm ci`, build (shared, API, web), then tests. `DEPLOY_TESTS=quick` (the default) runs typecheck plus the web unit tests. `full` adds the API tests and needs `DATABASE_URL_TEST` on its own database. `off` runs none.
4. A database backup (`pg_dump`), then migrations. They are expand-only, so the live release keeps working on the new schema.
5. **Switch**: the symlink `flatmeta` → `releases/<sha>`, in one atomic rename.
6. PM2 reload from that stable path, with no downtime.
7. **`/readyz` must show the new commit** for both the web build and the API, within 90 s.
8. A smoke test against the public URL.

**If any step fails:**
- **Before the switch:** the live release is never touched, and the temporary folder is deleted.
- **After the switch:** it switches back to the previous release and reloads it.
- **Either way:** the commit goes into `shared/state/failed-shas`, so cron never retries it, and the admins get an email naming the failing step with the end of the log. Staging emails only on failure; production emails every result.

## Layout (per instance)

```
/home/flatmeta/web/<domain>/private/
  flatmeta  -> releases/<sha>    the live release; the same path as before, now a symlink
  releases/<sha>/                the live one, the previous one, plus KEEP_RELEASES older ones (default 2)
  repo.git                       read-only copy of GitHub
  shared/.env                    the only .env (mode 600); every release links to it
  shared/state/                  current, previous, failed-shas, paused, history, lock
  shared/logs/autodeploy.log     one line per event
  shared/logs/runs/              the full log of each deploy (the last 40)
  bin/autodeploy.sh              the runner (updated from each successful release)
```

## Commands (as najamussaqib)

Replace `<domain>` with `staging.flatmeta.io` or `flatmeta.io`.

| What | Command |
|---|---|
| Status: live, previous, tip, failed, readyz | `bash /home/flatmeta/web/<domain>/private/bin/autodeploy.sh status` |
| **Roll back** to the previous release (no build, about 10 s) | `bash /home/flatmeta/web/<domain>/private/bin/autodeploy.sh rollback` |
| Roll back to an older kept release | `bash …/bin/autodeploy.sh rollback <sha>` |
| Deploy the tip now, even a commit that failed before | `bash …/bin/autodeploy.sh deploy` |
| **Pause** automatic deploys | `bash …/bin/autodeploy.sh pause` |
| Resume | `bash …/bin/autodeploy.sh resume` |
| Follow the log | `tail -f /home/flatmeta/web/<domain>/private/shared/logs/autodeploy.log` |
| The last deploy in full | `ls -t /home/flatmeta/web/<domain>/private/shared/logs/runs/ \| head -1` |

Pausing stops the cron from deploying: manual `deploy` and `rollback` still work, and so does the daily database backup. To stop it completely, set `AUTO_DEPLOY=false` in `shared/.env`.

After a rollback, cron will not redeploy the commit you left only if that commit is in `failed-shas`. Otherwise it deploys the tip again on its next tick, so to stay rolled back, **pause first**.

## GitHub access

The repository is read through `repo.git` with one of these, read from `shared/.env` only and never printed:
- `GITHUB_READ_TOKEN`: a fine-grained token named `FlatMeta-Deploy-Read`, for this repository only, with the permission **Contents: Read-only**. git gets it through `bin/git-askpass.sh` from an environment variable, so it is never in a URL, a git config, the process list or a log.
- or `DEPLOY_KEY_FILE`: a path to a read-only deploy key, with `DEPLOY_REPO_URL=git@github.com:MeWeBe-com/flatmeta.io.git`.

The install script asks for the token at a hidden prompt when neither is set. Pressing Enter skips it while the repository is public.

## Settings (`shared/.env`)

| Key | Default | Meaning |
|---|---|---|
| `AUTO_DEPLOY` | `true` (install sets it) | `false`: cron deploys nothing |
| `DEPLOY_BRANCH` | staging `v2`, production `production` | the branch it follows |
| `DEPLOY_TESTS` | `quick` | `quick`, `full` or `off` |
| `KEEP_RELEASES` | `2` | older releases kept for rollback (each is about 1 GB with node_modules) |
| `READYZ_URL` | `http://127.0.0.1:$WEB_PORT/readyz` | what must show the new commit |
| `DEPLOY_SMOKE` | `http` | `off` skips the smoke test |
| `ADMIN_EMAILS` | | extra people to email; admins in the database always get it |

## `/readyz`

`GET /readyz` answers 200 with `{"ok":true,"release":"<web build sha>","api":{"ok":true,"release":"<api sha>"},"sameRelease":true}` when the web app, the API, the database and Redis all answer. Otherwise it answers 503. Uptime monitors can use it too.

## Install (once per instance; safe to run again)

`scripts/autodeploy/install.sh <staging|production> <private folder>`, run as najamussaqib. It needs no root. It:
1. checks the tools;
2. turns the existing checkout into the first release (the path stays the same);
3. writes the settings;
4. asks for the token if missing;
5. installs `bin/` and `repo.git`;
6. replaces the old cron line with the new one;
7. prints the status.

## Going back to the old way (if ever needed)

1. `bash …/bin/autodeploy.sh pause`.
2. `crontab -e`: remove the `bin/autodeploy.sh` line.
3. The live release folder is a normal checkout: `readlink /home/flatmeta/web/<domain>/private/flatmeta`.
