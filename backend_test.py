#!/usr/bin/env python3
"""
Backend API Testing for WM Finance Application
Tests comprehensive financial management APIs
"""

import requests
import sys
import json
import urllib.parse
from datetime import datetime, timedelta
from typing import Dict, Any, List

class WMFinanceAPITester:
    def __init__(self, base_url: str = "https://finance-staging.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_base = f"{base_url}/api"
        self.token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        self.created_resources = {
            'accounts': [],
            'categories': [], 
            'directions': [],
            'contractors': [],
            'transactions': [],
            'planned_payments': [],
            'projects': []
        }

    def log_test(self, name: str, status: str, details: str = "", response_code: int = None):
        """Log test result"""
        result = {
            'test_name': name,
            'status': status,
            'details': details,
            'response_code': response_code,
            'timestamp': datetime.now().isoformat()
        }
        self.test_results.append(result)
        
        if status == 'PASS':
            self.tests_passed += 1
            print(f"✅ {name}")
        elif status == 'FAIL':
            print(f"❌ {name} - {details}")
        else:
            print(f"⚠️  {name} - {details}")
        
        self.tests_run += 1

    def make_request(self, method: str, endpoint: str, data: dict = None, params: dict = None) -> tuple:
        """Make HTTP request with error handling"""
        try:
            url = f"{self.api_base}/{endpoint}"
            headers = {'Content-Type': 'application/json'}
            
            if self.token:
                headers['Authorization'] = f'Bearer {self.token}'
            
            if method.upper() == 'GET':
                response = requests.get(url, headers=headers, params=params, timeout=30)
            elif method.upper() == 'POST':
                response = requests.post(url, headers=headers, json=data, timeout=30)
            elif method.upper() == 'PUT':
                response = requests.put(url, headers=headers, json=data, timeout=30)
            elif method.upper() == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=30)
            else:
                return False, {}, f"Unsupported method: {method}"
            
            try:
                response_data = response.json()
            except:
                response_data = {}
            
            return response.status_code >= 200 and response.status_code < 300, response_data, response.status_code
            
        except requests.exceptions.Timeout:
            return False, {}, "Request timeout"
        except requests.exceptions.ConnectionError:
            return False, {}, "Connection error"
        except Exception as e:
            return False, {}, f"Request error: {str(e)}"

    def test_health_check(self):
        """Test health and connectivity"""
        print("\n🔍 Testing Health & Connectivity...")
        
        # Test root endpoint
        success, data, code = self.make_request('GET', '')
        if success and data.get('message') == 'WM Finance API':
            self.log_test("API Root Endpoint", "PASS", f"API accessible, version: {data.get('version', 'unknown')}", code)
        else:
            self.log_test("API Root Endpoint", "FAIL", f"Unexpected response: {data}", code)
        
        # Test health endpoint
        success, data, code = self.make_request('GET', 'health')
        if success and data.get('status') == 'healthy':
            self.log_test("Health Check", "PASS", "API is healthy", code)
        else:
            self.log_test("Health Check", "FAIL", f"Health check failed: {data}", code)

    def test_user_registration(self):
        """Test user registration"""
        print("\n🔍 Testing User Registration...")
        
        # Generate unique test email
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        test_email = f"test_user_{timestamp}@wmfinance.pl"
        
        registration_data = {
            "email": test_email,
            "password": "test123456",
            "name": "Test User"
        }
        
        success, data, code = self.make_request('POST', 'auth/register', registration_data)
        
        if success and data.get('token'):
            self.token = data['token']
            self.user_id = data['user']['id']
            self.log_test("User Registration", "PASS", f"User registered successfully with ID: {self.user_id}", code)
            
            # Test if seed data was created
            success, directions_data, _ = self.make_request('GET', 'directions')
            if success and len(directions_data) >= 4:
                self.log_test("Seed Data Creation", "PASS", f"Found {len(directions_data)} default directions", code)
            else:
                self.log_test("Seed Data Creation", "FAIL", f"Expected 4+ directions, got {len(directions_data) if success else 0}")
                
        else:
            self.log_test("User Registration", "FAIL", f"Registration failed: {data}", code)

    def test_existing_user_login(self):
        """Test login with provided test credentials"""
        print("\n🔍 Testing Existing User Login...")
        
        login_data = {
            "email": "test@wmfinance.pl", 
            "password": "test123456"
        }
        
        success, data, code = self.make_request('POST', 'auth/login', login_data)
        
        if success and data.get('token'):
            # Keep both tokens but prioritize existing user for main testing
            existing_token = data['token']
            existing_user_id = data['user']['id']
            self.log_test("Existing User Login", "PASS", f"Login successful for existing user: {data['user']['email']}", code)
            
            # Use existing user for rest of tests if available  
            if not self.token:  # If registration failed, use existing user
                self.token = existing_token
                self.user_id = existing_user_id
                
        else:
            self.log_test("Existing User Login", "FAIL", f"Login failed: {data}", code)

    def test_authentication_endpoints(self):
        """Test authentication-related endpoints"""
        print("\n🔍 Testing Authentication Endpoints...")
        
        if not self.token:
            self.log_test("Auth Token Check", "FAIL", "No token available for auth tests")
            return
            
        # Test /auth/me endpoint
        success, data, code = self.make_request('GET', 'auth/me')
        if success and data.get('id'):
            self.log_test("Get Current User", "PASS", f"Retrieved user data for: {data.get('email')}", code)
        else:
            self.log_test("Get Current User", "FAIL", f"Failed to get user data: {data}", code)

    def test_accounts_endpoints(self):
        """Test accounts management"""
        print("\n🔍 Testing Accounts Management...")
        
        if not self.token:
            self.log_test("Accounts Test Setup", "FAIL", "No authentication token")
            return
            
        # Get existing accounts
        success, accounts, code = self.make_request('GET', 'accounts')
        if success:
            self.log_test("Get Accounts", "PASS", f"Retrieved {len(accounts)} accounts", code)
        else:
            self.log_test("Get Accounts", "FAIL", f"Failed to get accounts: {accounts}", code)
            
        # Create new account
        new_account = {
            "name": "Test Account PLN",
            "type": "checking",
            "currency": "PLN",
            "bank": "Test Bank",
            "initial_balance": 1000.0
        }
        
        success, account_data, code = self.make_request('POST', 'accounts', new_account)
        if success and account_data.get('id'):
            self.created_resources['accounts'].append(account_data['id'])
            self.log_test("Create Account", "PASS", f"Created account: {account_data['name']}", code)
        else:
            self.log_test("Create Account", "FAIL", f"Failed to create account: {account_data}", code)

    def test_categories_endpoints(self):
        """Test categories management"""
        print("\n🔍 Testing Categories Management...")
        
        if not self.token:
            self.log_test("Categories Test Setup", "FAIL", "No authentication token")
            return
            
        # Get existing categories  
        success, categories, code = self.make_request('GET', 'categories')
        if success:
            self.log_test("Get Categories", "PASS", f"Retrieved {len(categories)} categories", code)
        else:
            self.log_test("Get Categories", "FAIL", f"Failed to get categories: {categories}", code)
            
        # Get income categories specifically
        success, income_cats, code = self.make_request('GET', 'categories', params={'type': 'income'})
        if success:
            self.log_test("Get Income Categories", "PASS", f"Retrieved {len(income_cats)} income categories", code)
        else:
            self.log_test("Get Income Categories", "FAIL", f"Failed to get income categories: {income_cats}", code)

    def test_directions_endpoints(self):
        """Test business directions management"""
        print("\n🔍 Testing Business Directions...")
        
        if not self.token:
            self.log_test("Directions Test Setup", "FAIL", "No authentication token")
            return
            
        # Get existing directions
        success, directions, code = self.make_request('GET', 'directions')
        if success and len(directions) >= 4:
            expected_directions = ['Теплицы', 'Сауны', 'Купели', 'Общее']
            found_directions = [d['name'] for d in directions]
            
            if all(exp in found_directions for exp in expected_directions):
                self.log_test("Get Business Directions", "PASS", f"Found all expected directions: {found_directions}", code)
            else:
                self.log_test("Get Business Directions", "WARN", f"Missing some expected directions. Found: {found_directions}", code)
        else:
            self.log_test("Get Business Directions", "FAIL", f"Expected 4+ directions, got: {directions}", code)

    def test_contractors_endpoints(self):
        """Test contractors management"""
        print("\n🔍 Testing Contractors Management...")
        
        if not self.token:
            self.log_test("Contractors Test Setup", "FAIL", "No authentication token")  
            return
            
        # Get existing contractors
        success, contractors, code = self.make_request('GET', 'contractors')
        if success:
            self.log_test("Get Contractors", "PASS", f"Retrieved {len(contractors)} contractors", code)
        else:
            self.log_test("Get Contractors", "FAIL", f"Failed to get contractors: {contractors}", code)
            
        # Create new contractor
        new_contractor = {
            "name": "Test Contractor",
            "type": "client",
            "email": "test.contractor@example.com",
            "phone": "+48123456789"
        }
        
        success, contractor_data, code = self.make_request('POST', 'contractors', new_contractor)
        if success and contractor_data.get('id'):
            self.created_resources['contractors'].append(contractor_data['id'])
            self.log_test("Create Contractor", "PASS", f"Created contractor: {contractor_data['name']}", code)
        else:
            self.log_test("Create Contractor", "FAIL", f"Failed to create contractor: {contractor_data}", code)

    def test_transactions_endpoints(self):
        """Test transactions management"""
        print("\n🔍 Testing Transactions Management...")
        
        if not self.token:
            self.log_test("Transactions Test Setup", "FAIL", "No authentication token")
            return
            
        # Get accounts and directions first
        success, accounts, _ = self.make_request('GET', 'accounts')
        success2, directions, _ = self.make_request('GET', 'directions')
        
        if not (success and accounts and success2 and directions):
            self.log_test("Transaction Prerequisites", "FAIL", "Missing accounts or directions for transaction test")
            return
            
        # Get existing transactions
        success, transactions, code = self.make_request('GET', 'transactions')
        if success:
            self.log_test("Get Transactions", "PASS", f"Retrieved {len(transactions)} transactions", code)
        else:
            self.log_test("Get Transactions", "FAIL", f"Failed to get transactions: {transactions}", code)
            
        # Create income transaction
        income_transaction = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "type": "income",
            "amount": 5000.0,
            "currency": "PLN",
            "direction_id": directions[0]['id'],
            "account_id": accounts[0]['id'],
            "description": "Test income transaction",
            "status": "fact"
        }
        
        success, transaction_data, code = self.make_request('POST', 'transactions', income_transaction)
        if success and transaction_data.get('id'):
            self.created_resources['transactions'].append(transaction_data['id'])
            self.log_test("Create Income Transaction", "PASS", f"Created income transaction: {transaction_data['amount']} PLN", code)
        else:
            self.log_test("Create Income Transaction", "FAIL", f"Failed to create income transaction: {transaction_data}", code)
            
        # Create expense transaction
        expense_transaction = {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "type": "expense", 
            "amount": 2000.0,
            "currency": "PLN",
            "direction_id": directions[0]['id'],
            "account_id": accounts[0]['id'],
            "description": "Test expense transaction",
            "status": "fact"
        }
        
        success, expense_data, code = self.make_request('POST', 'transactions', expense_transaction)
        if success and expense_data.get('id'):
            self.created_resources['transactions'].append(expense_data['id'])
            self.log_test("Create Expense Transaction", "PASS", f"Created expense transaction: {expense_data['amount']} PLN", code)
        else:
            self.log_test("Create Expense Transaction", "FAIL", f"Failed to create expense transaction: {expense_data}", code)

    def test_planned_payments_endpoints(self):
        """Test planned payments management"""
        print("\n🔍 Testing Planned Payments...")
        
        if not self.token:
            self.log_test("Planned Payments Setup", "FAIL", "No authentication token")
            return
            
        # Get existing planned payments
        success, payments, code = self.make_request('GET', 'planned-payments')
        if success:
            self.log_test("Get Planned Payments", "PASS", f"Retrieved {len(payments)} planned payments", code)
        else:
            self.log_test("Get Planned Payments", "FAIL", f"Failed to get planned payments: {payments}", code)
            
        # Get prerequisites
        success, accounts, _ = self.make_request('GET', 'accounts')
        success2, directions, _ = self.make_request('GET', 'directions')
        
        if success and accounts and success2 and directions:
            # Create planned payment
            future_date = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
            new_payment = {
                "date": future_date,
                "type": "expense",
                "amount": 1500.0,
                "currency": "PLN",
                "direction_id": directions[0]['id'],
                "account_id": accounts[0]['id'],
                "comment": "Test planned payment"
            }
            
            success, payment_data, code = self.make_request('POST', 'planned-payments', new_payment)
            if success and payment_data.get('id'):
                self.created_resources['planned_payments'].append(payment_data['id'])
                self.log_test("Create Planned Payment", "PASS", f"Created planned payment: {payment_data['amount']} PLN", code)
            else:
                self.log_test("Create Planned Payment", "FAIL", f"Failed to create planned payment: {payment_data}", code)

    def test_projects_endpoints(self):
        """Test projects management"""
        print("\n🔍 Testing Projects Management...")
        
        if not self.token:
            self.log_test("Projects Setup", "FAIL", "No authentication token")
            return
            
        # Get existing projects
        success, projects, code = self.make_request('GET', 'projects')
        if success:
            self.log_test("Get Projects", "PASS", f"Retrieved {len(projects)} projects", code)
        else:
            self.log_test("Get Projects", "FAIL", f"Failed to get projects: {projects}", code)
            
        # Get directions for project creation
        success, directions, _ = self.make_request('GET', 'directions')
        
        if success and directions:
            # Create new project
            new_project = {
                "name": "Test Project - Greenhouse Installation",
                "direction_id": directions[0]['id'],
                "planned_amount": 25000.0,
                "start_date": datetime.now().strftime("%Y-%m-%d"),
                "comment": "Test project for greenhouse installation"
            }
            
            success, project_data, code = self.make_request('POST', 'projects', new_project)
            if success and project_data.get('id'):
                self.created_resources['projects'].append(project_data['id'])
                self.log_test("Create Project", "PASS", f"Created project: {project_data['name']}", code)
            else:
                self.log_test("Create Project", "FAIL", f"Failed to create project: {project_data}", code)

    def test_analytics_endpoints(self):
        """Test analytics endpoints"""
        print("\n🔍 Testing Analytics...")
        
        if not self.token:
            self.log_test("Analytics Setup", "FAIL", "No authentication token")
            return
            
        # Test analytics summary
        current_date = datetime.now()
        date_from = current_date.replace(day=1).strftime("%Y-%m-%d")
        date_to = current_date.strftime("%Y-%m-%d")
        
        params = {
            'date_from': date_from,
            'date_to': date_to
        }
        
        success, summary, code = self.make_request('GET', 'analytics/summary', params=params)
        if success and 'total_income' in summary:
            self.log_test("Analytics Summary", "PASS", f"Income: {summary['total_income']}, Expense: {summary['total_expense']}", code)
        else:
            self.log_test("Analytics Summary", "FAIL", f"Failed to get analytics summary: {summary}", code)
            
        # Test daily balance
        success, daily_balance, code = self.make_request('GET', 'analytics/daily-balance', params=params)
        if success and isinstance(daily_balance, list):
            self.log_test("Daily Balance Analytics", "PASS", f"Retrieved {len(daily_balance)} daily balance records", code)
        else:
            self.log_test("Daily Balance Analytics", "FAIL", f"Failed to get daily balance: {daily_balance}", code)

    def test_ai_chat_endpoint(self):
        """Test AI chat functionality"""
        print("\n🔍 Testing AI Chat...")
        
        if not self.token:
            self.log_test("AI Chat Setup", "FAIL", "No authentication token")
            return
            
        # Test AI chat with financial question - AI endpoint expects query params not body
        test_message = "Покажи мне краткий отчет по финансам"
        
        # Construct URL with query params directly
        url = f"{self.api_base}/ai/chat?message={urllib.parse.quote(test_message)}"
        headers = {'Authorization': f'Bearer {self.token}'}
        
        try:
            response = requests.post(url, headers=headers, timeout=30)
            response_data = response.json() if response.text else {}
            success = response.status_code >= 200 and response.status_code < 300
            code = response.status_code
        except Exception as e:
            success = False
            response_data = {}
            code = None
        
        if success and response_data.get('response'):
            self.log_test("AI Chat", "PASS", f"AI responded with {len(response_data['response'])} characters", code)
        else:
            self.log_test("AI Chat", "FAIL", f"AI chat failed: {response_data}", code)

    def cleanup_test_data(self):
        """Clean up created test data"""
        print("\n🧹 Cleaning up test data...")
        
        cleanup_count = 0
        
        # Delete in reverse order due to dependencies
        for resource_type in ['transactions', 'planned_payments', 'projects', 'contractors', 'accounts']:
            for resource_id in self.created_resources[resource_type]:
                try:
                    endpoint = resource_type.replace('_', '-')  # Convert underscores to hyphens for API
                    success, _, code = self.make_request('DELETE', f'{endpoint}/{resource_id}')
                    if success:
                        cleanup_count += 1
                except:
                    pass  # Ignore cleanup errors
                    
        if cleanup_count > 0:
            self.log_test("Cleanup Test Data", "PASS", f"Cleaned up {cleanup_count} test resources")
        else:
            self.log_test("Cleanup Test Data", "WARN", "No test data to clean up")

    def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚀 Starting WM Finance API Testing...")
        print(f"📍 Base URL: {self.base_url}")
        print(f"🕒 Test started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        try:
            # Core functionality tests
            self.test_health_check()
            self.test_user_registration()
            self.test_existing_user_login()
            self.test_authentication_endpoints()
            
            # Data management tests  
            self.test_accounts_endpoints()
            self.test_categories_endpoints()
            self.test_directions_endpoints()
            self.test_contractors_endpoints()
            
            # Transaction tests
            self.test_transactions_endpoints()
            self.test_planned_payments_endpoints()
            self.test_projects_endpoints()
            
            # Analytics and AI tests
            self.test_analytics_endpoints()
            self.test_ai_chat_endpoint()
            
            # Cleanup
            self.cleanup_test_data()
            
        except KeyboardInterrupt:
            print("\n⚠️ Tests interrupted by user")
        except Exception as e:
            print(f"\n💥 Unexpected error during testing: {e}")
            
        # Print final results
        self.print_summary()

    def print_summary(self):
        """Print test summary"""
        print("\n" + "="*60)
        print(f"📊 TEST SUMMARY")
        print("="*60)
        print(f"Total Tests: {self.tests_run}")
        print(f"Passed: {self.tests_passed} ✅")
        print(f"Failed: {self.tests_run - self.tests_passed} ❌")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100) if self.tests_run > 0 else 0:.1f}%")
        
        # Show failed tests
        failed_tests = [r for r in self.test_results if r['status'] == 'FAIL']
        if failed_tests:
            print(f"\n❌ Failed Tests ({len(failed_tests)}):")
            for test in failed_tests:
                print(f"  • {test['test_name']}: {test['details']}")
        
        # Show warnings
        warning_tests = [r for r in self.test_results if r['status'] == 'WARN']
        if warning_tests:
            print(f"\n⚠️ Warnings ({len(warning_tests)}):")
            for test in warning_tests:
                print(f"  • {test['test_name']}: {test['details']}")
        
        print(f"\n🕒 Test completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        return {
            'total_tests': self.tests_run,
            'passed_tests': self.tests_passed,
            'failed_tests': self.tests_run - self.tests_passed,
            'success_rate': (self.tests_passed/self.tests_run*100) if self.tests_run > 0 else 0,
            'test_results': self.test_results
        }

def main():
    """Main test execution"""
    tester = WMFinanceAPITester()
    
    try:
        results = tester.run_all_tests()
        
        # Return appropriate exit code
        if results['success_rate'] >= 80:
            print("🎉 Backend tests mostly successful!")
            return 0
        elif results['success_rate'] >= 50:
            print("⚠️ Backend tests partially successful - needs attention")
            return 1  
        else:
            print("💥 Backend tests mostly failed - significant issues")
            return 2
            
    except Exception as e:
        print(f"💥 Critical test failure: {e}")
        return 3

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)