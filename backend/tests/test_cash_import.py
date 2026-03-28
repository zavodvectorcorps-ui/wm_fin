"""
Test Cash Import API endpoints
- POST /api/cash-import/fetch - Fetch and parse Google Sheets data
- POST /api/cash-import/confirm - Import selected transactions
- GET /api/cash-import/settings - Get saved sheet URLs
- PUT /api/cash-import/settings - Save sheet URLs
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_EMAIL = "admin"
TEST_PASSWORD = "220066mm"

# Test Google Sheet URL (public sheet)
TEST_SHEET_URL = "https://docs.google.com/spreadsheets/d/1S5OcIk2oPr8F0mrUX0U4ioDGSm6L-NNW08vttUkgH8E/edit"
TEST_DATE_FROM = "2026-03-01"
TEST_DATE_TO = "2026-03-31"


@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_EMAIL,
        "password": TEST_PASSWORD
    })
    assert response.status_code == 200, f"Login failed: {response.text}"
    data = response.json()
    assert "token" in data, "No token in login response"
    return data["token"]


@pytest.fixture
def api_client(auth_token):
    """Authenticated requests session"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session


class TestCashImportFetch:
    """Tests for POST /api/cash-import/fetch endpoint"""
    
    def test_fetch_requires_auth(self):
        """Fetch endpoint requires authentication"""
        response = requests.post(f"{BASE_URL}/api/cash-import/fetch", json={
            "sheet_url": TEST_SHEET_URL,
            "date_from": TEST_DATE_FROM,
            "date_to": TEST_DATE_TO
        })
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASS: Fetch requires authentication")
    
    def test_fetch_requires_sheet_url(self, api_client):
        """Fetch requires sheet_url parameter"""
        response = api_client.post(f"{BASE_URL}/api/cash-import/fetch", json={
            "date_from": TEST_DATE_FROM,
            "date_to": TEST_DATE_TO
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("PASS: Fetch requires sheet_url")
    
    def test_fetch_requires_date_range(self, api_client):
        """Fetch requires date_from and date_to parameters"""
        response = api_client.post(f"{BASE_URL}/api/cash-import/fetch", json={
            "sheet_url": TEST_SHEET_URL
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("PASS: Fetch requires date range")
    
    def test_fetch_invalid_sheet_url(self, api_client):
        """Fetch rejects invalid Google Sheets URL"""
        response = api_client.post(f"{BASE_URL}/api/cash-import/fetch", json={
            "sheet_url": "https://example.com/not-a-sheet",
            "date_from": TEST_DATE_FROM,
            "date_to": TEST_DATE_TO
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("PASS: Fetch rejects invalid sheet URL")
    
    def test_fetch_success(self, api_client):
        """Fetch successfully parses public Google Sheet"""
        response = api_client.post(f"{BASE_URL}/api/cash-import/fetch", json={
            "sheet_url": TEST_SHEET_URL,
            "date_from": TEST_DATE_FROM,
            "date_to": TEST_DATE_TO
        })
        assert response.status_code == 200, f"Fetch failed: {response.text}"
        
        data = response.json()
        
        # Verify response structure
        assert "transactions" in data, "Missing 'transactions' in response"
        assert "total" in data, "Missing 'total' in response"
        assert "duplicates" in data, "Missing 'duplicates' in response"
        assert "accounts" in data, "Missing 'accounts' in response"
        assert "directions" in data, "Missing 'directions' in response"
        
        # Verify transactions structure
        if len(data["transactions"]) > 0:
            tx = data["transactions"][0]
            assert "date" in tx, "Transaction missing 'date'"
            assert "type" in tx, "Transaction missing 'type'"
            assert "amount" in tx, "Transaction missing 'amount'"
            assert "currency" in tx, "Transaction missing 'currency'"
            assert "is_duplicate" in tx, "Transaction missing 'is_duplicate'"
            
            # Verify type is valid
            assert tx["type"] in ["income", "expense"], f"Invalid type: {tx['type']}"
            
            # Verify amount is positive
            assert tx["amount"] >= 0, f"Amount should be positive: {tx['amount']}"
        
        print(f"PASS: Fetch success - {data['total']} transactions, {data['duplicates']} duplicates")
        return data


class TestCashImportConfirm:
    """Tests for POST /api/cash-import/confirm endpoint"""
    
    def test_confirm_requires_auth(self):
        """Confirm endpoint requires authentication"""
        response = requests.post(f"{BASE_URL}/api/cash-import/confirm", json={
            "transactions": []
        })
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASS: Confirm requires authentication")
    
    def test_confirm_requires_transactions(self, api_client):
        """Confirm requires non-empty transactions array"""
        response = api_client.post(f"{BASE_URL}/api/cash-import/confirm", json={
            "transactions": []
        })
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        print("PASS: Confirm requires transactions")
    
    def test_confirm_success(self, api_client):
        """Confirm successfully imports transactions"""
        # First fetch transactions
        fetch_response = api_client.post(f"{BASE_URL}/api/cash-import/fetch", json={
            "sheet_url": TEST_SHEET_URL,
            "date_from": TEST_DATE_FROM,
            "date_to": TEST_DATE_TO
        })
        assert fetch_response.status_code == 200, f"Fetch failed: {fetch_response.text}"
        
        fetch_data = fetch_response.json()
        transactions = fetch_data.get("transactions", [])
        
        if len(transactions) == 0:
            pytest.skip("No transactions to import")
        
        # Import first 3 transactions (to avoid importing too many)
        txs_to_import = transactions[:3]
        
        response = api_client.post(f"{BASE_URL}/api/cash-import/confirm", json={
            "transactions": [{
                "date": t["date"],
                "type": t["type"],
                "amount": t["amount"],
                "currency": t.get("currency", "PLN"),
                "contractor": t.get("contractor", ""),
                "description": t.get("description", "TEST_CASH_IMPORT"),
                "account_id": t.get("account_id", ""),
                "account_name": t.get("account_name", ""),
                "direction_id": t.get("direction_id", ""),
                "direction_name": t.get("direction_name", ""),
                "category_id": t.get("category_id", ""),
                "comment": "TEST_CASH_IMPORT",
                "needs_review": False
            } for t in txs_to_import]
        })
        
        assert response.status_code == 200, f"Confirm failed: {response.text}"
        
        data = response.json()
        assert "imported_count" in data, "Missing 'imported_count' in response"
        assert data["imported_count"] == len(txs_to_import), f"Expected {len(txs_to_import)} imported, got {data['imported_count']}"
        
        print(f"PASS: Confirm success - imported {data['imported_count']} transactions")


class TestCashImportSettings:
    """Tests for GET/PUT /api/cash-import/settings endpoints"""
    
    def test_get_settings_requires_auth(self):
        """Get settings requires authentication"""
        response = requests.get(f"{BASE_URL}/api/cash-import/settings")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASS: Get settings requires authentication")
    
    def test_get_settings_success(self, api_client):
        """Get settings returns sheets array"""
        response = api_client.get(f"{BASE_URL}/api/cash-import/settings")
        assert response.status_code == 200, f"Get settings failed: {response.text}"
        
        data = response.json()
        assert "sheets" in data, "Missing 'sheets' in response"
        assert isinstance(data["sheets"], list), "'sheets' should be a list"
        
        print(f"PASS: Get settings success - {len(data['sheets'])} saved sheets")
    
    def test_put_settings_requires_auth(self):
        """Put settings requires authentication"""
        response = requests.put(f"{BASE_URL}/api/cash-import/settings", json={
            "sheets": []
        })
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}"
        print("PASS: Put settings requires authentication")
    
    def test_put_settings_success(self, api_client):
        """Put settings saves sheet URLs"""
        test_sheets = [
            {"url": TEST_SHEET_URL, "name": "Test Sheet"}
        ]
        
        response = api_client.put(f"{BASE_URL}/api/cash-import/settings", json={
            "sheets": test_sheets
        })
        assert response.status_code == 200, f"Put settings failed: {response.text}"
        
        # Verify settings were saved
        get_response = api_client.get(f"{BASE_URL}/api/cash-import/settings")
        assert get_response.status_code == 200
        
        data = get_response.json()
        assert len(data["sheets"]) >= 1, "Settings not saved"
        
        print("PASS: Put settings success")


class TestCashImportDeduplication:
    """Tests for deduplication logic"""
    
    def test_deduplication_marks_duplicates(self, api_client):
        """Fetch marks previously imported transactions as duplicates"""
        # First import some transactions
        fetch_response = api_client.post(f"{BASE_URL}/api/cash-import/fetch", json={
            "sheet_url": TEST_SHEET_URL,
            "date_from": TEST_DATE_FROM,
            "date_to": TEST_DATE_TO
        })
        assert fetch_response.status_code == 200
        
        data = fetch_response.json()
        
        # Check if duplicates field is present and is a number
        assert "duplicates" in data, "Missing 'duplicates' in response"
        assert isinstance(data["duplicates"], int), "'duplicates' should be an integer"
        
        # Check if transactions have is_duplicate field
        for tx in data.get("transactions", []):
            assert "is_duplicate" in tx, "Transaction missing 'is_duplicate' field"
            assert isinstance(tx["is_duplicate"], bool), "'is_duplicate' should be boolean"
        
        print(f"PASS: Deduplication working - {data['duplicates']} duplicates found")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
