# ─────────────────────────────────────────────────────────────────────────────
# outputs.tf — Values printed after terraform apply
# ─────────────────────────────────────────────────────────────────────────────

output "public_ip" {
  description = "Public IP address assigned to the app server"
  value       = oci_core_instance.app.public_ip
}

output "ssh_command" {
  description = "Ready-to-run SSH command to connect to the instance"
  value       = "ssh ubuntu@${oci_core_instance.app.public_ip}"
}
