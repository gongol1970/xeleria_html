from pathlib import Path
import re
import unittest


HTML = (Path(__file__).resolve().parents[1] / "admin_erp.html").read_text(encoding="utf-8")


def function_body(name: str) -> str:
    match = re.search(rf"async function {re.escape(name)}\([^)]*\)\{{", HTML)
    if not match:
        raise AssertionError(f"No se encontró {name}")
    start = match.start()
    next_function = HTML.find("\nasync function ", match.end())
    if next_function < 0:
        next_function = len(HTML)
    return HTML[start:next_function]


def sync_function_body(name: str) -> str:
    match = re.search(rf"function {re.escape(name)}\([^)]*\)\{{", HTML)
    if not match:
        raise AssertionError(f"No se encontró {name}")
    start = match.start()
    next_function = HTML.find("\nfunction ", match.end())
    if next_function < 0:
        next_function = HTML.find("\nasync function ", match.end())
    if next_function < 0:
        next_function = len(HTML)
    return HTML[start:next_function]


class SalesNonBlockingContract(unittest.TestCase):
    def test_live_channel_refresh_finishes_before_saved_sales_are_read(self):
        body = function_body("enterSalesView")
        self.assertLess(body.index("orders/refresh-section"), body.index("await loadRecent("))

    def test_live_refresh_has_no_thirty_second_cut_and_no_global_spinner(self):
        body = function_body("enterSalesView")
        self.assertIn("fetchJson(`/admin/${lc}/orders/refresh-section", body)
        self.assertNotIn("fetchJsonWithTimeout", body)
        self.assertNotIn("30000", body)
        self.assertIn("trackActivity:false", body)

    def test_saved_sales_read_is_bounded(self):
        body = function_body("loadRecent")
        self.assertIn("fetchJsonWithTimeout", body)
        self.assertIn("SALES_DB_LOAD_MAX_MS", body)

    def test_late_closed_view_cannot_repaint_sales(self):
        body = function_body("enterSalesView")
        self.assertGreaterEqual(body.count("enterSeq!==salesState.enterSeq||!salesViewIsActive(ch)"), 2)

    def test_channel_failure_keeps_saved_sales_warning(self):
        body = function_body("enterSalesView")
        self.assertIn("Se muestran datos guardados", body)
        self.assertIn("no uses esta lista para afirmar que una compra no existe", body)

    def test_claims_refresh_starts_independently_from_sales_refresh(self):
        body = function_body("enterSalesView")
        self.assertLess(body.index("claimsPromise"), body.index("orders/refresh-section"))
        self.assertNotIn("refreshVisibleShipping", body)

    def test_dashboard_refreshes_live_channels_before_reading_summary(self):
        body = function_body("loadDashboard")
        self.assertLess(body.index("await refreshShippingForDashboard"), body.index("/admin/dashboard/summary"))

    def test_dashboard_live_refresh_has_no_timeout_or_duplicate_shipping_pass(self):
        body = function_body("refreshShippingForDashboard")
        self.assertNotIn("fetchJsonWithTimeout", body)
        self.assertNotIn("refresh_shipping_pending", body)

    def test_manual_visible_refresh_does_not_ask_for_confirmation(self):
        body = function_body("refreshShippingPending")
        self.assertNotIn("confirm(", body)

    def test_successful_visible_refresh_clears_previous_channel_warning(self):
        body = function_body("refreshVisibleShipping")
        self.assertIn("salesState.freshnessWarning=''", body)

    def test_background_poll_does_not_repaint_visible_status(self):
        body = function_body("loadRecent")
        self.assertIn("if(!opts.background){", body)
        self.assertIn("if(!opts.background)setStatus(sid,'Error: '+msg,false)", body)

    def test_tn_contact_shipping_copy_is_rendered_as_a_coordinar(self):
        body = sync_function_body("tnLogisticLabel")
        logistic_body = sync_function_body("logisticLabel")
        self.assertIn("normalized.includes('contact')", body)
        self.assertIn("normalized.includes('coordinar')", body)
        self.assertIn("return 'A coordinar'", body)
        self.assertIn("return tnLogisticLabel(opt,st)", logistic_body)

    def test_persisted_external_stock_evidence_wins_over_generic_ml_label(self):
        body = sync_function_body("logisticLabel")
        full_position = body.index("boolishTrue(o.ml_is_full_or_external_stock)")
        explicit_position = body.index("let explicitType=")
        self.assertLess(full_position, explicit_position)
        self.assertIn("return 'FULL'", body)

    def test_specific_pending_action_replaces_generic_pending_state(self):
        body = sync_function_body("orderCard")
        self.assertIn("logStateLow==='pendiente'", body)
        self.assertIn("actLow.startsWith('pendiente')", body)
        self.assertIn("logState=act;act=''", body)

    def test_combo_save_error_keeps_human_and_technical_detail_copyable(self):
        body = sync_function_body("comboFriendlyComboError")
        self.assertIn("detail.message", body)
        self.assertIn("Código: ", body)
        self.assertIn("Detalle: ", body)


if __name__ == "__main__":
    unittest.main()
