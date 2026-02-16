#!/bin/bash
# Copy script for Home Hub v2.0.1 fixed files
# Run this from your HOME HUB repository root directory

echo "🏠 Home Hub v2.0.1 - File Copy Script"
echo "====================================="
echo ""

# Get the path to the homehub-fixed folder
if [ -z "$1" ]; then
    echo "Usage: ./copy-files.sh /path/to/homehub-fixed"
    echo ""
    echo "Example:"
    echo "  ./copy-files.sh ~/Downloads/homehub-fixed"
    echo ""
    exit 1
fi

FIXED_DIR="$1"

# Check if the directory exists
if [ ! -d "$FIXED_DIR" ]; then
    echo "❌ Error: Directory not found: $FIXED_DIR"
    exit 1
fi

echo "📂 Source: $FIXED_DIR"
echo "📂 Target: $(pwd)"
echo ""

# Confirm before proceeding
read -p "Copy files to current directory? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo "Copying files..."
echo ""

# Copy files
echo "  ✓ Copying api/weather-aggregate.js"
cp "$FIXED_DIR/api/weather-aggregate.js" ./api/

echo "  ✓ Copying public/assets/app.js"
cp "$FIXED_DIR/public/assets/app.js" ./public/assets/

echo "  ✓ Copying public/assets/supabase.js"
cp "$FIXED_DIR/public/assets/supabase.js" ./public/assets/

echo "  ✓ Copying public/assets/calendar.js"
cp "$FIXED_DIR/public/assets/calendar.js" ./public/assets/

echo "  ✓ Copying public/assets/router.js"
cp "$FIXED_DIR/public/assets/router.js" ./public/assets/

echo "  ✓ Copying database-setup.sql"
cp "$FIXED_DIR/database-setup.sql" ./

echo ""
echo "✅ All files copied successfully!"
echo ""
echo "Next steps:"
echo "  1. Review changes: git status"
echo "  2. See diff: git diff"
echo "  3. Commit: git add -A && git commit -m 'Fix: v2.0.1 improvements'"
echo "  4. Push: git push origin main"
echo ""
