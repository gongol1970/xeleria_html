import unittest
from pathlib import Path


HTML = (Path(__file__).resolve().parents[1] / "admin_erp.html").read_text(encoding="utf-8")


class ArcaIncidentsContractTest(unittest.TestCase):
    def test_version_and_separate_tab_are_present(self):
        self.assertIn("2.97.23-micorreo-commerce-number", HTML)
        self.assertIn("Incidencias fiscales", HTML)
        self.assertIn("showArcaReportTab('incidents')", HTML)

    def test_incidents_load_only_on_entry_or_explicit_action(self):
        self.assertIn("if(active==='incidents')loadArcaIncidents();else loadArcaInvoices();", HTML)
        self.assertIn('onclick="loadArcaIncidents()"', HTML)
        self.assertNotIn("setInterval(loadArcaIncidents", HTML)

    def test_incident_routes_and_accountant_export_are_wired(self):
        self.assertIn("/admin/arca/incidencias?limit=", HTML)
        self.assertIn("/admin/arca/incidencias/export_excel?", HTML)
        self.assertIn("Descargar expediente Excel", HTML)

    def test_ui_states_that_incidents_do_not_enter_iva_simple_or_reissue(self):
        self.assertIn("no integra el TXT oficial de IVA Simple ni habilita una reemisión", HTML)
        self.assertIn("sin comprobante emitido", HTML)

    def test_visible_and_exported_fields_cover_accountant_requirements(self):
        for text in [
            "Nombre / Razón social",
            "CUIT / DNI",
            "Jurisdicción",
            "IVA",
            "Rechazo ARCA",
        ]:
            self.assertIn(text, HTML)


if __name__ == "__main__":
    unittest.main()
