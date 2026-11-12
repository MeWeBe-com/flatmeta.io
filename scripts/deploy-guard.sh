#!/usr/bin/env bash
# Who may deploy which environment, and how (sourced by deploy.sh; tested in apps/api/test/deploy-guard.test.ts).
#
# Inputs (environment variables):
#   APP_ENV        from the checkout's .env (staging | production | development)
#   ENV_ARG        the environment named on the command line (may be empty)
#   AUTO           1 when deploy.sh was called with --auto
#   AUTO_DEPLOY    from the production .env: only "true" allows automatic production deploys
#   IS_TTY         1 when stdin is a terminal
#   SSH_CONNECTION set by sshd for remote sessions (the CI deploy key)
#   COMMIT         the commit an automatic deploy asks for (full 40-character SHA)
#   FAILED_DIR     where failed commits are recorded (one file per SHA)
#
# Prints one line saying why, and exits:
#   0  allowed: staging/development, or a manual production deploy (deploy.sh still asks to type "production")
#   10 allowed: automatic production deploy of $COMMIT
#   1  refused
deploy_guard() {
  local env="${APP_ENV:-production}"
  if [ -n "${ENV_ARG:-}" ] && [ "$ENV_ARG" != "$env" ]; then
    echo "✗ This checkout is APP_ENV=$env, not $ENV_ARG. Run the deploy in the $ENV_ARG checkout."
    return 1
  fi
  if [ "$env" != "production" ]; then
    if [ "${AUTO:-0}" = 1 ]; then echo "✗ --auto is only for production."; return 1; fi
    echo "✓ $env deploy"
    return 0
  fi
  if [ "${ENV_ARG:-}" != "production" ]; then
    echo "✗ Refusing to deploy production without naming it: bash scripts/deploy.sh production [branch]"
    return 1
  fi
  if [ "${AUTO:-0}" = 1 ]; then
    # Automatic: only the CI deploy key (a remote, non-interactive SSH session), only when the server opted in,
    # only one exact commit, and never a commit that already failed here.
    if [ "${AUTO_DEPLOY:-}" != "true" ]; then
      echo "✗ Automatic production deploys are off: set AUTO_DEPLOY=true in this checkout's .env to allow them."
      return 1
    fi
    if [ -z "${SSH_CONNECTION:-}" ] || [ "${IS_TTY:-0}" = 1 ]; then
      echo "✗ --auto runs only from CI over SSH (non-interactive). To deploy by hand: bash scripts/deploy.sh production"
      return 1
    fi
    if ! [[ "${COMMIT:-}" =~ ^[0-9a-f]{40}$ ]]; then
      echo "✗ --auto needs the full commit SHA to deploy (--commit <40 hex characters>)."
      return 1
    fi
    if [ -n "${FAILED_DIR:-}" ] && [ -e "$FAILED_DIR/$COMMIT" ]; then
      echo "✗ Commit ${COMMIT:0:7} failed a production deploy before; it is never retried automatically. Deploy a newer commit, or by hand."
      return 1
    fi
    echo "✓ automatic production deploy of ${COMMIT:0:7}"
    return 10
  fi
  # Manual: a person at a terminal, not CI, cron or a forced-command key.
  if [ -n "${SSH_ORIGINAL_COMMAND:-}" ] || [ -n "${GITHUB_ACTIONS:-}" ] || [ "${IS_TTY:-0}" != 1 ]; then
    echo "✗ Manual production deploys run only from an interactive terminal (CI uses --auto, which needs AUTO_DEPLOY=true)."
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
