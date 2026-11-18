# Paso 28: el bucket donde vive el estado de Terraform del proyecto.
#
# Problema del huevo y la gallina: el estado remoto necesita un bucket, y el
# bucket lo queremos crear con Terraform. Por eso este mini-proyecto aparte
# guarda SU estado en local (bootstrap/terraform.tfstate, ignorado por git).
# Se aplica una sola vez; el resto de la infraestructura (infra/terraform)
# guarda su estado en el bucket que crea este archivo.

terraform {
  required_version = "~> 1.17.1"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.72.0"
    }
  }
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile

  default_tags {
    tags = {
      Project   = "charanatech"
      ManagedBy = "terraform"
      Stack     = "bootstrap"
    }
  }
}

variable "aws_region" {
  description = "Región de AWS. En tu cuenta (modo nuevo de AWS) es fija."
  type        = string
  default     = "us-east-2"
}

variable "aws_profile" {
  description = "Perfil de la AWS CLI (el de `aws login --profile ...`)."
  type        = string
  default     = "charanatech"
}

data "aws_caller_identity" "current" {}

# Los nombres de bucket son únicos en TODO S3 (no solo en tu cuenta):
# el ID de la cuenta al final evita choques con otras personas.
resource "aws_s3_bucket" "tfstate" {
  bucket = "charanatech-tfstate-${data.aws_caller_identity.current.account_id}"

  # Borrar este bucket es borrar la memoria de Terraform: lo impedimos.
  lifecycle {
    prevent_destroy = true
  }
}

# Cada `terraform apply` guarda una versión nueva del estado. Si algo sale mal,
# se puede volver a la anterior desde la consola de S3.
resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Las versiones viejas se borran a los 90 días para que el bucket no crezca sin fin.
resource "aws_s3_bucket_lifecycle_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    id     = "expire-old-state-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.tfstate]
}

# El estado puede tener datos sensibles (IDs, a veces contraseñas): cifrado en reposo.
resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Nadie de internet puede leerlo, aunque alguien se equivoque con una política.
resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Y solo se habla con él por HTTPS.
resource "aws_s3_bucket_policy" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  policy = data.aws_iam_policy_document.tfstate.json

  depends_on = [aws_s3_bucket_public_access_block.tfstate]
}

data "aws_iam_policy_document" "tfstate" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]

    resources = [
      aws_s3_bucket.tfstate.arn,
      "${aws_s3_bucket.tfstate.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

output "state_bucket" {
  description = "Va en infra/terraform/backend.hcl como `bucket`."
  value       = aws_s3_bucket.tfstate.bucket
}
