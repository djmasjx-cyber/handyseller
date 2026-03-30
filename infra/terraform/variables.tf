variable "yandex_cloud_id" {
  description = "ID облака Яндекс"
  type        = string
}

variable "yandex_folder_id" {
  description = "ID каталога Яндекс"
  type        = string
}

variable "environment" {
  description = "Окружение (prod, staging, dev)"
  type        = string
  default     = "prod"
}

variable "db_password" {
  description = "Пароль базы данных"
  type        = string
  sensitive   = true
}

variable "lockbox_secret_id" {
  description = "ID секрета в Yandex Lockbox для runtime-секретов приложения"
  type        = string
  default     = ""
}
