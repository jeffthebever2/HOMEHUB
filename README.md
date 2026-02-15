# 🏠 HOME HUB V2.0 UPGRADE

## 📦 What's in This Package

This package contains all the files you need to upgrade your Home Hub to v2.0. The file structure **exactly matches your GitHub repository** for easy upload.

## 📁 File Structure

```
homehub-v2-upgrade/
├── README.md                              ← You are here
│
├── 🆕 NEW FILES (Upload to GitHub as-is)
│   ├── api/
│   │   └── cron-chores-reset.js          ← Upload to /api/
│   ├── public/assets/
│   │   ├── player.js                      ← Upload to /public/assets/
│   │   ├── radio.js                       ← Upload to /public/assets/
│   │   └── music.js                       ← Upload to /public/assets/
│   └── migration-add-chore-reset-tracking.sql ← Run in Supabase, then commit
│
├── ✏️ UPDATED FILES (Replace on GitHub)
│   ├── vercel.json                        ← Replace /vercel.json
│   ├── public/
│   │   ├── config.js                      ← Replace /public/config.js
│   │   └── assets/
│   │       └── router.js                  ← Replace /public/assets/router.js
│
└── 📝 UPDATE-GUIDES/ (Manual edits required)
    ├── INDEX_HTML_UPDATES.md              → Edit /public/index.html
    ├── APP_JS_UPDATES.md                  → Edit /public/assets/app.js
    ├── CHORES_JS_UPDATES.md               → Edit /public/assets/chores.js
    ├── TREATS_JS_UPDATES.md               → Edit /public/assets/treats.js
    ├── STANDBY_JS_UPDATES.md              → Edit /public/assets/standby.js
    ├── WEATHER_JS_UPDATES.md              → Edit /public/assets/weather.js
    ├── README_V2.md                       ← Feature overview
    └── DEPLOYMENT_GUIDE.md                ← Full deployment guide
```

## 🚀 Deployment Instructions

### Step 1: Database Migration (5 minutes)
1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `migration-add-chore-reset-tracking.sql`
3. Execute
4. Verify: `SELECT * FROM households LIMIT 1;` shows new `last_chore_reset_date` column

### Step 2: Vercel Configuration (5 minutes)
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add: `SUPABASE_SERVICE_ROLE_KEY` (get from Supabase → Settings → API → service_role)
3. Save (deployment will auto-trigger)

### Step 3: Upload to GitHub (30 minutes)

#### Option A: Using GitHub Web Interface
1. Go to your repository on GitHub
2. **Upload NEW files:**
   - Navigate to `/api/` → Upload `api/cron-chores-reset.js`
   - Navigate to `/public/assets/` → Upload `player.js`, `radio.js`, `music.js`
   - Upload `migration-add-chore-reset-tracking.sql` to root

3. **Replace UPDATED files:**
   - Click on `/vercel.json` → Edit → Copy contents from `vercel.json` → Commit
   - Click on `/public/config.js` → Edit → Copy contents → Commit
   - Click on `/public/assets/router.js` → Edit → Copy contents → Commit

#### Option B: Using Git Command Line
```bash
# Copy new files to your local repo
cp -r homehub-v2-upgrade/api/cron-chores-reset.js your-repo/api/
cp homehub-v2-upgrade/public/assets/player.js your-repo/public/assets/
cp homehub-v2-upgrade/public/assets/radio.js your-repo/public/assets/
cp homehub-v2-upgrade/public/assets/music.js your-repo/public/assets/
cp homehub-v2-upgrade/migration-add-chore-reset-tracking.sql your-repo/

# Replace updated files
cp homehub-v2-upgrade/vercel.json your-repo/
cp homehub-v2-upgrade/public/config.js your-repo/public/
cp homehub-v2-upgrade/public/assets/router.js your-repo/public/assets/

# Commit and push
git add .
git commit -m "Add automatic chore reset, music, and radio features"
git push
```

### Step 4: Apply Manual Updates (30-60 minutes)

You need to manually edit these 6 files. Each has a guide in `UPDATE-GUIDES/`:

1. **`public/index.html`** - Use `INDEX_HTML_UPDATES.md`
   - Major: Complete design system overhaul
   - Find/replace CSS and HTML sections as shown

2. **`public/assets/app.js`** - Use `APP_JS_UPDATES.md`
   - Add player/radio/music init
   - Add chore reset call on login
   - Update page routing

3. **`public/assets/chores.js`** - Use `CHORES_JS_UPDATES.md`
   - Add confetti animation
   - Add category icons
   - Enhanced UI with progress bars

4. **`public/assets/treats.js`** - Use `TREATS_JS_UPDATES.md`
   - Add timestamp support
   - Add recent history to dashboard

5. **`public/assets/standby.js`** - Use `STANDBY_JS_UPDATES.md`
   - Add Now Playing widget integration

6. **`public/assets/weather.js`** - Use `WEATHER_JS_UPDATES.md`
   - Enhanced visuals and animations

**Each guide has clear FIND/REPLACE instructions. Open the guide and your file side-by-side.**

After editing each file, commit to GitHub:
```bash
git add public/index.html
git commit -m "Apply design system updates"
# Repeat for each file
```

### Step 5: Test (30 minutes)
1. Visit `your-app.vercel.app/api/cron-chores-reset` - should return JSON
2. Check dashboard - should show bento grid layout
3. Check Music and Radio pages appear in navigation
4. Test Now Playing widget
5. Verify no console errors (F12)
6. Wait 24 hours - chores should auto-reset

## ✨ What You're Getting

- ⏰ **Automatic daily chore resets** (server-side cron, no admin required)
- 🎵 **Music tab** with YouTube Music
- 📻 **Radio tab** with live streaming
- 🎮 **Now Playing widget** on dashboard and standby
- ✨ **Enhanced chores UI** with confetti, animations, progress bars
- 🐕 **Treat history** with timestamps on dashboard
- 📊 **Bento grid dashboard** with beautiful asymmetric layout
- 🎨 **Complete design system** with elevated dark mode
- 🖥️ **Standby mode** with Ken Burns photo effect
- 🌤️ **Better weather** with animated icons

## 📋 Checklist

Before starting:
- [ ] I've read this README
- [ ] I have access to Supabase dashboard
- [ ] I have access to Vercel dashboard
- [ ] I have access to GitHub repository
- [ ] I have 1-2 hours available

After deployment:
- [ ] Database migration executed
- [ ] Vercel env var set
- [ ] New files uploaded to GitHub
- [ ] Updated files replaced on GitHub
- [ ] Manual edits applied to 6 files
- [ ] `/api/cron-chores-reset` returns JSON
- [ ] Dashboard shows new layout
- [ ] Music/Radio pages work
- [ ] No console errors

## 🆘 Need Help?

1. **Can't upload to GitHub?** Use the GitHub web interface - navigate to each folder and upload files directly
2. **Confused by update guides?** Each guide has clear FIND/REPLACE sections - just search for the text and replace it
3. **Environment variables?** SUPABASE_SERVICE_ROLE_KEY is in Supabase Dashboard → Settings → API → service_role (secret key)
4. **Cron not working?** Check Vercel Dashboard → Deployments → Your latest deployment → Functions → cron-chores-reset

See `UPDATE-GUIDES/DEPLOYMENT_GUIDE.md` for detailed troubleshooting.

## 📚 Documentation

- `UPDATE-GUIDES/README_V2.md` - Complete feature overview
- `UPDATE-GUIDES/DEPLOYMENT_GUIDE.md` - Detailed deployment guide with troubleshooting
- Each `*_UPDATES.md` file - Step-by-step edit instructions

## ⚠️ Important Notes

- ✅ All changes are **backward compatible**
- ✅ **Non-breaking** - existing features remain intact
- ✅ You can deploy in stages (backend first, then UI)
- ✅ Easy rollback - just revert your GitHub commits

## 🎯 Estimated Time

- Database + Vercel setup: 10 min
- Upload files to GitHub: 30 min
- Apply manual updates: 30-60 min
- Testing: 30 min
- **Total: 1.5-2.5 hours**

---

**Ready to upgrade?** Start with Step 1 above! 🚀

**Questions?** Check `UPDATE-GUIDES/DEPLOYMENT_GUIDE.md` for detailed instructions.
