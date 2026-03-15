import cv2
from insightface.app import FaceAnalysis
from deepface import DeepFace
import numpy as np
import faiss
import pickle
import requests
import webbrowser
from playwright.sync_api import sync_playwright
import json
import os
import time

# Carga modelos (primera vez: ~1GB, espera)
print("Cargando todo... no pares, va profundo.")
insight_app = FaceAnalysis(name='buffalo_l')
insight_app.prepare(ctx_id=-1)

# Base FAISS (para millones de caras)
INDEX_FILE = 'face_index.faiss'
if os.path.exists(INDEX_FILE):
    index = faiss.read_index(INDEX_FILE)
    with open('metadata.pkl', 'rb') as f:
        metadata = pickle.load(f)
else:
    dim = 512  # InsightFace dim
    index = faiss.IndexFlatL2(dim)
    metadata = []

def add_to_base(emb, meta):
    index.add(np.array([emb]))
    metadata.append(meta)
    faiss.write_index(index, INDEX_FILE)
    with open('metadata.pkl', 'wb') as f:
        pickle.dump(metadata, f)

def search_in_base(emb):
    if index.ntotal == 0:
        return None
    D, I = index.search(np.array([emb]), 5)  # top 5
    matches = []
    for dist, idx in zip(D[0], I[0]):
        if dist < 0.35:  # umbral hardcore
            matches.append((metadata[idx], dist))
    return matches

# Función profunda: scrapea Yandex + Bing + Adult
def deep_web_search(img_path):
    print("Entrando en modo profundo...")
   
    # Yandex (más NSFW)
    yandex_url = "https://yandex.com/images/search"
    with open(img_path, 'rb') as f:
        files = {'upfile': f}
        resp = requests.post(yandex_url, files=files, data={'rpt': 'imageview'})
    if resp.status_code == 200:
        full_url = resp.url + "&text=onlyfans+porn+escort+nsfw"
        webbrowser.open(full_url)
   
    # Bing (menos censura)
    bing_url = "https://www.bing.com/images/visualsearch?q=face&cbir=face&form=IRSBIH"
    webbrowser.open(bing_url)
   
    # Playwright para sitios bloqueados (ej: Pornhub preview)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("https://www.google.com/search?q=reverse+image+nsfw")
        # Simula subida (manual por ahora, pero puedes automatizar)
        print("Busca manual en Pornhub/OnlyFans con los resultados.")

# Uso completo
def scan_profundo(image_path):
    img = cv2.imread(image_path)
    if img is None:
        print("No se pudo leer la imagen.")
        return
        
    faces = insight_app.get(img)
   
    if not faces:
        print("No cara. Fallback DeepFace...")
        emb = DeepFace.represent(img, model_name="ArcFace")[0]["embedding"]
    else:
        emb = faces[0].embedding
   
    # Busca local
    matches = search_in_base(emb)
    if matches:
        for meta, dist in matches:
            nombre = meta.get('nombre', 'Desconocido')
            print(f"¡Match! {nombre} - Dist: {dist:.3f}")
            print(f"Edad: {meta.get('edad', 'N/A')}, Emoción: {meta.get('emocion', 'N/A')}")
            print(f"Link: {meta.get('url', 'N/A')}")
   
    # Si no, web profunda
    else:
        print("No en base. Lanzando búsqueda profunda...")
        deep_web_search(image_path)
   
    # Extra: atributos DeepFace
    try:
        attrs = DeepFace.analyze(img, actions=['age', 'gender', 'race', 'emotion'])
        print("Atributos:", attrs)
    except Exception as e:
        print("Atributos fallaron:", e)

# Ejecuta
if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        scan_profundo(sys.argv[1])
    else:
        print("Usa: python deep_scanner.py tu_foto.jpg")
