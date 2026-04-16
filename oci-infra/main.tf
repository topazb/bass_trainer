# ─────────────────────────────────────────────────────────────────────────────
# main.tf — OCI Always Free single-instance setup
#
# Resources created:
#   - VCN + public subnet + internet gateway + route table + security list
#   - 1 × VM.Standard.A1.Flex (1 OCPU, 6 GB RAM, 50 GB boot volume)
#   - cloud-init bootstraps Docker on first boot
#
# Always Free limits (as of 2024):
#   A1 Flex: 4 OCPUs + 24 GB RAM total — this instance uses 1 + 6
#   Block storage: 200 GB total — boot volume uses 50 GB
#   Public IPs: 2 reserved IPs free (ephemeral IPs are always free)
# ─────────────────────────────────────────────────────────────────────────────

terraform {
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 5.0"
    }
  }
  required_version = ">= 1.3"
}

provider "oci" {
  region           = var.region
  tenancy_ocid     = var.tenancy_ocid
  user_ocid        = var.user_ocid
  fingerprint      = var.fingerprint
  private_key_path = var.private_key_path
}

# ── Availability Domain ───────────────────────────────────────────────────────
# Fetch all ADs for the tenancy and use the first one.
# Most regions have a single AD; multi-AD regions still work fine with index [0].

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

# ── OS Image ─────────────────────────────────────────────────────────────────
# Find the most recent Canonical Ubuntu image that supports the A1 (ARM) shape.
# Sorted descending by creation time so index [0] is always the newest.

data "oci_core_images" "ubuntu" {
  compartment_id   = var.compartment_ocid
  operating_system = "Canonical Ubuntu"
  shape            = "VM.Standard.A1.Flex"
  sort_by          = "TIMECREATED"
  sort_order       = "DESC"
  state            = "AVAILABLE"
}

locals {
  # First availability domain in the tenancy
  ad = data.oci_identity_availability_domains.ads.availability_domains[0].name

  # Most recently published matching Ubuntu image
  image_id = data.oci_core_images.ubuntu.images[0].id
}

# ─────────────────────────────────────────────────────────────────────────────
# NETWORKING
# ─────────────────────────────────────────────────────────────────────────────

# ── VCN ──────────────────────────────────────────────────────────────────────

resource "oci_core_vcn" "main" {
  compartment_id = var.compartment_ocid
  cidr_block     = "10.0.0.0/16"
  display_name   = "app-vcn"
  dns_label      = "appvcn"
}

# ── Internet Gateway ──────────────────────────────────────────────────────────
# Required for instances in the public subnet to reach the internet.

resource "oci_core_internet_gateway" "igw" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "app-igw"
  enabled        = true
}

# ── Route Table ───────────────────────────────────────────────────────────────
# Sends all outbound traffic (0.0.0.0/0) through the internet gateway.

resource "oci_core_route_table" "public" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "app-public-rt"

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.igw.id
  }
}

# ── Security List ─────────────────────────────────────────────────────────────
# Stateful firewall rules attached to the public subnet.

resource "oci_core_security_list" "app" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.main.id
  display_name   = "app-security-list"

  # SSH — restricted to admin_cidr (set this to your own IP)
  ingress_security_rules {
    protocol  = "6" # TCP
    source    = var.admin_cidr
    stateless = false
    tcp_options {
      min = 22
      max = 22
    }
  }

  # HTTP — open to the world
  ingress_security_rules {
    protocol  = "6"
    source    = "0.0.0.0/0"
    stateless = false
    tcp_options {
      min = 80
      max = 80
    }
  }

  # HTTPS — open to the world
  ingress_security_rules {
    protocol  = "6"
    source    = "0.0.0.0/0"
    stateless = false
    tcp_options {
      min = 443
      max = 443
    }
  }

  # App port — configurable via var.app_port (default 8080)
  ingress_security_rules {
    protocol  = "6"
    source    = "0.0.0.0/0"
    stateless = false
    tcp_options {
      min = var.app_port
      max = var.app_port
    }
  }

  # Allow all outbound traffic
  egress_security_rules {
    protocol    = "all"
    destination = "0.0.0.0/0"
    stateless   = false
  }
}

# ── Public Subnet ─────────────────────────────────────────────────────────────

resource "oci_core_subnet" "public" {
  compartment_id    = var.compartment_ocid
  vcn_id            = oci_core_vcn.main.id
  cidr_block        = "10.0.1.0/24"
  display_name      = "app-public-subnet"
  dns_label         = "appsubnet"
  route_table_id    = oci_core_route_table.public.id
  security_list_ids = [oci_core_security_list.app.id]

  # false = instances in this subnet can be assigned a public IP
  prohibit_public_ip_on_vnic = false
}

# ─────────────────────────────────────────────────────────────────────────────
# COMPUTE
# ─────────────────────────────────────────────────────────────────────────────

# VM.Standard.A1.Flex is the Always Free ARM (Ampere) shape.
# Always Free pool: 4 OCPUs + 24 GB RAM shared across all A1 instances.
# This instance uses 1 OCPU + 6 GB — leaves plenty of headroom.

resource "oci_core_instance" "app" {
  compartment_id      = var.compartment_ocid
  availability_domain = local.ad
  display_name        = "app-server"

  shape = "VM.Standard.A1.Flex"
  shape_config {
    ocpus         = 1
    memory_in_gbs = 6
  }

  source_details {
    source_type = "image"
    source_id   = local.image_id

    # 50 GB boot volume — Always Free allows up to 200 GB total block storage
    boot_volume_size_in_gbs = 50
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.public.id
    assign_public_ip = true
    hostname_label   = "appserver"
  }

  metadata = {
    # Inject the SSH public key so the ubuntu user can log in
    ssh_authorized_keys = file(var.ssh_public_key_path)

    # cloud-init script runs on first boot (base64-encoded as required by OCI)
    user_data = base64encode(file("${path.module}/cloud-init.yaml"))
  }

  # Ignore image ID changes on re-plan — prevents unnecessary instance replacement
  # when OCI publishes a newer image and the data source returns a different ID.
  lifecycle {
    ignore_changes = [source_details[0].source_id]
  }
}
