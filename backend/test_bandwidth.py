import unittest
from app.api.bandwidth import get_bandwidth_links

class TestBandwidthRouter(unittest.TestCase):
    
    def test_get_all_links(self):
        data = get_bandwidth_links()
        self.assertIn("links", data)
        self.assertEqual(len(data["links"]), 6)
        
        # Verify schema elements
        for lnk in data["links"]:
            self.assertIn("id", lnk)
            self.assertIn("name", lnk)
            self.assertIn("region", lnk)
            self.assertIn("type", lnk)
            self.assertIn("speed", lnk)
            self.assertIn("rate", lnk)
            self.assertIn("totalData", lnk)
            self.assertIn("accruedCost", lnk)
            
    def test_filter_by_region(self):
        data = get_bandwidth_links(region="IN-West")
        self.assertIn("links", data)
        self.assertEqual(len(data["links"]), 2)
        for lnk in data["links"]:
            self.assertEqual(lnk["region"], "IN-West")
            
    def test_filter_by_type(self):
        data = get_bandwidth_links(link_type="VPN")
        self.assertIn("links", data)
        self.assertEqual(len(data["links"]), 2)
        for lnk in data["links"]:
            self.assertEqual(lnk["type"], "VPN")

if __name__ == "__main__":
    unittest.main()
