# --- Paso 29: MySQL en RDS (catálogo y stock) --------------------------------
# Decisión de la fase 4: RDS con IP pública + TLS obligatorio, sin VPC privada.
# Meter las Lambdas en una VPC exigiría un NAT Gateway (~USD 32/mes) para que
# lleguen a Stripe y EventBridge. En una empresa iría en subred privada.

# La VPC "por defecto" que trae toda cuenta de AWS. No la creamos: solo la leemos.
data "aws_vpc" "default" {
  default = true
}

# Firewall de la base: solo deja entrar al puerto 3306 desde las IPs permitidas.
resource "aws_security_group" "db" {
  name        = "charanatech-db"
  description = "MySQL de CharanaTech: solo puerto 3306 desde IPs permitidas"
  vpc_id      = data.aws_vpc.default.id
}

resource "aws_vpc_security_group_ingress_rule" "db_mysql" {
  for_each = toset(var.db_allowed_cidrs)

  security_group_id = aws_security_group.db.id
  description       = "MySQL desde ${each.value}"
  cidr_ipv4         = each.value
  ip_protocol       = "tcp"
  from_port         = 3306
  to_port           = 3306
}

# Paso 30: la Lambda de la API no tiene una IP fija (cambia en cada arranque y
# AWS no publica un rango corto), así que el puerto 3306 queda abierto a todo
# internet. Lo que protege la base ahora es: TLS obligatorio (nadie lee el
# tráfico), contraseña de 40 caracteres aleatorios, y el usuario solo existe
# para esta base. La alternativa "de empresa" (Lambda en subred privada + NAT o
# RDS Proxy) cuesta ~USD 32/mes más.
resource "aws_vpc_security_group_ingress_rule" "db_mysql_lambda" {
  security_group_id = aws_security_group.db.id
  description       = "MySQL desde la Lambda de la API (IP variable), solo con TLS"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 3306
  to_port           = 3306
}

# Ajustes del servidor MySQL. El importante: rechazar conexiones sin TLS.
resource "aws_db_parameter_group" "mysql" {
  name        = "charanatech-mysql84"
  family      = "mysql8.4"
  description = "MySQL 8.4 de CharanaTech con TLS obligatorio"

  parameter {
    name  = "require_secure_transport"
    value = "1"
  }
}

resource "aws_db_instance" "main" {
  identifier = "charanatech"

  engine                     = "mysql"
  engine_version             = "8.4" # la misma versión mayor que compose.yaml (8.4.13)
  auto_minor_version_upgrade = true
  instance_class             = "db.t4g.micro" # la más pequeña (Graviton), del plan gratuito
  parameter_group_name       = aws_db_parameter_group.mysql.name
  ca_cert_identifier         = "rds-ca-rsa2048-g1"

  allocated_storage = 20 # GB, el mínimo
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = "charanatech"
  username = "charanatech"
  # Contraseña "write-only": Terraform la envía a AWS pero NO la guarda en el
  # estado. Para cambiarla: nueva contraseña + subir secrets_version.
  password_wo         = var.db_password
  password_wo_version = var.secrets_version

  publicly_accessible    = true
  vpc_security_group_ids = [aws_security_group.db.id]
  multi_az               = false # una sola zona: suficiente para un portafolio

  backup_retention_period = 1 # copia automática diaria, se guarda 1 día
  copy_tags_to_snapshot   = true

  # Protecciones contra borrados accidentales.
  deletion_protection       = true
  skip_final_snapshot       = false
  final_snapshot_identifier = "charanatech-final"
}
