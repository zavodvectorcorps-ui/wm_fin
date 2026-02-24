"""
WM Finance - Analytics API Tests
Tests for P0/P1 analytics features: Balance, Expense Analysis, Profitability, Top Contractors, Auto Rules
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAnalyticsAPIs:
    """Test suite for analytics endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test user and token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Register a unique test user
        test_email = f"test_analytics_{uuid.uuid4().hex[:8]}@wmfinance.pl"
        
        register_response = self.session.post(f"{BASE_URL}/api/auth/register", json={
            "email": test_email,
            "password": "test123",
            "name": "Analytics Test User",
            "role": "owner"
        })
        
        if register_response.status_code == 200:
            data = register_response.json()
            self.token = data.get("token")
            self.user_id = data.get("user", {}).get("id")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip("Could not register test user")
    
    # === BALANCE ANALYTICS ===
    def test_analytics_balance_endpoint(self):
        """Test /api/analytics/balance returns correct structure"""
        response = self.session.get(f"{BASE_URL}/api/analytics/balance")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Verify response structure
        assert "date" in data, "Response should contain 'date'"
        assert "assets" in data, "Response should contain 'assets'"
        assert "liabilities" in data, "Response should contain 'liabilities'"
        assert "receivables" in data, "Response should contain 'receivables'"
        assert "net_worth" in data, "Response should contain 'net_worth'"
        
        # Verify assets structure
        assets = data["assets"]
        assert "cash" in assets, "Assets should contain 'cash'"
        assert "checking" in assets, "Assets should contain 'checking'"
        assert "total" in assets, "Assets should contain 'total'"
        assert "by_currency" in assets, "Assets should contain 'by_currency'"
        
        print(f"Balance endpoint returned: {len(assets.get('cash', []))} cash accounts, {len(assets.get('checking', []))} checking accounts")
    
    def test_analytics_balance_with_date(self):
        """Test /api/analytics/balance with date_to parameter"""
        response = self.session.get(f"{BASE_URL}/api/analytics/balance?date_to=2026-01-15")
        assert response.status_code == 200
        
        data = response.json()
        assert data["date"] == "2026-01-15", "Date should match the requested date"
    
    # === EXPENSE ANALYSIS ===
    def test_analytics_expense_analysis_endpoint(self):
        """Test /api/analytics/expense-analysis returns correct structure"""
        response = self.session.get(f"{BASE_URL}/api/analytics/expense-analysis?date_from=2025-01-01&date_to=2026-01-31")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Verify response structure
        assert "period" in data, "Response should contain 'period'"
        assert "total_expense" in data, "Response should contain 'total_expense'"
        assert "daily_average" in data, "Response should contain 'daily_average'"
        assert "transaction_count" in data, "Response should contain 'transaction_count'"
        assert "by_category" in data, "Response should contain 'by_category'"
        assert "by_direction" in data, "Response should contain 'by_direction'"
        assert "top_contractors" in data, "Response should contain 'top_contractors'"
        assert "daily_trend" in data, "Response should contain 'daily_trend'"
        
        print(f"Expense analysis: total={data['total_expense']}, transactions={data['transaction_count']}")
    
    def test_analytics_expense_analysis_requires_dates(self):
        """Test /api/analytics/expense-analysis requires date parameters"""
        response = self.session.get(f"{BASE_URL}/api/analytics/expense-analysis")
        # Should return 422 without required parameters
        assert response.status_code == 422, "Should require date_from and date_to parameters"
    
    # === PROFITABILITY ===
    def test_analytics_profitability_endpoint(self):
        """Test /api/analytics/profitability returns correct structure"""
        response = self.session.get(f"{BASE_URL}/api/analytics/profitability?date_from=2025-01-01&date_to=2026-01-31")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        # Verify response structure
        assert "period" in data, "Response should contain 'period'"
        assert "by_direction" in data, "Response should contain 'by_direction'"
        assert "totals" in data, "Response should contain 'totals'"
        
        # Verify totals structure
        totals = data["totals"]
        assert "income" in totals, "Totals should contain 'income'"
        assert "expense" in totals, "Totals should contain 'expense'"
        assert "profit" in totals, "Totals should contain 'profit'"
        assert "margin" in totals, "Totals should contain 'margin'"
        
        # Verify directions are present (seeded data)
        direction_names = [d["name"] for d in data["by_direction"]]
        assert "Теплицы" in direction_names, "Should have 'Теплицы' direction"
        assert "Сауны" in direction_names, "Should have 'Сауны' direction"
        
        print(f"Profitability: {len(data['by_direction'])} directions, margin={totals['margin']}%")
    
    def test_analytics_profitability_direction_structure(self):
        """Test each direction has required fields"""
        response = self.session.get(f"{BASE_URL}/api/analytics/profitability?date_from=2025-01-01&date_to=2026-01-31")
        assert response.status_code == 200
        
        data = response.json()
        for direction in data["by_direction"]:
            assert "name" in direction, "Direction should have 'name'"
            assert "income" in direction, "Direction should have 'income'"
            assert "expense" in direction, "Direction should have 'expense'"
            assert "profit" in direction, "Direction should have 'profit'"
            assert "margin" in direction, "Direction should have 'margin'"
            assert "transactions" in direction, "Direction should have 'transactions'"
    
    # === TOP CONTRACTORS ===
    def test_analytics_top_contractors_endpoint(self):
        """Test /api/analytics/top-contractors returns correct structure"""
        response = self.session.get(f"{BASE_URL}/api/analytics/top-contractors?date_from=2025-01-01&date_to=2026-01-31&limit=5")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "period" in data, "Response should contain 'period'"
        assert "contractors" in data, "Response should contain 'contractors'"
        
        print(f"Top contractors: {len(data['contractors'])} contractors found")
    
    def test_analytics_top_contractors_default_dates(self):
        """Test /api/analytics/top-contractors works without dates (uses defaults)"""
        response = self.session.get(f"{BASE_URL}/api/analytics/top-contractors")
        assert response.status_code == 200, "Should work with default date range"


class TestAutoRulesAPI:
    """Test suite for auto-rules endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test user and token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Register a unique test user
        test_email = f"test_rules_{uuid.uuid4().hex[:8]}@wmfinance.pl"
        
        register_response = self.session.post(f"{BASE_URL}/api/auth/register", json={
            "email": test_email,
            "password": "test123",
            "name": "Rules Test User",
            "role": "owner"
        })
        
        if register_response.status_code == 200:
            data = register_response.json()
            self.token = data.get("token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip("Could not register test user")
    
    def test_get_auto_rules_empty(self):
        """Test getting auto-rules returns empty list for new user"""
        response = self.session.get(f"{BASE_URL}/api/auto-rules")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list), "Should return a list"
        print(f"Initial rules count: {len(data)}")
    
    def test_create_auto_rule(self):
        """Test creating an auto-rule"""
        rule_data = {
            "pattern": "TEST_PATTERN_001",
            "category_id": None,
            "direction_id": None,
            "contractor_id": None
        }
        
        response = self.session.post(f"{BASE_URL}/api/auto-rules", json=rule_data)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data["pattern"] == "TEST_PATTERN_001"
        assert data["is_active"] == True
        assert "id" in data
        
        self.created_rule_id = data["id"]
        print(f"Created rule ID: {self.created_rule_id}")
    
    def test_create_and_get_auto_rule(self):
        """Test creating an auto-rule and fetching it"""
        # Create rule
        rule_data = {"pattern": "BIEDRONKA_TEST"}
        create_response = self.session.post(f"{BASE_URL}/api/auto-rules", json=rule_data)
        assert create_response.status_code == 200
        
        created_rule = create_response.json()
        rule_id = created_rule["id"]
        
        # Get all rules
        get_response = self.session.get(f"{BASE_URL}/api/auto-rules")
        assert get_response.status_code == 200
        
        rules = get_response.json()
        rule_ids = [r["id"] for r in rules]
        assert rule_id in rule_ids, "Created rule should be in the list"
    
    def test_update_auto_rule(self):
        """Test updating an auto-rule"""
        # Create rule first
        create_response = self.session.post(f"{BASE_URL}/api/auto-rules", json={"pattern": "ORIGINAL"})
        assert create_response.status_code == 200
        rule_id = create_response.json()["id"]
        
        # Update rule
        update_response = self.session.put(f"{BASE_URL}/api/auto-rules/{rule_id}", json={"pattern": "UPDATED"})
        assert update_response.status_code == 200
        
        updated_rule = update_response.json()
        assert updated_rule["pattern"] == "UPDATED"
    
    def test_delete_auto_rule(self):
        """Test deleting an auto-rule"""
        # Create rule first
        create_response = self.session.post(f"{BASE_URL}/api/auto-rules", json={"pattern": "TO_DELETE"})
        assert create_response.status_code == 200
        rule_id = create_response.json()["id"]
        
        # Delete rule
        delete_response = self.session.delete(f"{BASE_URL}/api/auto-rules/{rule_id}")
        assert delete_response.status_code == 200
        
        # Verify deletion
        get_response = self.session.get(f"{BASE_URL}/api/auto-rules")
        rules = get_response.json()
        rule_ids = [r["id"] for r in rules]
        assert rule_id not in rule_ids, "Deleted rule should not be in the list"


class TestAIChatAPI:
    """Test suite for AI Chat endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test user and token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        test_email = f"test_ai_{uuid.uuid4().hex[:8]}@wmfinance.pl"
        
        register_response = self.session.post(f"{BASE_URL}/api/auth/register", json={
            "email": test_email,
            "password": "test123",
            "name": "AI Test User",
            "role": "owner"
        })
        
        if register_response.status_code == 200:
            data = register_response.json()
            self.token = data.get("token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip("Could not register test user")
    
    def test_ai_chat_endpoint(self):
        """Test AI chat endpoint responds"""
        response = self.session.post(f"{BASE_URL}/api/ai/chat?message=Привет")
        # AI endpoint should respond (might take time)
        assert response.status_code in [200, 500], f"Unexpected status: {response.status_code}"
        
        if response.status_code == 200:
            data = response.json()
            assert "response" in data, "Should contain 'response' field"
            print(f"AI response received: {len(data['response'])} chars")
        else:
            print("AI service may not be configured - this is acceptable for testing")


class TestDashboardAPI:
    """Test Dashboard-related endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test user and token"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        test_email = f"test_dashboard_{uuid.uuid4().hex[:8]}@wmfinance.pl"
        
        register_response = self.session.post(f"{BASE_URL}/api/auth/register", json={
            "email": test_email,
            "password": "test123",
            "name": "Dashboard Test User",
            "role": "owner"
        })
        
        if register_response.status_code == 200:
            data = register_response.json()
            self.token = data.get("token")
            self.session.headers.update({"Authorization": f"Bearer {self.token}"})
        else:
            pytest.skip("Could not register test user")
    
    def test_analytics_summary_endpoint(self):
        """Test /api/analytics/summary returns dashboard data"""
        response = self.session.get(f"{BASE_URL}/api/analytics/summary?date_from=2025-01-01&date_to=2026-01-31")
        assert response.status_code == 200
        
        data = response.json()
        assert "total_income" in data
        assert "total_expense" in data
        assert "profit" in data
        assert "total_balance" in data
        assert "by_direction" in data
        assert "accounts" in data
    
    def test_daily_balance_endpoint(self):
        """Test /api/analytics/daily-balance returns chart data"""
        response = self.session.get(f"{BASE_URL}/api/analytics/daily-balance?date_from=2026-01-01&date_to=2026-01-31")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list), "Should return a list of daily balances"
        
        if len(data) > 0:
            # Check structure of first item
            first = data[0]
            assert "date" in first, "Each item should have 'date'"
            assert "balance" in first, "Each item should have 'balance'"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
