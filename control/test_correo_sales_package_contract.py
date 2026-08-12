import re
import unittest
from pathlib import Path


HTML = Path(__file__).resolve().parents[1].joinpath("admin_erp.html").read_text(encoding="utf-8")


class CorreoSalesPackageContractTests(unittest.TestCase):
    def test_actions_are_available_for_ml_and_tn_a_coordinar_with_customer_id(self):
        self.assertIn("function correoAccountConfigured()", HTML)
        self.assertIn("String(s.correo_customer_id||'').trim()", HTML)
        self.assertIn("!['ML','TN'].includes(ch)||logistic!=='A coordinar'", HTML)
        self.assertIn("Cotizar con CA", HTML)
        self.assertIn("Exportar a CA", HTML)

    def test_sales_load_tenant_settings_before_rendering_actions(self):
        self.assertIn("function ensureTenantSettingsForSales()", HTML)
        self.assertIn("fetchJson('/admin/tenant/settings',{skipLastJson:true,trackActivity:false})", HTML)
        load_recent = re.search(r"async function loadRecent\(ch,offset=0,opts=\{\}\)\{([\s\S]*?)\n\}", HTML).group(1)
        self.assertIn("let tenantSettingsPromise=ensureTenantSettingsForSales()", load_recent)
        self.assertLess(load_recent.index("await tenantSettingsPromise"), load_recent.index("ordersTable(arr,ch)"))

    def test_actions_have_their_own_column_before_invoice(self):
        order = re.search(r"function orderCard\(o,ch\)\{([\s\S]*?)\n\}", HTML).group(1)
        self.assertLess(order.index('class="orderCorreoActions"'), order.index('class="orderInvoiceBlock"'))
        self.assertNotIn("${correoHtml}${cancelledActions}", order)

    def test_modal_supports_quote_and_export_for_both_channels(self):
        self.assertIn("id=\"correoPackageModal\"", HTML)
        self.assertIn('id="correoPackageOriginPostalCode"', HTML)
        self.assertIn('id="correoPackageDestinationPostalCode"', HTML)
        self.assertIn("Calcular env\u00edo", HTML)
        self.assertIn("correo/quote`,{method:'POST'", HTML)
        self.assertIn("correo/export`,{method:'POST'", HTML)
        self.assertIn("state.correoChannel.toLowerCase()", HTML)

    def test_quote_is_explicit_and_modal_does_not_auto_quote(self):
        modal = re.search(r'<div id="correoPackageModal"([\s\S]*?)<div id="erpBusyOverlay"', HTML).group(1)
        self.assertIn('onclick="quoteCorreoPackage()"', modal)
        open_modal = re.search(r"async function openCorreoPackageModal\(orderId,channel,mode\)\{([^\n]+)", HTML).group(1)
        self.assertNotIn("quoteCorreoPackage()", open_modal)
        self.assertNotIn("scheduleCorreoQuote", open_modal)

    def test_global_configuration_save_is_last_and_outside_cards(self):
        configuration = re.search(r'<section id="configuracion" class="view">([\s\S]*?)</section>', HTML).group(1)
        save_index = configuration.index('id="configSaveActions"')
        self.assertGreater(save_index, configuration.index('id="inventoryImportCard"'))
        self.assertGreater(save_index, configuration.index('id="correoSettingsCard"'))
        self.assertIn('Guardar toda la configuraci\u00f3n', configuration[save_index:])

    def test_test_mode_does_not_filter_delivered_state(self):
        action = re.search(r"function correoActionHtml\(o,ch,logistic\)\{([\s\S]*?)\n\}", HTML).group(1)
        self.assertNotIn("shippingStateLabel", action)
        self.assertNotIn("Entregado'", action)


if __name__ == "__main__":
    unittest.main()
