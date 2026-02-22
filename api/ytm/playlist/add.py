import json
import os
from http.server import BaseHTTPRequestHandler

_request_count = 0
_RATE_LIMIT = 20


def _write_oauth_file():
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

        playlist_id = (body.get('playlistId') or '').strip()
        video_ids   = body.get('videoIds') or []

        if not playlist_id or not isinstance(video_ids, list) or not video_ids:
            respond(400, {'error': 'playlistId and videoIds[] are required'})
            return

        # Sanitize: only allow strings, max 50 ids
        video_ids = [str(v)[:50] for v in video_ids[:50] if v]

        try:
            from ytmusicapi import YTMusic
            ytm = YTMusic(oauth_path)
            ytm.add_playlist_items(playlist_id, video_ids)
            respond(200, {'success': True})
        except ImportError:
            respond(503, {'error': 'YTMUSIC_NOT_CONFIGURED', 'detail': 'ytmusicapi not installed'})
        except Exception as e:
            respond(500, {'error': 'Add to playlist failed', 'detail': str(e)[:200]})

    def log_message(self, *args):
        pass
