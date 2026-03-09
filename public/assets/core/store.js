export const store = {
  route: 'home',
  session: null,
  membership: null,
  mediaState: {
    nowPlaying: {
      state: 'idle',
      sourceType: null,
      title: null,
      subtitle: null,
      startedAt: null,
    },
  },
};

export function setRoute(route) {
  store.route = route;
}

export function setSession(session) {
  store.session = session;
}

export function setMembership(membership) {
  store.membership = membership;
}

export function setMediaState(nextState) {
  store.mediaState = nextState;
}
