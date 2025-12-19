#!/bin/bash

# Setup CloudStack PR Scraper Cron Job
# This script installs the cron job for automated PR scraping

echo "Setting up CloudStack PR Scraper Cron Job..."
echo ""

# Check if running as root or with sudo
if [ "$EUID" -ne 0 ] && [ -z "$SUDO_USER" ]; then 
    echo "Warning: Not running as root. You may need sudo privileges to install cron jobs."
    echo ""
fi

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "Project directory: $PROJECT_DIR"
echo ""

# Ask user for cron schedule
echo "Choose a cron schedule for the PR scraper:"
echo "1) Every 15 minutes (recommended for active development)"
echo "2) Every 30 minutes"
echo "3) Every hour"
echo "4) Every 2 hours"
echo "5) Every 6 hours"
echo "6) Daily at midnight"
echo "7) Custom (you will enter cron expression)"
echo ""

read -p "Enter your choice (1-7): " choice

case $choice in
    1)
        CRON_SCHEDULE="*/15 * * * *"
        DESCRIPTION="every 15 minutes"
        ;;
    2)
        CRON_SCHEDULE="*/30 * * * *"
        DESCRIPTION="every 30 minutes"
        ;;
    3)
        CRON_SCHEDULE="0 * * * *"
        DESCRIPTION="every hour"
        ;;
    4)
        CRON_SCHEDULE="0 */2 * * *"
        DESCRIPTION="every 2 hours"
        ;;
    5)
        CRON_SCHEDULE="0 */6 * * *"
        DESCRIPTION="every 6 hours"
        ;;
    6)
        CRON_SCHEDULE="0 0 * * *"
        DESCRIPTION="daily at midnight"
        ;;
    7)
        read -p "Enter custom cron expression (e.g., '*/15 * * * *'): " CRON_SCHEDULE
        DESCRIPTION="custom schedule"
        ;;
    *)
        echo "Invalid choice. Defaulting to every hour."
        CRON_SCHEDULE="0 * * * *"
        DESCRIPTION="every hour"
        ;;
esac

echo ""
echo "Installing cron job to run $DESCRIPTION..."

# Create cron job entry
CRON_JOB="$CRON_SCHEDULE $SCRIPT_DIR/scraper-cron.sh"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "scraper-cron.sh"; then
    echo ""
    echo "Existing cron job found. Removing old entry..."
    (crontab -l 2>/dev/null | grep -v "scraper-cron.sh") | crontab -
fi

# Add new cron job
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo ""
echo "✓ Cron job installed successfully!"
echo ""
echo "Schedule: $DESCRIPTION ($CRON_SCHEDULE)"
echo "Script: $SCRIPT_DIR/scraper-cron.sh"
echo "Log file: /var/log/cloudstack-pr-scraper.log"
echo ""
echo "To view current cron jobs: crontab -l"
echo "To view scraper logs: tail -f /var/log/cloudstack-pr-scraper.log"
echo "To manually run the scraper: $SCRIPT_DIR/scraper-cron.sh"
echo ""
echo "To remove the cron job, run:"
echo "  crontab -l | grep -v 'scraper-cron.sh' | crontab -"
echo ""
