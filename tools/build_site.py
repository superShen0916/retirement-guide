#!/usr/bin/env python3
"""Build a static, file://-compatible website from site/ and canonical Markdown."""
import argparse
import html
import json
import os
import shutil
from pathlib import Path
from urllib.parse import quote, unquote, urlparse

from build_reader import PAGES, ROOT, SCENARIOS
from reader_markdown import render
from build_library import load as load_library

ORIGIN = 'https://retirement-before.supershen666.chatgpt.site'
ROUTES = {}
for source in PAGES:
    relative = source.relative_to(ROOT)
    if relative.parts[:2] == ('docs', 'scenarios'):
        route = 'guides/' + source.stem + '.html'
    elif relative.parts[0] == 'templates':
        route = 'templates/' + source.stem + '.html'
    elif relative.parts[0] == 'examples':
        route = 'examples/' + source.name
    elif relative.as_posix() == 'tools/README.md':
        route = 'book/calculator-cli.html'
    else:
        route = 'book/' + source.stem + '.html'
    ROUTES[source.resolve()] = route

READING_CSS = '''*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f6f3eb;color:#263d35;font:16px/1.95 system-ui,-apple-system,"Microsoft YaHei","PingFang SC",sans-serif}a{color:#24644f;text-underline-offset:4px}a:hover{color:#aa4d26}a:focus-visible{outline:3px solid #ce6a3b;outline-offset:4px}.reading-nav{max-width:1100px;margin:auto;padding:20px 28px;display:flex;align-items:center;gap:24px;border-bottom:1px solid #d7dbcf}.reading-nav a{text-decoration:none;min-height:44px;display:inline-flex;align-items:center}.brand{font-size:21px;font-weight:750;letter-spacing:.1em;margin-right:auto}main{max-width:860px;margin:36px auto 56px;padding:0 30px}.eyebrow{font-size:12px;letter-spacing:.08em;color:#63766b}.reading-paper{background:#fffdf8;border:1px solid #e2e1d6;border-radius:10px;padding:40px 44px;overflow-wrap:anywhere}.reading-paper h2{font-size:clamp(25px,4vw,36px);line-height:1.5;margin-top:0;letter-spacing:-.02em}.reading-paper h3{font-size:23px;margin-top:40px;border-top:1px solid #e6e4d9;padding-top:28px}.reading-paper h4{font-size:18px}p,li{line-height:1.95}li{margin:.4em 0}blockquote{border-left:3px solid #c16c43;background:#f4f0e5;margin:24px 0;padding:10px 22px}strong{color:#204d3c}code{font-size:.87em;background:#eef1e8;padding:3px 5px;border-radius:3px}pre{overflow:auto;background:#edf0e7;padding:18px;border-radius:7px;line-height:1.6}pre code{padding:0;white-space:pre}.table-wrap{overflow:auto;margin:24px 0}table{border-collapse:collapse;min-width:500px;width:100%;font-size:14px}th,td{text-align:left;border:1px solid #dce1d4;padding:11px;vertical-align:top}th{background:#ebf0e5}.content-image{display:block;max-width:100%;height:auto}.reading-bottom{border-top:1px solid #d7dbcf;padding-top:24px;margin-top:32px}.reading-bottom>a{display:inline-block;margin:0 20px 12px 0;min-height:44px}.reading-bottom p{font-size:13px;color:#647569}.reading-related{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}.reading-related a{padding:10px 15px;background:#eaf0e4;border-radius:5px;text-decoration:none;font-size:14px}.reading-footer{font-size:12px;color:#6c7b70;padding:0 24px 36px;text-align:center}@media(max-width:600px){.reading-nav{padding:12px 18px;gap:15px;font-size:13px}.brand{font-size:18px}main{margin:24px auto;padding:0 12px}.reading-paper{padding:24px 20px}.reading-paper h3{font-size:21px}.reading-nav .long-nav{display:none}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}@media print{body{background:#fff}.reading-nav,.reading-bottom,.reading-footer{display:none}main{max-width:none;margin:0;padding:0}.reading-paper{border:0;padding:0}.table-wrap{overflow:visible}table{min-width:0}}'''


def local_url(destination, current):
    return quote(os.path.relpath(destination, Path(current).parent).replace(os.sep, '/'), safe='/.-')


def render_page(source, route):
    def resolve(url, path):
        parsed = urlparse(url)
        if parsed.scheme:
            return url if parsed.scheme in ('https', 'http', 'mailto') else '#'
        target = (path.parent / unquote(parsed.path)).resolve() if parsed.path else path.resolve()
        if target in ROUTES:
            result = local_url(ROUTES[target], route)
        elif target.is_relative_to(ROOT / 'assets'):
            result = local_url(target.relative_to(ROOT).as_posix(), route)
        elif target == ROOT / 'site/index.html':
            result = local_url('index.html', route)
        elif target == ROOT / '阅读版.html':
            result = local_url('reader.html', route)
        else:
            # Unlisted source is never silently copied from the local checkout.
            result = 'https://github.com/superShen0916/retirement-guide/blob/main/' + quote(target.relative_to(ROOT).as_posix()) if target.is_relative_to(ROOT) else '#'
        if parsed.fragment:
            result += '#' + quote(unquote(parsed.fragment), safe='-')
        return result

    text = source.read_text(encoding='utf-8')
    if source.name == 'LICENSE':
        text = '# MIT License\n\n```text\n' + text + '\n```\n'
    title = next((line.lstrip('# ') for line in text.splitlines() if line.startswith('# ')), source.stem)
    description = next((line.strip('* >') for line in text.splitlines()
                        if line.strip() and not line.startswith(('#', '|', '!', '[', '<', '```'))), title)
    body = render(text, source, resolve, resolve, heading_offset=0)
    home = local_url('index.html', route)
    directory = local_url('book/README.html', route)
    related = ''.join('<a href="' + local_url('guides/' + name + '.html', route) + '">' + label + '</a>'
                      for name, label in zip(SCENARIOS, ['休息三个月', '5/10/30万起步', '降薪换时间', '兼职与半退休', '换城市生活', '家庭责任', '父母在农村']))
    return ('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1"><title>'
            + html.escape(title) + ' · 退休之前</title><meta name="description" content="'
            + html.escape(description[:180], quote=True) + '"><link rel="canonical" href="'
            + ORIGIN + '/' + route + '"><meta property="og:title" content="' + html.escape(title, quote=True)
            + '"><meta property="og:type" content="article"><meta property="og:description" content="'
            + html.escape(description[:180], quote=True) + '"><link rel="stylesheet" href="'
            + local_url('reading.css', route) + '"></head><body><header class="reading-nav">'
            '<a class="brand" href="' + home + '">退休之前</a><a href="' + home + '#calculator">算现金缓冲</a>'
            '<a href="' + directory + '">阅读目录</a></header><main><p class="eyebrow">工作退路指南 / '
            '内容更新 2026-10-21</p><article class="reading-paper">' + body + '</article>'
            '<aside class="reading-bottom"><a href="' + home + '#calculator">→ 用自己的数字算一次</a>'
            '<a href="' + directory + '">完整目录</a><p>继续找与你有关的选择：</p><nav class="reading-related" aria-label="六个场景">'
            + related + '</nav><p>政策来源的核查范围与日期见来源登记；本页更新时间不代表全部政策重新核验。</p></aside>'
            '</main><footer class="reading-footer">为未来留余地，也给现在留生活。 · 无账户 · 无追踪</footer></body></html>')


def build(destination):
    destination = Path(destination).resolve()
    if destination == ROOT or destination in ROOT.parents:
        raise ValueError('构建目录不能覆盖项目或其父目录')
    destination.mkdir(parents=True, exist_ok=True)
    library = load_library()
    for item in library['items'] + library['cases']:
        item['readMore'] = ROUTES[(ROOT / item['readMore']).resolve()]
    library['lifetimeCases'] = [json.loads((ROOT / 'examples' / (name + '.json')).read_text(encoding='utf-8')) for name in ['bridge', 'part-time', 'family']]
    (destination / 'library-data.js').write_text('window.RETIREMENT_LIBRARY=' + json.dumps(library, ensure_ascii=False).replace('</', '<\\/') + ';\n', encoding='utf-8', newline='\n')
    for source in (ROOT / 'site').rglob('*'):
        if source.is_file() and not source.is_symlink() and source.suffix in ('.html', '.css', '.js', '.svg', '.json', '.webmanifest'):
            target = destination / source.relative_to(ROOT / 'site')
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
    for source, route in ROUTES.items():
        target = destination / route
        target.parent.mkdir(parents=True, exist_ok=True)
        if source.suffix == '.json':
            shutil.copyfile(source, target)
        else:
            target.write_text(render_page(source, route), encoding='utf-8', newline='\n')
    for source in (ROOT / 'assets').glob('*'):
        if source.is_file() and source.suffix in ('.svg', '.png', '.webp', '.jpg'):
            target = destination / 'assets' / source.name
            target.parent.mkdir(exist_ok=True)
            shutil.copyfile(source, target)
    (destination / 'reading.css').write_text(READING_CSS.replace('.reading-paper h2{', '.reading-paper h1{').replace('.reading-paper h3{', '.reading-paper h2{').replace('.reading-paper h4{', '.reading-paper h3{'), encoding='utf-8', newline='\n')
    shutil.copyfile(ROOT / '阅读版.html', destination / 'reader.html')
    (destination / 'robots.txt').write_text('User-agent: *\nAllow: /\nSitemap: ' + ORIGIN + '/sitemap.xml\n', encoding='utf-8')
    urls = ['index.html'] + [route for route in ROUTES.values() if route.endswith('.html')]
    (destination / 'sitemap.xml').write_text('<?xml version="1.0" encoding="utf-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
                                           + ''.join('<url><loc>' + ORIGIN + '/' + route + '</loc></url>' for route in urls)
                                           + '</urlset>', encoding='utf-8')
    (destination / 'build-info.json').write_text(json.dumps({'version': '0.5.0', 'content_updated': '2026-10-22',
        'original_source_review': '2026-10-12', 'new_evidence_review': '2026-10-21', 'institutions_review': '2026-10-22', 'decision_items': len(library['items']),
        'fictional_cases': len(library['cases']), 'scenario_pages': 7, 'reading_pages': len(ROUTES)}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8', newline='\n')
    print('Built website:', destination, '|', len(ROUTES), 'reading pages + calculator')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'dist')
    build(parser.parse_args().output)
