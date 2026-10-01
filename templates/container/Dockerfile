# Runs the workbench in the open-source workerd runtime (the same one `pnpm dev` uses), so no
# Cloudflare account is needed. Build from the repository root:
#   docker build -f templates/container/Dockerfile -t workbench .
# The image bakes in the instance profile (workbench.profile.json) present at build time.
FROM node:26-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
COPY . .
ENV CI=true
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:26-slim
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
COPY --from=build /app /app
# Miniflare keeps D1, R2 and Durable Object state here; mount a volume to keep it across restarts.
RUN mkdir -p /app/.wrangler/state && chown -R node:node /app
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/app/templates/container/entrypoint.sh"]
