"""
WM Finance - Iteration 6 Tests
Testing new features: Superadmin login, Adesk Migration, FAQ page, Telegram bot summary

Features tested:
1. Superadmin login (admin / 220066mm)
2. /bot/summary API for Telegram
3. Adesk migration endpoints
4. FAQ page accessibility (frontend)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestSuperadminLogin:
    """Test superadmin authentication with login: admin, password: 220066mm"""
    
    def test_superadmin_login_success(self):
        """Test that superadmin can login with credentials admin/220066mm"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin",  # Using login field
            "password": "220066mm"
        })
        
        assert response.status_code == 200, f"Superadmin login failed: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "token" in data, "Token should be present in response"
        assert "user" in data, "User object should be present in response"
        assert data["user"]["role"] == "superadmin", f"Expected superadmin role, got {data['user']['role']}"
        assert data["user"]["name"] == "Super Admin", f"Expected Super Admin name, got {data['user']['name']}"
        assert data["user"]["email"] == "admin@wmfinance.local"
        assert data["user"]["id"] == "superadmin-wmfinance-001"
        
        print(f"Superadmin login SUCCESS - Token received, role: {data['user']['role']}")
    
    def test_superadmin_wrong_password(self):
        """Test superadmin login fails with wrong password"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin",
            "password": "wrongpassword"
        })
        
        assert response.status_code == 401, "Should return 401 for wrong password"
        print("Wrong password correctly rejected with 401")
    
    def test_superadmin_me_endpoint(self):
        """Test /auth/me endpoint for superadmin"""
        # First login
        login_res = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin",
            "password": "220066mm"
        })
        assert login_res.status_code == 200
        token = login_res.json()["token"]
        
        # Call /auth/me
        me_res = requests.get(f"{BASE_URL}/api/auth/me", headers={
            "Authorization": f"Bearer {token}"
        })
        assert me_res.status_code == 200
        data = me_res.json()
        
        assert data["role"] == "superadmin"
        assert data["id"] == "superadmin-wmfinance-001"
        print(f"Superadmin /auth/me SUCCESS - User: {data['name']}")


class TestTelegramBotSummary:
    """Test /bot/summary API for Telegram integration"""
    
    @pytest.fixture
    def auth_token(self):
        """Get auth token for bot API"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin",
            "password": "220066mm"
        })
        if response.status_code != 200:
            pytest.skip("Auth failed - skipping bot tests")
        return response.json()["token"]
    
    def test_bot_summary_week(self, auth_token):
        """Test /bot/summary with week period"""
        response = requests.get(f"{BASE_URL}/api/bot/summary", params={
            "user_token": auth_token,
            "period": "week"
        })
        
        assert response.status_code == 200, f"Bot summary failed: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "message" in data, "Message should be present"
        assert "data" in data, "Data object should be present"
        
        # Validate data structure
        assert "period" in data["data"], "Period should be in data"
        assert data["data"]["period"] == "week"
        assert "income" in data["data"]
        assert "expense" in data["data"]
        assert "profit" in data["data"]
        assert "balance" in data["data"]
        assert "by_direction" in data["data"]
        assert "top_expenses" in data["data"]
        
        # Validate message format (Telegram markdown)
        assert "Финансовая сводка" in data["message"], "Message should contain summary header"
        assert "Доходы" in data["message"]
        assert "Расходы" in data["message"]
        assert "Прибыль" in data["message"]
        assert "Баланс на счетах" in data["message"]
        
        print(f"Bot summary week SUCCESS - Income: {data['data']['income']}, Expense: {data['data']['expense']}")
    
    def test_bot_summary_day(self, auth_token):
        """Test /bot/summary with day period"""
        response = requests.get(f"{BASE_URL}/api/bot/summary", params={
            "user_token": auth_token,
            "period": "day"
        })
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["data"]["period"] == "day"
        assert "за сегодня" in data["message"]
        print(f"Bot summary day SUCCESS - Balance: {data['data']['balance']}")
    
    def test_bot_summary_month(self, auth_token):
        """Test /bot/summary with month period"""
        response = requests.get(f"{BASE_URL}/api/bot/summary", params={
            "user_token": auth_token,
            "period": "month"
        })
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["data"]["period"] == "month"
        assert "за месяц" in data["message"]
        print(f"Bot summary month SUCCESS - Profit: {data['data']['profit']}")
    
    def test_bot_summary_invalid_token(self):
        """Test /bot/summary with invalid token"""
        response = requests.get(f"{BASE_URL}/api/bot/summary", params={
            "user_token": "invalid_token_here",
            "period": "week"
        })
        
        assert response.status_code == 401, "Should return 401 for invalid token"
        print("Invalid token correctly rejected with 401")


class TestAdeskMigrationEndpoints:
    """Test Adesk migration API endpoints (Note: Adesk API is MOCKED - requires real token)"""
    
    @pytest.fixture
    def auth_headers(self):
        """Get auth headers for API calls"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin",
            "password": "220066mm"
        })
        if response.status_code != 200:
            pytest.skip("Auth failed - skipping Adesk tests")
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_adesk_test_connection_endpoint_exists(self, auth_headers):
        """Test that Adesk test-connection endpoint exists"""
        # Note: This test will fail with real Adesk API call since we don't have a valid token
        # We're testing that the endpoint exists and responds appropriately
        response = requests.post(
            f"{BASE_URL}/api/adesk/test-connection",
            json={"api_token": "dummy_test_token_12345"},
            headers=auth_headers
        )
        
        # The endpoint should exist (not 404) and handle the request
        assert response.status_code != 404, "Adesk test-connection endpoint should exist"
        
        # With invalid token, it should return an error status in the response
        if response.status_code == 200:
            data = response.json()
            # Since token is invalid, Adesk API will reject it
            assert "status" in data
            # Accept either error (invalid token) or timeout (Adesk unreachable)
            print(f"Adesk test-connection endpoint exists - Status: {data.get('status')}, Message: {data.get('message', 'N/A')}")
        
        print("Adesk test-connection endpoint available")
    
    def test_adesk_drafts_endpoint_exists(self, auth_headers):
        """Test that Adesk drafts GET endpoint exists"""
        response = requests.get(
            f"{BASE_URL}/api/adesk/drafts",
            headers=auth_headers
        )
        
        assert response.status_code == 200, f"Adesk drafts endpoint failed: {response.text}"
        data = response.json()
        
        # Validate response structure
        assert "drafts" in data, "Should have drafts array"
        assert "stats" in data, "Should have stats object"
        
        # Validate stats structure
        stats = data["stats"]
        assert "total" in stats
        assert "ready" in stats
        assert "needs_review" in stats
        assert "error" in stats
        assert "imported" in stats
        
        print(f"Adesk drafts endpoint available - Total drafts: {stats['total']}")


class TestExistingFeaturesRegression:
    """Regression tests to verify existing features still work"""
    
    @pytest.fixture
    def auth_headers(self):
        """Get auth headers"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin",
            "password": "220066mm"
        })
        if response.status_code != 200:
            pytest.skip("Auth failed")
        token = response.json()["token"]
        return {"Authorization": f"Bearer {token}"}
    
    def test_dashboard_analytics_summary(self, auth_headers):
        """Test /analytics/summary endpoint still works"""
        response = requests.get(
            f"{BASE_URL}/api/analytics/summary",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert "total_income" in data
        assert "total_expense" in data
        assert "profit" in data
        assert "total_balance" in data
        print(f"Analytics summary works - Profit: {data['profit']}")
    
    def test_accounts_endpoint(self, auth_headers):
        """Test /accounts endpoint still works"""
        response = requests.get(f"{BASE_URL}/api/accounts", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Accounts endpoint works - Count: {len(data)}")
    
    def test_directions_endpoint(self, auth_headers):
        """Test /directions endpoint still works"""
        response = requests.get(f"{BASE_URL}/api/directions", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Should have default directions
        if len(data) > 0:
            direction_names = [d["name"] for d in data]
            print(f"Directions endpoint works - Names: {direction_names}")
    
    def test_categories_endpoint(self, auth_headers):
        """Test /categories endpoint still works"""
        response = requests.get(f"{BASE_URL}/api/categories", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Categories endpoint works - Count: {len(data)}")
    
    def test_transactions_endpoint(self, auth_headers):
        """Test /transactions endpoint still works"""
        response = requests.get(f"{BASE_URL}/api/transactions", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Transactions endpoint works - Count: {len(data)}")
    
    def test_documents_endpoint(self, auth_headers):
        """Test /documents endpoint still works"""
        response = requests.get(f"{BASE_URL}/api/documents", headers=auth_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Documents endpoint works - Count: {len(data)}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
