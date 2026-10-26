# Cisum v0.11.7 - Docker image (single platform, built on the target machine).
# Build:  docker compose build      (or: docker build -t cisum .)
# Works with the legacy builder and with BuildKit (no BuildKit-only options).

########## Cisum web player (served at /web)
FROM node:22-alpine AS webui
WORKDIR /app
COPY webui/package.json webui/package-lock.json ./
RUN npm ci
COPY webui/ ./
RUN npx vite build --outDir=/build

########## Server binary
FROM golang:1.27-alpine AS build
RUN apk add --no-cache gcc musl-dev zlib-dev git
WORKDIR /workspace
COPY go.mod go.sum ./
RUN go mod download
COPY . .
COPY --from=webui /build ./webui/build
# Upstream Navidrome revision this fork is based on (shown as "based on Navidrome ...")
ARG GIT_SHA=56cc32a
ARG GIT_TAG=master
RUN CGO_ENABLED=1 go build -tags="$(sh ./release/build-tags.sh)" -ldflags="-w -s \
      -X github.com/navidrome/navidrome/consts.gitSha=${GIT_SHA} \
      -X github.com/navidrome/navidrome/consts.gitTag=${GIT_TAG}" \
      -o /out/cisum .

########## Final image
FROM alpine:3.22
LABEL org.opencontainers.image.title="Cisum" \
      org.opencontainers.image.description="Music server with Subsonic API, based on Navidrome" \
      org.opencontainers.image.version="0.11.7"

# ffmpeg: transcoding and waveforms. libwebp: native WebP artwork encoding.
# su-exec: drops root privileges after preparing the data folder (see docker-entrypoint.sh)
RUN apk add -U --no-cache curl ffmpeg sqlite tzdata su-exec libwebp libwebpdemux libwebpmux && \
    for lib in libwebp libwebpdemux libwebpmux; do \
        target=$(ls /usr/lib/$lib.so.* 2>/dev/null | head -1) && \
        [ -n "$target" ] && ln -sf "$target" /usr/lib/$lib.so; \
    done

COPY --from=build /out/cisum /app/cisum
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod 755 /app/docker-entrypoint.sh

VOLUME ["/data", "/music"]
ENV CISUM_MUSICFOLDER=/music \
    CISUM_DATAFOLDER=/data \
    CISUM_CONFIGFILE=/data/cisum.toml \
    CISUM_PORT=6874 \
    PUID=1000 \
    PGID=1000
RUN touch /.nddockerenv

EXPOSE 6874
WORKDIR /app
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s CMD curl -fs http://localhost:6874/ping || exit 1
ENTRYPOINT ["/app/docker-entrypoint.sh"]
