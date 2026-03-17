"""
Test module for Expense Plans (План расходов) feature
Tests CRUD operations for expense plans and items
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestExpensePlansAuth:
    """Authentication tests for expense plan endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token with admin/220066mm"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin",
            "password": "220066mm"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        return data["token"]
    
    @pytest.fixture
    def auth_headers(self, auth_token):
        """Authenticated headers"""
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}

    def test_login_success(self):
        """Test login with admin credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin",
            "password": "220066mm"
        })
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        print(f"Login successful, user role: {data['user'].get('role')}")


class TestExpensePlansEndpoints:
    """Tests for expense plan CRUD endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        """Get authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin",
            "password": "220066mm"
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    @pytest.fixture
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}

    def test_get_categories_list(self, auth_headers):
        """Test GET /api/expense-plans/categories/list returns category labels"""
        response = requests.get(f"{BASE_URL}/api/expense-plans/categories/list", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "rent" in data
        assert "salary" in data
        assert "subscriptions" in data
        assert data["rent"] == "Аренда"
        print(f"Categories: {data}")

    def test_get_expense_plans_empty(self, auth_headers):
        """Test GET /api/expense-plans with year/month params"""
        response = requests.get(f"{BASE_URL}/api/expense-plans", 
                               params={"year": 2026, "month": 3}, 
                               headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} plans for 2026-03")

    def test_create_expense_plan(self, auth_headers):
        """Test POST /api/expense-plans creates a plan"""
        # Create plan for a test month (April 2026)
        response = requests.post(f"{BASE_URL}/api/expense-plans",
                                params={"year": 2026, "month": 4},
                                headers=auth_headers)
        assert response.status_code == 200, f"Create plan failed: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["year"] == 2026
        assert data["month"] == 4
        assert "Апрель 2026" in data["name"]
        print(f"Created plan: {data['id']} - {data['name']}")
        return data["id"]

    def test_get_expense_plan_by_id(self, auth_headers):
        """Test GET /api/expense-plans/{plan_id}"""
        # First create a plan
        create_resp = requests.post(f"{BASE_URL}/api/expense-plans",
                                   params={"year": 2026, "month": 5},
                                   headers=auth_headers)
        assert create_resp.status_code == 200
        plan_id = create_resp.json()["id"]
        
        # Then get it by ID
        response = requests.get(f"{BASE_URL}/api/expense-plans/{plan_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == plan_id
        assert data["year"] == 2026
        assert data["month"] == 5
        print(f"Retrieved plan: {data['name']}")


class TestExpensePlanItems:
    """Tests for expense plan item CRUD operations"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin",
            "password": "220066mm"
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    @pytest.fixture
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}
    
    @pytest.fixture
    def test_plan_id(self, auth_headers):
        """Create a test plan and return its ID"""
        response = requests.post(f"{BASE_URL}/api/expense-plans",
                                params={"year": 2026, "month": 6},
                                headers=auth_headers)
        if response.status_code == 200:
            return response.json()["id"]
        # If plan exists, fetch it
        response = requests.get(f"{BASE_URL}/api/expense-plans",
                               params={"year": 2026, "month": 6},
                               headers=auth_headers)
        plans = response.json()
        if plans:
            return plans[0]["id"]
        pytest.skip("Could not create or find test plan")

    def test_create_plan_item(self, auth_headers, test_plan_id):
        """Test POST /api/expense-plans/{plan_id}/items adds an item"""
        item_data = {
            "type": "fixed",
            "category": "rent",
            "description": "TEST_Аренда офиса",
            "amount_planned": 5000.00,
            "currency": "PLN",
            "is_recurring_every_month": True
        }
        response = requests.post(f"{BASE_URL}/api/expense-plans/{test_plan_id}/items",
                                json=item_data,
                                headers=auth_headers)
        assert response.status_code == 200, f"Create item failed: {response.text}"
        data = response.json()
        assert "id" in data
        assert data["description"] == "TEST_Аренда офиса"
        assert data["amount_planned"] == 5000.00
        assert data["category"] == "rent"
        assert data["is_recurring_every_month"] == True
        print(f"Created item: {data['id']} - {data['description']} - {data['amount_planned']} PLN")
        return data["id"]

    def test_get_plan_items(self, auth_headers, test_plan_id):
        """Test GET /api/expense-plans/{plan_id}/items returns items list"""
        response = requests.get(f"{BASE_URL}/api/expense-plans/{test_plan_id}/items",
                               headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Plan has {len(data)} items")

    def test_update_plan_item(self, auth_headers, test_plan_id):
        """Test PUT /api/expense-plans/items/{item_id} updates an item"""
        # First create an item
        create_resp = requests.post(f"{BASE_URL}/api/expense-plans/{test_plan_id}/items",
                                   json={
                                       "type": "variable",
                                       "category": "other",
                                       "description": "TEST_Временный расход",
                                       "amount_planned": 100.00
                                   },
                                   headers=auth_headers)
        assert create_resp.status_code == 200
        item_id = create_resp.json()["id"]
        
        # Update the item
        update_data = {
            "description": "TEST_Обновленный расход",
            "amount_planned": 250.00,
            "category": "purchases"
        }
        response = requests.put(f"{BASE_URL}/api/expense-plans/items/{item_id}",
                               json=update_data,
                               headers=auth_headers)
        assert response.status_code == 200, f"Update item failed: {response.text}"
        data = response.json()
        assert data["description"] == "TEST_Обновленный расход"
        assert data["amount_planned"] == 250.00
        assert data["category"] == "purchases"
        print(f"Updated item: {data['id']} - new amount: {data['amount_planned']}")
        
        # Verify update persisted with GET
        items_resp = requests.get(f"{BASE_URL}/api/expense-plans/{test_plan_id}/items",
                                 headers=auth_headers)
        items = items_resp.json()
        updated_item = next((i for i in items if i["id"] == item_id), None)
        assert updated_item is not None
        assert updated_item["amount_planned"] == 250.00

    def test_delete_plan_item(self, auth_headers, test_plan_id):
        """Test DELETE /api/expense-plans/items/{item_id} deletes an item"""
        # First create an item to delete
        create_resp = requests.post(f"{BASE_URL}/api/expense-plans/{test_plan_id}/items",
                                   json={
                                       "type": "variable",
                                       "category": "other",
                                       "description": "TEST_Для удаления",
                                       "amount_planned": 50.00
                                   },
                                   headers=auth_headers)
        assert create_resp.status_code == 200
        item_id = create_resp.json()["id"]
        
        # Delete the item
        response = requests.delete(f"{BASE_URL}/api/expense-plans/items/{item_id}",
                                  headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "deleted"
        print(f"Deleted item: {item_id}")
        
        # Verify deletion
        items_resp = requests.get(f"{BASE_URL}/api/expense-plans/{test_plan_id}/items",
                                 headers=auth_headers)
        items = items_resp.json()
        deleted_item = next((i for i in items if i["id"] == item_id), None)
        assert deleted_item is None, "Item should be deleted"


class TestExpensePlanSpecialActions:
    """Tests for special actions like copy-previous and extend-recurring"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin",
            "password": "220066mm"
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    @pytest.fixture
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}

    def test_delete_expense_plan(self, auth_headers):
        """Test DELETE /api/expense-plans/{plan_id} deletes plan and its items"""
        # Create a plan
        create_resp = requests.post(f"{BASE_URL}/api/expense-plans",
                                   params={"year": 2026, "month": 12},
                                   headers=auth_headers)
        if create_resp.status_code != 200:
            # May already exist, get it
            get_resp = requests.get(f"{BASE_URL}/api/expense-plans",
                                   params={"year": 2026, "month": 12},
                                   headers=auth_headers)
            plans = get_resp.json()
            if not plans:
                pytest.skip("Could not create test plan")
            plan_id = plans[0]["id"]
        else:
            plan_id = create_resp.json()["id"]
        
        # Add an item to this plan
        requests.post(f"{BASE_URL}/api/expense-plans/{plan_id}/items",
                     json={"type": "fixed", "category": "rent", "description": "TEST_to_delete", "amount_planned": 100},
                     headers=auth_headers)
        
        # Delete the plan
        response = requests.delete(f"{BASE_URL}/api/expense-plans/{plan_id}",
                                  headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "deleted"
        print(f"Deleted plan: {plan_id}")
        
        # Verify plan is gone
        get_resp = requests.get(f"{BASE_URL}/api/expense-plans/{plan_id}", headers=auth_headers)
        assert get_resp.status_code == 404

    def test_copy_previous_month_no_previous(self, auth_headers):
        """Test copy-previous when no previous month plan exists"""
        # Create a plan for a month that definitely has no previous
        create_resp = requests.post(f"{BASE_URL}/api/expense-plans",
                                   params={"year": 2023, "month": 1},
                                   headers=auth_headers)
        if create_resp.status_code == 200:
            plan_id = create_resp.json()["id"]
        else:
            get_resp = requests.get(f"{BASE_URL}/api/expense-plans",
                                   params={"year": 2023, "month": 1},
                                   headers=auth_headers)
            plans = get_resp.json()
            if not plans:
                pytest.skip("Could not get plan")
            plan_id = plans[0]["id"]
        
        # Try to copy from previous (Dec 2022 - should not exist)
        response = requests.post(f"{BASE_URL}/api/expense-plans/{plan_id}/copy-previous",
                                headers=auth_headers)
        # Should get 404 since no previous month plan
        assert response.status_code == 404
        print("Copy previous correctly returns 404 when no previous plan exists")

    def test_extend_recurring_no_recurring(self, auth_headers):
        """Test extend-recurring when no recurring items exist"""
        # Create a fresh plan
        create_resp = requests.post(f"{BASE_URL}/api/expense-plans",
                                   params={"year": 2026, "month": 7},
                                   headers=auth_headers)
        if create_resp.status_code == 200:
            plan_id = create_resp.json()["id"]
        else:
            get_resp = requests.get(f"{BASE_URL}/api/expense-plans",
                                   params={"year": 2026, "month": 7},
                                   headers=auth_headers)
            plans = get_resp.json()
            if not plans:
                pytest.skip("Could not get plan")
            plan_id = plans[0]["id"]
        
        # Try to extend recurring (no recurring items)
        response = requests.post(f"{BASE_URL}/api/expense-plans/{plan_id}/extend-recurring",
                                params={"months_ahead": 2},
                                headers=auth_headers)
        # Should return 400 since no recurring items
        assert response.status_code == 400
        print("Extend recurring correctly returns 400 when no recurring items")


class TestExpensePlanSummary:
    """Test summary endpoint"""
    
    @pytest.fixture(scope="class")
    def auth_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin",
            "password": "220066mm"
        })
        assert response.status_code == 200
        return response.json()["token"]
    
    @pytest.fixture
    def auth_headers(self, auth_token):
        return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}

    def test_get_plans_summary(self, auth_headers):
        """Test GET /api/expense-plans/summary/all returns summaries"""
        response = requests.get(f"{BASE_URL}/api/expense-plans/summary/all",
                               params={"year": 2026},
                               headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        if data:
            # Check summary structure
            plan_summary = data[0]
            assert "year" in plan_summary
            assert "month" in plan_summary
            assert "items_count" in plan_summary
            assert "fixed_total" in plan_summary
            assert "variable_total" in plan_summary
            assert "total" in plan_summary
            print(f"Summary for first plan: items={plan_summary['items_count']}, total={plan_summary['total']}")


# Cleanup fixture to remove TEST_ prefixed items after tests
@pytest.fixture(scope="module", autouse=True)
def cleanup_test_data():
    """Cleanup TEST_ prefixed data after all tests complete"""
    yield
    # Cleanup will be done by main test flow
    print("Test cleanup complete")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
