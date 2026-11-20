#!/usr/bin/env bash
# Construye la imagen de la API o de los workers y la sube a ECR (pasos 30 y 31).
#
#   bash scripts/ecr-push.sh api
#   bash scripts/ecr-push.sh workers
#
# Al final imprime la línea que va en infra/terraform/terraform.tfvars.
# Requiere: Docker Desktop abierto y la sesión de `aws login --profile charanatech`.
set -euo pipefail

app="${1:-}"
case "$app" in
  api | workers) ;;
  *)
    echo "Uso: bash scripts/ecr-push.sh api|workers" >&2
    exit 1
    ;;
esac

profile="${AWS_PROFILE_NAME:-charanatech}"
region="us-east-2"
cd "$(git rev-parse --show-toplevel)"

# La etiqueta es el commit: si hay cambios sin guardar, la imagen no
# correspondería a ese commit.
if [ -n "$(git status --porcelain)" ]; then
  echo "Hay cambios sin commit. Haz commit (o git stash) y vuelve a intentarlo." >&2
  exit 1
fi
tag="$(git rev-parse --short HEAD)"

account="$(aws sts get-caller-identity --query Account --output text --profile "$profile")"
registry="${account}.dkr.ecr.${region}.amazonaws.com"
image="${registry}/charanatech-${app}"

# Las etiquetas son inmutables: si ya existe, no hay nada que subir.
if aws ecr describe-images --repository-name "charanatech-${app}" --image-ids "imageTag=${tag}" \
  --region "$region" --profile "$profile" >/dev/null 2>&1; then
  echo "La imagen ${image}:${tag} ya está en ECR."
else
  docker build --platform linux/amd64 --provenance=false \
    -f "apps/${app}/Dockerfile" -t "${image}:${tag}" .

  # Sesión de Docker en ECR sin `docker login`: en Windows, `docker login`
  # intenta guardar la contraseña en el Administrador de credenciales, que la
  # rechaza por larga ("The stub received bad data"). Usamos una configuración
  # de Docker aparte, solo para este push, y la borramos al terminar.
  export DOCKER_CONFIG="${HOME}/.docker-ecr"
  mkdir -p "$DOCKER_CONFIG"
  trap 'rm -rf "$DOCKER_CONFIG"' EXIT
  password="$(aws ecr get-login-password --region "$region" --profile "$profile")"
  auth="$(printf 'AWS:%s' "$password" | base64 | tr -d '\n')"
  printf '{"auths":{"%s":{"auth":"%s"}}}' "$registry" "$auth" >"${DOCKER_CONFIG}/config.json"
  unset password auth

  docker push "${image}:${tag}"
fi

echo
echo "Listo. En infra/terraform/terraform.tfvars:"
echo "  ${app}_image_tag = \"${tag}\""
