import unittest
from pathlib import Path


HTML = (Path(__file__).resolve().parent / "tc_panel.html").read_text(encoding="utf-8")


class ControlAccountDeleteContractTests(unittest.TestCase):
    def test_delete_requires_a_fresh_owner_key_and_exact_name(self):
        self.assertIn('id="confirmDeleteName"', HTML)
        self.assertIn('id="confirmDeleteKey" type="password"', HTML)
        self.assertIn("owner_key_confirmation:ownerKey", HTML)
        self.assertIn("confirmedName!==String(selectedUser.name||'')", HTML)
        self.assertIn("Respetá mayúsculas, minúsculas, espacios y acentos", HTML)

    def test_delete_audits_before_showing_the_confirmation(self):
        self.assertIn("/delete-audit`)", HTML)
        self.assertIn("if(!deleteAudit.safe_to_delete)", HTML)
        self.assertIn("Primero desactivá el acceso de la cuenta.", HTML)

    def test_close_account_offers_keep_or_delete_all_data(self):
        self.assertIn('id="retainData"', HTML)
        self.assertIn("Dar de baja y mantener datos", HTML)
        self.assertIn("Dar de baja y borrar datos", HTML)
        self.assertIn("clientes, ventas, facturas, inventario, publicaciones, auditorías y configuración", HTML)

    def test_delete_errors_are_visible_inside_the_dialogs(self):
        self.assertIn('id="deleteInlineStatus"', HTML)
        self.assertIn('id="deleteDialogStatus"', HTML)
        self.assertIn("setInlineStatus('deleteDialogStatus',error.message,'error')", HTML)

    def test_delete_uses_the_owner_control_endpoint(self):
        self.assertIn("/delete`,{method:'POST'", HTML)
        self.assertIn("Eliminar definitivamente", HTML)


if __name__ == "__main__":
    unittest.main()
