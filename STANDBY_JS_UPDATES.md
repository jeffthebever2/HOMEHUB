# HOME HUB UPGRADE - TEST CHECKLIST & DEPLOYMENT GUIDE

## PRE-DEPLOYMENT CHECKLIST

### 1. Environment Variables (Vercel)
Ensure these environment variables are set in your Vercel project:

```
SUPABASE_URL=https://cmaefwhqoykittrwiobw.supabase.co
SUPABASE_SERVICE_ROLE_KEY=[your-service-role-key]
```

Get the service role key from:
Supabase Dashboard → Settings → API → service_role (secret)

### 2. Database Migration
Run the new migration in Supabase SQL Editor:

```sql
-- Copy contents of migration-add-chore-reset-tracking.sql
-- and execute in Supabase SQL Editor
```

Verify the migration:
```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'households';
-- Should show last_chore_reset_date column
```

### 3. File Deployment Order

Deploy in this order to avoid breaking changes:

1. **Database first**: Run SQL migration
2. **Backend**: Deploy API files and vercel.json
3. **Frontend**: Deploy public/ files

## DEPLOYMENT STEPS

### Step 1: Database Migration
1. Open Supabase Dashboard → SQL Editor
2. Paste contents of `migration-add-chore-reset-tracking.sql`
3. Execute
4. Verify: `SELECT * FROM households LIMIT 1;` should show new column

### Step 2: Deploy Backend Files
```bash
# Commit these files:
git add api/cron-chores-reset.js
git add vercel.json
git commit -m "Add automatic chore reset cron job"
git push
```

Vercel will auto-deploy. Wait for deployment to complete.

### Step 3: Test Cron Endpoint Manually
```bash
# Visit or curl:
https://your-app.vercel.app/api/cron-chores-reset

# Should return JSON:
{
  "message": "Processed N household(s)",
  "date": "2026-02-15",
  "processed": N
}
```

### Step 4: Deploy Frontend Files

Update files in this order:

1. **Config**:
   ```bash
   git add public/config.js
   ```

2. **Router**:
   ```bash
   git add public/assets/router.js
   ```

3. **New Modules**:
   ```bash
   git add public/assets/player.js
   git add public/assets/radio.js
   git add public/assets/music.js
   ```

4. **Updated Modules**:
   Apply changes from update guides:
   - APP_JS_UPDATES.md → public/assets/app.js
   - CHORES_JS_UPDATES.md → public/assets/chores.js
   - TREATS_JS_UPDATES.md → public/assets/treats.js
   - STANDBY_JS_UPDATES.md → public/assets/standby.js
   - WEATHER_JS_UPDATES.md → public/assets/weather.js

5. **HTML**:
   Apply changes from INDEX_HTML_UPDATES.md → public/index.html

6. **Commit and push**:
   ```bash
   git add public/
   git commit -m "Major UI upgrade: bento grid, music/radio, enhanced visuals"
   git push
   ```

## POST-DEPLOYMENT TESTING

### A. Automatic Chore Reset
1. **Test Manual Call**:
   - Visit: `/api/cron-chores-reset`
   - Should see JSON response with processed count

2. **Test Idempotency**:
   - Call endpoint twice in same day
   - Second call should process 0 households
   - Verify: `SELECT last_chore_reset_date FROM households;`

3. **Wait for Cron**:
   - Cron runs hourly (0 * * * *)
   - Check Vercel logs next hour
   - Verify chores reset correctly

4. **Test Client Fallback**:
   - Sign out and sign back in
   - Check browser console for chore reset call
   - Should see: `[App] Calling chore reset endpoint...`

### B. Music Page
1. **Navigate**: Go to Music page from dashboard
2. **Verify iframe loads**: YouTube Music or playlist should load
3. **Test playback**: Start playing music
4. **Check Now Playing**: Dashboard should show "YouTube Music" playing
5. **Test Bluetooth help**: Should show pairing instructions

### C. Radio Page
1. **Navigate**: Go to Radio page
2. **Verify station list**: Should see all configured stations
3. **Test station playback**: Click a station, should play
4. **Check Now Playing**: Dashboard should show station name
5. **Test controls**: Pause, Resume, Stop should work
6. **Test persistence**: Navigate away and back, should keep playing

### D. Now Playing Widget
1. **Dashboard**: Should appear in bento grid
2. **Standby**: Should appear in glassmorphism cards
3. **Test states**:
   - Nothing playing → shows placeholder
   - Radio playing → shows station name + controls
   - Music playing → shows "YouTube Music" + controls
4. **Test controls**:
   - Play/Pause buttons work
   - Stop button works
   - State persists across page navigation

### E. Chores UI Improvements
1. **Category icons**: Should see colored dots (🔵 daily, 🟡 weekly)
2. **Progress bars**: Each category shows completion percentage
3. **Checkbox animation**: Clicking checkbox should be smooth
4. **Confetti**: Completing chore should burst confetti
5. **Hover effects**: Edit/delete buttons appear on hover (desktop)
6. **Mobile**: Buttons visible on mobile (touch)

### F. Barker (Dog) Treat Improvements
1. **Dashboard widget**: Shows recent 5 treats with times
2. **Timestamp**: New treats should have timestamp
3. **Calorie calculation**: Should only count TODAY's treats
4. **History link**: "View full history →" goes to treats page
5. **Optional sparkline**: If implemented, shows 7-day bars

### G. Standby Enhancements
1. **Ken Burns effect**: Photo should slowly zoom/pan
2. **Now Playing card**: Should show current playback
3. **Glassmorphism**: Cards should have blur backdrop
4. **Wake behavior**: Tap should wake up properly
5. **Optional ripple**: If implemented, should ripple from tap point

### H. Dashboard Bento Grid
1. **Layout**:
   - Mobile: stacked cards
   - Tablet: 2-column grid
   - Desktop: 3-column asymmetric grid
2. **Card sizes**: Weather (small), Chores (medium), Calendar (large)
3. **Animations**: Cards should stagger-fade in
4. **Hover effects**: Cards lift 4px on hover
5. **Responsive**: Breaks properly on all screen sizes

### I. Design System
1. **Typography**: Text uses Inter font, proper scale
2. **Colors**: Dark mode with elevated palette (#0B0F19 base)
3. **Spacing**: Consistent spacing variables
4. **Motion**: Smooth transitions, respects reduced-motion
5. **Cards**: Gradient backgrounds, proper shadows

### J. General Functionality
1. **Auth**: Login/logout still works
2. **Routing**: All pages navigate correctly (dashboard, standby, weather, chores, treats, music, radio, settings, status)
3. **Weather**: Still loads and displays correctly
4. **Calendar**: Still works
5. **Photos**: Immich integration still works
6. **Settings**: Can still save settings

## TROUBLESHOOTING

### Chore Reset Not Working
- Check Vercel env vars: `SUPABASE_SERVICE_ROLE_KEY` must be set
- Check cron logs in Vercel dashboard
- Manually call `/api/cron-chores-reset` to test
- Verify migration ran: `SELECT last_chore_reset_date FROM households;`

### Music/Radio Not Loading
- Check browser console for errors
- Verify config.js has correct URLs/playlist IDs
- Test YouTube Music manually: https://music.youtube.com
- If blocked, verify fallback playlist is configured

### Now Playing Not Updating
- Check that player.js is loaded before radio.js and music.js
- Verify `Hub.player.init()` is called in app.js
- Check that `updateUI()` is called when pages load
- Inspect widget containers exist: `#nowPlayingWidget`, `#standbyNowPlaying`

### Confetti Not Working
- Check browser console for JavaScript errors
- Verify chores.js has `_createConfetti` method
- Test in different browsers (some may block animations)

### Bento Grid Layout Broken
- Verify all CSS updates from INDEX_HTML_UPDATES.md are applied
- Check browser console for CSS errors
- Test responsive breakpoints (resize browser)
- Verify Tailwind CDN is loading

### Timestamp Issues (Treats)
- Old treats won't have timestamps (expected)
- New treats must have `ts: Date.now()`
- Check Firebase console: treats should show `ts` field
- Verify `todayStart` calculation is correct

## ROLLBACK PLAN

If issues occur:

1. **Immediate**: Revert frontend only
   ```bash
   git revert HEAD
   git push
   ```

2. **Keep cron**: Cron job is harmless, can stay active

3. **Full rollback**: Restore from backup
   ```bash
   git checkout main
   git push --force
   ```

## MONITORING

### Week 1
- Monitor Vercel cron logs daily
- Check chore reset happens correctly
- Watch for JavaScript errors in browser console
- Verify no performance degradation

### Week 2
- Verify chores reset on schedule
- Check treat timestamps are working
- Ensure Now Playing persists correctly
- Monitor for any user-reported issues

### Ongoing
- Cron logs: Vercel Dashboard → Cron
- Error logs: Browser console (F12)
- Performance: Lighthouse scores
- User feedback: Support channels

## SUCCESS METRICS

✅ Chores reset automatically every day
✅ Standby mode works correctly
✅ Now Playing persists between pages
✅ Radio plays and controls work
✅ Music tab loads only when opened
✅ Dashboard bento grid renders correctly
✅ No console errors
✅ All existing features still work
✅ Mobile responsive
✅ Performance maintained (< 3s load time)

## NOTES

- Cron job is timezone-aware (America/New_York)
- First cron run may take up to 1 hour after deployment
- Client fallback ensures chores reset even if cron fails
- All new features gracefully degrade if JS errors occur
- Design system respects user's reduced-motion preferences
