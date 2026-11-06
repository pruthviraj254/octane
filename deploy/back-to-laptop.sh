#!/usr/bin/env bash
# Moves the makers and indexer from the server back to this laptop, for a local demo.
# It stops them on the server first, so no maker ever runs in two places.
set -euo pipefail
cd "$(dirname "$0")/.."

KEY="$HOME/.ssh/octane-deploy.pem"
SERVER=ubuntu@13.232.70.181
FIREWALL=sg-0c79b41e664ccb930
SSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10"

# SSH only opens to known addresses, and a new network means a new one.
MY_IP=$(curl -fsS -m 8 https://checkip.amazonaws.com)
aws ec2 authorize-security-group-ingress --profile octane --region ap-south-1 \
  --group-id "$FIREWALL" --protocol tcp --port 22 --cidr "$MY_IP/32" >/dev/null 2>&1 || true

$SSH "$SERVER" 'sudo systemctl stop octane-maker@cautious octane-maker@aggressive octane-maker@balancer octane-maker@eth octane-indexer'
echo "Stopped on the server."

rsync -az --exclude '*.pid' --exclude '*.log' -e "$SSH" "$SERVER:octane/apps/makers/data/" apps/makers/data/
rsync -az -e "$SSH" "$SERVER:octane/apps/indexer/data/" apps/indexer/data/
echo "Copied the latest maker data back."

git switch main
cat <<'NEXT'

Now run these, each in its own terminal:
  pnpm makers
  pnpm indexer
  pnpm web
Then open http://127.0.0.1:3000. Start Eth from the desk at /makers/desk.
NEXT
