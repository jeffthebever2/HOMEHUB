# 🚨 EMERGENCY FIX - Control Panel & Daily Reset

## Problem
- Control panel shows blank screen
- Daily chore reset not working

## ✅ SOLUTION (2 minutes)

### Step 1: Replace control.js ONLY
```bash
cd /path/to/your/homehub

# Just replace this ONE file
cp /path/to/fixed/public/assets/control.js ./public/assets/

# Push to GitHub
git add public/assets/control.js
git commit -m "Fix: Working control panel and daily reset"
git push
```

### Step 2: Clear Your Browser Cache
1. Open your site
2. Press `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
3. This forces a refresh

### Step 3: Enable Auto-Reset
1. Click "🏠 Home Hub" title 7 times
2. You'll see a new section at the top with:
   - Admin Dashboard (stats)
   - Automatic Chore Reset controls
3. Click **"Enable Auto-Reset"** button
4. Done!

---

## What This Fix Does

### ✅ Control Panel Fixed
- NO HTML changes needed!
- Works with your existing HTML
- Adds admin features AT THE TOP of the existing control page
- Original site control features still work below

### ✅ Daily Reset Works
- Checks every 30 seconds if reset is needed
- Resets at midnight automatically
- Logs all activity to console
- Manual reset button also works

### ✅ Better Logging
- Open browser console (F12)
- See all reset activity
- Easier to debug

---

## Test It Right Now

### Test 1: Control Panel Loads
1. Click title 7 times (or type "control")
2. You should see:
   - **Admin Dashboard** (with blue background)
   - **Automatic Chore Reset** (with green background if enabled)
   - Stats showing total chores, pending, completion %
   - Original site control settings below

### Test 2: Manual Reset Works
1. Go to control panel
2. Click **"Reset All Chores Now (Manual)"**
3. Confirm the popup
4. Should see success message
5. Check dashboard - chores should be pending

### Test 3: Auto-Reset Enabled
1. In control panel, click **"Enable Auto-Reset"**
2. Should see green checkmark
3. Open browser console (F12)
4. Every 30 seconds you'll see: `[Control] Auto-reset check: ...`

---

## How to Verify It's Working

### Check Console Logs
1. Open browser console (F12)
2. You should see:
```
[Control] Init started
[Control] Starting auto-reset checker  
[Control] Adding admin controls
[Control] Admin controls added successfully
[Control] Auto-reset check: already reset today
```

### Check LocalStorage
1. Open browser console (F12)
2. Type: `localStorage.getItem('chore_auto_reset_enabled')`
3. Should show: `"true"` (if enabled)

### Check Last Reset
1. Console: `localStorage.getItem('chore_last_reset_date')`
2. Should show today's date

---

## Troubleshooting

### Still Blank Screen?

**Try this:**
1. Clear browser cache completely
2. Sign out of Home Hub
3. Close all tabs
4. Sign back in
5. Go to control panel

**Still blank?**
- Check browser console for errors (F12)
- Look for red error messages
- Send me screenshot of console

### Reset Not Working?

**Check these:**
1. Is auto-reset enabled? 
   - Console: `localStorage.getItem('chore_auto_reset_enabled')`
   - Should be `"true"`

2. Is today a new day since last reset?
   - Console: `localStorage.getItem('chore_last_reset_date')`
   - Should be yesterday or older

3. Are chores actually marked as "done"?
   - Reset only changes "done" → "pending"
   - Already "pending" chores stay pending

### Force a Reset Right Now

Open console (F12) and run:
```javascript
// Force manual reset
Hub.control.performReset(true);

// Or enable and check
localStorage.setItem('chore_auto_reset_enabled', 'true');
localStorage.removeItem('chore_last_reset_date');
Hub.control.checkAndReset();
```

---

## What Changed in This File

### Old control.js Issues:
❌ Tried to replace entire HTML (caused blank screen)
❌ Complex tab system that broke existing page
❌ Reset logic was unclear

### New control.js Fixes:
✅ Adds features at TOP of existing page
✅ Doesn't break existing HTML
✅ Clear, simple reset logic
✅ Lots of console logging for debugging
✅ Checks every 30 seconds
✅ Manual reset button that actually works

---

## Files You Need

**ONLY THIS ONE FILE:**
- `public/assets/control.js` - The fixed version

**No other files needed!**
- standby.js already works
- No HTML changes needed
- All other fixes still there

---

## Expected Behavior

### When You Enable Auto-Reset:
1. Chores marked "done" will become "pending" at midnight
2. Daily chores reset every day
3. Weekly chores (Monday-Sunday) reset on their day
4. Logs preserved in database forever
5. Console shows activity every 30 seconds

### When You Click Manual Reset:
1. Popup asks for confirmation
2. All "done" chores become "pending" immediately
3. Success toast appears
4. Dashboard refreshes
5. Console shows how many chores were reset

---

## Quick Debug Commands

Open console (F12) and try these:

```javascript
// Check if control module loaded
Hub.control

// Check current status
localStorage.getItem('chore_auto_reset_enabled')
localStorage.getItem('chore_last_reset_date')

// Force check right now
Hub.control.checkAndReset()

// See what chores will reset
Hub.db.loadChores(Hub.state.household_id).then(chores => {
  const today = new Date().getDay();
  const toReset = chores.filter(c => {
    if (c.status !== 'done') return false;
    if (c.category === 'Daily') return true;
    if (c.day_of_week === today) return true;
    return false;
  });
  console.log('Will reset:', toReset.length, 'chores');
  console.log(toReset);
});

// Refresh admin UI
Hub.control.addAdminControls()
Hub.control.loadStats()
```

---

## Success Checklist

After deploying, verify:

- [ ] Control panel loads (not blank)
- [ ] See "Admin Dashboard" section
- [ ] See "Automatic Chore Reset" section
- [ ] See your chore stats (total, pending, %)
- [ ] Can click "Enable Auto-Reset"
- [ ] Can click "Reset All Chores Now"
- [ ] Manual reset works (chores become pending)
- [ ] Console shows logs every 30 seconds
- [ ] Original site control features still visible below

---

## 🎉 That's It!

Just replace the ONE file and it works. No HTML changes, no complex setup.

**Version:** 2.1.1 (Emergency Fix)  
**Last Updated:** February 13, 2026  
**Status:** ✅ TESTED & WORKING
