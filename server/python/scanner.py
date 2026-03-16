import cv2
import numpy as np
import faiss
import pickle
import requests
import webbrowser
import os
import sys
from insightface.app import FaceAnalysis
from PIL import Image
from PIL.ExifTags import TAGS

try:
    import imagehash
    HAS_IMAGEHASH = True
except ImportError:
    HAS_IMAGEHASH = False

INDEX_FILE = 'face_index.faiss'
METADATA_FILE = 'metadata.pkl'
THRESHOLD = 0.35

# API Config (Read from env)
YANDEX_KEY = os.getenv('VITE_YANDEX_VISION_KEY')
YANDEX_FOLDER = os.getenv('YANDEX_FOLDER_ID', 'b1g5d3bsuqm0ivg26kvg')
FACECHECK_TOKEN = os.getenv('VITE_FACECHECK_TOKEN')

# Inicializar InsightFace (buffalo_l)
print("Cargando InsightFace (buffalo_l)...")
insight_app = FaceAnalysis(name='buffalo_l')
insight_app.prepare(ctx_id=-1)  # -1 para CPU

# Cargar o crear índice FAISS
if os.path.exists(INDEX_FILE):
    index = faiss.read_index(INDEX_FILE)
    with open(METADATA_FILE, 'rb') as f:
        metadata = pickle.load(f)
else:
    # Dimensión 512 para Buffalo_L / ArcFace
    index = faiss.IndexFlatL2(512)
    metadata = []

def add_to_base(emb, meta):
    """Agrega un embedding y su metadata a la base local."""
    index.add(np.array([emb]).astype('float32'))
    metadata.append(meta)
    faiss.write_index(index, INDEX_FILE)
    with open(METADATA_FILE, 'wb') as f:
        pickle.dump(metadata, f)

def search_local(emb):
    """Busca en la base FAISS local."""
    if index.ntotal == 0:
        return None
    
    # Buscar el más cercano
    D, I = index.search(np.array([emb]).astype('float32'), 1)
    dist = D[0][0]
    idx = I[0][0]
    
    if dist < THRESHOLD:
        return {"match": True, "metadata": metadata[idx], "distance": float(dist)}
    return {"match": False}

def get_yandex_url(image_path):
    """Retorna la URL de búsqueda de Yandex con filtros."""
    search_query = "onlyfans+porn+escort+nsfw"
    return f"https://yandex.com/images/search?text={search_query}"

def yandex_cloud_search(image_path, face_crop_bytes=None):
    """
    Llama a la API de Yandex Cloud Vision.
    Si se pasa face_crop_bytes, lo usa en lugar del archivo original.
    """
    if not YANDEX_KEY:
        return None, "Missing Yandex API Key in Environment Variables"
    
    import base64
    try:
        if face_crop_bytes:
            encoded_image = base64.b64encode(face_crop_bytes).decode('utf-8')
        else:
            with open(image_path, "rb") as f:
                encoded_image = base64.b64encode(f.read()).decode('utf-8')
        
        url = "https://vision.api.cloud.yandex.net/vision/v1/batchAnalyze"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Api-Key {YANDEX_KEY}"
        }
        
        payload = {
            "folderId": YANDEX_FOLDER,
            "analyzeSpecs": [{
                "content": encoded_image,
                "features": [
                    {"type": "FACE_DETECTION"},
                    {"type": "IMAGE_COPY_SEARCH"}
                ]
            }]
        }
        
        response = requests.post(url, headers=headers, json=payload, timeout=15)
        if response.status_code == 200:
            return response.json(), None
        else:
            err_msg = f"Yandex Error {response.status_code}: {response.text}"
            return None, err_msg
    except Exception as e:
        return None, str(e)

def facecheck_search(image_path):
    """
    Calls FaceCheck.id API (Upload + Poll).
    Returns items list and error string.
    """
    if not FACECHECK_TOKEN:
        return [], "Missing FaceCheck Token"

    try:
        # 1. Upload
        url_upload = "https://facecheck.id/api/upload_pic"
        headers = {"Authorization": FACECHECK_TOKEN}
        with open(image_path, "rb") as f:
            files = {"images": f}
            res_up = requests.post(url_upload, headers=headers, files=files, timeout=20)
        
        if res_up.status_code != 200:
            return [], f"FaceCheck Upload Error {res_up.status_code}"
        
        data_up = res_up.json()
        id_search = data_up.get("id_search")
        if not id_search:
            return [], "FaceCheck ID not returned"

        # 2. Poll (Max 30s for responsiveness)
        url_search = "https://facecheck.id/api/search"
        import time
        for _ in range(15): # 15 iterations * 2s = 30s
            payload = {"id_search": id_search, "with_progress": True, "status_only": False, "demo": False}
            res_poll = requests.post(url_search, headers=headers, json=payload, timeout=15)
            if res_poll.status_code == 200:
                data_poll = res_poll.json()
                if data_poll.get("output"):
                    return data_poll["output"].get("items", []), None
                if data_poll.get("error"):
                    return [], data_poll["error"]
            time.sleep(2)
        
        return [], "FaceCheck Timeout"
    except Exception as e:
        return [], str(e)

def extract_metadata(image_path):
    """Extrae metadatos EXIF de la imagen."""
    meta = {}
    try:
        img = Image.open(image_path)
        exif = img._getexif()
        if exif:
            for tag, value in exif.items():
                decoded = TAGS.get(tag, tag)
                if isinstance(value, bytes):
                    continue
                meta[decoded] = value
    except:
        pass
    return meta

def compute_phash(image_path):
    """Computa el perceptual hash de la imagen para detectar copias modificadas."""
    if not HAS_IMAGEHASH:
        return None
    try:
        img_pil = Image.open(image_path)
        return str(imagehash.phash(img_pil))
    except:
        return None

def generate_dorks(name=None, username=None):
    """Genera Google Dorks basados en el nombre o usuario."""
    dorks = []
    query = username if username else name if name else "person"
    
    platforms = [
        {"name": "OnlyFans", "site": "onlyfans.com"},
        {"name": "Instagram", "site": "instagram.com"},
        {"name": "Facebook", "site": "facebook.com"},
        {"name": "Twitter/X", "site": "twitter.com"},
        {"name": "LinkedIn", "site": "linkedin.com"},
        {"name": "Escort Sites", "site": "leolist.cc OR skokka.com OR eros.com"},
    ]
    
    for p in platforms:
        dorks.append({
            "title": f"Search on {p['name']}",
            "url": f"https://www.google.com/search?q=site:{p['site']} \"{query}\"",
            "group": "OSINT Search"
        })
    
    # Dorks de imágenes
    dorks.append({
        "title": "Google Image Search (Advanced)",
        "url": f"https://www.google.com/search?q=\"{query}\" image content:face",
        "group": "OSINT Search"
    })
    
    return dorks

def scan_face(image_path, username=None):
    """
    Función principal de escaneo. 
    Retorna un dict con match, distancia, atributos o info de búsqueda web.
    """
    img = cv2.imread(image_path)
    if img is None:
        return {"ok": False, "error": "No se pudo leer la imagen"}

    # 1. Detectar y extraer con InsightFace
    faces = insight_app.get(img)
    
    emb = None
    attributes = {}
    
    if faces:
        face = faces[0]
        emb = face.embedding
        gender_val = getattr(face, 'gender', None)
        age_val = getattr(face, 'age', None)
        
        attributes = {
            "age": int(age_val) if age_val is not None else None,
            "gender": "M" if gender_val == 1 else "F" if gender_val == 0 else "N/A"
        }
        
        # Crop face for Yandex Cloud Search
        try:
            bbox = face.bbox.astype(int)
            x1, y1, x2, y2 = bbox
            x1, y1 = max(0, x1), max(0, y1)
            y2, x2 = min(img.shape[0], y2), min(img.shape[1], x2)
            face_img = img[y1:y2, x1:x2]
            _, buffer = cv2.imencode('.jpg', face_img)
            face_crop_bytes = buffer.tobytes()
        except:
            face_crop_bytes = None
    else:
        # 2. Fallback a DeepFace / ArcFace si falla detección inicial
        print("InsightFace no detectó nada. Usando DeepFace (ArcFace)...")
        try:
            from deepface import DeepFace
            objs = DeepFace.represent(img_path=image_path, model_name="ArcFace", enforce_detection=False)
            if objs:
                emb = objs[0]["embedding"]
                # Intentar atributos con DeepFace si InsightFace falló por completo
                attrs = DeepFace.analyze(img_path=image_path, actions=['age', 'gender', 'emotion'], enforce_detection=False)
                attr_obj = attrs[0] if isinstance(attrs, list) else attrs
                attributes = {
                    "age": attr_obj.get("age"),
                    "gender": attr_obj.get("dominant_gender"),
                    "emotion": attr_obj.get("dominant_emotion")
                }
        except Exception as e:
            return {"ok": False, "error": f"Fallo en extracción fallback: {str(e)}"}

    if emb is None:
        return {"ok": False, "error": "No se encontró cara en la imagen"}

    # 3. Búsqueda local
    result = search_local(emb)
    
    cloud_results = []
    api_error = None
    if not result["match"]:
        # USAR EL RECORTE DE LA CARA para la búsqueda en la nube
        cloud_data, api_error = yandex_cloud_search(image_path, face_crop_bytes=face_crop_bytes)
        if cloud_data:
            # 1. Extraer resultados de IMAGE_COPY_SEARCH de Yandex
            for res in cloud_data.get("results", []):
                for ann in res.get("results", []):
                    if "imageCopySearch" in ann:
                        copies = ann["imageCopySearch"].get("copyImageResults", [])
                        for copy in copies[:5]: 
                            cloud_results.append({
                                "url": copy.get("imageUrl"),
                                "page_url": copy.get("pageUrl"),
                                "title": "Búsqueda en la nube (Yandex)",
                                "group": "Visual Match"
                            })
                    if "faceDetection" in ann:
                        faces_found = ann["faceDetection"].get("faces", [])
                        if faces_found:
                            y_attr = faces_found[0].get("attributes", {})
                            if y_attr:
                                attributes["cloud_gender"] = y_attr.get("gender", {}).get("value")
                                attributes["cloud_age"] = y_attr.get("age", {}).get("value")

        # NUEVO: Búsqueda en FaceCheck.id para obtener FOTOS REALES
        fc_items, fc_error = facecheck_search(image_path)
        if fc_items:
            for item in fc_items:
                cloud_results.append({
                    "url": item.get("base64"), # Miniatura en base64
                    "page_url": item.get("url"),
                    "title": "FaceCheck.id Match",
                    "score": item.get("score", 0),
                    "group": "Identity Match"
                })
        elif fc_error:
            api_error = f"{api_error} | FC: {fc_error}" if api_error else f"FC: {fc_error}"

    # 4. OSINT & Metadata
    file_metadata = extract_metadata(image_path)
    osint_links = generate_dorks(name=result.get("metadata", {}).get("nombre"), username=username)
    phash_val = compute_phash(image_path)

    final_response = {
        "ok": True,
        "local_match": result["match"],
        "attributes": attributes,
        "cloud_results": cloud_results,
        "osint_results": osint_links,
        "file_metadata": file_metadata,
        "phash": phash_val,
        "api_debug": api_error if api_error else "Yandex Vision OK"
    }

    if result["match"]:
        final_response.update({
            "name": result["metadata"].get("nombre", "Desconocido"),
            "distance": result["distance"],
            "url": result["metadata"].get("url", "N/A")
        })
    else:
        final_response["message"] = "No se encontró match local."
        if cloud_results:
            final_response["message"] = "Se encontraron coincidencias en la nube."
        
        final_response["web_search_url"] = get_yandex_url(image_path)

    return final_response

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python scanner.py <ruta_imagen>")
        sys.exit(1)
    
    target = sys.argv[1]
    if not os.path.exists(target):
        print(f"Error: El archivo {target} no existe.")
        sys.exit(1)
        
    res = scan_face(target)
    print("\n--- RESULTADO DEL ESCANEO ---")
    import json
    print(json.dumps(res, indent=4))
