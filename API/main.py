from fastapi import FastAPI, File, UploadFile, HTTPException, Body
return {"objects": objects, "hints": hints}
except Exception as e:
raise HTTPException(status_code=400, detail=f"Error analizando imagen: {e}")


# 2) Texto → Audio (wav). Útil si la app RN decide convertir por separado
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


# 3) Imagen → Texto+Audio (respuesta mixta):
@app.post("/v1/analyze-and-tts")
async def analyze_and_tts(file: UploadFile = File(...)):
content = await file.read()
img_np = load_image_to_numpy(content)
objects = run_object_detection(img_np)
hints = generate_navigation_hints(objects, img_np.shape)
# Generamos una frase compacta para lectura
spoken = "; ".join(hints)
audio_bytes = tts_generate_audio_bytes(spoken)
# Devolvemos multipart-like en JSON + binario por streaming no es trivial;
# Para móvil es práctico hacer 2 llamadas o este endpoint que retorna audio
# y añade metadatos en headers JSON.
headers = {"X-Metadata": str({"hints": hints})}
return StreamingResponse(io.BytesIO(audio_bytes), media_type="audio/wav", headers=headers)