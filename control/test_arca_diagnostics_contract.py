from pathlib import Path
import unittest


HTML = (Path(__file__).resolve().parents[1] / "admin_erp.html").read_text(encoding="utf-8")


class ArcaDiagnosticsContract(unittest.TestCase):
    def test_sale_warning_exposes_arca_code_message_stage_and_time(self):
        self.assertIn("normalizeArcaDiagnosticErrors", HTML)
        self.assertIn("Código ${esc(x.code||'-')}", HTML)
        self.assertIn("Etapa: '+diagnostic.stage", HTML)
        self.assertIn("Hora: '+dateAR(diagnostic.at)", HTML)

    def test_operational_log_carries_arca_observations(self):
        self.assertIn("function opsLogArcaDetailHtml", HTML)
        self.assertIn("arca_errors:Array.isArray(x.arca_errors)?x.arca_errors:[]", HTML)
        self.assertIn("expected_cbte_nro:x.expected_cbte_nro", HTML)

    def test_ambiguous_or_technical_error_has_no_blind_invoice_button(self):
        self.assertIn("let reviewedRejection=diagnostic.response_kind==='explicit_rejection'", HTML)
        self.assertIn("No reintentar: requiere consulta o revisión previa.", HTML)

    def test_operational_pending_invoice_launches_safe_manual_invoicing(self):
        self.assertIn("kind==='issue_invoice'&&a.channel&&a.order_id", HTML)
        self.assertIn("issueInvoiceFromSale('${jsq(String(a.channel))}','${jsq(String(a.order_id))}')", HTML)
        self.assertIn("label:'Facturar manualmente'", HTML)
        self.assertIn("status==='not_attempted'||x.response_kind==='explicit_rejection'||preRequestFailure", HTML)
        self.assertIn("['build_payload','resolve_customer_from_arca']", HTML)
        self.assertIn("label:'Revisar facturación'", HTML)
        self.assertNotIn("label:'Abrir Facturación'", HTML)

    def test_operational_log_has_no_xeli_interpret_button(self):
        self.assertNotIn('>Interpretar con Xeli</button>', HTML)

    def test_manual_invoice_error_refreshes_visible_persisted_diagnostic(self):
        self.assertIn("detail.arca_padron_error||detail.error", HTML)
        self.assertIn("alert(`No se pudo emitir la factura.", HTML)
        self.assertIn("await loadOpsLog(false);", HTML)

    def test_successful_manual_invoice_reloads_page_after_cleanup(self):
        self.assertIn("let refreshAfterSuccess=false;", HTML)
        self.assertIn("refreshAfterSuccess=true;", HTML)
        self.assertIn("if(refreshAfterSuccess)window.location.reload();", HTML)

    def test_manual_quantity_uses_integer_arrows(self):
        self.assertIn('class="amQty" type="number" min="1" step="1"', HTML)
        self.assertNotIn('class="amQty" type="number" step="0.01"', HTML)

    def test_questions_have_visible_persisted_signature_without_example(self):
        self.assertIn('id="mlSignatureTextMain"', HTML)
        self.assertIn('>Guardar firma</button>', HTML)
        self.assertNotIn('placeholder="Nombre del comercio"', HTML)


if __name__ == "__main__":
    unittest.main()
