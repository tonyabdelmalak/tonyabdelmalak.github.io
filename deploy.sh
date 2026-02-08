#!/bin/bash

# GitHub Deployment Script
# Run this script to commit and push changes to GitHub

echo "========================================"
echo "GitHub Deployment Script"
echo "========================================"
echo ""

# Set your GitHub token
GIT_TOKEN="YOUR_GITHUB_TOKEN_HERE"
GIT_REPO="tonyabdelmalak/tonyabdelmalak.github.io"

# Configure git remote with token
echo "[1/5] Configuring git remote..."
git remote set-url origin "https://${GIT_TOKEN}@github.com/${GIT_REPO}.git"
echo "✅ Remote configured"
echo ""

# Check current branch
echo "[2/5] Checking current branch..."
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: ${CURRENT_BRANCH}"
echo ""

# Add all changes
echo "[3/5] Adding changes..."
git add index.html SKILLS_ICONS_MOBILE_FIX_FINAL.md
git status --short
echo "✅ Changes staged"
echo ""

# Commit changes
echo "[4/5] Committing changes..."
git commit -m "CRITICAL FIX: Skills icons 20px for mobile (406px devices)"
echo "✅ Changes committed"
echo ""

# Push to GitHub
echo "[5/5] Pushing to GitHub..."
git push origin ${CURRENT_BRANCH}
echo "✅ Pushed to GitHub!"
echo ""

echo "========================================"
echo "✅ DEPLOYMENT COMPLETE!"
echo "========================================"
echo ""
echo "GitHub Pages will deploy in 2-3 minutes."
echo "Check: https://tonyabdelmalak.com"
echo ""
echo "Test on your mobile device (406px):"
echo "- Pull down to refresh (hard refresh)"
echo "- Skills icons should be 20px (much smaller)"
echo ""
