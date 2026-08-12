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

    def test_micorreo_uses_customer_id_without_tenant_credentials_or_token(self):
        self.assertIn("const MICORREO_ORDER_EXPORT_ENABLED=true", HTML)
        self.assertNotIn("CORREO_ARGENTINO_OAUTH_ENABLED", HTML)
        self.assertIn('<div class="card" id="correoSettingsCard">', HTML)
        self.assertIn('id="cfgCorreoCustomerId"', HTML)
        self.assertIn('N° de comercio MiCorreo', HTML)
        self.assertIn('No cargues usuario, contraseña ni token.', HTML)
        self.assertIn('id="cfgShippingMarkupValue"', HTML)
        self.assertIn('id="cfgShippingRoundingStep"', HTML)
        self.assertNotIn('id="cfgCorreoAccountEmail"', HTML)
        self.assertNotIn('id="cfgCorreoAccountPassword"', HTML)
        self.assertNotIn('id="cfgCorreoBearerToken"', HTML)
        self.assertIn("correo_customer_id:correoCustomerId||null", function_body("personalizationPayload"))
        self.assertIn("correoAccountConfigured()", function_body("correoActionHtml"))
        self.assertIn("String(s.correo_customer_id||'').trim()", function_body("correoAccountConfigured"))


if __name__ == "__main__":
    unittest.main()
