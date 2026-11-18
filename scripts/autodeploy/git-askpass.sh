#!/bin/sh
# Git asks for a username, then a password. The token comes from the environment (set by autodeploy.sh from
# shared/.env), so it is never in a URL, a git config, the process list or a log.
case "$1" in
  Username*) echo "x-access-token" ;;
  *) printf '%s\n' "${FM_GIT_TOKEN:-}" ;;
esac
