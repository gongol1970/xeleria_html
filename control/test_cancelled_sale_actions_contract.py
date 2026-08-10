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
        self.assertIn("includes('cancelado')", body)
        self.assertIn("restore.pending>0", body)
        self.assertIn(">Restaurar stock</button>", body)

    def test_restore_balance_uses_audited_sale_and_cancellation_movements(self):
        body = function_body("cancelledSaleRestoreState")
        self.assertIn("type==='sale'&&referenceType==='order'&&quantity<0", body)
        self.assertIn("type==='sale_cancellation_restore'&&referenceType==='order_cancellation'&&quantity>0", body)
        self.assertIn("Math.max(0,entry.sold-entry.restored)", body)

    def test_restore_requires_human_confirmation_and_explicit_backend_confirmation(self):
        body = function_body("restoreCancelledSaleStock")
        self.assertIn(r"mercader\u00eda no fue despachada", body)
        self.assertIn("confirm(", body)
        self.assertIn("confirmar:true", body)
        self.assertIn("restore-cancelled-stock", body)

    def test_credit_note_is_available_for_issued_ml_and_tn_invoices(self):
        body = function_body("issuedInvoiceActionsHtml")
        nc_position = body.index("arcaStartNoteFromInvoice")
        tn_only_position = body.index("if(channel==='TN')")
        self.assertLess(nc_position, tn_only_position)
        self.assertIn("Nota de Cr&eacute;dito", body)

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
