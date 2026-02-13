# 🚀 Quick Start - Admin Features

## 2-Minute Setup

### Step 1: Copy Files (30 seconds)
```bash
cd /path/to/your/homehub

# Copy the new control panel
cp /path/to/fixed/public/assets/control.js ./public/assets/

# Copy updated standby
cp /path/to/fixed/public/assets/standby.js ./public/assets/
```

### Step 2: Update HTML (1 minute)

Open `public/index.html` and find the control page section (around line 380).

**Find this:**
```html
    <div id="controlPage" class="page">
      <div class="max-w-4xl mx-auto p-4 md:p-6">
        <header class="flex items-center justify-between mb-6">
          <h1 class="text-3xl font-bold">🛰️ Site Control Center</h1>
```

**Replace with:**  
Copy the entire content from `index-control-section.html`

### Step 3: Deploy (30 seconds)
```bash
git add public/assets/control.js public/assets/standby.js public/index.html
git commit -m "Add admin panel with chore automation"
git push
```

---

## 🎯 Features You Just Installed

✅ **Automatic chore reset at midnight**
✅ **Today's chores only on standby**
✅ **Statistics dashboard**
✅ **User management**
✅ **System logs**
✅ **Completion history**

---

## 🔓 Access the Admin Panel

**Method 1:** Click the "🏠 Home Hub" title 7 times fast
**Method 2:** Type "control" on the keyboard

---

## ⚡ Enable Auto-Reset (First Time)

1. Access admin panel (7 clicks)
2. Go to "✅ Chores" tab
3. Click "Enable" button
4. Done! Chores will reset automatically at midnight

---

## 📊 View Statistics

1. Access admin panel
2. Go to "📈 Statistics" tab
3. See all completion data

---

## 🧪 Test It

**Test Standby:**
- Go to standby mode
- Only today's chores should show
- Check that other days are hidden

**Test Manual Reset:**
- Go to admin → Chores tab
- Click "Reset All Daily Chores Now"
- Verify chores reset to pending
- Check logs are preserved

**Test Auto-Reset:**
- Enable in admin panel
- Wait until midnight (or change system time)
- Verify chores automatically reset

---

## 📝 What Changed

### control.js - NEW
- Complete rewrite
- 6 admin tabs (Overview, Chores, Users, Stats, Logs, Site Control)
- Automatic reset system
- Statistics tracking
- ~850 lines of new code

### standby.js - UPDATED
- Filters chores by today's day
- Shows Daily + current weekday chores only
- Cleaner, more relevant view

### index.html - UPDATED
- New tabbed admin interface
- Better organization
- Mobile-responsive design

---

## 💾 Data Storage

**LocalStorage:**
- `chore_auto_reset_enabled` - On/off state
- `chore_last_reset_date` - Last reset time

**Database:**
- All completion logs preserved forever
- Chore status updated on reset
- No data is deleted

---

## 🔧 Configuration

### Change Reset Time
Edit `control.js` line ~200:
```javascript
// Current: midnight (0:00)
if (now.getHours() === 0 && now.getMinutes() < 2)

// Change to 6 AM:
if (now.getHours() === 6 && now.getMinutes() < 2)
```

### Change Check Interval
Edit `control.js` line ~180:
```javascript
// Current: every 60 seconds
setInterval(() => { ... }, 60000)

// Change to 30 seconds:
setInterval(() => { ... }, 30000)
```

---

## 🐛 Troubleshooting

**Can't access admin panel?**
- Verify you're an admin in Supabase `household_members` table
- Try signing out and back in

**Auto-reset not working?**
- Check if enabled in admin panel
- Verify browser isn't sleeping
- Look at browser console for errors

**Wrong chores showing on standby?**
- Verify chore categories are set correctly
- Check `category` column values in database
- Daily chores should have `category = 'Daily'`
- Weekly chores should have correct day name

**Statistics not loading?**
- Check `chore_logs` table exists
- Verify you have completion history
- Look for errors in browser console

---

## 🎉 You're Done!

Your Home Hub now has:
- ✅ Automatic chore management
- ✅ Professional admin interface
- ✅ Complete statistics tracking
- ✅ Smart standby display
- ✅ Zero manual resets needed

**Enjoy your automated household!** 🏠✨

---

## 📚 More Info

- **Complete Documentation:** See `ADMIN-FEATURES.md`
- **HTML Reference:** See `index-control-section.html`
- **Previous Fixes:** See original documentation files

**Version:** 2.1.0  
**Last Updated:** February 13, 2026
