#!/bin/bash

# This script installs git hooks for the project
# Run this after cloning the repository or when hooks are updated

echo "Installing git hooks..."

# Copy pre-push hook
cp scripts/pre-push .git/hooks/pre-push
chmod +x .git/hooks/pre-push

echo "✅ Git hooks installed successfully!"
echo ""
echo "The pre-push hook will now check TypeScript compilation before each push."
echo "This helps prevent pushing code with build errors."
