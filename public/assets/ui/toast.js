const stack = document.createElement('div');
stack.className = 'hh-toast-stack';

function ensureStack() {
  if (!document.body || stack.isConnected) return;
  document.body.appendChild(stack);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ensureStack, { once: true });
} else {
  ensureStack();
}

export function pushToast(message) {
  ensureStack();
  const toast = document.createElement('div');
  toast.className = 'hh-toast';
  toast.textContent = message;
  stack.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3200);
}
