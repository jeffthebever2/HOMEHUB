# Authentication Fix - Home Hub (v2)

## Problem
The app was logging in successfully but then immediately redirecting back to the login screen. This happened because:

1. **Race Conditions**: Multiple authentication events (`INITIAL_SESSION`, `TOKEN_REFRESHED`) were firing simultaneously, causing duplicate login attempts
2. **Poor State Management**: The `_loggedIn` flag wasn't being properly reset, causing early returns that prevented re-authentication
3. **No Login Guard**: Multiple concurrent login attempts could interfere with each other
4. **Router Interference**: Hash changes during OAuth redirect could trigger routing before auth completed
5. **Poor Error Handling**: Database errors were indistinguishable from "access denied", causing confusing UX
6. **Unexpected Sign-outs**: SIGNED_OUT events during login could abort the authentication process

## Changes Made

### 1. **app.js** - Added `_loginInProgress` flag & improved flow control
- **New flag `_loginInProgress`** prevents concurrent login attempts
- **Auth event handler** now skips duplicate events when already logged in
- **Fallback timers** check `_loginInProgress` before attempting login
- **Flag resets** on both success and error paths
- **Set `_loggedIn = true` BEFORE showing app** to prevent race conditions
- **Protected SIGNED_OUT** events - won't sign out if login is in progress

### 2. **app.js** - Enhanced error handling in `_onLogin()`
```javascript
async _onLogin(user) {
  if (this._loginInProgress || this._loggedIn) return;
  
  this._loginInProgress = true;
  
  try {
    const allowed = await Hub.auth.checkAccess(user);
    
    if (!allowed) {
      // User not authorized - show access denied
      Hub.router.showScreen('accessDenied');
      return;
    }
    
    this._loggedIn = true; // Set BEFORE showing app!
    this._showApp();
    
  } catch (e) {
    // Database error - show helpful error message with retry
    showErrorScreen(e.message);
  } finally {
    this._loginInProgress = false;
  }
}
```

**Key improvement**: Now shows a user-friendly error screen with a retry button when database queries fail, instead of just bouncing to login.

### 3. **supabase.js** - Improved `checkAccess()` error handling
- **Differentiates between authorization failures and errors**:
  - Returns `false` when user is not in allowed_emails/household_members (not authorized)
  - Throws errors when database queries fail or timeout (system error)
- **Separate timeout handling** for each query with clear error messages
- **Detailed logging** shows exactly which query failed and why

### 4. **supabase.js** - Enhanced `signOut()` function
- Now properly resets ALL authentication flags: `_loggedIn`, `_loginInProgress`, `_authHandled`
- Added logging for better debugging
- Ensures clean state after sign out

### 5. **router.js** - Added login protection
```javascript
const handleHash = () => {
  // Don't route if user not authenticated OR if login is in progress
  if (!Hub.state?.user || Hub.app?._loginInProgress) {
    console.log('[Router] Blocked hashchange');
    return;
  }
  Hub.router._activate(Hub.router._resolveRoute());
};
```

**Critical fix**: Prevents router from interfering with authentication flow during OAuth redirect

### 6. **supabase.js** - Better session validation logging
- Logs session expiration time
- Shows how many minutes until session expires
- Helps identify expired session issues

## Complete Authentication Flow (Fixed)

1. **Page loads** → Shows "Loading Home Hub..." (or "Welcome back..." if session in localStorage)
2. **Supabase detects session** → Logs session details and expiration
3. **INITIAL_SESSION event fires** → Sets `_authHandled = true`
4. **`_onLogin()` called** → Sets `_loginInProgress = true`
5. **`checkAccess()` queries database** → Up to 6s timeout per query
6. **Three possible outcomes**:
   - ✅ **Success**: Sets `_loggedIn = true`, shows dashboard
   - ❌ **Not authorized**: Returns `false`, shows access denied screen
   - ⚠️ **Error**: Throws exception, shows error screen with retry button
7. **Router activation** → Only after `_loggedIn = true` and `_loginInProgress = false`

### Safeguards Against Bouncing

- ✅ Multiple auth events ignored when `_loggedIn = true`
- ✅ Router blocked when `_loginInProgress = true`  
- ✅ SIGNED_OUT events ignored when `_loginInProgress = true`
- ✅ Fallback timers skip when `_loginInProgress = true`
- ✅ Database errors show retry screen instead of silent failure

## How to Deploy

1. **Replace files** with the fixed versions:
   - `public/assets/app.js`
   - `public/assets/supabase.js`
   - `public/assets/router.js`

2. **Clear browser data** to remove any stale session:
   ```javascript
   // In browser console:
   localStorage.clear();
   location.reload();
   ```

3. **Test the authentication flow**:
   - Sign in with Google
   - Refresh the page (should stay logged in)
   - Sign out and sign back in
   - Close tab and reopen (should restore session)
   - Test with slow network (3G throttling)

## Testing Checklist

- [ ] Fresh login works without redirecting back
- [ ] Page refresh maintains login state
- [ ] Browser tab close/reopen restores session
- [ ] Sign out clears session properly
- [ ] Multiple tabs don't interfere with each other
- [ ] Network delays don't cause login loops
- [ ] Database errors show helpful error message with retry
- [ ] Unauthorized users see access denied (not error screen)
- [ ] Hash navigation doesn't interfere with OAuth redirect

## Debug Tips

### Check browser console for these log messages:

**Good signs** ✅:
```
[Boot] session: user@example.com
[Boot] session expires: [future date]
[Auth] Event: INITIAL_SESSION user@example.com
[Auth] _onLogin: user@example.com
[Auth] checkAccess → true
[Auth] ✓ Showing app
```

**Race condition prevented** ✅:
```
[Auth] Login already in progress, skip
[Auth] Already logged in, ignoring event
[Router] Blocked hashchange (no user or login in progress)
```

**Authorization issue** ⚠️:
```
[Auth] checkAccess → false
[Auth] DENIED: user@example.com
```

**Database issue** ⚠️:
```
[Auth] household_members TIMEOUT: DB query timeout (6s)
[Auth] _onLogin error: Database timeout - please check your connection
```

### Common Issues & Solutions

**"Welcome back" then bounces to login**:
- Check: Is user in both `household_members` AND `allowed_emails` tables?
- Check: Are database queries timing out? (Look for TIMEOUT in logs)
- Check: Is Supabase URL and anon key configured correctly?

**Error screen shows "Database timeout"**:
- Check: Network connection to Supabase
- Check: Database is not paused or suspended
- Check: RLS policies allow the query
- Solution: Click "Try Again" button

**Access denied screen**:
- Check: User email exists in `allowed_emails` table
- Check: User email exists in `household_members` table
- Solution: Add user to both tables in Supabase dashboard

**Session expires quickly**:
- Check console for: `[Boot] session valid for: X minutes`
- If < 60 minutes: May need to refresh session
- Solution: Supabase should auto-refresh, but can force with `Hub.auth.getSession()`

## Additional Debugging Tools

### Check current auth state:
```javascript
// In browser console
console.log('Logged in:', Hub.app._loggedIn);
console.log('Login in progress:', Hub.app._loginInProgress);
console.log('Auth handled:', Hub.app._authHandled);
console.log('User:', Hub.state.user?.email);
```

### Force check Supabase connection:
```javascript
// Click "Check Supabase" button on login screen OR:
Hub.debug.checkSupabase();
```

### Manually trigger login:
```javascript
Hub.auth.getSession().then(s => {
  if (s?.user) Hub.app._onLogin(s.user);
});
```
