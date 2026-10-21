"""Escaped Markdown subset shared by the website and self-contained reader."""
import html
import re
from urllib.parse import urlparse


def slug(text):
    text = re.sub(r'[`*_]', '', text).strip().lower()
    return re.sub(r'\s', '-', re.sub(r'[^\w\-\s\u3400-\u9fff]', '', text))


def inline(text, path, resolve_link=None, resolve_image=None):
    tokens = []

    def hold(value):
        tokens.append(value)
        return '\x00' + str(len(tokens) - 1) + '\x00'

    def safe_url(url):
        return url if urlparse(url).scheme.lower() in ('', 'http', 'https', 'mailto') else '#'

    def picture(match):
        alt, url = match.groups()
        url = resolve_image(url, path) if resolve_image else safe_url(url)
        return hold('<img class="content-image" src="' + html.escape(url, quote=True)
                    + '" alt="' + html.escape(alt, quote=True) + '" loading="lazy">')

    def link(match):
        label, url = match.groups()
        url = resolve_link(url, path) if resolve_link else safe_url(url)
        return hold('<a href="' + html.escape(url, quote=True) + '">'
                    + html.escape(label) + '</a>')

    text = re.sub(r'`([^`]+)`', lambda m: hold('<code>' + html.escape(m[1]) + '</code>'), text)
    text = re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', picture, text)
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', link, text)
    text = html.escape(text)
    text = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', text)
    for i, value in enumerate(tokens):
        text = text.replace('\x00' + str(i) + '\x00', value)
    return text


def render(text, path, resolve_link=None, resolve_image=None, heading_prefix='', heading_offset=1):
    text = re.sub(r'<!--.*?-->', '', text, flags=re.S)
    out, paragraph, items, table, quote = [], [], [], [], []
    code_lines = None
    heading_counts = {}

    def fmt(value):
        return inline(value, path, resolve_link, resolve_image)

    def flush():
        if paragraph:
            out.append('<p>' + fmt(' '.join(paragraph)) + '</p>')
            paragraph.clear()
        if items:
            tag = items[0][0]
            out.append('<' + tag + '>' + ''.join('<li>' + fmt(x[1]) + '</li>' for x in items) + '</' + tag + '>')
            items.clear()
        if quote:
            out.append('<blockquote><p>' + fmt(' '.join(quote)) + '</p></blockquote>')
            quote.clear()
        if table:
            rows = [row for row in table if not all(re.fullmatch(r':?-{3,}:?', cell.strip()) for cell in row.strip('|').split('|'))]
            out.append('<div class="table-wrap"><table>')
            for i, row in enumerate(rows):
                tag = 'th' if i == 0 else 'td'
                out.append('<tr>' + ''.join('<' + tag + '>' + fmt(cell.strip()) + '</' + tag + '>' for cell in row.strip('|').split('|')) + '</tr>')
            out.append('</table></div>')
            table.clear()

    for line in text.splitlines():
        if line.startswith('```'):
            if code_lines is None:
                flush()
                code_lines = []
            else:
                out.append('<pre><code>' + html.escape('\n'.join(code_lines)) + '</code></pre>')
                code_lines = None
            continue
        if code_lines is not None:
            code_lines.append(line)
            continue
        if line.startswith('|'):
            if paragraph or items or quote:
                flush()
            table.append(line)
            continue
        if table:
            flush()
        if not line.strip():
            flush()
            continue
        if line.startswith('>'):
            if paragraph or items:
                flush()
            quote.append(line.lstrip('>').strip())
            continue
        if quote:
            flush()
        heading = re.match(r'^(#{1,6}) (.+)$', line)
        item = re.match(r'^(?:([-*]) |(\d+)\. )(.+)$', line)
        if heading:
            flush()
            n = min(6, len(heading[1]) + heading_offset)
            ident = slug(heading[2])
            count = heading_counts.get(ident, 0)
            heading_counts[ident] = count + 1
            if count:
                ident += '-' + str(count)
            out.append(f'<h{n} id="' + html.escape(heading_prefix + ident, quote=True) + '">' + fmt(heading[2]) + f'</h{n}>')
        elif re.fullmatch(r'\s*(?:---+|\*\*\*+)\s*', line):
            flush()
            out.append('<hr>')
        elif item:
            if paragraph:
                flush()
            tag = 'ul' if item[1] else 'ol'
            if items and items[0][0] != tag:
                flush()
            items.append((tag, item[3]))
        else:
            if items:
                flush()
            paragraph.append(line)
    if code_lines is not None:
        out.append('<pre><code>' + html.escape('\n'.join(code_lines)) + '</code></pre>')
    flush()
    return ''.join(out)
