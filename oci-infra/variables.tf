# ─────────────────────────────────────────────────────────────────────────────
# variables.tf — Input variables for the OCI Always Free app server
# ─────────────────────────────────────────────────────────────────────────────

# ── OCI Authentication ────────────────────────────────────────────────────────

variable "tenancy_ocid" {
  description = "OCID of your OCI tenancy (found under Profile → Tenancy)"
  type        = string
}

variable "user_ocid" {
  description = "OCID of the OCI user Terraform authenticates as (Profile → My Profile)"
  type        = string
}

variable "compartment_ocid" {
  description = <<-EOT
    OCID of the compartment where resources are created.
    Using the root compartment (same as tenancy_ocid) is fine for personal setups.
  EOT
  type        = string
}

variable "fingerprint" {
  description = "Fingerprint of the API signing key uploaded to your OCI user (Profile → API Keys)"
  type        = string
}

variable "private_key_path" {
  description = "Local path to the PEM private key used for OCI API authentication"
  type        = string
}

variable "region" {
  description = "OCI region identifier — e.g. us-ashburn-1, eu-frankfurt-1, ap-singapore-1"
  type        = string
}

# ── SSH ───────────────────────────────────────────────────────────────────────

variable "ssh_public_key_path" {
  description = "Local path to your SSH public key — injected into the VM for the ubuntu user"
  type        = string
}

# ── Network ───────────────────────────────────────────────────────────────────

variable "admin_cidr" {
  description = <<-EOT
    CIDR block allowed to SSH into the instance.
    Restrict this to your own IP for security: e.g. "1.2.3.4/32".
    Using "0.0.0.0/0" opens SSH to the world — avoid in production.
  EOT
  type        = string
}

variable "app_port" {
  description = "TCP port your application listens on — opened to 0.0.0.0/0 in the security list"
  type        = number
  default     = 8080
}
