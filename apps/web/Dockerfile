# syntax=docker/dockerfile:1
# Build from the repo root: docker build -f apps/web/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/voice-gateway/package.json apps/voice-gateway/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
COPY packages/storage/package.json packages/storage/
COPY packages/voice-sdk/package.json packages/voice-sdk/
COPY workers/post-call/package.json workers/post-call/
COPY workers/notifier/package.json workers/notifier/
COPY infra/package.json infra/
RUN npm ci --workspace @muxaris/web --include-workspace-root
COPY packages/shared packages/shared
COPY packages/voice-sdk packages/voice-sdk
COPY apps/web apps/web
# The dev email gallery imports this one self-contained file from @muxaris/core by relative path.
COPY packages/core/src/notifications/templates.ts packages/core/src/notifications/templates.ts
RUN npm run build -w @muxaris/shared && npm run build -w @muxaris/voice-sdk

# NEXT_PUBLIC_* values are inlined into the client bundle at build time.
ARG NEXT_PUBLIC_API_URL=
ARG NEXT_PUBLIC_VOICE_WS_URL=
ARG NEXT_PUBLIC_COGNITO_USER_POOL_ID=
ARG NEXT_PUBLIC_COGNITO_CLIENT_ID=
ARG NEXT_PUBLIC_COGNITO_DOMAIN=
ARG NEXT_PUBLIC_GOOGLE_ENABLED=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_VOICE_WS_URL=$NEXT_PUBLIC_VOICE_WS_URL \
    NEXT_PUBLIC_COGNITO_USER_POOL_ID=$NEXT_PUBLIC_COGNITO_USER_POOL_ID \
    NEXT_PUBLIC_COGNITO_CLIENT_ID=$NEXT_PUBLIC_COGNITO_CLIENT_ID \
    NEXT_PUBLIC_COGNITO_DOMAIN=$NEXT_PUBLIC_COGNITO_DOMAIN \
    NEXT_PUBLIC_GOOGLE_ENABLED=$NEXT_PUBLIC_GOOGLE_ENABLED \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @muxaris/web

FROM node:22-alpine
WORKDIR /repo
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
