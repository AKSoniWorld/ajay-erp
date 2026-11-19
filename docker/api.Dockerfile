# ---- build ----
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm install
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build

# ---- run ----
FROM node:20-bookworm-slim
ENV NODE_ENV=production TZ=Asia/Kolkata
# Noto Sans gives the PDFs the ₹ sign; tini reaps processes and forwards signals
RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-core tini \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
RUN mkdir -p /data/uploads && chown -R node:node /data /app
USER node
WORKDIR /app/apps/api
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/main.js"]
