"""
find_in_db.py — Searches for a face in the local db_images/ database using DeepFace.find().
Each subdirectory of db_images/ represents one person (folder name = person's name).

Usage:
  python3 find_in_db.py /path/to/uploaded/photo.jpg
"""
import os
import sys
import json
from pathlib import Path

DB_ROOT = Path(__file__).parent / 'db_images'


def find_face_in_db(image_path, model='ArcFace', threshold=0.4):
    """
    Searches all person folders in db_images/ using DeepFace.find().
    Returns a list of matches sorted by score (highest first).
    """
    if not DB_ROOT.exists():
        return []

    person_dirs = [d for d in DB_ROOT.iterdir() if d.is_dir()]
    if not person_dirs:
        return []

    results = []

    try:
        from deepface import DeepFace
        import pandas as pd

        for person_dir in person_dirs:
            # Skip empty folders
            images = (list(person_dir.glob('*.jpg')) + list(person_dir.glob('*.png')) +
                      list(person_dir.glob('*.webp')) + list(person_dir.glob('*.jpeg')))
            if not images:
                continue

            try:
                matches = DeepFace.find(
                    img_path=image_path,
                    db_path=str(person_dir),
                    model_name=model,
                    enforce_detection=False,
                    silent=True,
                    threshold=threshold
                )

                # DeepFace.find returns a list of DataFrames (one per face detected)
                if matches and len(matches) > 0:
                    df = matches[0]
                    if df is not None and len(df) > 0:
                        best_row = df.sort_values('distance').iloc[0]
                        distance = float(best_row.get('distance', 1.0))

                        if distance <= threshold:
                            person_name = person_dir.name.replace('_', ' ')
                            match_img = str(best_row.get('identity', ''))
                            results.append({
                                "name": person_name,
                                "folder": person_dir.name,
                                "score": round((1 - distance / threshold) * 100, 1),
                                "distance": round(distance, 4),
                                "match_image": os.path.basename(match_img),
                                "total_images_in_folder": len(images)
                            })
            except Exception as e:
                # Log but don't crash — folder might have no detectable faces
                print(f"[find_in_db] Skipped {person_dir.name}: {e}", file=sys.stderr)
                continue

    except ImportError:
        print("[find_in_db] DeepFace not installed. Run: pip install deepface", file=sys.stderr)
        return []
    except Exception as e:
        print(f"[find_in_db] Error: {e}", file=sys.stderr)
        return []

    return sorted(results, key=lambda x: x['score'], reverse=True)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: find_in_db.py <image_path>"}))
        sys.exit(1)

    img_path = sys.argv[1]
    if not os.path.exists(img_path):
        print(json.dumps({"error": f"File not found: {img_path}"}))
        sys.exit(1)

    matches = find_face_in_db(img_path)
    print(json.dumps({"matches": matches, "total": len(matches)}))
