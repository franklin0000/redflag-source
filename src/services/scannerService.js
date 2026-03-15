/**
 * scannerService.js — Backend Face Scanner API
 *
 * Calls the local RedFlag scanner engine via /api/searches/background-check.
 */

const BASE = import.meta.env.VITE_API_URL || '';

export async function runLocalScan(fileObject, username = '') {
    const url = `${BASE}/api/searches/background-check`;
    const token = localStorage.getItem('token'); // Assuming standard JWT storage

    const formData = new FormData();
    formData.append('file', fileObject);
    if (username) formData.append('username', username);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${token}` 
            },
            body: formData,
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Backend scan failed');
        }

        const data = await response.json();
        return data; // { status: "success", results: [...] }
    } catch (error) {
        console.error('Local scan error:', error);
        return { error: error.message };
    }
}
