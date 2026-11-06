from pathlib import Path
import unittest


HTML = (Path(__file__).resolve().parents[1] / "admin_erp.html").read_text(encoding="utf-8")


class InventoryPriceSaveContractTests(unittest.TestCase):
    def test_zero_jobs_is_not_reported_as_marketplace_confirmation(self):
        self.assertIn("let hasSyncJobs=queuedJobs>0||jobCount>0", HTML)
        self.assertIn("else if(hasSyncJobs)setStatus('invStatus'", HTML)
        self.assertIn("no hubo cambios de stock/precio para sincronizar", HTML)

    def test_listing_prices_are_sent_with_the_product_save(self):
        self.assertIn("listings:inventoryListingPayloadsFromEdit(idx,item)", HTML)
        self.assertIn("price:qs(`editListingPrice_${idx}_${j}`)", HTML)


if __name__ == "__main__":
    unittest.main()
