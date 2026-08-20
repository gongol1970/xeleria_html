from pathlib import Path
import re
import unittest


HTML = (Path(__file__).resolve().parents[1] / "admin_erp.html").read_text(encoding="utf-8")


def function_body(name: str) -> str:
    match = re.search(rf"(?:async )?function {re.escape(name)}\([^)]*\)\{{", HTML)
    if not match:
        raise AssertionError(f"No se encontrÃ³ {name}")
    start = match.start()
    next_function = re.search(r"\n(?:async )?function ", HTML[match.end():])
    end = match.end() + next_function.start() if next_function else len(HTML)
    return HTML[start:end]


class CancelledSaleActionsContract(unittest.TestCase):
    def test_restore_is_offered_only_for_cancelled_sales_with_pending_sale_movements(self):
        body = function_body("cancelledSaleActionsHtml")
        self.assertIn("saleIsCancelled(o,ch)", body)
        self.assertIn("restore.pending>0", body)
        self.assertIn(">Restaurar stock</button>", body)

    def test_cancelled_sale_uses_order_status_even_if_shipping_is_not_cancelled(self):
        body = function_body("saleIsCancelled")
        self.assertIn("o?.is_cancelled===true", body)
        self.assertIn("o?.ml_status", body)
        self.assertIn("deepVal(r,'ml_raw.status')", body)
        self.assertIn("'cancelled'", body)

    def test_restore_balance_uses_audited_sale_and_cancellation_movements(self):
        body = function_body("cancelledSaleRestoreState")
        self.assertIn("movement.reference_id", body)
        self.assertIn("movement.movement_type", body)
        self.assertIn("movement.reference_type", body)
        self.assertIn("type==='sale'&&referenceType==='order'&&quantity<0", body)
        self.assertIn("type==='sale_cancellation_restore'&&referenceType==='order_cancellation'&&quantity>0", body)
        self.assertIn("Math.max(0,entry.sold-entry.restored)", body)

    def test_restore_requires_human_confirmation_and_explicit_backend_confirmation(self):
        body = function_body("restoreCancelledSaleStock")
        self.assertIn(r"mercader\u00eda no fue despachada", body)
        self.assertIn("confirm(", body)
        self.assertIn("confirmar:true", body)
        self.assertIn("restore-cancelled-stock", body)

    def test_restore_button_blocks_repeat_clicks_and_reports_local_result(self):
        actions_body = function_body("cancelledSaleActionsHtml")
        restore_body = function_body("restoreCancelledSaleStock")
        self.assertIn("restoreCancelledSaleStock(this", actions_body)
        self.assertIn("button.disabled=true", restore_body)
        self.assertIn("button.textContent='Restaurando...'", restore_body)
        self.assertIn("'Stock ya restaurado'", restore_body)
        self.assertIn("cancelledSaleRestoreFeedback", restore_body)
        self.assertIn("button.disabled=false", restore_body)

    def test_successful_restore_is_not_reported_as_failed_if_reload_fails(self):
        body = function_body("restoreCancelledSaleStock")
        success_position = body.index("restoredCount=Number")
        reload_position = body.index("await loadRecent")
        reload_catch_position = body.index("No se pudo actualizar la lista")
        self.assertLess(success_position, reload_position)
        self.assertGreater(reload_catch_position, reload_position)

    def test_credit_note_is_available_for_issued_ml_and_tn_invoices(self):
        body = function_body("issuedInvoiceActionsHtml")
        nc_position = body.index("arcaStartNoteFromInvoice")
        tn_only_position = body.index("if(channel==='TN')")
        self.assertLess(nc_position, tn_only_position)
        self.assertIn("Nota de Cr&eacute;dito", body)

    def test_claim_does_not_hide_independent_cancelled_sale_actions(self):
        body = function_body("orderCard")
        self.assertIn("let cancelledActions=cancelledSaleActionsHtml(o,ch);", body)
        self.assertNotIn("hasClaim?'':cancelledSaleActionsHtml", body)

    def test_cancelled_sale_has_no_pending_invoice_icon(self):
        body = function_body("invoiceButton")
        cancelled_position = body.index("saleIsCancelled(o,ch)")
        waiting_position = body.index("shippingLow!=='entregado'")
        self.assertLess(cancelled_position, waiting_position)
        self.assertIn("if(saleIsCancelled(o,ch))return '';", body)

    def test_cancelled_sale_is_not_requested_by_visible_shipping_refresh(self):
        body = function_body("salesVisibleOrderIds")
        self.assertIn("if(saleIsCancelled(item,ch))continue;", body)
        self.assertIn("continue", body)

    def test_credit_note_requires_an_explicit_restore_or_keep_stock_choice(self):
        start_body = function_body("arcaStartNoteFromInvoice")
        validation_body = function_body("arcaManualValidateStockDecision")
        payload_body = function_body("arcaManualBody")
        self.assertIn("arcaManualRequireStockDecision(kind==='NC')", start_body)
        self.assertIn("Elegí si esta Nota de Crédito restaura stock o no", validation_body)
        self.assertIn("arcaManualValidateStockDecision()", payload_body)
        self.assertIn("arcaManualRequireStockDecision([3,8,13].includes(tipo))", function_body("arcaManualTypeChanged"))

    def test_explicit_nc_stock_choice_controls_the_existing_stock_contract(self):
        element_body = function_body("arcaManualStockDecisionElement")
        choice_body = function_body("arcaManualStockDecisionChanged")
        self.assertIn("No restaurar stock", element_body)
        self.assertIn("Restaurar stock", element_body)
        self.assertIn("checkbox.checked=select?.value==='restore'", choice_body)
        self.assertIn("value='devolucion'", choice_body)


if __name__ == "__main__":
    unittest.main()
