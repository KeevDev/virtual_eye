import os
import io
import base64
import tempfile
from typing import Dict, Any, List

import numpy as np
import cv2
import httpx
import pyttsx3
from ultralytics import YOLO

from fastapi import FastAPI, File, UploadFile, HTTPException, Body, Request
from fastapi.responses import StreamingResponse, JSONResponse
import json  # 🔹 para formatear metadata en encabezados
from fastapi.middleware.cors import CORSMiddleware


# --------------------------------------------------------------------
# CONFIG
# --------------------------------------------------------------------

CAMERA_URL = "http://10.56.90.145/capture"
app = FastAPI(title="Backend visión + TTS + ESP32-CAM + YOLO")

YOLO_WEIGHTS = "yolov8n.pt"
try:
    yolo_model = YOLO(YOLO_WEIGHTS)
except Exception as e:
    raise RuntimeError(f"No se pudo cargar el modelo YOLO ({YOLO_WEIGHTS}): {e}")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],           # en dev: permitir todos. En prod, pon tu dominio/IP
    allow_credentials=True,
    allow_methods=["*"],           # o ["GET", "POST", "OPTIONS"]
    allow_headers=["*"],           # permitir Content-Type, Authorization, etc.
)

# --------------------------------------------------------------------
# CONFIGURACIÓN DE TTS (pyttsx3)
# --------------------------------------------------------------------

_tts_engine = None  # se inicializa bajo demanda

def get_tts_engine():
    """
    Inicializa pyttsx3 solo cuando se necesita.
    Si falla (por voces/espeak en Docker), lanza NotImplementedError
    y los endpoints responderán 501.
    """
    global _tts_engine
    if _tts_engine is not None:
        return _tts_engine

    try:
        engine = pyttsx3.init()  # usa driver 'espeak' en Linux

        # Intentamos elegir una voz española si existe
        try:
            voices = engine.getProperty("voices")
            for v in voices:
                name = (v.name or "").lower()
                vid = (v.id or "").lower()
                if "spanish" in name or "es" in vid:
                    engine.setProperty("voice", v.id)
                    break
        except Exception:
            # Si falla la selección de voz, seguimos con la default
            pass

        engine.setProperty("rate", 180)
        engine.setProperty("volume", 1.0)
        _tts_engine = engine
        return _tts_engine
    except Exception as e:
        # Aquí cae el error de espeak dentro del contenedor
        raise NotImplementedError(f"TTS no disponible en este entorno: {e}")



# --------------------------------------------------------------------
# HELPERS VISIÓN
# --------------------------------------------------------------------
LABELS_ES = {
    "person": "persona",
    "bicycle": "bicicleta",
    "car": "carro",
    "motorcycle": "motocicleta",
    "airplane": "avión",
    "bus": "bus",
    "train": "tren",
    "truck": "camión",
    "boat": "barco",
    "traffic light": "semáforo",
    "fire hydrant": "hidrante",
    "stop sign": "señal de pare",
    "bench": "banca",
    "bird": "pájaro",
    "cat": "gato",
    "dog": "perro",
    "horse": "caballo",
    "sheep": "oveja",
    "cow": "vaca",
    "elephant": "elefante",
    "bear": "oso",
    "zebra": "cebra",
    "giraffe": "jirafa",
    "backpack": "mochila",
    "umbrella": "paraguas",
    "handbag": "bolso",
    "suitcase": "maleta",
    "frisbee": "frisbee",
    "skis": "esquís",
    "snowboard": "tabla de snowboard",
    "sports ball": "balón",
    "kite": "cometa",
    "baseball bat": "bate de béisbol",
    "baseball glove": "guante de béisbol",
    "skateboard": "patineta",
    "surfboard": "tabla de surf",
    "tennis racket": "raqueta de tenis",
    "bottle": "botella",
    "wine glass": "copa de vino",
    "cup": "taza",
    "fork": "tenedor",
    "knife": "cuchillo",
    "spoon": "cuchara",
    "bowl": "cuenco",
    "banana": "banano",
    "apple": "manzana",
    "sandwich": "sándwich",
    "orange": "naranja",
    "broccoli": "brócoli",
    "carrot": "zanahoria",
    "hot dog": "perro caliente",
    "pizza": "pizza",
    "donut": "donut",
    "cake": "pastel",
    "chair": "silla",
    "couch": "sofá",
    "potted plant": "planta en maceta",
    "bed": "cama",
    "table": "mesa",
    "toilet": "inodoro",
    "tv": "televisor",
    "laptop": "portátil",
    "mouse": "ratón",
    "remote": "control remoto",
    "keyboard": "teclado",
    "cell phone": "celular",
    "microwave": "microondas",
    "oven": "horno",
    "toaster": "tostadora",
    "sink": "lavamanos",
    "refrigerator": "nevera",
    "book": "libro",
    "clock": "reloj",
    "vase": "florero",
    "scissors": "tijeras",
    "teddy bear": "oso de peluche",
    "hair drier": "secador de pelo",
    "toothbrush": "cepillo de dientes",
}

MIN_CONFIDENCE = 0.25        # por debajo de esto, ignoramos la detección
GENERIC_THRESHOLD = 0.55     # por debajo de esto, usamos categoría genérica si existe

ANIMAL_LABELS_ES = {
    "perro", "gato", "caballo", "oveja", "vaca",
    "elefante", "oso", "cebra", "jirafa", "pájaro"
}

VEHICLE_LABELS_ES = {
    "carro", "motocicleta", "bicicleta", "bus",
    "camión", "tren", "barco", "avión"
}

FURNITURE_LABELS_ES = {
    "silla", "sofá", "banca", "cama", "mesa"
}


def load_image_to_numpy(content: bytes) -> np.ndarray:
    arr = np.frombuffer(content, np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("No se pudo decodificar la imagen")
    return img

def run_object_detection(img_np: np.ndarray) -> List[Dict[str, Any]]:
    img_rgb = cv2.cvtColor(img_np, cv2.COLOR_BGR2RGB)
    results = yolo_model.predict(img_rgb, verbose=False)
    if not results:
        return []

    r = results[0]
    objects: List[Dict[str, Any]] = []

    for box in r.boxes:
        cls_id = int(box.cls[0])
        label_en = yolo_model.names.get(cls_id, str(cls_id))
        base_label = LABELS_ES.get(label_en, label_en)  # Traducción al español si existe
        conf = float(box.conf[0])

        # 1) descartamos detecciones muy poco confiables
        if conf < MIN_CONFIDENCE:
            continue

        # 2) definimos categoría
        category = "otro"
        if base_label in ANIMAL_LABELS_ES:
            category = "animal"
        elif base_label in VEHICLE_LABELS_ES:
            category = "vehículo"
        elif base_label in FURNITURE_LABELS_ES:
            category = "mueble"

        # 3) si la confianza es media-baja y tenemos categoría → usamos el nombre genérico
        #    (ej: en vez de “gato” con 0.32 decir “animal”)
        if conf < GENERIC_THRESHOLD and category != "otro":
            final_label = category
        else:
            final_label = base_label

        x1, y1, x2, y2 = map(float, box.xyxy[0])

        objects.append(
            {
                "label": final_label,      # lo que se usa para hablar / hints
                "base_label": base_label,  # etiqueta original en español
                "category": category,      # animal, vehículo, mueble, otro
                "confidence": conf,
                "box": [x1, y1, x2, y2],
            }
        )

    return objects


SPANISH_GENDER = {
    "persona": "una",
    "bicicleta": "una",
    "carro": "un",
    "motocicleta": "una",
    "perro": "un",
    "gato": "un",
    "silla": "una",
    "mesa": "una",
    "televisor": "un",
    "celular": "un",
    "computador": "un",
    "planta en maceta": "una",
    "camión": "un",
    "botella": "una",
    "libro": "un",
}


def generate_navigation_hints(objects: List[Dict[str, Any]], img_shape) -> List[str]:
    h, w = img_shape[0], img_shape[1]
    total_area = float(w * h)
    hints: List[str] = []

    for obj in objects:
        x1, y1, x2, y2 = obj["box"]
        cx = (x1 + x2) / 2.0
        area = max((x2 - x1) * (y2 - y1), 1.0)
        ratio = area / total_area

        # Posición
        if cx < w / 3:
            position = "a tu izquierda"
        elif cx > 2 * w / 3:
            position = "a tu derecha"
        else:
            position = "al frente"

        # Distancia
        if ratio > 0.2:
            distance = "muy cerca"
        elif ratio > 0.05:
            distance = "cerca"
        else:
            distance = "lejos"

        label = obj["label"]
        articulo = SPANISH_GENDER.get(label, "un")

        frase = f"{articulo} {label} está {position} y {distance}"
        hints.append(frase)

    return hints



def analyze_bytes(content: bytes) -> Dict[str, Any]:
    img_np = load_image_to_numpy(content)
    objects = run_object_detection(img_np)
    hints = generate_navigation_hints(objects, img_np.shape)
    spoken = build_spoken_from_objects(objects, img_np.shape)
    return {
        "objects": objects,
        "hints": hints,
        "spoken_text": spoken,
    }


# --------------------------------------------------------------------
# HELPERS PARA HABLA AGRUPADA
# --------------------------------------------------------------------

PLURALS_ES = {
    "persona": "personas",
    "animal": "animales",
    "vehículo": "vehículos",
    "mueble": "muebles",
    "silla": "sillas",
    "mesa": "mesas",
    "carro": "carros",
    "bus": "buses",
    "camión": "camiones",
    "bicicleta": "bicicletas",
    "motocicleta": "motocicletas",
    "perro": "perros",
    "gato": "gatos",
    # agrega aquí si quieres más control fino
}

def plural_es(label: str) -> str:
    if label in PLURALS_ES:
        return PLURALS_ES[label]
    # fallback simple (no perfecto pero suficiente)
    if label.endswith("z"):
        return label[:-1] + "ces"
    return label + "s"


def build_spoken_from_objects(objects: List[Dict[str, Any]], img_shape) -> str:
    """
    Genera una frase hablada agrupando por label:
    - "una silla está..." / "varias sillas están..."
    """
    if not objects:
        return "No se detectaron elementos relevantes frente a ti."

    h, w = img_shape[0], img_shape[1]
    total_area = float(w * h)

    # 1) Agrupamos por label
    from collections import defaultdict
    groups = defaultdict(list)
    for obj in objects:
        groups[obj["label"]].append(obj)

    frases: List[str] = []

    for label, objs in groups.items():
        # promedio de posición y tamaño para el grupo
        cxs = []
        ratios = []
        for o in objs:
            x1, y1, x2, y2 = o["box"]
            cx = (x1 + x2) / 2.0
            area = max((x2 - x1) * (y2 - y1), 1.0)
            ratio = area / total_area
            cxs.append(cx)
            ratios.append(ratio)

        mean_cx = sum(cxs) / len(cxs)
        mean_ratio = sum(ratios) / len(ratios)

        # posición
        if mean_cx < w / 3:
            position = "a tu izquierda"
        elif mean_cx > 2 * w / 3:
            position = "a tu derecha"
        else:
            position = "al frente"

        # distancia
        if mean_ratio > 0.2:
            distance = "muy cerca"
        elif mean_ratio > 0.05:
            distance = "cerca"
        else:
            distance = "lejos"

        count = len(objs)
        articulo = SPANISH_GENDER.get(label, "un")

        if count == 1:
            frase = f"{articulo} {label} está {position} y {distance}"
        else:
            cuantificador = "varias" if articulo == "una" else "varios"
            label_plural = plural_es(label)
            frase = f"{cuantificador} {label_plural} están {position} y {distance}"

        frases.append(frase)

    if len(frases) == 1:
        return f"Frente a ti hay {frases[0]}."
    listado = "; ".join(frases)
    return f"Frente a ti hay: {listado}."


def build_spoken_from_hints(hints: List[str]) -> str:
    if not hints:
        return "No se detectaron elementos relevantes frente a ti."

    if len(hints) == 1:
        return f"Frente a ti hay {hints[0]}."

    listado = "; ".join(hints)
    return f"Frente a ti hay: {listado}."


def decode_base64_image(data: str) -> bytes:
    try:
        if "," in data:
            data = data.split(",", 1)[1]
        return base64.b64decode(data)
    except Exception:
        raise HTTPException(status_code=422, detail="Imagen base64 inválida")


# --------------------------------------------------------------------
# HELPER TTS
# --------------------------------------------------------------------

def tts_generate_audio_bytes(text: str) -> bytes:
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        _tts_engine.save_to_file(text, tmp_path)
        _tts_engine.runAndWait()

        with open(tmp_path, "rb") as f:
            audio = f.read()
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    return audio


# --------------------------------------------------------------------
# HELPER CÁMARA
# --------------------------------------------------------------------

async def fetch_camera_frame() -> bytes:
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(CAMERA_URL, timeout=5.0)

        if resp.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"Error al obtener imagen de la cámara (status={resp.status_code})",
            )

        content_type = resp.headers.get("content-type", "")
        if "jpeg" not in content_type and "jpg" not in content_type:
            raise HTTPException(
                status_code=502,
                detail=f"Contenido inesperado desde la cámara (Content-Type={content_type})",
            )

        return resp.content

    except httpx.RequestError as e:
        raise HTTPException(
            status_code=502,
            detail=f"No se pudo conectar a la cámara: {e}",
        )


# --------------------------------------------------------------------
# ENDPOINTS: UPLOAD / BASE64
# --------------------------------------------------------------------

@app.post("/v1/analyze-image")
async def analyze_image(request: Request):
    """
    Analiza imagen → JSON con objetos, hints y texto hablado sugerido.
    Acepta multipart/form-data desde React Native.
    """
    try:
        # Leer el form data manualmente
        form = await request.form()
        print("📝 Form recibido:", dict(form))
        
        # Buscar el archivo en el form (puede venir como 'file' o con otro nombre)
        file_field = form.get('file')
        
        if file_field is None:
            # Intentar encontrar cualquier campo que sea un archivo
            for key, value in form.items():
                if hasattr(value, 'read'):
                    file_field = value
                    break
        
        if file_field is None:
            raise HTTPException(
                status_code=400,
                detail="No se encontró archivo en el request",
            )
        
        # Leer el contenido del archivo
        content = await file_field.read()
        
        if not content:
            raise HTTPException(
                status_code=400,
                detail="El archivo está vacío",
            )
        analysis = analyze_bytes(content)
        return analysis

        # analysis = analyze_bytes(content)
        # spoken = build_spoken_from_hints(analysis["hints"])

        # return {
        #     "objects": analysis["objects"],
        #     "hints": analysis["hints"],
        #     "spoken_text": spoken,
        # }
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Error: {e}")
        raise HTTPException(status_code=400, detail=f"Error analizando imagen: {e}")
    
@app.post("/v1/analyze-base64")
async def analyze_base64(payload: Dict[str, str] = Body(...)):
    image_b64 = payload.get("image_base64")
    if not image_b64:
        raise HTTPException(status_code=422, detail="Falta 'image_base64'")

    try:
        content = decode_base64_image(image_b64)
        analysis = analyze_bytes(content)
        return analysis

        # analysis = analyze_bytes(content)
        # spoken = build_spoken_from_hints(analysis["hints"])
        # return {"objects": analysis["objects"], "hints": analysis["hints"], "spoken_text": spoken}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error analizando imagen base64: {e}")


@app.post("/v1/tts")
async def tts_endpoint(payload: Dict[str, str] = Body(...)):
    text = payload.get("text", "")
    if not text:
        raise HTTPException(status_code=422, detail="Falta 'text'")

    try:
        audio_bytes = tts_generate_audio_bytes(text)
        return StreamingResponse(io.BytesIO(audio_bytes), media_type="audio/wav")
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))


@app.post("/v1/analyze-and-tts")
async def analyze_and_tts(file: UploadFile = File(...)):
    """
    Subes imagen → analiza → AUDIO (wav) + metadata JSON (objects, hints, spoken_text)
    """
    try:
        content = await file.read()
        analysis = analyze_bytes(content)
        spoken = build_spoken_from_hints(analysis["hints"])
        audio_bytes = tts_generate_audio_bytes(spoken)

        metadata = {
            "objects": analysis["objects"],
            "hints": analysis["hints"],
            "spoken_text": spoken,
        }

        headers = {"X-Metadata": json.dumps(metadata, ensure_ascii=False)}
        return StreamingResponse(io.BytesIO(audio_bytes), media_type="audio/wav", headers=headers)

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error analizando imagen y generando TTS: {e}")


# --------------------------------------------------------------------
# ENDPOINTS: ESP32-CAM
# --------------------------------------------------------------------

@app.get("/cam/frame")
async def cam_frame():
    content = await fetch_camera_frame()
    analysis = analyze_bytes(content)
    spoken = build_spoken_from_hints(analysis["hints"])

    metadata = {
        "objects": analysis["objects"],
        "hints": analysis["hints"],
        "spoken_text": spoken,
    }

    headers = {"X-Metadata": json.dumps(metadata, ensure_ascii=False)}
    return StreamingResponse(io.BytesIO(content), media_type="image/jpeg", headers=headers)


@app.get("/cam/analyze")
async def cam_analyze():
    content = await fetch_camera_frame()
    analysis = analyze_bytes(content)
    spoken = build_spoken_from_hints(analysis["hints"])
    return JSONResponse({"objects": analysis["objects"], "hints": analysis["hints"], "spoken_text": spoken})


@app.get("/cam/analyze-tts")
async def cam_analyze_tts():
    content = await fetch_camera_frame()
    analysis = analyze_bytes(content)
    spoken = build_spoken_from_hints(analysis["hints"])

    try:
        audio_bytes = tts_generate_audio_bytes(spoken)
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))

    metadata = {
        "objects": analysis["objects"],
        "hints": analysis["hints"],
        "spoken_text": spoken,
    }

    headers = {"X-Metadata": json.dumps(metadata, ensure_ascii=False)}
    return StreamingResponse(io.BytesIO(audio_bytes), media_type="audio/wav", headers=headers)
