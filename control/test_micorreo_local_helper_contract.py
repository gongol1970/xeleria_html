from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "admin_erp.html").read_text(encoding="utf-8")
BAT = (ROOT / "Obtener_customerId_MiCorreo.bat").read_text(encoding="utf-8")


class MiCorreoLocalHelperContract(unittest.TestCase):
    def test_configuration_offers_the_local_helper_as_a_download(self):
        self.assertIn('href="./Obtener_customerId_MiCorreo.bat" download', HTML)
        self.assertIn("No configura XelerIA ni solicita tus credenciales", HTML)

    def test_helper_opens_only_the_official_micorreo_portal(self):
        self.assertIn(
            'start "" "https://www.correoargentino.com.ar/MiCorreo/public"',
            BAT,
        )
        self.assertNotIn("xeleria.com", BAT.lower())
        self.assertNotIn("curl ", BAT.lower())
        self.assertNotIn("invoke-webrequest", BAT.lower())
        self.assertNotIn("invoke-restmethod", BAT.lower())

    def test_helper_reads_only_customer_id_and_delivers_it_locally(self):
        read_prompts = re.findall(r"Read-Host[^;]+", BAT, flags=re.IGNORECASE)
        self.assertEqual(len(read_prompts), 1)
        self.assertIn("ID de cliente", read_prompts[0])
        self.assertIn("'^\\d{1,32}$'", BAT)
        self.assertIn("Set-Clipboard -Value $id", BAT)
        self.assertIn("Datos_para_XelerIA_MiCorreo.txt", BAT)


if __name__ == "__main__":
    unittest.main()
