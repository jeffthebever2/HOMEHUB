# STANDBY.JS UPDATES - Now Playing Widget & Ken Burns Effect

## 1. Add Now Playing widget update to start() method

FIND the `start()` method (it should be around line 30-50) and locate where standby content is being refreshed.

ADD this call to update Now Playing widget:

```javascript
      // Update Now Playing widget
      if (Hub.player) {
        Hub.player.updateUI();
      }
```

Place this wherever other widgets are being updated (like weather, calendar, chores).

## 2. Ensure Ken Burns effect is already in CSS

The CSS for Ken Burns effect should already be in index.html:

```css
@keyframes kenBurns {
  0% {
    transform: scale(1) translate(0, 0);
  }
  100% {
    transform: scale(1.1) translate(-5%, -5%);
  }
}

#standbyCurrentPhoto {
  animation: kenBurns 30s ease-in-out infinite alternate;
}

@media (prefers-reduced-motion: reduce) {
  #standbyCurrentPhoto {
    animation: none;
  }
}
```

This is already included in the INDEX_HTML_UPDATES.md file.

## 3. Add ripple wake effect on tap (optional enhancement)

If you want to add a visual ripple when waking from standby, add this to the click handler:

FIND where standby page is clicked to wake up (there should be an event listener or onclick).

ADD this ripple effect:

```javascript
  // Add ripple wake effect
  const standbyPage = document.getElementById('standbyPage');
  if (standbyPage) {
    standbyPage.classList.add('waking');
    setTimeout(() => standbyPage.classList.remove('waking'), 800);
  }
```

The CSS for this is already included in index.html updates:

```css
@keyframes ripple {
  0% {
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.5);
  }
  100% {
    box-shadow: 0 0 0 100px rgba(59, 130, 246, 0);
  }
}

#standbyPage.waking {
  animation: ripple 0.8s ease-out;
}
```

## 4. Update data refresh to include player state

In the method that refreshes standby data (usually a setInterval or similar), make sure to include:

```javascript
  // Refresh Now Playing
  if (Hub.player) {
    Hub.player.updateUI();
  }
```

## 5. Ensure cleanup on stop()

The `stop()` method should already clean up timers and listeners. No changes needed if it's working correctly.

## Summary

The main changes needed are:
1. Call `Hub.player.updateUI()` when standby starts and during refreshes
2. CSS for Ken Burns and ripple effects (already in index.html updates)
3. Optional ripple wake effect on tap
4. Ensure Now Playing widget container is in the HTML (already in index.html updates)

Most of the visual effects are CSS-only, so they're already handled by the index.html updates. The standby.js changes are minimal - just ensuring the Now Playing widget gets updated.
