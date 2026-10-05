#!/usr/bin/env bash
# scripts/request-cert.sh — request the ACM certificate and print the DNS validation records.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$ROOT/.env" ]]; then set -a; source "$ROOT/.env"; set +a; fi
source "$ROOT/scripts/lib/aws-guard.sh"

# ACM idempotency tokens expire after about an hour, so reuse an existing certificate first.
ARN="$(aws acm list-certificates --region ap-south-1 \
  --query "CertificateSummaryList[?DomainName=='api.muxaris.com'] | [0].CertificateArn" --output text)"
[[ -n "$ARN" && "$ARN" != "None" ]] || ARN="$(aws acm request-certificate --domain-name api.muxaris.com \
  --subject-alternative-names voice.muxaris.com --validation-method DNS \
  --idempotency-token muxaris-services --region ap-south-1 \
  --query CertificateArn --output text)"

RECORDS=""
for _ in $(seq 1 12); do
  RECORDS="$(aws acm describe-certificate --certificate-arn "$ARN" --region ap-south-1 \
    --query 'Certificate.DomainValidationOptions[?ResourceRecord!=`null`].[ResourceRecord.Name,ResourceRecord.Value]' \
    --output text)"
  [[ -n "$RECORDS" && "$RECORDS" != "None" ]] && break
  RECORDS=""
  sleep 5
done

echo "Add these CNAME records at GoDaddy (name, value):"
if [[ -n "$RECORDS" ]]; then
  echo "$RECORDS" | while IFS=$'\t' read -r name value; do
    echo "  CNAME $name -> $value"
  done
else
  echo "  (validation records not available yet; re-run this script in a minute)"
fi

STATUS="$(aws acm describe-certificate --certificate-arn "$ARN" --region ap-south-1 \
  --query 'Certificate.Status' --output text)"
echo "Status: $STATUS (deploy:services with CERT_ARN set adds HTTPS once this is ISSUED)"
echo "CERT_ARN=$ARN"
