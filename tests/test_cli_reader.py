import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from retirement import project,load_config
from build_reader import render


class CliReaderTest(unittest.TestCase):
    def run_cli(self,*args):
        return subprocess.run([sys.executable,str(ROOT/'tools/retirement.py'),*map(str,args)],capture_output=True,text=True)

    def test_json_stress_output(self):
        r=self.run_cli(ROOT/'examples/bridge.json','--stress','--json')
        self.assertEqual(r.returncode,0,r.stderr)
        data=json.loads(r.stdout)
        self.assertEqual(len(data['results']),3)
        self.assertEqual(len(data['results'][0]['rows']),50)
        self.assertAlmostEqual(data['results'][0]['final_assets'],428939.56,places=2)

    def test_reject_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            c=Path(d)/'input.json'; c.write_bytes((ROOT/'examples/bridge.json').read_bytes())
            original=c.read_bytes()
            r=self.run_cli(c,'--csv',c)
            self.assertEqual(r.returncode,2)
            self.assertEqual(c.read_bytes(),original)
            out=Path(d)/'existing.csv'; out.write_text('keep')
            self.assertEqual(self.run_cli(c,'--csv',out).returncode,2)
            self.assertEqual(out.read_text(),'keep')

    def test_csv_and_json_independent(self):
        import csv
        with tempfile.TemporaryDirectory() as d:
            output=Path(d)/'new.csv'
            r=self.run_cli(ROOT/'examples/bridge.json','--json','--csv',output)
            self.assertEqual(r.returncode,0,r.stderr)
            self.assertEqual(json.loads(r.stdout)['schema_version'],1)
            with output.open(encoding='utf-8-sig') as f:
                self.assertEqual(len(list(csv.DictReader(f))),50)

    def test_bom_and_duplicate_keys(self):
        with tempfile.TemporaryDirectory() as d:
            c=Path(d)/'bom.json'
            c.write_text('{"assets":100}',encoding='utf-8-sig')
            self.assertEqual(load_config(c)['assets'],100)
            c.write_text('{"assets":100,"assets":200}')
            with self.assertRaises(ValueError):load_config(c)

    def test_blank_rows_survive(self):
        html=render('| A | B |\n|---|---|\n| | |\n',ROOT/'README.md')
        self.assertEqual(html.count('<tr>'),2)
        self.assertIn('<td></td><td></td>',html)

    def test_html_escaped(self):
        html=render('<script>alert(1)</script>',ROOT/'README.md')
        self.assertNotIn('<script>',html)
        self.assertIn('&lt;script&gt;',html)

    def test_cash_flow_overflow(self):
        c=dict(start_age=40,end_age=42,assets=1e308,annual_spending=1e308,real_return=0,
               extra_expenses=[dict(start_age=40,end_age=42,annual_amount=1e308)])
        with self.assertRaises(ValueError):project(c)
        c['assets']=10**1000
        with self.assertRaises(ValueError):project(c)

    def test_integer_age_and_labels(self):
        c=dict(start_age=40.0,end_age=42,assets=100,annual_spending=10,real_return=0)
        with self.assertRaises(ValueError):project(c)
        c['start_age']=40
        c['events']=[dict(age=40,amount=1,label={})]
        with self.assertRaises(ValueError):project(c)

if __name__=='__main__':unittest.main()
