# Cloudflare Pages Auto-Deploy Setup Guide

## ✅ What's Been Created

I've added a GitHub Actions workflow that automatically deploys your portfolio to Cloudflare Pages whenever you push to the `main` branch.

**File Created**: `.github/workflows/cloudflare-pages.yml`

---

## 🔧 Setup Required

To enable auto-deployment, you need to configure GitHub Secrets:

### Step 1: Get Your Cloudflare API Token

1. **Log in to Cloudflare Dashboard**: https://dash.cloudflare.com/
2. **Go to**: My Profile → API Tokens
3. **Click**: "Create Token"
4. **Use Template**: "Edit Cloudflare Workers" or create custom token with:
   - **Permissions**:
     - Account → Cloudflare Pages → Edit
     - Account → Account Settings → Read
   - **Account Resources**: Include → Your Account
5. **Copy the token** (you'll only see it once!)

### Step 2: Get Your Cloudflare Account ID

1. **Go to**: Cloudflare Dashboard → Workers & Pages
2. **Look for**: Account ID on the right sidebar
3. **Copy it** (format: `59fea97fab54fbd4d4168ccaa1fa3410`)

### Step 3: Add Secrets to GitHub

1. **Go to**: https://github.com/tonyabdelmalak/tonyabdelmalak.github.io/settings/secrets/actions
2. **Click**: "New repository secret"
3. **Add two secrets**:

   **Secret 1:**
   - Name: `CLOUDFLARE_API_TOKEN`
   - Value: [Paste your API token from Step 1]

   **Secret 2:**
   - Name: `CLOUDFLARE_ACCOUNT_ID`
   - Value: [Paste your Account ID from Step 2]

---

## 🚀 How It Works

### Automatic Deployment

Once configured, the workflow will:

1. **Trigger** on every push to `main` branch
2. **Checkout** your code
3. **Deploy** to Cloudflare Pages automatically
4. **Complete** in ~30-60 seconds

### Manual Deployment

You can also trigger deployments manually:

1. Go to: https://github.com/tonyabdelmalak/tonyabdelmalak.github.io/actions
2. Click: "Deploy to Cloudflare Pages"
3. Click: "Run workflow" → "Run workflow"

---

## 📊 Cloudflare Pages Project Setup

### Option 1: Let the Workflow Create It (Recommended)

The workflow will automatically create a Cloudflare Pages project named `tonyabdelmalak-portfolio` on first run.

### Option 2: Create Manually

1. **Go to**: https://dash.cloudflare.com/ → Workers & Pages
2. **Click**: "Create application" → "Pages" → "Connect to Git"
3. **Select**: Your GitHub repository
4. **Configure**:
   - Project name: `tonyabdelmalak-portfolio`
   - Production branch: `main`
   - Build command: (leave empty - static site)
   - Build output directory: `/`
5. **Save and Deploy**

---

## 🔍 Verify Deployment

### Check GitHub Actions

1. **Go to**: https://github.com/tonyabdelmalak/tonyabdelmalak.github.io/actions
2. **Look for**: "Deploy to Cloudflare Pages" workflow
3. **Check status**: Should show green checkmark ✅

### Check Cloudflare Dashboard

1. **Go to**: https://dash.cloudflare.com/ → Workers & Pages
2. **Find**: `tonyabdelmalak-portfolio` project
3. **View**: Deployment history and live URL

### Your Live URL

After first deployment, your site will be available at:
- **Cloudflare Pages URL**: `https://tonyabdelmalak-portfolio.pages.dev`
- **Custom Domain**: You can add `tonyabdelmalak.com` in Cloudflare Pages settings

---

## 🎯 Current Setup Summary

### Existing Workflows

1. **`deploy-worker.yml`** - Deploys chat widget Cloudflare Worker
   - Triggers: Push to `main`
   - Deploys: `chat-widget/worker.js`
   - Endpoint: `https://my-chat-agent.tonyabdelmalak.workers.dev/chat`

2. **`jekyll-docker.yml`** - Builds Jekyll site (for GitHub Pages)
   - Triggers: Push to `main`
   - Purpose: GitHub Pages compatibility

3. **`cloudflare-pages.yml`** ⭐ NEW
   - Triggers: Push to `main`
   - Deploys: Entire static site to Cloudflare Pages
   - Purpose: Fast global CDN deployment

---

## 🔄 Migration from GitHub Pages to Cloudflare Pages

### Why Cloudflare Pages?

- ✅ **Faster**: Global CDN with edge caching
- ✅ **Better Performance**: Automatic optimization
- ✅ **Unlimited Bandwidth**: No limits
- ✅ **Preview Deployments**: Every PR gets a preview URL
- ✅ **Analytics**: Built-in Web Analytics
- ✅ **Free SSL**: Automatic HTTPS

### Keep Both (Recommended)

You can keep both GitHub Pages and Cloudflare Pages active:

- **GitHub Pages**: `https://tonyabdelmalak.github.io`
- **Cloudflare Pages**: `https://tonyabdelmalak-portfolio.pages.dev`
- **Custom Domain**: Point to either one

### Switch to Cloudflare Pages Only

If you want to use only Cloudflare Pages:

1. **Disable GitHub Pages**:
   - Go to: Repository Settings → Pages
   - Set Source to "None"

2. **Update Custom Domain**:
   - In Cloudflare Pages, add custom domain `tonyabdelmalak.com`
   - Update DNS records as instructed

---

## 🐛 Troubleshooting

### Workflow Fails with "API Token Invalid"

- **Check**: Token has correct permissions (Cloudflare Pages → Edit)
- **Verify**: Token hasn't expired
- **Regenerate**: Create new token and update GitHub secret

### Workflow Fails with "Account ID Invalid"

- **Check**: Account ID is correct (32 characters)
- **Verify**: No extra spaces in GitHub secret
- **Find**: Account ID in Cloudflare Dashboard → Workers & Pages

### Deployment Succeeds but Site Not Updated

- **Wait**: Cloudflare Pages can take 1-2 minutes to propagate
- **Clear Cache**: Hard refresh browser (Ctrl+Shift+R)
- **Check**: Cloudflare Pages dashboard for deployment status

### Chat Widget Not Working

- **Verify**: Worker is deployed via `deploy-worker.yml`
- **Check**: Worker endpoint in `index.html` is correct
- **Test**: Visit worker URL directly to verify it's running

---

## 📞 Next Steps

1. ✅ **Add GitHub Secrets** (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID)
2. ✅ **Push a change** to trigger first deployment
3. ✅ **Verify** deployment in GitHub Actions
4. ✅ **Check** Cloudflare Pages dashboard
5. ✅ **Add custom domain** (optional)

---

## 📚 Resources

- **Cloudflare Pages Docs**: https://developers.cloudflare.com/pages/
- **GitHub Actions Docs**: https://docs.github.com/en/actions
- **Cloudflare Pages Action**: https://github.com/cloudflare/pages-action

---

**Created**: February 7, 2026  
**Status**: ⏳ Awaiting GitHub Secrets Configuration  
**Next Action**: Add CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to GitHub Secrets
