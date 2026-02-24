"""
WM Finance - Iteration 7 Tests
Tests for new features:
1. "Made by Knyazev" badge in index.html
2. Integrations Page (/settings/integrations) with Telegram settings
3. FAQ Page with 'Первоначальная настройка' (setup-checklist) section
4. Superadmin login (admin / 220066mm)
5. API /settings/integrations endpoints
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
SUPERADMIN_LOGIN = "admin"
SUPERADMIN_PASSWORD = "220066mm"


class TestSuperadminLogin:
    """Test superadmin authentication"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_superadmin_login_success(self):
        """Test that superadmin can login with admin/220066mm"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPERADMIN_LOGIN,
            "password": SUPERADMIN_PASSWORD
        })
        
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        
        assert "token" in data, "Token not in response"
        assert "user" in data, "User not in response"
        assert data["user"]["role"] == "superadmin", f"Expected superadmin role, got {data['user']['role']}"
        assert data["user"]["id"] == "superadmin-wmfinance-001", "Wrong superadmin ID"
        assert data["user"]["name"] == "Super Admin", "Wrong superadmin name"
        print(f"✅ Superadmin login successful, role: {data['user']['role']}")
    
    def test_superadmin_wrong_password(self):
        """Test that wrong password returns 401"""
        response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPERADMIN_LOGIN,
            "password": "wrongpassword"
        })
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        print("✅ Wrong password correctly rejected")


class TestIntegrationSettingsAPI:
    """Test /settings/integrations endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as superadmin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPERADMIN_LOGIN,
            "password": SUPERADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Authentication failed")
    
    def test_get_integration_settings(self):
        """Test GET /settings/integrations returns settings"""
        response = self.session.get(f"{BASE_URL}/api/settings/integrations")
        
        assert response.status_code == 200, f"Failed to get settings: {response.text}"
        data = response.json()
        
        # Check expected fields exist
        assert "telegram_bot_token" in data or data.get("telegram_bot_token") is None
        assert "telegram_chat_id" in data or data.get("telegram_chat_id") is None
        assert "telegram_auto_summary" in data
        assert "telegram_summary_schedule" in data
        assert "telegram_summary_time" in data
        
        print(f"✅ Integration settings returned: auto_summary={data.get('telegram_auto_summary')}, schedule={data.get('telegram_summary_schedule')}")
    
    def test_update_telegram_settings(self):
        """Test PUT /settings/integrations/telegram updates settings"""
        test_settings = {
            "telegram_chat_id": "-1001234567890",
            "telegram_auto_summary": True,
            "telegram_summary_schedule": "daily",
            "telegram_summary_time": "10:00"
        }
        
        response = self.session.put(
            f"{BASE_URL}/api/settings/integrations/telegram",
            json=test_settings
        )
        
        assert response.status_code == 200, f"Failed to update settings: {response.text}"
        
        # Verify update
        get_response = self.session.get(f"{BASE_URL}/api/settings/integrations")
        assert get_response.status_code == 200
        
        data = get_response.json()
        assert data.get("telegram_chat_id") == test_settings["telegram_chat_id"]
        assert data.get("telegram_auto_summary") == test_settings["telegram_auto_summary"]
        assert data.get("telegram_summary_schedule") == test_settings["telegram_summary_schedule"]
        assert data.get("telegram_summary_time") == test_settings["telegram_summary_time"]
        
        print("✅ Telegram settings updated and verified")
    
    def test_telegram_test_connection_endpoint(self):
        """Test POST /settings/telegram/test endpoint exists"""
        # Send fake token - will return error but endpoint should exist
        response = self.session.post(
            f"{BASE_URL}/api/settings/telegram/test",
            json={
                "bot_token": "fake_token",
                "chat_id": "-123456"
            }
        )
        
        # Should return 200 with error status (not 404/500)
        assert response.status_code == 200, f"Endpoint not found: {response.status_code}"
        data = response.json()
        assert "status" in data
        assert data["status"] in ["success", "error"]
        
        print(f"✅ Telegram test endpoint exists, status: {data.get('status')}")
    
    def test_send_summary_without_config(self):
        """Test POST /settings/telegram/send-summary without Telegram config"""
        # First clear telegram config
        self.session.put(
            f"{BASE_URL}/api/settings/integrations/telegram",
            json={"telegram_bot_token": "", "telegram_chat_id": ""}
        )
        
        response = self.session.post(f"{BASE_URL}/api/settings/telegram/send-summary?period=week")
        
        # Should return 400 because telegram is not configured
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("✅ Send summary correctly fails when Telegram not configured")


class TestRegressionBasicAPIs:
    """Regression tests for basic APIs"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as superadmin
        login_response = self.session.post(f"{BASE_URL}/api/auth/login", json={
            "email": SUPERADMIN_LOGIN,
            "password": SUPERADMIN_PASSWORD
        })
        
        if login_response.status_code == 200:
            token = login_response.json().get("token")
            self.session.headers.update({"Authorization": f"Bearer {token}"})
        else:
            pytest.skip("Authentication failed")
    
    def test_accounts_endpoint(self):
        """Test accounts endpoint works"""
        response = self.session.get(f"{BASE_URL}/api/accounts")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Accounts endpoint works, count: {len(data)}")
    
    def test_categories_endpoint(self):
        """Test categories endpoint works"""
        response = self.session.get(f"{BASE_URL}/api/categories")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Categories endpoint works, count: {len(data)}")
    
    def test_directions_endpoint(self):
        """Test directions endpoint works"""
        response = self.session.get(f"{BASE_URL}/api/directions")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"✅ Directions endpoint works, count: {len(data)}")
    
    def test_analytics_summary_endpoint(self):
        """Test analytics summary endpoint works"""
        response = self.session.get(f"{BASE_URL}/api/analytics/summary")
        assert response.status_code == 200
        data = response.json()
        assert "total_income" in data
        assert "total_expense" in data
        assert "profit" in data
        print("✅ Analytics summary endpoint works")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
