#!/usr/bin/env python3
"""Check relative Markdown links without requesting external websites."""
import re
from pathlib import Path
from urllib.parse import urlparse
root=Path(__file__).resolve().parents[1]
errors=[]
for p in root.rglob('*.md'):
    if any(part in {'.git', '.venv', '.deploy', 'dist', 'private', 'work'} for part in p.relative_to(root).parts):
        continue
    for url in re.findall(r'\[[^\]]*\]\(([^)]+)\)',p.read_text(encoding='utf-8')):
        if urlparse(url).scheme or url.startswith('#'):
            continue
        if not (p.parent/url.split('#')[0]).exists():
            errors.append(f'{p.relative_to(root)}: {url}')
if errors:
    raise SystemExit('\n'.join(errors))
print('All relative Markdown file links resolve.')
