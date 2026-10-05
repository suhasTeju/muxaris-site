# syntax=docker/dockerfile:1
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
RUN npm ci --workspace @muxaris/voice-gateway --include-workspace-root
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY packages/core packages/core
COPY packages/storage packages/storage
COPY apps/voice-gateway apps/voice-gateway
RUN npm run build -w @muxaris/shared && npm run build -w @muxaris/db \
 && npm run build -w @muxaris/core && npm run build -w @muxaris/storage \
 && npm run build -w @muxaris/voice-gateway

FROM node:22-alpine
WORKDIR /repo
ENV NODE_ENV=production
ARG GIT_SHA=dev
ENV GIT_SHA=$GIT_SHA
COPY --from=build /repo/package.json /repo/package-lock.json ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared/package.json packages/shared/
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/packages/db/package.json packages/db/
COPY --from=build /repo/packages/db/dist packages/db/dist
COPY --from=build /repo/packages/db/drizzle packages/db/drizzle
COPY --from=build /repo/packages/core/package.json packages/core/
COPY --from=build /repo/packages/core/dist packages/core/dist
COPY --from=build /repo/packages/storage/package.json packages/storage/
COPY --from=build /repo/packages/storage/dist packages/storage/dist
COPY --from=build /repo/apps/voice-gateway/package.json apps/voice-gateway/
COPY --from=build /repo/apps/voice-gateway/dist apps/voice-gateway/dist
USER node
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.VOICE_PORT||4100)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/voice-gateway/dist/index.js"]
