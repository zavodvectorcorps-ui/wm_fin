"""
Test suite for Documents page features:
- Folder CRUD (create, list, delete)
- Document process (mark as processed without linking)
- Document move to folder
- Filter by folder_id and status=processed
- Backup status endpoint (auto_backup_enabled, last_backup_at)
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

@pytest.fixture(scope="module")
def auth_token():
    """Get authentication token for admin user"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin",
        "password": "220066mm"
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Authentication failed: {response.status_code} - {response.text}")

@pytest.fixture(scope="module")
def api_client(auth_token):
    """Session with auth header"""
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {auth_token}"
    })
    return session

@pytest.fixture(scope="module")
def test_folder_id(api_client):
    """Create a test folder and return its ID, cleanup after tests"""
    response = api_client.post(f"{BASE_URL}/api/documents/folders", json={
        "name": "TEST_Folder_Pytest",
        "color": "#ff5733"
    })
    assert response.status_code == 200, f"Failed to create test folder: {response.text}"
    folder = response.json()
    folder_id = folder["id"]
    yield folder_id
    # Cleanup
    api_client.delete(f"{BASE_URL}/api/documents/folders/{folder_id}")

@pytest.fixture(scope="module")
def test_document_id(api_client, test_folder_id):
    """Upload a test document and return its ID, cleanup after tests"""
    # Create a simple test file
    files = {
        'file': ('TEST_document.pdf', io.BytesIO(b'%PDF-1.4 test content'), 'application/pdf')
    }
    data = {
        'document_date': '2026-01-15',
        'type': 'other',
        'description': 'TEST document for pytest'
    }
    response = requests.post(
        f"{BASE_URL}/api/documents/upload",
        files=files,
        data=data,
        headers={"Authorization": api_client.headers["Authorization"]}
    )
    assert response.status_code == 200, f"Failed to upload test document: {response.text}"
    doc = response.json()
    doc_id = doc["id"]
    yield doc_id
    # Cleanup
    api_client.delete(f"{BASE_URL}/api/documents/{doc_id}")


class TestFolderCRUD:
    """Test folder create, list, delete operations"""
    
    def test_create_folder(self, api_client):
        """POST /api/documents/folders - create folder with name and color"""
        response = api_client.post(f"{BASE_URL}/api/documents/folders", json={
            "name": "TEST_NewFolder",
            "color": "#6366f1"
        })
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["name"] == "TEST_NewFolder"
        assert data["color"] == "#6366f1"
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/documents/folders/{data['id']}")
    
    def test_list_folders(self, api_client, test_folder_id):
        """GET /api/documents/folders - list all folders"""
        response = api_client.get(f"{BASE_URL}/api/documents/folders")
        assert response.status_code == 200
        folders = response.json()
        assert isinstance(folders, list)
        # Should contain our test folder
        folder_ids = [f["id"] for f in folders]
        assert test_folder_id in folder_ids
    
    def test_delete_folder(self, api_client):
        """DELETE /api/documents/folders/{folder_id} - delete folder"""
        # Create a folder to delete
        create_resp = api_client.post(f"{BASE_URL}/api/documents/folders", json={
            "name": "TEST_ToDelete",
            "color": "#ff0000"
        })
        assert create_resp.status_code == 200
        folder_id = create_resp.json()["id"]
        
        # Delete it
        delete_resp = api_client.delete(f"{BASE_URL}/api/documents/folders/{folder_id}")
        assert delete_resp.status_code == 200
        assert delete_resp.json()["status"] == "deleted"
        
        # Verify it's gone
        list_resp = api_client.get(f"{BASE_URL}/api/documents/folders")
        folder_ids = [f["id"] for f in list_resp.json()]
        assert folder_id not in folder_ids
    
    def test_delete_nonexistent_folder(self, api_client):
        """DELETE /api/documents/folders/{folder_id} - 404 for nonexistent"""
        response = api_client.delete(f"{BASE_URL}/api/documents/folders/nonexistent-id-12345")
        assert response.status_code == 404


class TestDocumentProcess:
    """Test document process endpoint (mark as processed without linking)"""
    
    def test_process_document(self, api_client, test_document_id):
        """POST /api/documents/{document_id}/process - mark as processed"""
        response = api_client.post(f"{BASE_URL}/api/documents/{test_document_id}/process")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "processed"
        assert data["id"] == test_document_id
    
    def test_process_nonexistent_document(self, api_client):
        """POST /api/documents/{document_id}/process - 404 for nonexistent"""
        response = api_client.post(f"{BASE_URL}/api/documents/nonexistent-doc-12345/process")
        assert response.status_code == 404


class TestDocumentMove:
    """Test document move to folder endpoint"""
    
    def test_move_document_to_folder(self, api_client, test_document_id, test_folder_id):
        """POST /api/documents/{document_id}/move - move to folder"""
        response = api_client.post(
            f"{BASE_URL}/api/documents/{test_document_id}/move",
            json={"folder_id": test_folder_id}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["folder_id"] == test_folder_id
    
    def test_move_document_to_root(self, api_client, test_document_id):
        """POST /api/documents/{document_id}/move - move to root (no folder)"""
        response = api_client.post(
            f"{BASE_URL}/api/documents/{test_document_id}/move",
            json={"folder_id": None}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["folder_id"] is None
    
    def test_move_nonexistent_document(self, api_client, test_folder_id):
        """POST /api/documents/{document_id}/move - 404 for nonexistent"""
        response = api_client.post(
            f"{BASE_URL}/api/documents/nonexistent-doc-12345/move",
            json={"folder_id": test_folder_id}
        )
        assert response.status_code == 404


class TestDocumentFilters:
    """Test document filtering by folder_id and status"""
    
    def test_filter_by_folder_id(self, api_client, test_document_id, test_folder_id):
        """GET /api/documents?folder_id=... - filter by folder"""
        # First move document to folder
        api_client.post(
            f"{BASE_URL}/api/documents/{test_document_id}/move",
            json={"folder_id": test_folder_id}
        )
        
        # Filter by folder
        response = api_client.get(f"{BASE_URL}/api/documents", params={"folder_id": test_folder_id})
        assert response.status_code == 200
        docs = response.json()
        assert isinstance(docs, list)
        # All returned docs should have this folder_id
        for doc in docs:
            assert doc["folder_id"] == test_folder_id
    
    def test_filter_by_status_processed(self, api_client, test_document_id):
        """GET /api/documents?status=processed - filter by processed status"""
        # First mark document as processed
        api_client.post(f"{BASE_URL}/api/documents/{test_document_id}/process")
        
        # Filter by status
        response = api_client.get(f"{BASE_URL}/api/documents", params={"status": "processed"})
        assert response.status_code == 200
        docs = response.json()
        assert isinstance(docs, list)
        # All returned docs should have status=processed
        for doc in docs:
            assert doc["status"] == "processed"


class TestBackupStatus:
    """Test backup status endpoint"""
    
    def test_backup_status_returns_required_fields(self, api_client):
        """GET /api/backup/status - returns auto_backup_enabled and last_backup_at"""
        response = api_client.get(f"{BASE_URL}/api/backup/status")
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields exist
        assert "auto_backup_enabled" in data, "Missing auto_backup_enabled field"
        assert "last_backup_at" in data, "Missing last_backup_at field"
        assert "configured" in data
        assert "has_url" in data
        assert "has_service_account" in data
        
        # auto_backup_enabled should be boolean
        assert isinstance(data["auto_backup_enabled"], bool)


class TestDocumentUploadWithFolder:
    """Test document upload with folder_id"""
    
    def test_upload_document_with_folder(self, api_client, test_folder_id):
        """POST /api/documents/upload - upload with folder_id"""
        files = {
            'file': ('TEST_with_folder.pdf', io.BytesIO(b'%PDF-1.4 test'), 'application/pdf')
        }
        data = {
            'document_date': '2026-01-15',
            'type': 'invoice',
            'folder_id': test_folder_id,
            'description': 'TEST document with folder'
        }
        response = requests.post(
            f"{BASE_URL}/api/documents/upload",
            files=files,
            data=data,
            headers={"Authorization": api_client.headers["Authorization"]}
        )
        assert response.status_code == 200
        doc = response.json()
        assert doc["folder_id"] == test_folder_id
        assert doc["status"] == "pending"  # Not linked to transaction
        
        # Cleanup
        api_client.delete(f"{BASE_URL}/api/documents/{doc['id']}")


class TestAuthRequired:
    """Test that endpoints require authentication"""
    
    def test_folders_require_auth(self):
        """GET /api/documents/folders - requires auth"""
        response = requests.get(f"{BASE_URL}/api/documents/folders")
        assert response.status_code in [401, 403]
    
    def test_process_requires_auth(self):
        """POST /api/documents/{id}/process - requires auth"""
        response = requests.post(f"{BASE_URL}/api/documents/some-id/process")
        assert response.status_code in [401, 403]
    
    def test_move_requires_auth(self):
        """POST /api/documents/{id}/move - requires auth"""
        response = requests.post(
            f"{BASE_URL}/api/documents/some-id/move",
            json={"folder_id": "some-folder"}
        )
        assert response.status_code in [401, 403]
    
    def test_backup_status_requires_auth(self):
        """GET /api/backup/status - requires auth"""
        response = requests.get(f"{BASE_URL}/api/backup/status")
        assert response.status_code in [401, 403]
