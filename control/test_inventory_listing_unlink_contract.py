from pathlib import Path
import unittest


HTML = (Path(__file__).resolve().parents[1] / "admin_erp.html").read_text(encoding="utf-8")


class InventoryListingUnlinkContractTests(unittest.TestCase):
    def test_trash_action_uses_the_existing_status_column(self):
        self.assertIn(
            ".productEditPubLine{grid-template-columns:46px minmax(260px,1fr) 120px 92px 74px!important}",
            HTML,
        )
        self.assertIn(
            '<div class="productEditPubStatus">${listingStatusTextSpan(l)}<button type="button" class="productEditPubDelete"',
            HTML,
        )
        self.assertNotIn("grid-template-columns:46px minmax(260px,1fr) 120px 92px 74px 26px", HTML)

    def test_each_listing_can_be_unlinked_without_deleting_the_marketplace_item(self):
        self.assertIn("async function unlinkInventoryListing(idx,j)", HTML)
        self.assertIn("/unlink-listing',{method:'POST'", HTML)
        self.assertIn("Esto no borra ni modifica la publicación en ${market}", HTML)
        self.assertIn("Las demás publicaciones del SKU ${item.sku} quedan intactas", HTML)
        self.assertNotIn("method:'DELETE',body:JSON.stringify(body)", HTML)

    def test_unlinked_row_is_removed_from_future_product_saves(self):
        self.assertIn("listing._unlinked=true", HTML)
        self.assertIn("l._unlinked?null", HTML)
        self.assertIn(".filter(x=>x&&x.marketplace&&x.external_product_id)", HTML)


if __name__ == "__main__":
    unittest.main()
