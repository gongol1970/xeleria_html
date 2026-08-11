from pathlib import Path
import unittest


HTML = (Path(__file__).resolve().parents[1] / "admin_erp.html").read_text(encoding="utf-8")


class InventoryUploadFallbackContractTests(unittest.TestCase):
    def test_limit_is_explained_as_screen_pagination(self):
        self.assertIn("<label>Mostrar en pantalla</label><select id=\"invLimit\"", HTML)

    def test_safe_reads_retry_but_writes_do_not(self):
        self.assertIn("maxAttempts=(method==='GET'&&opt.retrySafeGet!==false)?3:1", HTML)
        self.assertIn("retryableStatus=new Set([429,500,502,503,504])", HTML)

    def test_saved_upload_survives_grid_refresh_failure(self):
        self.assertIn("feedback.savedSummary", HTML)
        self.assertIn("XelerIA la reintentará automáticamente", HTML)
        self.assertIn("autoRetry:true", HTML)
        self.assertNotIn("Error inventario: '+friendlyInventoryError(e)", HTML)

    def test_upload_summary_reports_real_product_and_price_changes(self):
        self.assertIn("product_changes_count", HTML)
        self.assertIn("price_changes_count", HTML)
        self.assertIn("sincronización(es) pendientes; se reintentan solas", HTML)

    def test_ambiguous_post_is_confirmed_through_notifications_before_resend(self):
        self.assertIn("recoverInventoryUploadConfirmation", HTML)
        self.assertIn("revisá Notificaciones antes de volver a enviarlo", HTML)


if __name__ == "__main__":
    unittest.main()
