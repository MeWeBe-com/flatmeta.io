# PM2, restarts and rollbacks on cp2

**Short version:** the apps run under PM2 as **najamussaqib**, not as the Hestia domain user. Every change reaches the server through GitHub and the auto-deploy. **Never edit files on the server**, and never restart by hand. The only safe ways to restart, deploy or roll back are the `bin/autodeploy.sh` commands below. Full details: `docs/deploy/AUTO-DEPLOY.md`.

## Who runs what

| | |
|---|---|
| App user | `najamussaqib`. It owns the releases, the PM2 daemon and the cron. Hestia's domain user only owns the web folders nginx serves. |
| PM2 apps | `flatmeta-web-production`, `flatmeta-api-production`, `flatmeta-worker-production`, plus the same three with `-staging`. Check with `pm2 ls`, as najamussaqib. |
| Production | `/home/flatmeta/web/flatmeta.io/private/` |
| Staging | `/home/flatmeta/web/staging.flatmeta.io/private/` |

Inside each of those folders:

```
flatmeta -> releases/<sha>      the live release (a symlink; PM2 runs from this path)
releases/<sha>/                 one folder per release: a clean checkout, its node_modules and build
shared/.env                     the only .env (mode 600); every release links to it
shared/state/                   current, previous, failed-shas, paused, history
shared/logs/autodeploy.log      one line per event; shared/logs/runs/ has each deploy in full
bin/autodeploy.sh               the runner
```

Since 20 Nov 2026 both production and staging follow `v2` (`DEPLOY_BRANCH=v2` in each `shared/.env`), so **pushing `v2` is the production deploy**. The cron checks every 2 minutes.

## The only safe commands (as najamussaqib)

Replace `<site>` with `flatmeta.io` (production) or `staging.flatmeta.io`.

| To | Run |
|---|---|
| See what is live, what failed, and `/readyz` | `bash /home/flatmeta/web/<site>/private/bin/autodeploy.sh status` |
| Deploy the branch tip now (also a commit that failed before) | `bash /home/flatmeta/web/<site>/private/bin/autodeploy.sh deploy` |
| Deploy one commit of the branch | `bash /home/flatmeta/web/<site>/private/bin/autodeploy.sh deploy <sha>` |
| Rebuild the live commit (after a `shared/.env` change) | `bash /home/flatmeta/web/<site>/private/bin/autodeploy.sh rebuild` |
| Go back to the previous release (no build, seconds) | `bash /home/flatmeta/web/<site>/private/bin/autodeploy.sh rollback` |
| Go back to an older kept release | `bash /home/flatmeta/web/<site>/private/bin/autodeploy.sh rollback <sha>` |
| Stop automatic deploys (e.g. during an incident) | `bash /home/flatmeta/web/<site>/private/bin/autodeploy.sh pause` |
| Start them again | `bash /home/flatmeta/web/<site>/private/bin/autodeploy.sh resume` |

**After a rollback, pause first** if you want to stay there. Otherwise the next tick deploys the branch tip again, unless that commit is in `failed-shas`.

**A changed `.env`** (a new key, `NEXT_PUBLIC_*`) needs a rebuild, because `NEXT_PUBLIC_*` values are built into the web app. Edit `shared/.env`, then run `autodeploy.sh rebuild`. It builds and tests the live commit again in a new folder and swaps it in; if the new build does not come up, the old one is put back. A plain restart is not enough, and `deploy` does nothing when the tip is already live.

## What not to do, and why

- **Don't edit files in `releases/`.** The next deploy replaces them, a rollback brings the old ones back, and git no longer matches what runs. Change the code on GitHub instead.
- **Don't run `pm2 restart <app>` or `pm2 reload` by hand.** Run that way, PM2 keeps the environment from when the app started. A changed `.env` is ignored, and so are `RELEASE_SHA` and `FM_APP_ROOT`, so `/readyz` then shows the wrong release.
- **If you truly must restart by hand** (the auto-deploy itself is broken), do it from the live release with the ecosystem file and `--update-env`, exactly as the auto-deploy does:

  ```bash
  cd /home/flatmeta/web/<site>/private/flatmeta
  ```

  ```bash
  FM_APP_ROOT=$PWD RELEASE_SHA=$(cat ../shared/state/current) pm2 startOrReload ecosystem.config.cjs --update-env && pm2 save
  ```

  Then check `curl -s http://127.0.0.1:<WEB_PORT>/readyz`. It must show the live sha with `"sameRelease":true`.
- **Don't run pm2 as root or as the Hestia user.** That starts a second PM2 daemon with its own copies of the apps, fighting the real ones for the same ports.
- **Don't `git pull` or `git checkout` in a release folder.** Releases are fixed commits, and the next deploy is a new folder.

## When something is wrong

1. Run `status`. Then `tail -n 50 shared/logs/autodeploy.log`, and open the newest file in `shared/logs/runs/`.
2. A failed deploy has already been undone: the live release was kept, or switched back. The admins got an email naming the failing step.
3. Fix it on GitHub (a new commit on `v2`) and let the cron deploy it. For an urgent production problem, `rollback` first, then fix.
