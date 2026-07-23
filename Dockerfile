# syntax=docker/dockerfile:1

# ---- deps ----
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --include=dev: the platform injects NODE_ENV=production as a build arg, which
# would otherwise make npm ci skip devDependencies (tailwind, drizzle-kit, etc.)
# that the build needs.
RUN npm ci --include=dev

# ---- builder ----
FROM node:22-slim AS builder
WORKDIR /app
# next build reads env at build time; keep NODE_ENV unset here so the build
# behaves like a normal (dev-deps-present) build regardless of injected env.
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Drizzle migrations need to be present in the runtime image.
RUN npm run build

# ---- runner ----
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Next.js standalone reads HOSTNAME; Docker sets it to the container ID, which
# makes the server bind to that interface and the reverse proxy get a 502.
# Force it to bind all interfaces.
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Standalone server + static assets.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Migration assets + drizzle-kit for the entrypoint.
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/src/db ./src/db
COPY --from=deps /app/node_modules ./node_modules
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000
USER nextjs
ENTRYPOINT ["./docker-entrypoint.sh"]
