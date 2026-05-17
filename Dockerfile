FROM node:22-alpine AS build
WORKDIR /build
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=build /build/node_modules ./node_modules
COPY --from=build /build/package*.json ./
COPY --from=build /build/server.js ./
COPY --from=build /build/genlayer-bridge.js ./
COPY --from=build /build/vitest.config.js ./
COPY --from=build /build/__tests__ ./__tests__
COPY docs /app/docs
USER appuser
EXPOSE 5005
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5005/healthz || exit 1
CMD ["node", "server.js"]
