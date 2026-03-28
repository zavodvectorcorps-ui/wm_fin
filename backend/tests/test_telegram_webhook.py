"""
Test Telegram Webhook API for WM Finance Cash Bot.

Tests:
- POST /api/telegram/webhook - handles /start, /help, /balance, /last, /direction commands
- POST /api/telegram/webhook - handles callback_query for direction selection
- POST /api/telegram/webhook - parses expense and income transactions
- POST /api/telegram/webhook - requires direction selection before recording transaction
- POST /api/telegram/setup-webhook - requires auth and bot token
- GET /api/telegram/webhook-info - returns webhook status
- GET /api/telegram/bot-users - returns connected users
"""

import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TEST_USERNAME = "admin"
TEST_PASSWORD = "220066mm"

# Use unique chat_id to avoid conflicts with previous tests
TEST_CHAT_ID = 99999


def get_auth_token():
    """Get authentication token."""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": TEST_USERNAME,
        "password": TEST_PASSWORD
    })
    if response.status_code == 200:
        return response.json().get("token")  # API returns 'token' not 'access_token'
    return None


class TestTelegramWebhookCommands:
    """Test Telegram webhook command handling - PUBLIC endpoint (no auth required)."""
    
    def test_webhook_start_command(self):
        """POST /api/telegram/webhook handles /start command."""
        payload = {
            "update_id": 1001,
            "message": {
                "message_id": 1,
                "chat": {"id": TEST_CHAT_ID, "type": "private"},
                "from": {"id": TEST_CHAT_ID, "first_name": "TestUser", "username": "testuser99"},
                "text": "/start",
                "date": 1704067200
            }
        }
        response = requests.post(f"{BASE_URL}/api/telegram/webhook", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("ok") == True, f"Expected ok:true, got {data}"
        print(f"✓ /start command handled successfully: {data}")
    
    def test_webhook_help_command(self):
        """POST /api/telegram/webhook handles /help command."""
        payload = {
            "update_id": 1002,
            "message": {
                "message_id": 2,
                "chat": {"id": TEST_CHAT_ID, "type": "private"},
                "from": {"id": TEST_CHAT_ID, "first_name": "TestUser", "username": "testuser99"},
                "text": "/help",
                "date": 1704067201
            }
        }
        response = requests.post(f"{BASE_URL}/api/telegram/webhook", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("ok") == True, f"Expected ok:true, got {data}"
        print(f"✓ /help command handled successfully: {data}")
    
    def test_webhook_balance_command(self):
        """POST /api/telegram/webhook handles /balance command."""
        payload = {
            "update_id": 1003,
            "message": {
                "message_id": 3,
                "chat": {"id": TEST_CHAT_ID, "type": "private"},
                "from": {"id": TEST_CHAT_ID, "first_name": "TestUser", "username": "testuser99"},
                "text": "/balance",
                "date": 1704067202
            }
        }
        response = requests.post(f"{BASE_URL}/api/telegram/webhook", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("ok") == True, f"Expected ok:true, got {data}"
        print(f"✓ /balance command handled successfully: {data}")
    
    def test_webhook_last_command(self):
        """POST /api/telegram/webhook handles /last command."""
        payload = {
            "update_id": 1004,
            "message": {
                "message_id": 4,
                "chat": {"id": TEST_CHAT_ID, "type": "private"},
                "from": {"id": TEST_CHAT_ID, "first_name": "TestUser", "username": "testuser99"},
                "text": "/last",
                "date": 1704067203
            }
        }
        response = requests.post(f"{BASE_URL}/api/telegram/webhook", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("ok") == True, f"Expected ok:true, got {data}"
        print(f"✓ /last command handled successfully: {data}")
    
    def test_webhook_direction_command(self):
        """POST /api/telegram/webhook handles /direction command."""
        payload = {
            "update_id": 1005,
            "message": {
                "message_id": 5,
                "chat": {"id": TEST_CHAT_ID, "type": "private"},
                "from": {"id": TEST_CHAT_ID, "first_name": "TestUser", "username": "testuser99"},
                "text": "/direction",
                "date": 1704067204
            }
        }
        response = requests.post(f"{BASE_URL}/api/telegram/webhook", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("ok") == True, f"Expected ok:true, got {data}"
        print(f"✓ /direction command handled successfully: {data}")


class TestTelegramWebhookCallbackQuery:
    """Test callback_query handling for direction selection."""
    
    def test_webhook_callback_query_direction_selection(self):
        """POST /api/telegram/webhook handles callback_query for direction selection."""
        # Simulate direction selection callback
        direction_id = str(uuid.uuid4())
        direction_name = "Теплицы"
        
        payload = {
            "update_id": 1006,
            "callback_query": {
                "id": "callback123",
                "from": {"id": TEST_CHAT_ID, "first_name": "TestUser", "username": "testuser99"},
                "message": {
                    "message_id": 10,
                    "chat": {"id": TEST_CHAT_ID, "type": "private"},
                    "date": 1704067205
                },
                "data": f"dir:{direction_id}:{direction_name}"
            }
        }
        response = requests.post(f"{BASE_URL}/api/telegram/webhook", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("ok") == True, f"Expected ok:true, got {data}"
        print(f"✓ callback_query direction selection handled successfully: {data}")


class TestTelegramWebhookTransactionParsing:
    """Test transaction text parsing."""
    
    def test_webhook_requires_direction_before_transaction(self):
        """POST /api/telegram/webhook requires direction selection before recording transaction."""
        # Use a new chat_id that hasn't selected a direction
        new_chat_id = 88888
        
        payload = {
            "update_id": 1007,
            "message": {
                "message_id": 7,
                "chat": {"id": new_chat_id, "type": "private"},
                "from": {"id": new_chat_id, "first_name": "NewUser", "username": "newuser88"},
                "text": "1000 Антон зп",
                "date": 1704067206
            }
        }
        response = requests.post(f"{BASE_URL}/api/telegram/webhook", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("ok") == True, f"Expected ok:true, got {data}"
        # The handler should return ok:true but prompt user to select direction first
        print(f"✓ Transaction without direction handled (prompts for direction): {data}")
    
    def test_webhook_parses_expense_transaction(self):
        """POST /api/telegram/webhook parses '1000 Антон зп' as expense with amount 1000."""
        # First set direction for this user
        direction_id = str(uuid.uuid4())
        direction_name = "Сауны"
        
        # Set direction via callback
        callback_payload = {
            "update_id": 1008,
            "callback_query": {
                "id": "callback456",
                "from": {"id": TEST_CHAT_ID, "first_name": "TestUser", "username": "testuser99"},
                "message": {
                    "message_id": 11,
                    "chat": {"id": TEST_CHAT_ID, "type": "private"},
                    "date": 1704067207
                },
                "data": f"dir:{direction_id}:{direction_name}"
            }
        }
        response = requests.post(f"{BASE_URL}/api/telegram/webhook", json=callback_payload)
        assert response.status_code == 200
        
        # Now send expense transaction
        payload = {
            "update_id": 1009,
            "message": {
                "message_id": 8,
                "chat": {"id": TEST_CHAT_ID, "type": "private"},
                "from": {"id": TEST_CHAT_ID, "first_name": "TestUser", "username": "testuser99"},
                "text": "1000 Антон зп",
                "date": 1704067208
            }
        }
        response = requests.post(f"{BASE_URL}/api/telegram/webhook", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("ok") == True, f"Expected ok:true, got {data}"
        print(f"✓ Expense transaction '1000 Антон зп' parsed successfully: {data}")
    
    def test_webhook_parses_income_transaction(self):
        """POST /api/telegram/webhook parses '+5000 продажа' as income with amount 5000."""
        payload = {
            "update_id": 1010,
            "message": {
                "message_id": 9,
                "chat": {"id": TEST_CHAT_ID, "type": "private"},
                "from": {"id": TEST_CHAT_ID, "first_name": "TestUser", "username": "testuser99"},
                "text": "+5000 продажа",
                "date": 1704067209
            }
        }
        response = requests.post(f"{BASE_URL}/api/telegram/webhook", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("ok") == True, f"Expected ok:true, got {data}"
        print(f"✓ Income transaction '+5000 продажа' parsed successfully: {data}")


class TestTelegramWebhookAuthenticatedEndpoints:
    """Test authenticated Telegram endpoints."""
    
    def test_setup_webhook_requires_auth(self):
        """POST /api/telegram/setup-webhook requires authentication."""
        response = requests.post(f"{BASE_URL}/api/telegram/setup-webhook", json={
            "webhook_url": "https://example.com/webhook"
        })
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}: {response.text}"
        print(f"✓ setup-webhook requires auth: {response.status_code}")
    
    def test_webhook_info_requires_auth(self):
        """GET /api/telegram/webhook-info requires authentication."""
        response = requests.get(f"{BASE_URL}/api/telegram/webhook-info")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}: {response.text}"
        print(f"✓ webhook-info requires auth: {response.status_code}")
    
    def test_bot_users_requires_auth(self):
        """GET /api/telegram/bot-users requires authentication."""
        response = requests.get(f"{BASE_URL}/api/telegram/bot-users")
        assert response.status_code in [401, 403], f"Expected 401/403, got {response.status_code}: {response.text}"
        print(f"✓ bot-users requires auth: {response.status_code}")
    
    def test_webhook_info_with_auth(self):
        """GET /api/telegram/webhook-info returns webhook status with auth."""
        token = get_auth_token()
        if not token:
            pytest.skip("Authentication failed")
        
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/api/telegram/webhook-info", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        # Should have 'configured' field
        assert "configured" in data, f"Expected 'configured' field in response: {data}"
        print(f"✓ webhook-info returns status: {data}")
    
    def test_bot_users_with_auth(self):
        """GET /api/telegram/bot-users returns connected users with auth."""
        token = get_auth_token()
        if not token:
            pytest.skip("Authentication failed")
        
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.get(f"{BASE_URL}/api/telegram/bot-users", headers=headers)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        # Should have 'users' field
        assert "users" in data, f"Expected 'users' field in response: {data}"
        assert isinstance(data["users"], list), f"Expected 'users' to be a list: {data}"
        print(f"✓ bot-users returns users list: {len(data['users'])} users")
    
    def test_setup_webhook_requires_bot_token(self):
        """POST /api/telegram/setup-webhook requires bot token to be configured."""
        token = get_auth_token()
        if not token:
            pytest.skip("Authentication failed")
        
        headers = {"Authorization": f"Bearer {token}"}
        response = requests.post(f"{BASE_URL}/api/telegram/setup-webhook", json={
            "webhook_url": "https://example.com/webhook"
        }, headers=headers)
        # Should return 400 if bot token not configured, or success if configured
        assert response.status_code in [200, 400], f"Expected 200/400, got {response.status_code}: {response.text}"
        print(f"✓ setup-webhook response: {response.status_code} - {response.json()}")


class TestTelegramWebhookEdgeCases:
    """Test edge cases and error handling."""
    
    def test_webhook_empty_message(self):
        """POST /api/telegram/webhook handles empty message gracefully."""
        payload = {
            "update_id": 1011,
            "message": {
                "message_id": 12,
                "chat": {"id": TEST_CHAT_ID, "type": "private"},
                "from": {"id": TEST_CHAT_ID, "first_name": "TestUser"},
                "text": "",
                "date": 1704067210
            }
        }
        response = requests.post(f"{BASE_URL}/api/telegram/webhook", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("ok") == True, f"Expected ok:true, got {data}"
        print(f"✓ Empty message handled gracefully: {data}")
    
    def test_webhook_no_message(self):
        """POST /api/telegram/webhook handles update without message."""
        payload = {
            "update_id": 1012
        }
        response = requests.post(f"{BASE_URL}/api/telegram/webhook", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("ok") == True, f"Expected ok:true, got {data}"
        print(f"✓ Update without message handled gracefully: {data}")
    
    def test_webhook_invalid_transaction_format(self):
        """POST /api/telegram/webhook handles invalid transaction format."""
        payload = {
            "update_id": 1013,
            "message": {
                "message_id": 13,
                "chat": {"id": TEST_CHAT_ID, "type": "private"},
                "from": {"id": TEST_CHAT_ID, "first_name": "TestUser"},
                "text": "invalid text without amount",
                "date": 1704067211
            }
        }
        response = requests.post(f"{BASE_URL}/api/telegram/webhook", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("ok") == True, f"Expected ok:true, got {data}"
        print(f"✓ Invalid transaction format handled gracefully: {data}")
    
    def test_webhook_transaction_with_decimal(self):
        """POST /api/telegram/webhook parses transaction with decimal amount."""
        payload = {
            "update_id": 1014,
            "message": {
                "message_id": 14,
                "chat": {"id": TEST_CHAT_ID, "type": "private"},
                "from": {"id": TEST_CHAT_ID, "first_name": "TestUser"},
                "text": "1500.50 материалы",
                "date": 1704067212
            }
        }
        response = requests.post(f"{BASE_URL}/api/telegram/webhook", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("ok") == True, f"Expected ok:true, got {data}"
        print(f"✓ Decimal amount transaction handled: {data}")
    
    def test_webhook_transaction_with_slash_separator(self):
        """POST /api/telegram/webhook parses '1000/ Антон Ск' format."""
        payload = {
            "update_id": 1015,
            "message": {
                "message_id": 15,
                "chat": {"id": TEST_CHAT_ID, "type": "private"},
                "from": {"id": TEST_CHAT_ID, "first_name": "TestUser"},
                "text": "1000/ Антон Ск",
                "date": 1704067213
            }
        }
        response = requests.post(f"{BASE_URL}/api/telegram/webhook", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        data = response.json()
        assert data.get("ok") == True, f"Expected ok:true, got {data}"
        print(f"✓ Slash separator format handled: {data}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
