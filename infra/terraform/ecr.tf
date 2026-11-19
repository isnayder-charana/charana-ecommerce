# --- Paso 30: el registro de imágenes de la API -------------------------------
# ECR es el "Docker Hub privado" de tu cuenta. Lambda solo acepta imágenes que
# estén en ECR, en la misma región.

resource "aws_ecr_repository" "api" {
  name = "charanatech-api"

  # IMMUTABLE: una etiqueta (el commit de git) apunta siempre a la misma imagen.
  # Si alguien intenta subir otra imagen con la misma etiqueta, ECR la rechaza.
  image_tag_mutability = "IMMUTABLE"

  # Busca vulnerabilidades conocidas en cada imagen que subes (gratis).
  image_scanning_configuration {
    scan_on_push = true
  }
}

# Cada imagen pesa ~150 MB y ECR cobra por GB guardado: nos quedamos con las
# 10 más recientes y borramos el resto.
resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Conservar solo las 10 imagenes mas recientes"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}
