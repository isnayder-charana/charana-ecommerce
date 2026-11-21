# Módulo: una Lambda de worker con su rol, su política y sus logs (paso 31).
#
# Las tres Lambdas de los workers se arman igual; solo cambian el nombre, las
# variables de entorno y los permisos. Un módulo evita copiar lo mismo tres veces.

terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

variable "name" {
  description = "Nombre del worker: notifications, fulfillment u outbox-relay."
  type        = string
}

variable "image_uri" {
  description = "Imagen de los workers en ECR (la misma para todos)."
  type        = string

  validation {
    condition     = !endswith(var.image_uri, ":sin-imagen")
    error_message = "Falta workers_image_tag en terraform.tfvars: la etiqueta que imprimió scripts/ecr-push.sh workers."
  }
}

variable "environment" {
  description = "Variables de entorno propias de este worker (WORKER se agrega solo)."
  type        = map(string)
  default     = {}
}

variable "policy_json" {
  description = "Permisos de este worker, además de escribir sus logs."
  type        = string
}

variable "timeout" {
  description = "Segundos máximos por invocación."
  type        = number
  default     = 30
}

locals {
  function_name = "charanatech-${var.name}"
}

resource "aws_iam_role" "this" {
  name = local.function_name

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_cloudwatch_log_group" "this" {
  name              = "/aws/lambda/${local.function_name}"
  retention_in_days = 14
}

data "aws_iam_policy_document" "logs" {
  # Junta los permisos del worker con el de escribir en SU grupo de logs.
  source_policy_documents = [var.policy_json]

  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.this.arn}:*"]
  }
}

resource "aws_iam_role_policy" "this" {
  name   = local.function_name
  role   = aws_iam_role.this.id
  policy = data.aws_iam_policy_document.logs.json
}

resource "aws_lambda_function" "this" {
  function_name = local.function_name
  role          = aws_iam_role.this.arn
  package_type  = "Image"
  image_uri     = var.image_uri
  architectures = ["x86_64"]
  memory_size   = 512
  timeout       = var.timeout

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.this.name
  }

  environment {
    variables = merge(var.environment, {
      NODE_ENV = "production"
      WORKER   = var.name
    })
  }

  # Paso 36: la imagen la actualiza el despliegue de GitHub Actions
  # (deploy.yml). Terraform solo pone la primera; después no la toca.
  lifecycle {
    ignore_changes = [image_uri]
  }

  # Lambda revisa los permisos al conectar la cola o el stream: la política
  # tiene que existir antes que la función.
  depends_on = [aws_iam_role_policy.this]
}

output "function_name" {
  value = aws_lambda_function.this.function_name
}

output "function_arn" {
  value = aws_lambda_function.this.arn
}
