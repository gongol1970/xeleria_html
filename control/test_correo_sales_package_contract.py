import re
import unittest
from pathlib import Path


HTML = Path(__file__).resolve().parents[1].joinpath("admin_erp.html").read_text(encoding="utf-8")


class CorreoSalesPackageContractTests(unittest.TestCase):
    def test_actions_are_available_for_ml_and_tn_a_coordinar_with_customer_id(self):
        self.assertIn("String(state.tenantSettings?.correo_customer_id||'').trim()", HTML)
        self.assertIn("!['ML','TN'].includes(ch)||logistic!=='A coordinar'", HTML)
        self.assertIn("Cotizar con CA", HTML)
        self.assertIn("Exportar a CA", HTML)

    def test_actions_have_their_own_column_before_invoice(self):
        order = re.search(r"function orderCard\(o,ch\)\{([\s\S]*?)\n\}", HTML).group(1)
        self.assertLess(order.index('class="orderCorreoActions"'), order.index('class="orderInvoiceBlock"'))
        self.assertNotIn("${correoHtml}${cancelledActions}", order)

    def test_modal_supports_quote_and_export_for_both_channels(self):
        self.assertIn("id=\"correoPackageModal\"", HTML)
        self.assertIn("correo/quote`,{method:'POST'", HTML)
        self.assertIn("correo/export`,{method:'POST'", HTML)
        self.assertIn("state.correoChannel.toLowerCase()", HTML)

    def test_test_mode_does_not_filter_delivered_state(self):
        action = re.search(r"function correoActionHtml\(o,ch,logistic\)\{([\s\S]*?)\n\}", HTML).group(1)
        self.assertNotIn("shippingStateLabel", action)
        self.assertNotIn("Entregado'", action)


if __name__ == "__main__":
    unittest.main()
