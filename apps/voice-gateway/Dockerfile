FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/voice-gateway/package.json apps/voice-gateway/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN npm ci --workspace @muxaris/voice-gateway --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/db packages/db
COPY apps/voice-gateway apps/voice-gateway
RUN npm run build -w @muxaris/shared && npm run build -w @muxaris/db && npm run build -w @muxaris/voice-gateway

FROM node:22-alpine
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo/package.json /repo/package-lock.json ./
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared/package.json packages/shared/
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/packages/db/package.json packages/db/
COPY --from=build /repo/packages/db/dist packages/db/dist
COPY --from=build /repo/packages/db/drizzle packages/db/drizzle
COPY --from=build /repo/apps/voice-gateway/package.json apps/voice-gateway/
COPY --from=build /repo/apps/voice-gateway/dist apps/voice-gateway/dist
EXPOSE 4100
CMD ["node", "apps/voice-gateway/dist/index.js"]
