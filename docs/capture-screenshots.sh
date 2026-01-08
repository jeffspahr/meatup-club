#!/bin/bash
# Screenshot Capture Helper for Meatup.Club Documentation
#
# This script provides guidance for capturing and processing screenshots.
# Run from the docs/ directory.

set -e

SCREENSHOTS_DIR="./screenshots"

echo "=== Meatup.Club Screenshot Capture Helper ==="
echo ""

# Create screenshots directory if needed
mkdir -p "$SCREENSHOTS_DIR"

echo "Screenshots directory: $SCREENSHOTS_DIR"
echo ""

# Check for required tools
check_tool() {
    if command -v "$1" &> /dev/null; then
        echo "[OK] $1 is installed"
        return 0
    else
        echo "[--] $1 not found (optional)"
        return 1
    fi
}

echo "Checking tools..."
check_tool "convert" && HAS_IMAGEMAGICK=true || HAS_IMAGEMAGICK=false
check_tool "pngquant" && HAS_PNGQUANT=true || HAS_PNGQUANT=false
echo ""

echo "=== Screenshot Checklist ==="
echo ""
echo "Capture these pages from https://meatup.club:"
echo ""
echo "[ ] 01-landing.png        - Landing page (logged out)"
echo "[ ] 02-landing-features.png - Landing page scrolled down"
echo "[ ] 03-dashboard.png      - Dashboard home (logged in)"
echo "[ ] 04-quick-actions.png  - Dashboard quick actions section"
echo "[ ] 05-events.png         - Events page"
echo "[ ] 06-restaurants.png    - Restaurants page"
echo "[ ] 07-polls.png          - Polls page"
echo "[ ] 08-members.png        - Members directory"
echo "[ ] 09-profile.png        - Profile settings"
echo "[ ] 10-admin.png          - Admin panel"
echo ""

echo "=== PII Redaction Required ==="
echo ""
echo "Screenshots requiring redaction:"
echo "  - 03-dashboard.png: Redact name in 'Welcome, [Name]!'"
echo "  - 06-restaurants.png: Redact 'Suggested by [Name]'"
echo "  - 08-members.png: Redact ALL names, emails, and profile photos"
echo "  - 09-profile.png: Redact name and email address"
echo ""

if [ "$HAS_IMAGEMAGICK" = true ]; then
    echo "=== ImageMagick Redaction Examples ==="
    echo ""
    echo "# Cover text with gray box (adjust coordinates as needed):"
    echo "convert input.png -fill '#6B7280' -draw 'rectangle X1,Y1 X2,Y2' output.png"
    echo ""
    echo "# Blur a region (for profile photos):"
    echo "convert input.png -region WxH+X+Y -blur 0x10 output.png"
    echo ""
    echo "# Example for dashboard welcome message:"
    echo "convert 03-dashboard.png -fill '#6B7280' -draw 'rectangle 395,135 500,195' 03-dashboard-redacted.png"
    echo ""
fi

if [ "$HAS_PNGQUANT" = true ]; then
    echo "=== Optimize Screenshots ==="
    echo ""
    echo "Run this to optimize all screenshots:"
    echo "pngquant --quality=80-90 --ext .png --force $SCREENSHOTS_DIR/*.png"
    echo ""
fi

echo "=== macOS Screenshot Tips ==="
echo ""
echo "Capture window:  Cmd + Shift + 4, then Space, then click window"
echo "Capture region:  Cmd + Shift + 4, then drag to select"
echo "Full screen:     Cmd + Shift + 3"
echo ""
echo "Chrome DevTools: Cmd + Shift + P → 'Capture full size screenshot'"
echo ""

echo "=== Verification ==="
echo ""
echo "After adding screenshots, run:"
echo "  open slideshow.html"
echo ""
echo "To check all screenshots are present:"
for i in 01-landing 02-landing-features 03-dashboard 04-quick-actions 05-events 06-restaurants 07-polls 08-members 09-profile 10-admin; do
    if [ -f "$SCREENSHOTS_DIR/$i.png" ]; then
        echo "  [OK] $i.png"
    else
        echo "  [--] $i.png (missing)"
    fi
done
echo ""
