# --- Paso 33: fotos de los productos en S3, servidas por CloudFront ----------
#
#   navegador ──HTTPS──▶ CloudFront (CDN, copias cerca del usuario)
#                             │ firma cada petición (OAC)
#                             ▼
#                     S3 charanatech-images-<cuenta>   (privado: nadie más entra)
#
# Las fotos viven en el repo, en apps/web/public/products (así también se ven
# en tu PC con `pnpm dev`). Terraform sube cada archivo al bucket.

locals {
  product_images_dir = "${path.module}/../../apps/web/public/products"
  product_images     = fileset(local.product_images_dir, "*.jpg")
}

resource "aws_s3_bucket" "images" {
  bucket = "charanatech-images-${data.aws_caller_identity.current.account_id}"
}

# Bloquea cualquier acceso público directo al bucket, aunque alguien se
# equivoque con una política: las fotos solo salen por CloudFront.
resource "aws_s3_bucket_public_access_block" "images" {
  bucket                  = aws_s3_bucket.images.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "images" {
  bucket = aws_s3_bucket.images.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_object" "product_image" {
  for_each = local.product_images

  bucket       = aws_s3_bucket.images.id
  key          = "products/${each.value}"
  source       = "${local.product_images_dir}/${each.value}"
  content_type = "image/jpeg"
  # Si cambias la foto, cambia su huella y Terraform la vuelve a subir.
  etag = filemd5("${local.product_images_dir}/${each.value}")
  # El navegador y CloudFront la guardan un día antes de volver a pedirla.
  cache_control = "public, max-age=86400"
}

# --- CloudFront --------------------------------------------------------------

# OAC (Origin Access Control): CloudFront firma sus peticiones a S3, y la
# política del bucket solo acepta las firmadas por ESTA distribución.
resource "aws_cloudfront_origin_access_control" "images" {
  name                              = "charanatech-images"
  description                       = "CloudFront lee las fotos del bucket privado"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "images" {
  enabled         = true
  comment         = "Fotos de productos de CharanaTech"
  is_ipv6_enabled = true
  # Solo los puntos de presencia de Norteamérica y Europa: los más baratos.
  price_class = "PriceClass_100"

  origin {
    origin_id                = "images-bucket"
    domain_name              = aws_s3_bucket.images.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.images.id
  }

  default_cache_behavior {
    target_origin_id       = "images-bucket"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    # Política administrada por AWS "CachingOptimized": guarda las respuestas
    # según su Cache-Control y no reenvía cookies ni parámetros.
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # Sin dominio propio: usamos el certificado de *.cloudfront.net.
  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

data "aws_iam_policy_document" "images_bucket" {
  statement {
    sid       = "AllowCloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.images.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.images.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "images" {
  bucket = aws_s3_bucket.images.id
  policy = data.aws_iam_policy_document.images_bucket.json

  # La política solo da acceso a CloudFront, pero AWS la revisa contra el
  # bloqueo de acceso público: el bloqueo tiene que existir antes.
  depends_on = [aws_s3_bucket_public_access_block.images]
}
