import unittest
from pathlib import Path


HTML = (Path(__file__).resolve().parents[1] / "admin_erp.html").read_text(encoding="utf-8")
RECONCILE = HTML[
    HTML.index("function inventoryReconcileSourceCell"):
    HTML.index("async function searchInventory")
]


class InventoryReconcileContractTests(unittest.TestCase):
    def test_button_lives_only_with_the_initial_import_in_configuration(self):
        config_card = HTML[HTML.index('<div id="inventoryImportCard"'):]
        inventory_view = HTML[HTML.index('<section id="inventario"'):HTML.index('<section id="movimientos"')]
        self.assertIn('id="inventoryReconcileStart"', config_card)
        self.assertIn('onclick="startInventoryReconciliationFromConfig()"', config_card)
        self.assertIn(">Re-sincronizar stock</button>", config_card)
        self.assertNotIn('id="inventoryReconcileStart"', inventory_view)
        self.assertNotIn(">Resincronizar título y stock</button>", HTML)

    def test_report_separates_real_differences_from_warnings(self):
        self.assertIn("Diferencias de stock comprobadas", HTML)
        self.assertIn("Advertencias sin diferencia comprobada", HTML)
        self.assertIn("Diferencia comprobada de stock", HTML)
        self.assertNotIn("Sin diferencia aplicable; revisar advertencia.", HTML)

    def test_report_is_stock_only_and_exposes_internal_listing_conflicts(self):
        self.assertNotIn("título", RECONCILE.lower())
        self.assertIn("tienen stock distinto entre sí", HTML)
        self.assertIn("Ver ${values.length} publicaciones de ${esc(sourceName)}", HTML)

    def test_control_starts_a_persistent_job_without_waiting_for_the_full_scan(self):
        self.assertIn("async function startInventoryReconciliationFromConfig()", HTML)
        self.assertIn("fetchJson('/admin/inventory/reconcile-stock/jobs',{method:'POST'}", HTML)
        self.assertIn("/admin/inventory/reconcile-stock/jobs/latest", HTML)
        self.assertNotIn("fetchJson('/admin/inventory/reconcile-stock/preview'", HTML)
        self.assertIn("fetchJson('/admin/inventory/reconcile-stock/apply'", HTML)

    def test_background_control_is_resumable_and_opens_from_notifications(self):
        self.assertIn("tandas de 50 SKU", HTML)
        self.assertIn("inventory_stock_reconcile", HTML)
        self.assertIn("inventoryReconcileSchedulePoll", HTML)
        self.assertIn("resumeInventoryReconciliationJob();", HTML)
        self.assertIn("openInventoryReconciliationJob(jobId)", HTML)

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
