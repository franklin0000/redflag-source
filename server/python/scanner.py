import cv2
import numpy as np
import faiss
import pickle
import requests
import webbrowser
import os
import sys
from insightface.app import FaceAnalysis
from deepface import DeepFace

# Configuración de modelos y archivos
INDEX_FILE = 'face_index.faiss'
METADATA_FILE = 'metadata.pkl'
THRESHOLD = 0.35

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

def scan_face(image_path):
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
        # InsightFace Buffalo_L extrae género y edad por defecto
        # gender: 0=F, 1=M (usualmente) -> InsightFace usa [0, 1] o [1, 0]
        # Pero InsightFace 0.7+ suele tener .gender y .age
        gender_val = getattr(face, 'gender', None) # 0 for Female, 1 for Male
        age_val = getattr(face, 'age', None)
        
        attributes = {
            "age": int(age_val) if age_val is not None else None,
            "gender": "M" if gender_val == 1 else "F" if gender_val == 0 else "N/A"
        }
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
    
    final_response = {
        "ok": True,
        "local_match": result["match"],
        "attributes": attributes
    }

    if result["match"]:
        final_response.update({
            "name": result["metadata"].get("nombre", "Desconocido"),
            "distance": result["distance"],
            "url": result["metadata"].get("url", "N/A")
        })
    else:
        final_response["message"] = "No se encontró match local. Iniciando búsqueda web..."
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
