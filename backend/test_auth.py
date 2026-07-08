import unittest
from fastapi.testclient import TestClient
from app.main import app

class TestAuthRouter(unittest.TestCase):
    
    def setUp(self):
        self.client = TestClient(app)
        
    def test_login_success(self):
        # operator1 / securepass
        response = self.client.post("/auth/login", json={
            "username": "operator1",
            "password": "securepass"
        })
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "SUCCESS")
        self.assertEqual(data["username"], "operator1")
        self.assertEqual(data["role"], "WarehouseOperator")
        self.assertTrue(data["token"].startswith("vdi_sec_token_"))
        
    def test_login_invalid_password(self):
        response = self.client.post("/auth/login", json={
            "username": "operator1",
            "password": "wrongpassword"
        })
        self.assertEqual(response.status_code, 401)
        data = response.json()
        self.assertIn("detail", data)
        self.assertEqual(data["detail"], "Invalid credentials. Session establishment rejected.")
        
    def test_login_nonexistent_user(self):
        response = self.client.post("/auth/login", json={
            "username": "unknown_operator",
            "password": "securepass"
        })
        self.assertEqual(response.status_code, 401)
        data = response.json()
        self.assertIn("detail", data)
        self.assertEqual(data["detail"], "Invalid credentials. Session establishment rejected.")
        
    def test_login_empty_fields(self):
        response = self.client.post("/auth/login", json={
            "username": "",
            "password": "securepass"
        })
        self.assertEqual(response.status_code, 400)

if __name__ == "__main__":
    unittest.main()
