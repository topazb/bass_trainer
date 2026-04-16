# OCI Always Free App Server — Terraform

A minimal Terraform project that provisions a single, public-facing VM on Oracle Cloud Infrastructure (OCI) using only **Always Free** resources.

---

## What gets created

| Resource | Details |
|---|---|
| VCN | `10.0.0.0/16` |
| Public subnet | `10.0.1.0/24` |
| Internet gateway | Attached to the VCN |
| Route table | All outbound traffic → IGW |
| Security list | SSH (admin only), HTTP/HTTPS, app port |
| Compute instance | `VM.Standard.A1.Flex` — 1 OCPU, 6 GB RAM |
| Boot volume | 50 GB |
| Public IP | Ephemeral (assigned to VNIC) |

Docker is installed automatically on first boot via cloud-init.

---

## Always Free note

OCI's Always Free tier (as of 2024) includes:

- **A1 Flex**: 4 OCPUs + 24 GB RAM total, shared across all A1 instances in your account
- **Block storage**: 200 GB total
- **Ephemeral public IPs**: Always free (reserved/static IPs have limits)

This project uses 1 OCPU + 6 GB RAM + 50 GB storage — well within those limits.

> **Verify before applying**: Always Free availability depends on your account type and region capacity.  
> Check each resource in the OCI Console to confirm it carries the **Always Free** label before applying.

---

## File overview

| File | Purpose |
|---|---|
| `main.tf` | Provider config, data sources, and all resources |
| `variables.tf` | Declared input variables with descriptions |
| `outputs.tf` | Values printed after apply (IP, SSH command) |
| `terraform.tfvars.example` | Template — copy to `terraform.tfvars` and fill in |
| `cloud-init.yaml` | First-boot script: installs Docker, adds ubuntu to docker group |
| `.gitignore` | Keeps state files and `terraform.tfvars` out of version control |

---

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) ≥ 1.3
- An OCI account with Always Free capacity available
- OCI API key configured for your user ([docs](https://docs.oracle.com/en-us/iaas/Content/API/Concepts/apisigningkey.htm))
- An SSH key pair (`ssh-keygen -t rsa -b 4096` if you need one)

---

## Setup

### 1. Clone / copy this project

```bash
cd oci-infra
```

### 2. Create your variables file

```bash
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` and fill in all your values:

```hcl
tenancy_ocid     = "ocid1.tenancy.oc1..aaaaaaaa..."
user_ocid        = "ocid1.user.oc1..aaaaaaaa..."
compartment_ocid = "ocid1.tenancy.oc1..aaaaaaaa..."   # root compartment = tenancy OCID
fingerprint      = "aa:bb:cc:dd:..."
private_key_path = "~/.oci/oci_api_key.pem"
region           = "us-ashburn-1"

ssh_public_key_path = "~/.ssh/id_rsa.pub"
admin_cidr          = "1.2.3.4/32"   # your IP — curl ifconfig.me
app_port            = 8080
```

### 3. Initialize Terraform

Downloads the OCI provider plugin.

```bash
terraform init
```

### 4. Preview what will be created

```bash
terraform plan
```

### 5. Apply

Creates all resources. Takes ~2–3 minutes for the instance to be fully provisioned.

```bash
terraform apply
```

Type `yes` when prompted.

### 6. Get the outputs

```bash
terraform output
```

Example output:

```
public_ip   = "129.153.x.x"
ssh_command = "ssh ubuntu@129.153.x.x"
```

### 7. SSH in

```bash
ssh ubuntu@<public_ip>
```

Docker should already be running:

```bash
docker info
```

---

## Deploying your app

Once on the server, you can run any Docker container:

```bash
docker run -d -p 8080:8080 your-image:tag
```

Or use Docker Compose:

```bash
git clone https://github.com/you/your-app.git
cd your-app
docker compose up -d
```

---

## Tear everything down

```bash
terraform destroy
```

This deletes **all** resources created by this project — instance, networking, everything. Confirm with `yes`.

---

## Security tips

- Set `admin_cidr` to your own IP (`curl ifconfig.me` → `"x.x.x.x/32"`). Leaving it as `0.0.0.0/0` exposes SSH to the entire internet.
- Your `terraform.tfvars` and `.terraform/` folder are gitignored — keep them that way.
- The OCI API private key (`private_key_path`) should have `chmod 600` permissions.
