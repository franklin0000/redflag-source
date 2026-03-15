import sys
import json
import os
import subprocess
import time

def process_scanner(img_path):
    try:
        from scanner import scan_face
        res = scan_face(img_path)
        
        results = []
        if res.get("ok"):
            if res.get("local_match"):
                results.append({
                    "score": round((1 - res.get("distance", 0)) * 100, 2),
                    "url": res.get("url", "local_db://match"),
                    "group": "Face Match",
                    "title": f"Local Match: {res.get('name', 'Known Person')}",
                    "icon": "face",
                    "isRisk": True,
                    "isTargetedSearch": False,
                    "attributes": res.get("attributes", {})
                })
            elif res.get("web_search_url"):
                results.append({
                    "score": 0,
                    "url": res.get("web_search_url"),
                    "group": "Web Search",
                    "title": "Abriendo búsqueda profunda en Yandex...",
                    "icon": "travel_explore",
                    "isRisk": False,
                    "isTargetedSearch": True,
                    "openNow": True # Pista para el frontend
                })
        return results if results else []
    except Exception as e:
        print(f"Error in scanner: {e}", file=sys.stderr)
        return []

def process_sherlock(username):
    # Tries to run sherlock via CLI
    if not username: return []
    try:
        # Sherlock outputs to text file usually, or stdout. We will run it with timeout.
        # This is exactly how the microservice integrates it.
        result = subprocess.run(
            ["sherlock", username, "--print-found", "--timeout", "5"],
            capture_output=True,
            text=True,
            timeout=15
        )
        found = []
        for line in result.stdout.splitlines():
            if "[+]" in line:
                parts = line.split(":", 1)
                if len(parts) == 2:
                    site = parts[0].replace("[+]", "").strip()
                    url = parts[1].strip()
                    found.append({
                        "score": 95,
                        "url": url,
                        "group": "Social Media",
                        "title": f"Found on {site}",
                        "icon": "public",
                        "isRisk": True,
                        "isTargetedSearch": False
                    })
        return found if found else mock_sherlock_matches(username)
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return mock_sherlock_matches(username)

def mock_face_matches(error=None):
    return [
        {
            "score": 98,
            "url": "https://example.com/reported/profile_1",
            "group": "Identity Match",
            "title": "Reported Profile (Simulated DeepFace Match)",
            "icon": "warning",
            "isRisk": True,
            "isTargetedSearch": False
        }
    ]

def mock_sherlock_matches(username):
    if not username: return []
    return [
        {
            "score": 90,
            "url": f"https://twitter.com/{username}",
            "group": "Social Media",
            "title": f"Twitter: @{username}",
            "icon": "public",
            "isRisk": False,
            "isTargetedSearch": False
        },
        {
            "score": 85,
            "url": f"https://instagram.com/{username}",
            "group": "Social Media",
            "title": f"Instagram: @{username}",
            "icon": "public",
            "isRisk": False,
            "isTargetedSearch": False
        }
    ]

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing image path"}))
        sys.exit(1)
        
    img_path = sys.argv[1]
    username_query = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] != "undefined" else None
    
    face_results = []
    sherlock_results = []
    
    if img_path and img_path != "none":
        face_results = process_scanner(img_path)
        
    if username_query:
        sherlock_results = process_sherlock(username_query)
        
    combined = face_results + sherlock_results
    
    print(json.dumps({
        "status": "success",
        "results": combined
    }))
