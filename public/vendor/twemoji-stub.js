// Minimal twemoji stub — used when CDN load fails.
// parse() is a no-op; native emoji rendering is used as fallback.
if (!window.twemoji) {
  window.twemoji = {
    parse: function() {},
    convert: { fromCodePoint: function(c) { return String.fromCodePoint(parseInt(c,16)); } }
  };
}
