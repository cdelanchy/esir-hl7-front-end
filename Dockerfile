# Build stage
FROM node:26-alpine AS build-stage
WORKDIR /app
COPY package*.json ./
# npm ci : installation reproductible, strictement conforme au package-lock.json
RUN npm ci
COPY . .
# Mode Vite : charge .env puis .env.<mode> (ex. .env.prod pour BUILD_MODE=prod)
ARG BUILD_MODE=prod
RUN npx vite build --mode ${BUILD_MODE}

# Production stage with Caddy
FROM caddy:2-alpine
ARG VERSION=unknown
ARG REVISION=unknown
LABEL org.opencontainers.image.title="esir-hl7-front-end" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"
COPY --from=build-stage /app/dist /usr/share/caddy
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
