#!/bin/sh
# Starts the built workbench. Selected environment variables are written into the built
# Worker configuration (see configure.mjs), so one image serves any auth mode.
set -eu
umask 077

# Refuse to serve an unauthenticated workbench on every interface unless that was asked for
# (the local compose file asks, and publishes the port on 127.0.0.1 only).
if [ "${AUTH_MODE:-development}" = "development" ] && [ "${WORKBENCH_ALLOW_OPEN:-}" != "1" ]; then
  echo "Refusing to start: AUTH_MODE is 'development' (no sign-in). Set AUTH_MODE=oidc or alb-oidc, or WORKBENCH_ALLOW_OPEN=1 for a localhost-only run." >&2
  exit 1
fi

node templates/container/configure.mjs dist

exec pnpm exec vite preview --host 0.0.0.0 --port "${PORT:-8787}"
