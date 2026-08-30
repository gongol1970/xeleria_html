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

    def test_full_stock_is_shown_separately_and_never_offered_as_own_stock(self):
        self.assertIn("publicación(es) Full fuera del control de stock propio", RECONCILE)
        self.assertIn("Stock Full:", RECONCILE)
        self.assertIn("Lo administra Mercado Libre", RECONCILE)
        self.assertIn("El stock Full no se modificará.", RECONCILE)

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
        self.assertIn("let action=row.actionable&&source.selectable?", HTML)
        self.assertNotIn("${source.selectable?'':\"disabled\"}", HTML)

    def test_warning_messages_hide_raw_provider_json(self):
        self.assertIn("function inventoryReconcileHumanProblem", HTML)
        self.assertIn("La publicación ya no existe en ${channel}.", HTML)
        self.assertIn("low.includes('{')", HTML)

    def test_stock_resync_copy_does_not_claim_to_reimport_publications(self):
        self.assertIn("controla únicamente el stock de las publicaciones vinculadas", HTML)
        self.assertIn("No reimporta ni elimina publicaciones", HTML)

    def test_summary_exposes_retry_and_final_counts(self):
        self.assertIn("diferencias comprobadas:", HTML)
        self.assertIn("advertencias sin diferencia:", HTML)
        self.assertIn("no pudieron leerse después del reintento", HTML)
        self.assertIn("cerradas o eliminadas quedaron fuera del control de stock", HTML)
        self.assertIn("publicación(es) Full informadas aparte, sin modificar su stock", HTML)
        self.assertIn("TN reintentó", HTML)

    def test_applying_one_sku_preserves_the_remaining_result(self):
        apply_block = HTML[
            HTML.index("async function applyInventoryReconciliation"):
            HTML.index("async function searchInventory")
        ]
        self.assertIn("filter(row=>String(row.sku||'')!==String(sku||''))", apply_block)
        self.assertIn("Quedan ${remaining} diferencia(s) comprobada(s) por revisar.", apply_block)
        self.assertNotIn("await previewInventoryReconciliation()", apply_block)


if __name__ == "__main__":
    unittest.main()
