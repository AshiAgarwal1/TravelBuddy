from fastapi import APIRouter
from ..schemas import TranslateRequest
from ..services import translate

router = APIRouter(prefix="/api")


@router.post("/translate")
async def do_translate(req: TranslateRequest):
    text = await translate.translate(req.text, req.source, req.target)
    return {"text": text, "provider": "MyMemory"}
