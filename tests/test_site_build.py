import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlparse
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
import build_reader
import build_site


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls, self.ids = [], []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if 'id' in values:
            self.ids.append(values['id'])
        for attribute in ('href', 'src'):
            if attribute in values:
                self.urls.append(values[attribute])


class SiteBuildTests(unittest.TestCase):
    def test_offline_reader_includes_scenarios_and_embedded_cover(self):
        build_reader.main()
        content = (ROOT / '阅读版.html').read_text(encoding='utf-8')
        graph = Links()
        graph.feed(content)
        self.assertEqual(len(graph.ids), len(set(graph.ids)))
        for scenario in build_reader.SCENARIOS:
            self.assertIn('p-docs-scenarios-' + scenario + '-md', graph.ids)
        self.assertIn('src="data:image/svg+xml;base64,', content)
        self.assertNotIn('LIVE_SITE_LINK', content)
        for url in graph.urls:
            if url.startswith('#') and len(url) > 1:
                self.assertTrue(unquote(url[1:]) in graph.ids, 'Missing reader anchor: ' + url)
            self.assertFalse(url.endswith('.md'), url)

    def test_website_internal_links_and_fragments_work_without_server(self):
        with tempfile.TemporaryDirectory() as temp:
            destination = Path(temp)
            build_site.build(destination)
            self.assertTrue((destination / 'index.html').is_file())
            pages = {}
            for page in destination.rglob('*.html'):
                graph = Links()
                graph.feed(page.read_text(encoding='utf-8'))
                pages[page.resolve()] = graph
            for page, graph in pages.items():
                for url in graph.urls:
                    parsed = urlparse(url)
                    if parsed.scheme or url.startswith('//'):
                        continue
                    target = (page.parent / unquote(parsed.path)).resolve() if parsed.path else page
                    self.assertTrue(target.is_file(), str(page.relative_to(destination)) + ': ' + url)
                    if parsed.fragment and target in pages:
                        self.assertTrue(unquote(parsed.fragment) in pages[target].ids,
                                        str(page.relative_to(destination)) + ': ' + url)
            home = (destination / 'index.html').read_text(encoding='utf-8')
            self.assertNotIn('type="module"', home)
            for scenario in build_reader.SCENARIOS:
                self.assertTrue((destination / 'guides' / (scenario + '.html')).is_file())

    def test_renderer_escapes_html_and_dangerous_links(self):
        source = ROOT / 'README.md'
        result = build_reader.render('<script>x</script>\n\n[bad](javascript:evil)\n\n<!-- hidden -->', source)
        self.assertNotIn('<script>', result)
        self.assertNotIn('javascript:', result)
        self.assertNotIn('hidden', result)


if __name__ == '__main__':
    unittest.main()
