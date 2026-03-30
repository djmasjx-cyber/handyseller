# Провайдер Яндекс Облака
terraform {
  required_providers {
    yandex = {
      source  = "yandex-cloud/yandex"
      version = ">= 0.95"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }
}

provider "yandex" {
  cloud_id  = var.yandex_cloud_id
  folder_id = var.yandex_folder_id
  zone      = "ru-central1-a"
}

# VPC сеть
resource "yandex_vpc_network" "handyseller" {
  name = "handyseller-network"
}

resource "yandex_vpc_subnet" "handyseller_a" {
  name           = "handyseller-subnet-a"
  zone           = "ru-central1-a"
  network_id     = yandex_vpc_network.handyseller.id
  v4_cidr_blocks = ["10.0.1.0/24"]
}

resource "yandex_vpc_subnet" "handyseller_b" {
  name           = "handyseller-subnet-b"
  zone           = "ru-central1-b"
  network_id     = yandex_vpc_network.handyseller.id
  v4_cidr_blocks = ["10.0.2.0/24"]
}

# Object Storage для статики фронтенда
resource "yandex_storage_bucket" "frontend" {
  bucket = "handyseller-frontend-${var.environment}"

  anonymous_access_flags {
    read = true
    list = false
  }

  website {
    index_document = "index.html"
    error_document = "error.html"
  }

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD", "PUT", "POST", "DELETE"]
    allowed_origins = ["https://handyseller.ru", "https://www.handyseller.ru", "http://localhost:3000"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# Serverless Gateway для статики из Object Storage
# OpenAPI 3.0 spec с CORS для handyseller.ru
resource "yandex_api_gateway" "handyseller_frontend" {
  name        = "handyseller-frontend-${var.environment}"
  description = "Frontend gateway for HandySeller static files"
  spec        = <<-EOT
openapi: 3.0.0
info:
  title: HandySeller Frontend
  version: 1.0.0
paths:
  /:
    get:
      x-yc-apigateway-integration:
        type: object_storage
        bucket: ${yandex_storage_bucket.frontend.bucket}
        object: index.html
        error_object: error.html
  /{path}:
    get:
      parameters:
        - name: path
          in: path
          required: true
          schema:
            type: string
      x-yc-apigateway-integration:
        type: object_storage
        bucket: ${yandex_storage_bucket.frontend.bucket}
        object: '{path}'
        error_object: index.html
x-yc-apigateway:
  cors:
    allow_origins:
      - https://handyseller.ru
      - https://www.handyseller.ru
      - http://localhost:3000
    allow_methods:
      - GET
      - POST
      - PUT
      - DELETE
      - OPTIONS
    allow_headers: "*"
    max_age: 3600
    allow_credentials: true
  EOT
}

# KMS Key для шифрования дисков БД
resource "yandex_kms_symmetric_key" "db_encryption" {
  name              = "handyseller-db-encryption-${var.environment}"
  description       = "Key for PostgreSQL cluster disk encryption"
  default_algorithm = "AES_256"
  rotation_period   = "8760h" # 365 дней

  labels = {
    environment = var.environment
    purpose     = "database-encryption"
  }
}

# Security Group для PostgreSQL
resource "yandex_vpc_security_group" "db" {
  name        = "handyseller-db-sg-${var.environment}"
  network_id  = yandex_vpc_network.handyseller.id
  description = "PostgreSQL access from app servers"

  ingress {
    protocol       = "TCP"
    port           = 6432
    v4_cidr_blocks = ["10.0.0.0/16"]
    description    = "PostgreSQL from VPC"
  }

  egress {
    protocol       = "ANY"
    port           = 0
    v4_cidr_blocks = ["0.0.0.0/0"]
    description    = "Allow all outbound"
  }
}

# Managed PostgreSQL для бэкенда (production-ready)
resource "yandex_mdb_postgresql_cluster" "handyseller_db" {
  name                   = "handyseller-db-${var.environment}"
  description            = "Production database for HandySeller"
  environment            = "PRODUCTION"
  network_id             = yandex_vpc_network.handyseller.id
  disk_encryption_key_id = yandex_kms_symmetric_key.db_encryption.id
  security_group_ids    = [yandex_vpc_security_group.db.id]

  labels = {
    environment = var.environment
    project     = "handyseller"
  }

  config {
    version = "15"

    resources {
      resource_preset_id = "s2.micro"
      disk_size          = 16
      disk_type_id       = "network-ssd"
    }

    backup_retain_period_days = 7

    backup_window_start {
      hours   = 2
      minutes = 0
    }

    postgresql_config = {
      max_connections                   = "100"
      enable_parallel_hash               = "true"
      autovacuum_vacuum_scale_factor     = "0.3"
      autovacuum_analyze_scale_factor    = "0.2"
      shared_buffers                     = "536870912"  # 512MB (bytes)
      effective_cache_size               = "1073741824" # 1GB (bytes)
      work_mem                           = "16777216"   # 16MB (bytes)
      maintenance_work_mem               = "268435456"  # 256MB (bytes)
      random_page_cost                   = "1.1"
      effective_io_concurrency           = "200"
      log_min_duration_statement         = "1000"
    }
  }

  host {
    zone             = "ru-central1-a"
    subnet_id        = yandex_vpc_subnet.handyseller_a.id
    assign_public_ip = false
  }

  host {
    zone             = "ru-central1-b"
    subnet_id        = yandex_vpc_subnet.handyseller_b.id
    assign_public_ip = false
    priority         = 1
  }

  database {
    name  = "handyseller"
    owner = "handyseller_user"
  }

  user {
    name     = "handyseller_user"
    password = var.db_password

    permission {
      database_name = "handyseller"
    }

    settings = {
      default_transaction_isolation = "2" # read committed
      log_statement                 = "1" # none
    }
  }

  maintenance_window {
    type = "WEEKLY"
    day  = "SAT"
    hour = 3
  }

  access {
    web_sql    = false
    data_lens  = false
    serverless = true
  }
}

# Service Account для serverless
resource "yandex_iam_service_account" "serverless" {
  name        = "handyseller-serverless-${var.environment}"
  description = "Service account for HandySeller serverless functions"
}

resource "yandex_resourcemanager_folder_iam_member" "serverless_logging_writer" {
  folder_id = var.yandex_folder_id
  role      = "logging.writer"
  member    = "serviceAccount:${yandex_iam_service_account.serverless.id}"
}

resource "yandex_resourcemanager_folder_iam_member" "serverless_lockbox_payload_viewer" {
  count     = var.lockbox_secret_id != "" ? 1 : 0
  folder_id = var.yandex_folder_id
  role      = "lockbox.payloadViewer"
  member    = "serviceAccount:${yandex_iam_service_account.serverless.id}"
}

resource "yandex_resourcemanager_folder_iam_member" "serverless_kms_crypto" {
  folder_id = var.yandex_folder_id
  role      = "kms.keys.encrypterDecrypter"
  member    = "serviceAccount:${yandex_iam_service_account.serverless.id}"
}

resource "yandex_resourcemanager_folder_iam_member" "serverless_storage_viewer" {
  folder_id = var.yandex_folder_id
  role      = "storage.viewer"
  member    = "serviceAccount:${yandex_iam_service_account.serverless.id}"
}

resource "yandex_resourcemanager_folder_iam_member" "serverless_mdb_viewer" {
  folder_id = var.yandex_folder_id
  role      = "mdb.viewer"
  member    = "serviceAccount:${yandex_iam_service_account.serverless.id}"
}

resource "yandex_resourcemanager_folder_iam_member" "serverless_vpc_user" {
  folder_id = var.yandex_folder_id
  role      = "vpc.user"
  member    = "serviceAccount:${yandex_iam_service_account.serverless.id}"
}

resource "yandex_lockbox_secret_iam_member" "serverless_secret_access" {
  count     = var.lockbox_secret_id != "" ? 1 : 0
  secret_id = var.lockbox_secret_id
  role      = "lockbox.payloadViewer"
  member    = "serviceAccount:${yandex_iam_service_account.serverless.id}"
}

resource "yandex_kms_symmetric_key_iam_member" "serverless_db_encryption_usage" {
  symmetric_key_id = yandex_kms_symmetric_key.db_encryption.id
  role             = "kms.keys.encrypterDecrypter"
  member           = "serviceAccount:${yandex_iam_service_account.serverless.id}"
}

resource "yandex_iam_service_account_iam_binding" "serverless_token_creator" {
  service_account_id = yandex_iam_service_account.serverless.id
  role               = "iam.serviceAccounts.user"
  members = [
    "serviceAccount:${yandex_iam_service_account.serverless.id}",
  ]
}

# Serverless Function для аутентификации
data "archive_file" "auth" {
  type        = "zip"
  source_dir  = "${path.module}/../functions/auth"
  output_path = "${path.module}/auth-function.zip"
}

resource "yandex_function" "auth" {
  name               = "handyseller-auth-${var.environment}"
  description        = "Authentication service"
  user_hash          = data.archive_file.auth.output_base64sha256
  runtime            = "nodejs18"
  entrypoint         = "index.handler"
  memory             = 128
  execution_timeout  = 10
  service_account_id = yandex_iam_service_account.serverless.id

  content {
    zip_filename = data.archive_file.auth.output_path
  }

  environment = {
    DB_HOST           = yandex_mdb_postgresql_cluster.handyseller_db.host[0].fqdn
    DB_NAME           = "handyseller"
    DB_USER           = "handyseller_user"
    LOCKBOX_SECRET_ID = var.lockbox_secret_id
    KMS_KEY_ID        = yandex_kms_symmetric_key.db_encryption.id
  }
}

# CDN Origin Group для Object Storage
resource "yandex_cdn_origin_group" "frontend" {
  name = "handyseller-frontend-origin"

  origin {
    source = "${yandex_storage_bucket.frontend.bucket}.storage.yandexcloud.net"
  }
}

# CDN для ускорения загрузки статики
resource "yandex_cdn_resource" "frontend" {
  cname               = "cdn.handyseller.ru"
  active              = true
  origin_protocol     = "http"
  origin_group_id     = yandex_cdn_origin_group.frontend.id
  secondary_hostnames = ["static.handyseller.ru"]

  options {
    gzip_on = true
    slice   = true
  }
}
