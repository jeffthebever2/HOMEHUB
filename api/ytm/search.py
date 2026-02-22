import json
import os
import tempfile
from http.server import BaseHTTPRequestHandler

# Simple in-memory rate limiter (resets per instance)
_request_count = 0
_RATE_LIMIT = 50  # per instance lifetime


def _write_oauth_file():
    """Write YTM_OAUTH_JSON env var to /tmp/ytm_oauth.json for ytmusicapi."""
    oauth_json = os.environ.get('YTM_OAUTH_JSON', '')
    if not oauth_json:
        return None
    path = '/tmp/ytm_oauth.json'
    try:
        with open(path, 'w') as f:
            f.write(oauth_json)
        return path
    except Exception:
        return None


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_POST(self):
        global _request_count
        _request_count += 1

        def respond(code, body):
            b = json.dumps(body).encode()
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(b)

        if _request_count > _RATE_LIMIT:
            respond(429, {'error': 'Rate limit exceeded'})
            return

        oauth_path = _write_oauth_file()
        if not oauth_path:
            respond(503, {'error': 'YTMUSIC_NOT_CONFIGURED'})
            return

        length = int(self.headers.get('Content-Length', 0))
        try:
            body = json.loads(self.rfile.read(length)) if length else {}
        except Exception:
            respond(400, {'error': 'Invalid JSON'})
            return

        query = (body.get('query') or '').strip()
        if not query:
            respond(400, {'error': 'query is required'})
            return

        try:
            from ytmusicapi import YTMusic
            ytm = YTMusic(oauth_path)
            results = ytm.search(query, limit=5)
            safe = []
            for r in results[:5]:
                safe.append({
                    'title':    r.get('title', ''),
                    'artists':  [a.get('name', '') for a in (r.get('artists') or [])],
                    'videoId':  r.get('videoId', ''),
                    'duration': r.get('duration', ''),
                    'category': r.get('category', '')
                })
            respond(200, {'results': safe})
        except ImportError:
            respond(503, {'error': 'YTMUSIC_NOT_CONFIGURED', 'detail': 'ytmusicapi not installed'})
        except Exception as e:
            respond(500, {'error': 'Search failed', 'detail': str(e)[:200]})

    def log_message(self, *args):
        pass
