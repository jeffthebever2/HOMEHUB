# 🚀 Git Commands - Quick Reference

## Step-by-Step Deployment

### 1. Navigate to Your Repository
```bash
cd /path/to/your/homehub
```

### 2. Copy Fixed Files
```bash
# Copy all files from the homehub-fixed folder
cp -r /path/to/homehub-fixed/api/weather-aggregate.js ./api/
cp -r /path/to/homehub-fixed/public/assets/app.js ./public/assets/
cp -r /path/to/homehub-fixed/public/assets/supabase.js ./public/assets/
cp -r /path/to/homehub-fixed/public/assets/calendar.js ./public/assets/
cp -r /path/to/homehub-fixed/public/assets/router.js ./public/assets/
cp -r /path/to/homehub-fixed/database-setup.sql ./
```

### 3. Check What Changed
```bash
git status
git diff
```

### 4. Stage All Changes
```bash
git add -A
```

### 5. Commit with Detailed Message
```bash
git commit -m "Fix: Security, performance, and error handling improvements (v2.0.1)

Changes:
- Protect debug bypass in production (security)
- Fix race condition in login flow
- Add debounced idle timer (performance)
- Improve error logging throughout
- Add calendar cache clearing
- Make API timeout configurable
- Add configuration constants
- Update database schema documentation
"
```

### 6. Push to GitHub
```bash
git push origin main
```

### 7. Monitor Vercel Deployment
```
Go to: https://vercel.com/dashboard
Watch your deployment progress
```

---

## Alternative: Single-Line Commands

### If you want to copy all at once:
```bash
# From the homehub-fixed directory
cd /path/to/homehub-fixed
cp -r api/* /path/to/your/homehub/api/
cp -r public/* /path/to/your/homehub/public/
cp database-setup.sql /path/to/your/homehub/
```

### Quick commit and push:
```bash
cd /path/to/your/homehub
git add -A && git commit -m "Fix: v2.0.1 improvements" && git push origin main
```

---

## 🔄 Rollback Commands

### If something goes wrong:

#### Option 1: Revert last commit
```bash
git revert HEAD
git push origin main
```

#### Option 2: Hard reset (⚠️ use with caution)
```bash
git reset --hard HEAD~1
git push origin main --force
```

#### Option 3: Via Vercel Dashboard
1. Go to https://vercel.com/dashboard
2. Select your project
3. Go to Deployments
4. Find previous working deployment
5. Click "Promote to Production"

---

## 🧪 Test Commands

### After deployment, test locally:
```bash
# If you have a local dev server
npm run dev
# or
vercel dev

# Then open: http://localhost:3000
```

### Check Vercel logs:
```bash
vercel logs
```

---

## 📋 Verification Checklist

After `git push`:

```
□ Vercel deployment started (check dashboard)
□ Deployment succeeded (green checkmark)
□ Visit production site
□ Sign in with Google
□ Test calendar selection in Settings
□ Try /#letmein (should be blocked in production)
□ Move mouse rapidly (should be smooth)
□ Check browser console for proper error logging
```

---

## 💡 Pro Tips

### See commit history:
```bash
git log --oneline -5
```

### See what files changed:
```bash
git diff --name-only HEAD~1
```

### Create a tag for this version:
```bash
git tag -a v2.0.1 -m "Security and performance improvements"
git push origin v2.0.1
```

### Check which branch you're on:
```bash
git branch
```

### Make sure you're on main:
```bash
git checkout main
```

---

## 🆘 Common Issues

**Issue:** `git push` rejected  
**Solution:** Pull first: `git pull origin main`, then push

**Issue:** Merge conflicts  
**Solution:** These files shouldn't conflict, but if they do:
```bash
git status  # See which files have conflicts
# Edit the conflicting files
git add <conflicted-file>
git commit -m "Resolve merge conflicts"
git push origin main
```

**Issue:** Accidentally committed to wrong branch  
**Solution:**
```bash
git checkout main
git cherry-pick <commit-hash>
git push origin main
```

---

**Need help?** Check the main README.md in the homehub-fixed folder!
