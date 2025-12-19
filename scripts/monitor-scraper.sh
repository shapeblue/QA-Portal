#!/bin/bash

# GitHub PR Scraper - Monitoring and Auto-Recovery Script
# This script checks if the scraper is healthy and restarts it if needed

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="/var/log/cloudstack-pr-scraper.log"
MONITOR_LOG="/var/log/cloudstack-pr-scraper-monitor.log"
LOCK_FILE="/tmp/scraper-monitor.lock"

# Check if another monitor instance is running
if [ -f "$LOCK_FILE" ]; then
    LOCK_PID=$(cat "$LOCK_FILE")
    if ps -p "$LOCK_PID" > /dev/null 2>&1; then
        echo "$(date): Monitor already running (PID: $LOCK_PID)" >> "$MONITOR_LOG"
        exit 0
    fi
fi

# Create lock file
echo $$ > "$LOCK_FILE"

# Function to log
log_monitor() {
    echo "$(date '+%Y-%m-%d %H:%M:%S'): $1" >> "$MONITOR_LOG"
}

# Function to check if scraper log is being updated
check_log_freshness() {
    if [ ! -f "$LOG_FILE" ]; then
        log_monitor "WARNING: Log file does not exist"
        return 1
    fi
    
    # Check if log was updated in last 2 hours (scraper should run at least every hour)
    LOG_AGE=$(( $(date +%s) - $(stat -c %Y "$LOG_FILE" 2>/dev/null || echo 0) ))
    MAX_AGE=$((2 * 60 * 60)) # 2 hours in seconds
    
    if [ "$LOG_AGE" -gt "$MAX_AGE" ]; then
        log_monitor "WARNING: Log file not updated in $((LOG_AGE / 60)) minutes"
        return 1
    fi
    
    return 0
}

# Function to check for recent errors
check_for_errors() {
    if [ ! -f "$LOG_FILE" ]; then
        return 1
    fi
    
    # Check last 100 lines for fatal errors (exclude normal "Error processing PR" messages)
    RECENT_ERRORS=$(tail -100 "$LOG_FILE" | grep -i "fatal\|crashed" | wc -l)
    
    if [ "$RECENT_ERRORS" -gt 3 ]; then
        log_monitor "WARNING: Found $RECENT_ERRORS critical errors in log"
        return 1
    fi
    
    return 0
}

# Function to check if cron job exists
check_cron_job() {
    if ! crontab -l 2>/dev/null | grep -q "scraper-cron.sh"; then
        log_monitor "ERROR: Cron job not found!"
        return 1
    fi
    return 0
}

# Function to check recent successful runs
check_recent_success() {
    if [ ! -f "$LOG_FILE" ]; then
        return 1
    fi
    
    # Check if we have successful completions in last 3 hours
    LAST_SUCCESS=$(grep "Scraping completed successfully" "$LOG_FILE" | tail -1)
    if [ -z "$LAST_SUCCESS" ]; then
        log_monitor "WARNING: No successful runs found in log"
        return 1
    fi
    
    return 0
}

# Function to trigger manual scraper run
trigger_scraper() {
    log_monitor "INFO: Triggering manual scraper run due to health check failure"
    
    # Run scraper
    cd "$PROJECT_DIR"
    /usr/bin/node "$PROJECT_DIR/scripts/scrape-github-prs.js" >> "$LOG_FILE" 2>&1
    
    if [ $? -eq 0 ]; then
        log_monitor "INFO: Manual scraper run completed successfully"
        return 0
    else
        log_monitor "ERROR: Manual scraper run failed"
        return 1
    fi
}

# Function to send alert (can be extended to email/slack)
send_alert() {
    local MESSAGE="$1"
    log_monitor "ALERT: $MESSAGE"
    
    # You can add email/slack notifications here
    # Example: echo "$MESSAGE" | mail -s "Scraper Alert" admin@example.com
}

# Main monitoring logic
main() {
    log_monitor "=== Starting health check ==="
    
    ISSUES_FOUND=0
    
    # Check 1: Cron job exists
    if ! check_cron_job; then
        send_alert "Cron job not configured!"
        ((ISSUES_FOUND++))
    fi
    
    # Check 2: Log file freshness
    if ! check_log_freshness; then
        send_alert "Scraper log not updated recently"
        ((ISSUES_FOUND++))
    fi
    
    # Check 3: Recent errors
    if ! check_for_errors; then
        send_alert "Multiple errors detected in scraper log"
        ((ISSUES_FOUND++))
    fi
    
    # Check 4: Recent successful runs
    if ! check_recent_success; then
        send_alert "No recent successful scraper runs"
        ((ISSUES_FOUND++))
    fi
    
    # If issues found, trigger manual run
    if [ "$ISSUES_FOUND" -gt 0 ]; then
        log_monitor "INFO: Found $ISSUES_FOUND issue(s), triggering recovery"
        trigger_scraper
    else
        log_monitor "INFO: Health check passed - scraper is healthy"
    fi
    
    log_monitor "=== Health check completed ==="
}

# Run main function
main

# Clean up lock file
rm -f "$LOCK_FILE"

exit 0
