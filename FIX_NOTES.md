# Authentication Fix - Home Hub

## Problem
The app was logging in successfully but then immediately redirecting back to the login screen. This happened because:

1. **Race Conditions**: Multiple authentication events (`INITIAL_SESSION`, `TOKEN_REFRESHED`) were firing simultaneously, causing duplicate login attempts
2. **Poor State Management**: The `_loggedIn` flag wasn't being properly reset, causing early returns that prevented re-authentication
3. **No Login Guard**: Multiple concurrent login attempts could interfere with each other
4. **Incomplete Error Recovery**: When authentication failed, the flags weren't reset properly

## Changes Made

### 1. **app.js** - Added `_loginInProgress` flag
- Added a new `_loginInProgress` flag to prevent concurrent login attempts
- Modified the auth event handler to skip duplicate events when already logged in
- Updated fallback timers to check `_loginInProgress` before attempting login
- Added proper flag resets on both success and error paths
- Set `_loggedIn = true` BEFORE showing the app to prevent race conditions

### 2. **app.js** - Improved `_onLogin()` function
```javascript
async _onLogin(user) {
  // Prevent concurrent login attempts
  if (this._loginInProgress) {
    console.log('[Auth] Login already in progress, skip');
    return;
  }

  if (this._loggedIn) {
    console.log('[Auth] Already logged in, skip');
    return;
  }

  this._loginInProgress = true;

  try {
    // ... authentication logic ...
    
    // Set logged in BEFORE showing app
    this._loggedIn = true;
    Hub.state.user = user;
    
    // ... load settings and show app ...
    
    this._loginInProgress = false;
  } catch (e) {
    console.error('[Auth] _onLogin error:', e);
    this._loginInProgress = false;
    this._loggedIn = false; // Reset on error
    Hub.router.showScreen('login');
  }
}
```

### 3. **supabase.js** - Enhanced `signOut()` function
- Now properly resets ALL authentication flags including `_loginInProgress` and `_authHandled`
- Added logging for better debugging

### 4. **supabase.js** - Better error handling in `checkAccess()`
- Added more detailed error logging
- Separated error handling for database queries vs. empty results
- More descriptive console messages to help identify issues

## How to Deploy

1. Replace your existing files with the fixed versions:
   - `public/assets/app.js`
   - `public/assets/supabase.js`

2. Clear browser cache and localStorage to remove any stale session data

3. Test the authentication flow:
   - Sign in with Google
   - Refresh the page (should stay logged in)
   - Sign out and sign back in
   - Close tab and reopen (should restore session)

## Testing Checklist

- [ ] Fresh login works without redirecting back
- [ ] Page refresh maintains login state
- [ ] Browser tab close/reopen restores session
- [ ] Sign out clears session properly
- [ ] Multiple tabs don't interfere with each other
- [ ] Network delays don't cause login loops

## Debug Tips

Check the browser console for these log messages:
- `[Auth] Login already in progress, skip` - Good! Prevents race conditions
- `[Auth] Already logged in, skip` - Good! Prevents duplicate processing
- `[Auth] checkAccess → true` - Authentication successful
- `[Auth] ✓ Showing app` - App is being displayed

If you see repeated login attempts or bouncing between screens, check:
1. Supabase configuration (URL and key)
2. Database access (household_members and allowed_emails tables)
3. Network connectivity to Supabase
4. Browser console for specific error messages
