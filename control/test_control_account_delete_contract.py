import unittest
from pathlib import Path


HTML = (Path(__file__).resolve().parent / "tc_panel.html").read_text(encoding="utf-8")


class ControlAccountDeleteContractTests(unittest.TestCase):
    def test_delete_requires_a_fresh_owner_key_and_exact_name(self):
        self.assertIn('id="confirmDeleteName"', HTML)
        self.assertIn('id="confirmDeleteKey" type="password"', HTML)
        self.assertIn("owner_key_confirmation:ownerKey", HTML)
        self.assertIn("confirmedName!==String(selectedUser.name||'').trim()", HTML)

    def test_delete_audits_before_showing_the_confirmation(self):
        self.assertIn("/delete-audit`)", HTML)
        self.assertIn("if(!deleteAudit.safe_to_delete)", HTML)
        self.assertIn("Primero desactivá el acceso de la cuenta.", HTML)

    def test_delete_uses_the_owner_control_endpoint(self):
        self.assertIn("/delete`,{method:'POST'", HTML)
        self.assertIn("Eliminar definitivamente", HTML)


if __name__ == "__main__":
    unittest.main()
