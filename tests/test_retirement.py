import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from retirement import project, stresses


def config(**updates):
    c = dict(start_age=40, end_age=42, assets=100, annual_spending=10, real_return=0)
    c.update(updates)
    return c


class ProjectionTest(unittest.TestCase):
    def test_zero_return_arithmetic(self):
        self.assertEqual(project(config())['final_assets'], 80)

    def test_income_begins_at_boundary(self):
        r = project(config(incomes=[dict(start_age=41, end_age=42, annual_amount=10)]))
        self.assertEqual([x['income'] for x in r['rows']], [0, 10])
        self.assertEqual(r['final_assets'], 90)

    def test_end_exclusive(self):
        r = project(config(incomes=[dict(start_age=40, end_age=41, annual_amount=10)]))
        self.assertEqual([x['income'] for x in r['rows']], [10, 0])

    def test_sequence_changes_result(self):
        a = project(config(return_overrides={'40': -.2, '41': .25}))
        b = project(config(return_overrides={'40': .25, '41': -.2}))
        self.assertAlmostEqual(a['final_assets'], 77.5)
        self.assertAlmostEqual(b['final_assets'], 82)

    def test_no_implicit_borrowing(self):
        r = project(config(assets=5, incomes=[dict(start_age=41, end_age=42, annual_amount=20)]))
        self.assertEqual(r['first_shortfall_age'], 40)
        self.assertEqual(r['total_unfunded'], 5)
        self.assertEqual(r['final_assets'], 10)

    def test_zero_is_not_shortfall(self):
        r = project(config(assets=20))
        self.assertIsNone(r['first_shortfall_age'])
        self.assertEqual(r['final_assets'], 0)

    def test_event_and_stage(self):
        r = project(config(events=[dict(age=40, amount=30)], extra_expenses=[dict(start_age=41, end_age=42, annual_amount=20)]))
        self.assertEqual(r['final_assets'], 30)

    def test_complete_loss(self):
        r = project(config(real_return=-1))
        self.assertEqual(r['first_shortfall_age'], 41)

    def test_invalid_values(self):
        for changes in [dict(assets=-1), dict(real_return=float('nan')), dict(real_return=-1.1), dict(start_age=40.5), dict(assets=True), dict(end_age=40), dict(incomes={}), dict(typo=1), dict(return_overrides={'42': .1}), dict(events=[dict(age=42, amount=1)]), dict(incomes=[dict(start_age=41, end_age=43, annual_amount=1)])]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                project(config(**changes))

    def test_stress_does_not_mutate(self):
        c = config(return_overrides={'40': .1})
        variants = list(stresses(c))
        self.assertEqual(c['return_overrides'], {'40': .1})
        self.assertEqual(variants[1][1]['return_overrides'], {})
        self.assertEqual(variants[2][1]['return_overrides']['40'], -.2)

    def test_all_examples(self):
        import json
        for path in (Path(__file__).resolve().parents[1] / 'examples').glob('*.json'):
            with self.subTest(path=path.name):
                for _, c in stresses(json.loads(path.read_text())):
                    self.assertTrue(project(c)['rows'])

if __name__ == '__main__':
    unittest.main()
