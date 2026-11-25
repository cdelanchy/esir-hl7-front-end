#!/bin/sh
# Construit l'image Docker du front (Caddy servant l'application).
#
#   sh scripts/docker-image.sh dev
#       -> esir-hl7-front-end:dev-<hash court du commit>[-dirty]
#
#   sh scripts/docker-image.sh release [version]
#       -> esir-hl7-front-end:<version> et esir-hl7-front-end:latest
#          version : l'argument, sinon le tag git posé sur HEAD, sinon le hash du commit.
#          Refuse de tourner si des modifications ne sont pas commitées.
#
# Variables optionnelles : IMAGE_NAME (défaut esir-hl7-front-end),
# BUILD_MODE (mode Vite, défaut prod -> .env.prod).
set -eu

IMAGE_NAME="${IMAGE_NAME:-esir-hl7-front-end}"
BUILD_MODE="${BUILD_MODE:-prod}"
KIND="${1:-}"

cd "$(dirname "$0")/.."

COMMIT="$(git rev-parse --short HEAD)"
DIRTY=""
if [ -n "$(git status --porcelain)" ]; then
  DIRTY="-dirty"
fi

case "$KIND" in
  dev)
    VERSION="dev-${COMMIT}${DIRTY}"
    TAGS="-t ${IMAGE_NAME}:${VERSION}"
    ;;
  release)
    if [ -n "$DIRTY" ]; then
      echo "Release refusée : des modifications ne sont pas commitées (git status)." >&2
      exit 1
    fi
    VERSION="${2:-$(git describe --tags --exact-match HEAD 2>/dev/null || echo "$COMMIT")}"
    TAGS="-t ${IMAGE_NAME}:${VERSION} -t ${IMAGE_NAME}:latest"
    ;;
  *)
    echo "Usage : $0 dev | release [version]" >&2
    exit 1
    ;;
esac

echo "Construction de ${IMAGE_NAME}:${VERSION} (mode Vite : ${BUILD_MODE}, commit ${COMMIT}${DIRTY})"
# shellcheck disable=SC2086
docker build \
  --build-arg BUILD_MODE="$BUILD_MODE" \
  --build-arg VERSION="$VERSION" \
  --build-arg REVISION="$(git rev-parse HEAD)" \
  $TAGS .

echo "Image construite :"
for tag in $TAGS; do
  [ "$tag" = "-t" ] || echo "  $tag"
done
