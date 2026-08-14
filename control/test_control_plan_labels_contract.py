import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parent
HTML = (ROOT / "tc_panel.html").read_text(encoding="utf-8")


class ControlPlanLabelsContract(unittest.TestCase):
    def test_selector_uses_only_numbered_labels(self):
        for code, label in (
            ("plan_1", "Plan 1"),
            ("plan_2", "Plan 2"),
            ("plan_3", "Plan 3"),
            ("custom", "Plan 4"),
        ):
            self.assertIn(f'<option value="{code}">{label}</option>', HTML)

    def test_grid_and_dialog_use_the_same_numbered_mapping(self):
        self.assertIn(
            "({plan_1:'Plan 1',plan_2:'Plan 2',plan_3:'Plan 3',custom:'Plan 4'})[code]",
            HTML,
        )
        self.assertIn("controlPlanName(p.code)", HTML)
        self.assertIn("controlPlanName(selected)", HTML)

    def test_internal_plan_codes_and_custom_editor_remain_unchanged(self):
        self.assertIn("const custom=$('planCode').value==='custom'", HTML)
        self.assertIn("plan_code:$('planCode').value", HTML)
        self.assertIn('id="customPlan"', HTML)


if __name__ == "__main__":
    unittest.main()
