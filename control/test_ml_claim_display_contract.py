from pathlib import Path
import re
import unittest


HTML = (Path(__file__).resolve().parents[1] / "admin_erp.html").read_text(encoding="utf-8")


def function_body(name: str) -> str:
    match = re.search(rf"function {re.escape(name)}\([^)]*\)\{{", HTML)
    if not match:
        raise AssertionError(f"No se encontró {name}")
    next_function = HTML.find("\nfunction ", match.end())
    if next_function < 0:
        next_function = len(HTML)
    return HTML[match.start():next_function]


class MlClaimDisplayContract(unittest.TestCase):
    def test_claim_overrides_logistics_and_hides_other_actions(self):
        body = function_body("orderCard")
        self.assertIn("let logistic=hasClaim?'RECLAMO':logisticLabel(o,ch)", body)
        self.assertIn("let act=hasClaim?'':saleNeedsAction(o,ch)", body)
        self.assertIn("let correoHtml=hasClaim?'':correoActionHtml", body)

    def test_open_claims_are_stably_prioritized(self):
        body = function_body("prioritizeOpenClaims")
        self.assertIn("ml_claim_open", body)
        self.assertIn("a.index-b.index", body)
        self.assertIn("prioritizeOpenClaims(items,channel)", function_body("ordersTable"))

    def test_capture_timestamp_is_not_a_visible_sale_date_fallback(self):
        body = function_body("orderCard")
        sale_date_line = next(line for line in body.splitlines() if "let saleDate=" in line)
        self.assertNotIn("o.created_at", sale_date_line)
        self.assertIn("Fecha de venta pendiente", body)

    def test_correo_keeps_pricing_settings_without_login_or_export_action(self):
        self.assertIn("const CORREO_ARGENTINO_OAUTH_ENABLED=false", HTML)
        self.assertIn('<div class="card" id="correoSettingsCard">', HTML)
        self.assertIn('id="cfgShippingMarkupValue"', HTML)
        self.assertIn('id="cfgShippingRoundingStep"', HTML)
        self.assertNotIn('id="cfgCorreoAccountEmail"', HTML)
        self.assertNotIn('id="cfgCorreoAccountPassword"', HTML)
        self.assertIn(
            "if(!CORREO_ARGENTINO_OAUTH_ENABLED)return''",
            function_body("correoActionHtml"),
        )


if __name__ == "__main__":
    unittest.main()
