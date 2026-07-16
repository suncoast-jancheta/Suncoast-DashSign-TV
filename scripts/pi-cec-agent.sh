#!/bin/bash
# Suncoast Signages — HDMI-CEC agent for Raspberry Pi (and other Linux boxes
# with CEC support). Polls the screen's schedule every minute and physically
# turns the TV on/off over the HDMI cable.
#
# Setup on the Pi:
#   sudo apt install cec-utils
#   chmod +x pi-cec-agent.sh
#   ./pi-cec-agent.sh https://your-app.workers.dev <screen-id>
#   (for local testing use http://<server-ip>:8787 instead)
#
# Run it at boot by adding to /etc/rc.local (before "exit 0"), or as a
# systemd service:
#   /path/to/pi-cec-agent.sh https://your-app.workers.dev <screen-id> &
#
# The schedule itself is configured per screen in the admin dashboard
# ("Screen Hours" on the screen's page). No schedule = TV stays on.

SERVER="$1"
SCREEN_ID="$2"

if [ -z "$SERVER" ] || [ -z "$SCREEN_ID" ]; then
  echo "Usage: $0 <server-url> <screen-id>" >&2
  echo "  e.g. $0 https://your-app.workers.dev abc123" >&2
  exit 1
fi

LAST_STATE=""

while true; do
  # Pass the Pi's local time so the schedule works in this TV's timezone.
  STATE=$(curl -sf --max-time 10 "$SERVER/api/player/$SCREEN_ID/power?time=$(date +%H:%M)")

  if [ -n "$STATE" ] && [ "$STATE" != "$LAST_STATE" ]; then
    case "$STATE" in
      on)
        echo "$(date '+%F %T') CEC: turning TV ON"
        echo "on 0" | cec-client -s -d 1 >/dev/null 2>&1
        ;;
      off)
        echo "$(date '+%F %T') CEC: putting TV in STANDBY"
        echo "standby 0" | cec-client -s -d 1 >/dev/null 2>&1
        ;;
    esac
    LAST_STATE="$STATE"
  fi

  sleep 60
done
