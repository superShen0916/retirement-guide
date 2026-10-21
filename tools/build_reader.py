#!/usr/bin/env python3
"""Build one self-contained offline book from canonical Markdown files."""
import base64
import html
import mimetypes
from pathlib import Path
from urllib.parse import unquote, urlparse

from reader_markdown import inline as render_inline, render as render_markdown

ROOT = Path(__file__).resolve().parents[1]
SCENARIOS = ['rest', 'savings', 'lighter-work', 'part-time', 'move-city', 'family']
PAGES = ([ROOT / 'README.md', ROOT / 'docs/QUICKSTART.md', ROOT / 'docs/DECISIONS.md']
         + [ROOT / ('docs/' + name + '.md') for name in ['LIBRARY', 'CASEBOOK', 'RESEARCH-NOTES']
            if (ROOT / ('docs/' + name + '.md')).exists()]
         + [ROOT / f'docs/scenarios/{name}.md' for name in SCENARIOS
            if (ROOT / f'docs/scenarios/{name}.md').exists()]
         + sorted((ROOT / 'docs').glob('[0-9]*.md'))
         + [ROOT / 'docs/SOURCES.md']
         + sorted((ROOT / 'templates').glob('*.md'))
         + [ROOT / 'tools/README.md']
         + sorted((ROOT / 'examples').glob('*.json'))
         + [ROOT / name for name in ['CONTRIBUTING.md', 'RELEASE.md', 'CHANGELOG.md', 'LICENSE']])
if (ROOT / 'docs/START-HERE.md').exists():
    PAGES.insert(2, ROOT / 'docs/START-HERE.md')


def anchor(path):
    return 'p-' + path.relative_to(ROOT).as_posix().replace('/', '-').replace('.', '-')


def resolve_link(url, path):
    parsed = urlparse(url)
    if parsed.scheme:
        return url if parsed.scheme in ('https', 'http', 'mailto') else '#top'
    target = (path.parent / unquote(parsed.path)).resolve() if parsed.path else path
    if target in PAGES:
        suffix = '--' + unquote(parsed.fragment) if parsed.fragment else ''
        return '#' + anchor(target) + suffix
    if parsed.path == 'site/index.html' or parsed.path.endswith('/dist/index.html'):
        return 'https://retirement-before.supershen666.chatgpt.site/'
    return url


def resolve_image(url, path):
    if urlparse(url).scheme:
        return url if urlparse(url).scheme in ('http', 'https') else ''
    image = (path.parent / unquote(url)).resolve()
    if image.is_relative_to(ROOT) and image.is_file() and image.suffix in ('.svg', '.png', '.jpg', '.webp'):
        mime = mimetypes.guess_type(image.name)[0] or 'application/octet-stream'
        return 'data:' + mime + ';base64,' + base64.b64encode(image.read_bytes()).decode('ascii')
    return ''


def inline(text, path):
    return render_inline(text, path, resolve_link, resolve_image)


def render(text, path):
    return render_markdown(text, path, resolve_link, resolve_image, anchor(path) + '--')


def main():
    nav, sections = [], []
    for path in PAGES:
        text = path.read_text(encoding='utf-8')
        if path.suffix == '.json' or path.name == 'LICENSE':
            text = '# ' + path.name + '\n\n' + chr(96) * 3 + '\n' + text + '\n' + chr(96) * 3 + '\n'
        title = next((line.lstrip('# ') for line in text.splitlines() if line.startswith('# ')), path.stem)
        nav.append(f'<a href="#{anchor(path)}">{html.escape(title)}</a>')
        sections.append(f'<section id="{anchor(path)}">' + render(text, path)
                        + '<a class="top" href="#top">回到顶部 ↑</a></section>')
    css = '''*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;color:#243a35;background:#f4f1e9;font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.9}header{background:#183d35;color:#fff;padding:56px max(24px,calc((100vw - 1120px)/2))}header small{letter-spacing:.1em;color:#b8d0bf}h1{font-size:clamp(32px,6vw,54px);margin:12px 0}header p{color:#d9e4dc;max-width:680px}main{max-width:1180px;margin:auto;display:grid;grid-template-columns:245px minmax(0,1fr);gap:32px;padding:36px 24px}nav{position:sticky;top:20px;align-self:start;max-height:92vh;overflow:auto;font-size:13px}nav a{display:block;padding:6px 8px;border-bottom:1px solid #dce2da}a{color:#176b5c;text-decoration:none}a:hover{text-decoration:underline}a:focus-visible{outline:3px solid #ce6a3b;outline-offset:3px}section{background:#fffdf8;padding:32px;margin-bottom:24px;border:1px solid #e1e5dc;border-radius:12px;scroll-margin-top:20px;overflow-wrap:anywhere}h2{font-size:27px;line-height:1.4;border-bottom:2px solid #b9cec0;padding-bottom:16px;margin-top:0}h3{font-size:20px;margin-top:32px}h4{font-size:17px}p,li{font-size:16px}strong{color:#124e43}code{background:#edf2ed;padding:2px 5px;border-radius:4px;font-size:13px;overflow-wrap:anywhere}pre{background:#eaf0eb;padding:16px;border-radius:8px;overflow:auto;line-height:1.6}pre code{white-space:pre;overflow-wrap:normal;padding:0}.table-wrap{overflow:auto}table{border-collapse:collapse;min-width:540px;width:100%;font-size:14px}td,th{text-align:left;vertical-align:top;padding:10px;border:1px solid #dde4da}th{background:#eaf1e9;color:#174b40}.top{font-size:13px;display:block;margin-top:30px;padding:8px 0;color:#61766a}blockquote{margin:20px 0;padding:8px 20px;border-left:3px solid #ce6a3b;background:#f6f1e7}.content-image{max-width:100%;height:auto;display:block}footer{text-align:center;padding:25px;color:#667c70}@media(max-width:760px){main{display:block;padding:18px 12px}nav{position:static;max-height:230px;margin-bottom:20px;padding:12px;background:#e9eee5;border-radius:10px}section{padding:22px 18px}header{padding:36px 24px}h2{font-size:23px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}@media print{nav,.top{display:none}main{display:block;padding:0}header{background:white;color:#123d38;padding:20px}header p{color:#233a38}section{break-before:page;border:0;padding:0}body{background:white}.table-wrap{overflow:visible}table{min-width:0}a{color:inherit}}'''
    document = ('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
                '<meta name="viewport" content="width=device-width,initial-scale=1">'
                '<title>退休之前 · 普通人的工作退路指南 · 完整阅读版</title><style>' + css
                + '</style></head><body id="top"><header><small>RETIREMENT GUIDE · v0.4.0</small>'
                '<h1>退休之前</h1><p>把钱、时间和生活一起算清楚。<br>为未来留余地，也给现在留生活。</p>'
                '<small>决策资料库 · 十二个虚构账本 · 十二章正文 · 内容更新 2026-10-21<br>'
                '新增来源核查2026-10-21；原来源保留各自登记日期，详见研究记录。</small></header>'
                '<main><nav aria-label="章节目录">' + ''.join(nav) + '</nav><article>'
                + ''.join(sections) + '</article></main><footer>正文与封面可离线阅读 · 无追踪 · 无外部字体或脚本</footer></body></html>')
    (ROOT / '阅读版.html').write_text(document + '\n', encoding='utf-8', newline='\n')
    print('built 阅读版.html:', len(PAGES), 'sections')


if __name__ == '__main__':
    main()
