# Builds the React PWA (apps/web — added in the frontend phase) and serves it with nginx.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm install && npm run build -w @ajay/shared && npm run build -w @ajay/web

FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
