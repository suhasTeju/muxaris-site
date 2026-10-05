#!/usr/bin/env bash
# Regenerates packages/db/src/rds-ca.ts from the public RDS CA bundle. This is the only script in
# the repo that fetches from the internet; it touches no AWS account. Usage: scripts/update-rds-ca.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
URL="https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem"
PEM="$(mktemp)"
trap 'rm -f "$PEM"' EXIT
curl -fsSL "$URL" -o "$PEM"
grep -q -- '-----BEGIN CERTIFICATE-----' "$PEM" || { echo "downloaded file is not a PEM bundle" >&2; exit 1; }
if grep -q '`' "$PEM" || grep -qF '${' "$PEM"; then
  echo "PEM contains a backtick or \${ and cannot be embedded in a template literal" >&2
  exit 1
fi
{ echo "// Generated from $URL (public RDS CA bundle).";
  echo '// Regenerate with scripts/update-rds-ca.sh. Do not edit by hand.';
  echo 'export const RDS_GLOBAL_CA_BUNDLE = `'; cat "$PEM"; echo '`;'; } > "$ROOT/packages/db/src/rds-ca.ts"
echo "wrote packages/db/src/rds-ca.ts"
