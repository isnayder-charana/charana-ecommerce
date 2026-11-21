# --- Paso 36: GitHub Actions despliega sin claves guardadas (OIDC) ---------------
#
# En cada ejecución, GitHub firma un token (JWT) que dice quién es: repositorio,
# rama, environment... AWS lo verifica con el proveedor OIDC de abajo y, si las
# condiciones del rol coinciden, entrega credenciales temporales (1 hora).
# No hay ninguna clave de AWS guardada en GitHub.

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  # Sin thumbprint_list: AWS confía en la CA raíz de GitHub por su cuenta.
}

locals {
  deploy_role_name = "charanatech-github-deploy"
  github_owner     = split("/", var.github_repository)[0]
  github_repo      = split("/", var.github_repository)[1]

  # Lo que el despliegue actualiza: la API y los tres workers.
  deployed_functions = [
    aws_lambda_function.api.arn,
    module.queue_worker["notifications"].function_arn,
    module.queue_worker["fulfillment"].function_arn,
    module.outbox_relay.function_arn,
  ]
}

data "aws_iam_policy_document" "github_deploy_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    # El token tiene que ser para AWS...
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # ...y venir de ESTE repositorio, en el environment "production". Un PR
    # (o un fork) nunca está en ese environment, así que no puede asumir el rol.
    # Dos formatos, los dos exactos (StringEquals con varios valores = "cualquiera"):
    # el nuevo, con ID inmutables, que usan los repos creados desde julio de 2026
    # (este), y el clásico, por si GitHub lo vuelve a enviar.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${local.github_owner}@${var.github_owner_id}/${local.github_repo}@${var.github_repository_id}:environment:production",
        "repo:${var.github_repository}:environment:production",
      ]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name                 = local.deploy_role_name
  assume_role_policy   = data.aws_iam_policy_document.github_deploy_trust.json
  max_session_duration = 3600
}

# Permisos mínimos: subir imágenes a los dos repos de ECR y cambiar la imagen
# de las cuatro Lambdas. Nada más: no puede crear recursos, leer secretos ni
# tocar IAM. Los cambios de infraestructura siguen saliendo de tu PC con
# `terraform plan` y `apply`.
data "aws_iam_policy_document" "github_deploy" {
  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"] # esta acción no admite un recurso concreto
  }

  statement {
    sid = "PushImages"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeImages",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [aws_ecr_repository.api.arn, aws_ecr_repository.workers.arn]
  }

  statement {
    sid       = "UpdateFunctions"
    actions   = ["lambda:UpdateFunctionCode", "lambda:GetFunction", "lambda:GetFunctionConfiguration"]
    resources = local.deployed_functions
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = local.deploy_role_name
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json
}
