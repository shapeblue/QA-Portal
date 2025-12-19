#!/bin/bash

# Setup Scraper Monitoring
# This script configures automated monitoring and recovery for the GitHub PR scraper

echo "=== GitHub PR Scraper - Monitoring Setup ==="
echo ""

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Check if monitor script exists
if [ ! -f "$SCRIPT_DIR/monitor-scraper.sh" ]; then
    echo "Error: monitor-scraper.sh not found!"
    exit 1
fi

echo "This will set up automated monitoring for the GitHub PR scraper."
echo ""
echo "The monitor will:"
echo "  - Check if scraper logs are being updated"
echo "  - Detect errors and failures"
echo "  - Automatically trigger recovery runs"
echo "  - Log all monitoring activity to /var/log/cloudstack-pr-scraper-monitor.log"
echo ""

# Ask user for monitoring frequency
echo "Choose monitoring frequency:"
echo "1) Every 30 minutes (recommended)"
echo "2) Every hour"
echo "3) Every 2 hours"
echo "4) Every 6 hours"
echo "5) Custom (you will enter cron expression)"
echo ""

read -p "Enter your choice (1-5): " choice

case $choice in
    1)
        CRON_SCHEDULE="*/30 * * * *"
        DESCRIPTION="every 30 minutes"
        ;;
    2)
        CRON_SCHEDULE="0 * * * *"
        DESCRIPTION="every hour"
        ;;
    3)
        CRON_SCHEDULE="0 */2 * * *"
        DESCRIPTION="every 2 hours"
        ;;
    4)
        CRON_SCHEDULE="0 */6 * * *"
        DESCRIPTION="every 6 hours"
        ;;
    5)
        read -p "Enter custom cron expression (e.g., '*/30 * * * *'): " CRON_SCHEDULE
        DESCRIPTION="custom schedule"
        ;;
    *)
        echo "Invalid choice. Defaulting to every hour."
        CRON_SCHEDULE="0 * * * *"
        DESCRIPTION="every hour"
        ;;
esac

echo ""
echo "Installing monitoring cron job to run $DESCRIPTION..."

# Create cron job entry
CRON_JOB="$CRON_SCHEDULE $SCRIPT_DIR/monitor-scraper.sh"

# Check if monitor cron job already exists
if crontab -l 2>/dev/null | grep -q "monitor-scraper.sh"; then
    echo ""
    echo "Existing monitoring cron job found. Removing old entry..."
    (crontab -l 2>/dev/null | grep -v "monitor-scraper.sh") | crontab -
fi

# Add new cron job
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo ""
echo "✓ Monitoring cron job installed successfully!"
echo ""
echo "Schedule: $DESCRIPTION ($CRON_SCHEDULE)"
echo "Monitor script: $SCRIPT_DIR/monitor-scraper.sh"
echo "Monitor log: /var/log/cloudstack-pr-scraper-monitor.log"
echo "Scraper log: /var/log/cloudstack-pr-scraper.log"
echo ""
echo "To test the monitor manually:"
echo "  $SCRIPT_DIR/monitor-scraper.sh"
echo ""
echo "To view monitoring logs:"
echo "  tail -f /var/log/cloudstack-pr-scraper-monitor.log"
echo ""
echo "To view all cron jobs:"
echo "  crontab -l"
echo ""
echo "To remove the monitoring cron job:"
echo "  crontab -l | grep -v 'monitor-scraper.sh' | crontab -"
echo ""
