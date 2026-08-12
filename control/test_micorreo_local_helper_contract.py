from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "admin_erp.html").read_text(encoding="utf-8")


class MiCorreoLocalHelperContract(unittest.TestCase):
    def test_configuration_keeps_only_the_commerce_number(self):
        self.assertIn("N° de comercio MiCorreo", HTML)
        self.assertIn('id="cfgCorreoCustomerId"', HTML)
        self.assertIn("el único dato que debe cargar el comercio", HTML)

    def test_local_helper_is_completely_removed(self):
        self.assertFalse((ROOT / "Obtener_customerId_MiCorreo.bat").exists())
        self.assertNotIn("Obtener_customerId_MiCorreo.bat", HTML)
        self.assertNotIn("Descargar asistente local", HTML)
        self.assertNotIn("No configura XelerIA ni solicita tus credenciales", HTML)


if __name__ == "__main__":
    unittest.main()
