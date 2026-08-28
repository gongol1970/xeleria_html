from pathlib import Path
import unittest


HTML = (Path(__file__).resolve().parents[1] / "admin_erp.html").read_text(encoding="utf-8")


class PublicationsManualRemoveContractTests(unittest.TestCase):
    def test_ml_and_tn_publications_expose_the_manual_three_dot_action(self):
        self.assertIn('function listingMenuHtml(market,itemIdx,listingIdx)', HTML)
        self.assertIn('class="kebabMenu listingKebab"', HTML)
        self.assertIn('>Eliminar de XelerIA</button>', HTML)
        self.assertIn("renderReadonlyListingsForItem(i,market,itemIdx)", HTML)

    def test_manual_remove_reuses_the_tenant_scoped_unlink_without_external_delete(self):
        start = HTML.index("async function removePublicationFromXeleria")
        flow = HTML[start:HTML.index("async function loadPublications", start)]
        self.assertIn("/unlink-listing',{method:'POST'", flow)
        self.assertNotIn("method:'DELETE'", flow)
        self.assertIn("No se borrará ni modificará en ${channel}", flow)
        self.assertIn("El SKU ${sku} y su inventario permanecen intactos", flow)
        self.assertIn("await loadPublications(market,state.publications[market].offset||0)", flow)

    def test_publications_screen_no_longer_claims_to_be_read_only(self):
        self.assertNotIn("Vista solo lectura de publicaciones ML", HTML)
        self.assertNotIn("Vista solo lectura de publicaciones TN", HTML)
        self.assertEqual(HTML.count("El menú ⋮ permite quitar una publicación solo de XelerIA"), 2)


if __name__ == "__main__":
    unittest.main()
