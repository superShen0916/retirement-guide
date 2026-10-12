#!/usr/bin/env python3
"""Build the bundled offline reader; minimal trusted-Markdown renderer, stdlib only."""
import html
import re
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
PAGES = [ROOT / 'README.md', ROOT / 'docs/QUICKSTART.md', ROOT / 'docs/DECISIONS.md'] + sorted((ROOT / 'docs').glob('[0-9]*.md')) + [ROOT / 'docs/SOURCES.md'] + sorted((ROOT / 'templates').glob('*.md')) + [ROOT / 'tools/README.md'] + sorted((ROOT / 'examples').glob('*.json')) + [ROOT / 'CONTRIBUTING.md', ROOT / 'RELEASE.md', ROOT / 'CHANGELOG.md', ROOT / 'LICENSE']


def anchor(path):
    return 'p-' + path.relative_to(ROOT).as_posix().replace('/', '-').replace('.', '-')


def inline(s, path):
    def link(m):
        title, url = m.groups()
        if not urlparse(url).scheme:
            target = (path.parent / url.split('#')[0]).resolve()
            if target in PAGES:
                url = '#' + anchor(target)
        return '<a href="' + html.escape(url, quote=True) + '">' + html.escape(title) + '</a>'
    tokens = []
    def hold(m):
        tokens.append(link(m))
        return '\x00' + str(len(tokens)-1) + '\x00'
    s = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', hold, s)
    s = html.escape(s)
    s = re.sub(r'`([^`]+)`', r'<code>\1</code>', s)
    s = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', s)
    for i, token in enumerate(tokens):
        s = s.replace('\x00'+str(i)+'\x00', token)
    return s


def render(text, path):
    out, para, items, code, table = [], [], [], None, []
    def flush():
        if para:
            out.append('<p>' + inline(' '.join(para), path) + '</p>')
            para.clear()
        if items:
            tag = items[0][0]
            out.append('<'+tag+'>'+''.join('<li>'+inline(x[1],path)+'</li>' for x in items)+'</'+tag+'>')
            items.clear()
        if table:
            rows = [r for r in table if not all(re.fullmatch(r':?-{3,}:?', cell.strip()) for cell in r.strip('|').split('|'))]
            out.append('<div class="table-wrap"><table>')
            for i, row in enumerate(rows):
                tag = 'th' if i == 0 else 'td'
                out.append('<tr>'+''.join('<'+tag+'>'+inline(c.strip(),path)+'</'+tag+'>' for c in row.strip('|').split('|'))+'</tr>')
            out.append('</table></div>')
            table.clear()
    for line in text.splitlines():
        if line.startswith('```'):
            if code is None:
                flush(); code=[]
            else:
                out.append('<pre><code>'+html.escape('\n'.join(code))+'</code></pre>'); code=None
            continue
        if code is not None:
            code.append(line); continue
        if line.startswith('|'):
            if para or items: flush()
            table.append(line); continue
        if table: flush()
        if not line.strip():
            flush(); continue
        h = re.match(r'^(#{1,6}) (.+)$', line)
        item = re.match(r'^(?:([-*]) |(\d+)\. )(.+)$',line)
        if h:
            flush(); n=min(6,len(h[1])+1); out.append(f'<h{n}>'+inline(h[2],path)+f'</h{n}>')
        elif item:
            if para: flush()
            tag='ul' if item[1] else 'ol'
            if items and items[0][0]!=tag: flush()
            items.append((tag,item[3]))
        else:
            if items: flush()
            para.append(line)
    flush()
    return ''.join(out)


def main():
    nav=[]; sections=[]
    for path in PAGES:
        text=path.read_text(encoding='utf-8')
        if path.suffix == '.json' or path.name == 'LICENSE':
            text = '# ' + path.name + '\n\n```\n' + text + '\n```\n'
        title=text.splitlines()[0].lstrip('# ')
        nav.append(f'<a href="#{anchor(path)}">{html.escape(title)}</a>')
        sections.append(f'<section id="{anchor(path)}">'+render(text,path)+'<a class="top" href="#top">回到顶部 ↑</a></section>')
    css='''*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;color:#233a38;background:#f5f3ed;font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;line-height:1.9}header{background:#123d38;color:#fff;padding:64px max(24px,calc((100vw - 1120px)/2));}header small{letter-spacing:.14em;color:#acd6c2}h1{font-size:clamp(32px,6vw,58px);margin:12px 0}header p{color:#d4e8dd;max-width:680px}main{max-width:1180px;margin:auto;display:grid;grid-template-columns:245px minmax(0,1fr);gap:38px;padding:36px 24px}nav{position:sticky;top:20px;align-self:start;max-height:92vh;overflow:auto;font-size:13px}nav a{display:block;padding:5px 8px;border-bottom:1px solid #dce2da}a{color:#176b5c;text-decoration:none}a:hover{text-decoration:underline}section{background:#fffdf8;padding:32px;margin-bottom:24px;border:1px solid #e1e5dc;border-radius:12px;scroll-margin-top:20px}h2{font-size:27px;line-height:1.4;border-bottom:2px solid #b9cec0;padding-bottom:16px;margin-top:0}h3{font-size:20px;margin-top:32px}h4{font-size:17px}p,li{font-size:16px}strong{color:#124e43}code{background:#edf2ed;padding:2px 5px;border-radius:4px;font-size:13px;overflow-wrap:anywhere}pre{background:#eaf0eb;padding:16px;border-radius:8px;overflow:auto;line-height:1.6}pre code{white-space:pre;overflow-wrap:normal;padding:0}.table-wrap{overflow:auto}table{border-collapse:collapse;min-width:540px;width:100%;font-size:14px}td,th{text-align:left;vertical-align:top;padding:10px;border:1px solid #dde4da}th{background:#eaf1e9;color:#174b40}.top{font-size:12px;display:block;margin-top:30px;color:#748b7c}footer{text-align:center;padding:25px;color:#667c70}@media(max-width:760px){main{display:block;padding:18px 12px}nav{position:static;max-height:230px;margin-bottom:20px;padding:12px;background:#e9eee5;border-radius:10px}section{padding:22px 18px}header{padding:36px 24px}h2{font-size:23px}}@media print{nav,.top{display:none}main{display:block;padding:0}header{background:white;color:#123d38;padding:20px}header p{color:#233a38}section{break-before:page;border:0;padding:0}body{background:white}.table-wrap{overflow:visible}table{min-width:0}a{color:inherit}}'''
    doc='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>退休之前 · 退休与生活自主指南</title><style>'+css+'</style></head><body id="top"><header><small>RETIREMENT GUIDE · v0.2.0</small><h1>退休之前</h1><p>为未来留余地，也给现在留生活。<br>一份可以开始填写、运行、讨论的中文指南。</p><small>12章正文 · 6份模板 · 3个案例 · 核查日期 2026-10-12</small></header><main><nav aria-label="章节目录">'+''.join(nav)+'</nav><article>'+''.join(sections)+'</article></main><footer>全部内容可离线阅读 · 无追踪 · 无外部字体或脚本</footer></body></html>'
    (ROOT/'阅读版.html').write_text(doc,encoding='utf-8')
    print('built 阅读版.html:',len(PAGES),'sections')

if __name__=='__main__':
    main()
