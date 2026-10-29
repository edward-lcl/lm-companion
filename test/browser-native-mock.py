#!/usr/bin/env python3
"""Synthetic framed native host; all state adjacent to its disposable copy."""
import json
import pathlib
import struct
import sys
import time
import uuid
root = pathlib.Path(__file__).parent
header = sys.stdin.buffer.read(4)
if len(header) != 4:
    sys.exit(0)
length = struct.unpack('<I', header)[0]
if length > 1024 * 1024:
    sys.exit(2)
msg = json.loads(sys.stdin.buffer.read(length))
with (root / 'frames.jsonl').open('a') as f:
    f.write(json.dumps(msg) + '\n')
def send(value):
    body = json.dumps(value).encode()
    sys.stdout.buffer.write(struct.pack('<I', len(body)) + body)
    sys.stdout.buffer.flush()
if msg.get('cmd') == 'watch':
    pending = root / 'request.json'
    if pending.exists():
        request = json.loads(pending.read_text())
        pending.unlink()
    else:
        request = {'cmd': 'settings_get', 'id': str(uuid.uuid4()), 'at': int(time.time()*1000)-10}
    send(request)
    # Deliberately close: the production reconnect path must establish another port.
    time.sleep(0.1)
else:
    send({'ok': True, 'marks': {}})
