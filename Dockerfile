# syntax=docker/dockerfile:1
# ---- build ------------------------------------------------------------------------------
FROM oven/bun:1.4.4 AS build
# Public, build-time values baked into the browser bundle (never put secrets here).
ARG VITE_PUBLIC_SITE_URL=""
ARG VITE_TURNSTILE_SITE_KEY=""
ENV VITE_PUBLIC_SITE_URL=$VITE_PUBLIC_SITE_URL VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY
WORKDIR /src
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build \
 && bun build scripts/migrate.mjs scripts/create-admin.mjs --target=node --external pg-native \
      --entry-naming "[name].mjs" --outdir /src/.scripts

# ---- runtime ----------------------------------------------------------------------------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 STORAGE_DIR=/data/storage
WORKDIR /app
RUN addgroup -S amcms && adduser -S -G amcms amcms \
 && mkdir -p /data/storage && chown -R amcms:amcms /data
# Everything is pre-bundled: no package installs in the runtime image.
COPY --from=build /src/.output ./.output
COPY --from=build /src/.scripts ./scripts
COPY db ./db
COPY scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
USER amcms
EXPOSE 3000
VOLUME ["/data/storage"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
# Run with an init process (compose sets init: true) so signals and zombies are handled.
ENTRYPOINT ["scripts/docker-entrypoint.sh"]
CMD ["node", ".output/server/index.mjs"]
