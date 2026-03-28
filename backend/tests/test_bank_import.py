"""
Bank Import Feature Tests
Tests for PDF bank statement parsing and import confirmation endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
PDF_FILE_PATH = "/tmp/test_statement.pdf"


class TestBankImportParse:
    """Tests for POST /api/bank-import/parse endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin",
            "password": "220066mm"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_parse_pdf_returns_200(self):
        """Test that parsing a valid PDF returns 200"""
        with open(PDF_FILE_PATH, 'rb') as f:
            response = requests.post(
                f"{BASE_URL}/api/bank-import/parse",
                headers=self.headers,
                files={"file": ("test_statement.pdf", f, "application/pdf")}
            )
        assert response.status_code == 200, f"Parse failed: {response.text}"
        data = response.json()
        assert "transactions" in data
        assert "transactions_count" in data
        print(f"PASS: Parse PDF returns 200 with {data['transactions_count']} transactions")
    
    def test_parse_returns_correct_transaction_count(self):
        """Test that parse returns 86 transactions for test PDF"""
        with open(PDF_FILE_PATH, 'rb') as f:
            response = requests.post(
                f"{BASE_URL}/api/bank-import/parse",
                headers=self.headers,
                files={"file": ("test_statement.pdf", f, "application/pdf")}
            )
        assert response.status_code == 200
        data = response.json()
        assert data["transactions_count"] == 86, f"Expected 86 transactions, got {data['transactions_count']}"
        print(f"PASS: Correct transaction count: 86")
    
    def test_parse_returns_correct_currency(self):
        """Test that parse returns PLN currency"""
        with open(PDF_FILE_PATH, 'rb') as f:
            response = requests.post(
                f"{BASE_URL}/api/bank-import/parse",
                headers=self.headers,
                files={"file": ("test_statement.pdf", f, "application/pdf")}
            )
        assert response.status_code == 200
        data = response.json()
        assert data["currency"] == "PLN", f"Expected PLN, got {data['currency']}"
        print(f"PASS: Correct currency: PLN")
    
    def test_parse_returns_account_number(self):
        """Test that parse extracts account number from statement"""
        with open(PDF_FILE_PATH, 'rb') as f:
            response = requests.post(
                f"{BASE_URL}/api/bank-import/parse",
                headers=self.headers,
                files={"file": ("test_statement.pdf", f, "application/pdf")}
            )
        assert response.status_code == 200
        data = response.json()
        assert data["account_number"], "Account number should not be empty"
        assert len(data["account_number"]) > 10, "Account number should be valid length"
        print(f"PASS: Account number extracted: {data['account_number']}")
    
    def test_parse_returns_groups(self):
        """Test that parse returns groups of similar transactions"""
        with open(PDF_FILE_PATH, 'rb') as f:
            response = requests.post(
                f"{BASE_URL}/api/bank-import/parse",
                headers=self.headers,
                files={"file": ("test_statement.pdf", f, "application/pdf")}
            )
        assert response.status_code == 200
        data = response.json()
        assert "groups" in data, "Response should contain groups"
        assert len(data["groups"]) > 0, "Should have at least one group"
        # Verify group structure
        first_group = data["groups"][0]
        assert "group_key" in first_group
        assert "label" in first_group
        assert "count" in first_group
        assert "indices" in first_group
        print(f"PASS: Groups returned: {len(data['groups'])} groups")
    
    def test_parse_transaction_structure(self):
        """Test that each transaction has required fields"""
        with open(PDF_FILE_PATH, 'rb') as f:
            response = requests.post(
                f"{BASE_URL}/api/bank-import/parse",
                headers=self.headers,
                files={"file": ("test_statement.pdf", f, "application/pdf")}
            )
        assert response.status_code == 200
        data = response.json()
        assert len(data["transactions"]) > 0
        
        tx = data["transactions"][0]
        required_fields = ["date", "operation_type", "description", "amount", "type", "currency"]
        for field in required_fields:
            assert field in tx, f"Transaction missing field: {field}"
        
        # Verify type is income or expense
        assert tx["type"] in ["income", "expense"], f"Invalid type: {tx['type']}"
        # Verify amount is positive
        assert tx["amount"] > 0, "Amount should be positive"
        print(f"PASS: Transaction structure valid with all required fields")
    
    def test_parse_rejects_non_pdf(self):
        """Test that parse rejects non-PDF files"""
        response = requests.post(
            f"{BASE_URL}/api/bank-import/parse",
            headers=self.headers,
            files={"file": ("test.txt", b"not a pdf", "text/plain")}
        )
        assert response.status_code == 400, f"Should reject non-PDF, got {response.status_code}"
        print(f"PASS: Non-PDF file rejected with 400")
    
    def test_parse_requires_auth(self):
        """Test that parse requires authentication"""
        with open(PDF_FILE_PATH, 'rb') as f:
            response = requests.post(
                f"{BASE_URL}/api/bank-import/parse",
                files={"file": ("test_statement.pdf", f, "application/pdf")}
            )
        assert response.status_code in [401, 403], f"Should require auth, got {response.status_code}"
        print(f"PASS: Parse requires authentication (status {response.status_code})")


class TestBankImportConfirm:
    """Tests for POST /api/bank-import/confirm endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get auth token and fetch accounts/directions before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin",
            "password": "220066mm"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
        
        # Get accounts
        acc_res = requests.get(f"{BASE_URL}/api/accounts", headers=self.headers)
        self.accounts = acc_res.json() if acc_res.status_code == 200 else []
        
        # Get directions
        dir_res = requests.get(f"{BASE_URL}/api/directions", headers=self.headers)
        self.directions = dir_res.json() if dir_res.status_code == 200 else []
    
    def test_confirm_requires_account(self):
        """Test that confirm requires account_id"""
        response = requests.post(
            f"{BASE_URL}/api/bank-import/confirm",
            headers=self.headers,
            json={
                "direction_id": self.directions[0]["id"] if self.directions else "test",
                "transactions": [{"date": "2025-07-01", "amount": 100, "type": "expense"}]
            }
        )
        assert response.status_code == 400, f"Should require account, got {response.status_code}"
        print(f"PASS: Confirm requires account_id")
    
    def test_confirm_requires_direction(self):
        """Test that confirm requires direction_id"""
        response = requests.post(
            f"{BASE_URL}/api/bank-import/confirm",
            headers=self.headers,
            json={
                "account_id": self.accounts[0]["id"] if self.accounts else "test",
                "transactions": [{"date": "2025-07-01", "amount": 100, "type": "expense"}]
            }
        )
        assert response.status_code == 400, f"Should require direction, got {response.status_code}"
        print(f"PASS: Confirm requires direction_id")
    
    def test_confirm_requires_transactions(self):
        """Test that confirm requires transactions list"""
        response = requests.post(
            f"{BASE_URL}/api/bank-import/confirm",
            headers=self.headers,
            json={
                "account_id": self.accounts[0]["id"] if self.accounts else "test",
                "direction_id": self.directions[0]["id"] if self.directions else "test",
                "transactions": []
            }
        )
        assert response.status_code == 400, f"Should require transactions, got {response.status_code}"
        print(f"PASS: Confirm requires non-empty transactions")
    
    def test_confirm_imports_transactions(self):
        """Test that confirm successfully imports transactions"""
        if not self.accounts or not self.directions:
            pytest.skip("No accounts or directions available")
        
        # First parse the PDF to get real transaction data
        with open(PDF_FILE_PATH, 'rb') as f:
            parse_res = requests.post(
                f"{BASE_URL}/api/bank-import/parse",
                headers={"Authorization": f"Bearer {self.token}"},
                files={"file": ("test_statement.pdf", f, "application/pdf")}
            )
        assert parse_res.status_code == 200
        parsed = parse_res.json()
        
        # Import just 2 transactions for testing
        test_txs = parsed["transactions"][:2]
        
        response = requests.post(
            f"{BASE_URL}/api/bank-import/confirm",
            headers=self.headers,
            json={
                "account_id": self.accounts[0]["id"],
                "direction_id": self.directions[0]["id"],
                "transactions": test_txs
            }
        )
        assert response.status_code == 200, f"Import failed: {response.text}"
        data = response.json()
        assert data["status"] == "success"
        assert data["imported"] == 2, f"Expected 2 imported, got {data['imported']}"
        print(f"PASS: Successfully imported 2 transactions")
    
    def test_confirm_returns_account_name(self):
        """Test that confirm returns account name in response"""
        if not self.accounts or not self.directions:
            pytest.skip("No accounts or directions available")
        
        response = requests.post(
            f"{BASE_URL}/api/bank-import/confirm",
            headers=self.headers,
            json={
                "account_id": self.accounts[0]["id"],
                "direction_id": self.directions[0]["id"],
                "transactions": [{"date": "2025-07-15", "amount": 50, "type": "expense", "currency": "PLN"}]
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "account_name" in data, "Response should include account_name"
        print(f"PASS: Confirm returns account_name: {data['account_name']}")
    
    def test_confirm_requires_auth(self):
        """Test that confirm requires authentication"""
        response = requests.post(
            f"{BASE_URL}/api/bank-import/confirm",
            headers={"Content-Type": "application/json"},
            json={
                "account_id": "test",
                "direction_id": "test",
                "transactions": [{"date": "2025-07-01", "amount": 100}]
            }
        )
        assert response.status_code in [401, 403], f"Should require auth, got {response.status_code}"
        print(f"PASS: Confirm requires authentication (status {response.status_code})")


class TestBankImportIntegration:
    """Integration tests for full import flow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup for integration tests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": "admin",
            "password": "220066mm"
        })
        assert response.status_code == 200
        self.token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_full_import_flow(self):
        """Test complete flow: parse -> select -> confirm"""
        # Step 1: Parse PDF
        with open(PDF_FILE_PATH, 'rb') as f:
            parse_res = requests.post(
                f"{BASE_URL}/api/bank-import/parse",
                headers=self.headers,
                files={"file": ("test_statement.pdf", f, "application/pdf")}
            )
        assert parse_res.status_code == 200
        parsed = parse_res.json()
        assert parsed["transactions_count"] == 86
        
        # Step 2: Get accounts and directions
        acc_res = requests.get(f"{BASE_URL}/api/accounts", headers=self.headers)
        dir_res = requests.get(f"{BASE_URL}/api/directions", headers=self.headers)
        accounts = acc_res.json()
        directions = dir_res.json()
        
        if not accounts or not directions:
            pytest.skip("No accounts or directions")
        
        # Step 3: Select and import 3 transactions
        selected_txs = parsed["transactions"][5:8]  # Pick 3 transactions
        
        confirm_res = requests.post(
            f"{BASE_URL}/api/bank-import/confirm",
            headers={**self.headers, "Content-Type": "application/json"},
            json={
                "account_id": accounts[0]["id"],
                "direction_id": directions[0]["id"],
                "transactions": selected_txs
            }
        )
        assert confirm_res.status_code == 200
        result = confirm_res.json()
        assert result["imported"] == 3
        
        # Step 4: Verify transactions exist in system
        tx_res = requests.get(
            f"{BASE_URL}/api/transactions",
            headers=self.headers,
            params={"source": "import"}
        )
        assert tx_res.status_code == 200
        print(f"PASS: Full import flow completed - 3 transactions imported")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
