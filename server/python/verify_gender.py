"""
verify_gender.py — Analyzes a profile photo with DeepFace to detect the
person's gender. Used to verify that users entering gender-restricted
community rooms match their declared gender.

Usage:
  python3 verify_gender.py /path/to/photo.jpg
  python3 verify_gender.py https://example.com/photo.jpg

Output (JSON):
  { "detected": "female", "confidence": 92.4, "match": true, "declared": "female" }
  { "error": "No face detected" }
"""
import sys
import json
import os
import tempfile

def download_image(url):
    """Download an image URL to a temp file. Returns temp file path."""
    import requests
    r = requests.get(url, timeout=10, headers={'User-Agent': 'Mozilla/5.0'})
    r.raise_for_status()
    suffix = '.jpg'
    if 'png' in r.headers.get('content-type', ''): suffix = '.png'
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.write(r.content)
    tmp.close()
    return tmp.name

def verify_gender(image_path, declared_gender=None, confidence_threshold=65.0):
    """
    Analyzes photo with DeepFace and returns detected gender + confidence.
    declared_gender: 'male' or 'female' (if provided, also returns match bool)
    confidence_threshold: minimum % confidence required to consider the detection valid
    """
    tmp_path = None
    try:
        # Handle URL vs file path
        if image_path.startswith('http://') or image_path.startswith('https://'):
            tmp_path = download_image(image_path)
            analyze_path = tmp_path
        else:
            analyze_path = image_path

        from deepface import DeepFace

        results = DeepFace.analyze(
            img_path=analyze_path,
            actions=['gender'],
            enforce_detection=False,
            silent=True
        )

        obj = results[0] if isinstance(results, list) else results

        dominant = obj.get('dominant_gender', '').lower()  # 'man' or 'woman'
        gender_scores = obj.get('gender', {})

        # DeepFace uses 'Man'/'Woman' keys
        man_score = gender_scores.get('Man', gender_scores.get('man', 0))
        woman_score = gender_scores.get('Woman', gender_scores.get('woman', 0))

        if dominant == 'man':
            detected = 'male'
            confidence = round(float(man_score), 1)
        elif dominant == 'woman':
            detected = 'female'
            confidence = round(float(woman_score), 1)
        else:
            return {'error': 'Could not determine gender from photo'}

        if confidence < confidence_threshold:
            return {
                'error': f'Photo quality too low to verify gender (confidence: {confidence}%). Please use a clearer face photo.',
                'confidence': confidence
            }

        result = {
            'detected': detected,
            'confidence': confidence,
        }

        if declared_gender:
            normalized_declared = declared_gender.lower().strip()
            if normalized_declared in ('mujer', 'woman'): normalized_declared = 'female'
            if normalized_declared in ('hombre', 'man'): normalized_declared = 'male'
            result['declared'] = normalized_declared
            result['match'] = (detected == normalized_declared)

        return result

    except ImportError:
        return {'error': 'DeepFace not installed. Run: pip install deepface'}
    except Exception as e:
        return {'error': str(e)}
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'Usage: verify_gender.py <image_path_or_url> [declared_gender]'}))
        sys.exit(1)

    image_path = sys.argv[1]
    declared = sys.argv[2] if len(sys.argv) > 2 else None

    result = verify_gender(image_path, declared)
    print(json.dumps(result))
