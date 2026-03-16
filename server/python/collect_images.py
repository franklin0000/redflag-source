"""
collect_images.py — Downloads images from Google Custom Search API for a given
name/username and saves them to server/python/db_images/<query>/ for face indexing.

Usage:
  python3 collect_images.py "John Doe" 30
  python3 collect_images.py "john_doe_username" 50
"""
import os
import sys
import json
import requests
import urllib.parse
from pathlib import Path

GOOGLE_CSE_KEY = os.getenv('GOOGLE_CSE_KEY')
GOOGLE_CSE_ID = os.getenv('GOOGLE_CSE_ID')

DB_ROOT = Path(__file__).parent / 'db_images'

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
}


def collect_images_for_name(query, max_images=30):
    """Downloads images from Google CSE image search for a query, saves to db_images/<query>/."""
    if not GOOGLE_CSE_KEY or not GOOGLE_CSE_ID:
        return {"error": "GOOGLE_CSE_KEY or GOOGLE_CSE_ID not set", "downloaded": 0}

    safe_name = query.replace(' ', '_').replace('/', '_').replace('..', '_')
    output_dir = DB_ROOT / safe_name
    output_dir.mkdir(parents=True, exist_ok=True)

    downloaded = 0
    errors = 0

    # Google CSE allows max 10 results per request, start from 1 to 91
    for start in range(1, max_images + 1, 10):
        if downloaded >= max_images:
            break

        url = (
            f"https://www.googleapis.com/customsearch/v1"
            f"?key={GOOGLE_CSE_KEY}&cx={GOOGLE_CSE_ID}"
            f"&q={urllib.parse.quote(query)}&searchType=image&num=10&start={start}"
        )

        try:
            r = requests.get(url, timeout=10)
            if r.status_code != 200:
                break
            data = r.json()
            items = data.get('items', [])
            if not items:
                break

            for i, item in enumerate(items):
                if downloaded >= max_images:
                    break

                img_url = item.get('link', '')
                if not img_url or not img_url.startswith('http'):
                    continue

                try:
                    img_r = requests.get(img_url, timeout=8, headers=HEADERS, stream=True)
                    content_type = img_r.headers.get('content-type', '')
                    if img_r.status_code == 200 and 'image' in content_type:
                        # Determine extension
                        if 'jpeg' in content_type or 'jpg' in content_type:
                            ext = 'jpg'
                        elif 'png' in content_type:
                            ext = 'png'
                        elif 'webp' in content_type:
                            ext = 'webp'
                        else:
                            ext = img_url.split('.')[-1].split('?')[0][:4].lower()
                            if ext not in ('jpg', 'jpeg', 'png', 'webp'):
                                ext = 'jpg'

                        fname = output_dir / f"img_{start}_{i}.{ext}"
                        with open(fname, 'wb') as f:
                            for chunk in img_r.iter_content(8192):
                                f.write(chunk)
                        downloaded += 1
                except Exception:
                    errors += 1
                    continue

        except Exception as e:
            errors += 1
            break

    return {
        "query": query,
        "folder": str(output_dir),
        "downloaded": downloaded,
        "errors": errors
    }


def get_db_stats():
    """Returns stats about the local face database."""
    if not DB_ROOT.exists():
        return {"total_people": 0, "total_images": 0, "people": []}

    people = []
    for person_dir in sorted(DB_ROOT.iterdir()):
        if not person_dir.is_dir():
            continue
        images = list(person_dir.glob('*.jpg')) + list(person_dir.glob('*.png')) + list(person_dir.glob('*.webp'))
        people.append({
            "name": person_dir.name.replace('_', ' '),
            "folder": person_dir.name,
            "image_count": len(images)
        })

    return {
        "total_people": len(people),
        "total_images": sum(p['image_count'] for p in people),
        "people": people
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: collect_images.py <query> [max_images]"}))
        sys.exit(1)

    query = sys.argv[1]
    max_images = int(sys.argv[2]) if len(sys.argv) > 2 else 30

    result = collect_images_for_name(query, max_images)
    print(json.dumps(result))
