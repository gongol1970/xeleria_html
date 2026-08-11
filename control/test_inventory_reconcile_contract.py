import unittest
from pathlib import Path


HTML = (Path(__file__).resolve().parents[1] / "admin_erp.html").read_text(encoding="utf-8")


class InventoryReconcileContractTests(unittest.TestCase):
    def test_button_names_the_bounded_preview_instead_of_a_general_resync(self):
        self.assertIn(">Comparar título y stock</button>", HTML)
        self.assertNotIn(">Resincronizar título y stock</button>", HTML)

    def test_report_separates_real_differences_from_warnings(self):
        self.assertIn("Diferencias comprobadas", HTML)
        self.assertIn("Advertencias sin diferencia comprobada", HTML)
        self.assertIn("Diferencia comprobada en", HTML)
        self.assertNotIn("Sin diferencia aplicable; revisar advertencia.", HTML)

    def test_report_names_exact_fields_and_internal_listing_conflicts(self):
        self.assertIn("difference_fields", HTML)
        self.assertIn("ambiguous_fields", HTML)
        self.assertIn("Las publicaciones de ${sourceName} difieren en", HTML)
        self.assertIn("Ver ${values.length} publicaciones de ${esc(sourceName)}", HTML)

    def test_unreadable_sources_have_no_fake_action_button(self):
        self.assertIn("let action=source.selectable?", HTML)
        self.assertNotIn("${source.selectable?'':\"disabled\"}", HTML)

    def test_summary_exposes_retry_and_final_counts(self):
        self.assertIn("diferencias comprobadas:", HTML)
        self.assertIn("advertencias sin diferencia:", HTML)
        self.assertIn("no pudieron leerse después del reintento", HTML)
        self.assertIn("TN reintentó", HTML)


if __name__ == "__main__":
    unittest.main()
