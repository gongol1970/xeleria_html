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


class SalesNonBlockingContract(unittest.TestCase):
    def test_saved_sales_load_before_live_channel_refresh(self):
        body = function_body("enterSalesView")
        self.assertLess(body.index("await loadRecent("), body.index("orders/refresh-section"))

    def test_live_refresh_has_timeout_and_no_global_spinner(self):
        body = function_body("enterSalesView")
        self.assertIn("fetchJsonWithTimeout", body)
        self.assertIn("SALES_LIVE_REFRESH_MAX_MS", body)
        self.assertIn("trackActivity:false", body)

    def test_saved_sales_read_is_bounded(self):
        body = function_body("loadRecent")
        self.assertIn("fetchJsonWithTimeout", body)
        self.assertIn("SALES_DB_LOAD_MAX_MS", body)

    def test_late_closed_view_cannot_repaint_sales(self):
        body = function_body("enterSalesView")
        self.assertGreaterEqual(body.count("enterSeq!==salesState.enterSeq||!salesViewIsActive(ch)"), 3)

    def test_channel_failure_keeps_saved_sales_warning(self):
        body = function_body("enterSalesView")
        self.assertIn("Se muestran datos guardados", body)
        self.assertIn("no uses esta lista para afirmar que una compra no existe", body)


if __name__ == "__main__":
    unittest.main()
