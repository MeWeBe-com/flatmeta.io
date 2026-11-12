#!/usr/bin/env bash
# Who may deploy which environment, and how (sourced by deploy.sh; tested in apps/api/test/deploy-guard.test.ts).
#
# Inputs (environment variables):
#   APP_ENV        from the checkout's .env (staging | production | development)
#   ENV_ARG        the environment named on the command line (may be empty)
#   AUTO           1 when deploy.sh was called with --auto (the cron job, or the CI deploy key)
#   AUTO_DEPLOY    from the checkout's .env: only "true" allows automatic deploys
#   IS_TTY         1 when stdin is a terminal
#   SSH_CONNECTION set by sshd for remote sessions (the CI deploy key)
#   FM_TRIGGER     "cron" when scripts/auto-deploy.sh --cron runs the deploy
#   COMMIT         the commit an automatic deploy asks for (full 40-character SHA)
#   FAILED_SHAS    the file that lists commits that failed here (logs/failed-shas, one SHA per line)
#
# Prints one line saying why, and exits:
#   0  allowed: staging/development, or a manual production deploy (deploy.sh still asks to type "production")
#   10 allowed: automatic deploy of $COMMIT
#   1  refused
deploy_guard() {
  local env="${APP_ENV:-production}"
  if [ -n "${ENV_ARG:-}" ] && [ "$ENV_ARG" != "$env" ]; then
    echo "✗ This checkout is APP_ENV=$env, not $ENV_ARG. Run the deploy in the $ENV_ARG checkout."
    return 1
  fi
  if [ "$env" = "production" ] && [ "${ENV_ARG:-}" != "production" ]; then
    echo "✗ Refusing to deploy production without naming it: bash scripts/deploy.sh production [branch]"
    return 1
  fi
  if [ "${AUTO:-0}" = 1 ]; then
    # Automatic: only when this server opted in, only from cron or the CI key (never a person at a terminal),
    # only one exact commit, and never a commit that already failed here.
    if [ "${AUTO_DEPLOY:-}" != "true" ]; then
      echo "✗ Automatic deploys are off: set AUTO_DEPLOY=true in this checkout's .env to allow them."
      return 1
    fi
    if [ "${IS_TTY:-0}" = 1 ] || { [ -z "${SSH_CONNECTION:-}" ] && [ "${FM_TRIGGER:-}" != "cron" ]; }; then
      echo "✗ --auto runs only from cron (scripts/auto-deploy.sh --cron) or the CI key. To deploy by hand: bash scripts/auto-deploy.sh"
      return 1
    fi
    if ! [[ "${COMMIT:-}" =~ ^[0-9a-f]{40}$ ]]; then
      echo "✗ --auto needs the full commit SHA to deploy (--commit <40 hex characters>)."
      return 1
    fi
    if [ -n "${FAILED_SHAS:-}" ] && [ -f "$FAILED_SHAS" ] && grep -qx "$COMMIT" "$FAILED_SHAS"; then
      echo "✗ Commit ${COMMIT:0:7} failed a deploy here before; it is never retried automatically. Push a fix, or deploy it by hand."
      return 1
    fi
    echo "✓ automatic $env deploy of ${COMMIT:0:7}"
    return 10
  fi
  if [ "$env" != "production" ]; then
    echo "✓ $env deploy"
    return 0
  fi
  # Manual production: a person at a terminal, not CI, cron or a forced-command key.
  if [ -n "${SSH_ORIGINAL_COMMAND:-}" ] || [ -n "${GITHUB_ACTIONS:-}" ] || [ "${FM_TRIGGER:-}" = "cron" ] || [ "${IS_TTY:-0}" != 1 ]; then
    echo "✗ Manual production deploys run only from an interactive terminal (cron and CI use --auto, which needs AUTO_DEPLOY=true)."
    return 1
  fi
  echo "✓ manual production deploy"
  return 0
}

# Run directly (tests): print the decision and exit with its code.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  deploy_guard
  exit $?
fi
