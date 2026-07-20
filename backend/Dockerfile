# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src

# ---- runtime stage ----
FROM node:20-alpine
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/src ./src
USER appuser
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:4000/health/live || exit 1
CMD ["node", "src/index.js"]
