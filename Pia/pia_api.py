from __future__ import annotations

import os
import secrets
import mimetypes
import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import BackgroundTasks, File, Form, Header, HTTPException, Query, Request, Response, UploadFile
from pydantic import BaseModel, Field

from .pia_engine import PiaEngine
from xeleria_correo import DEFAULT_BASE_URL, XeleriaCorreoClient
from .pia_knowledge import build_knowledge_workbook, parse_knowledge_workbook
from .pia_llm import PiaModelUnavailable, PiaOpenAI
from .pia_media import PiaMediaService, PiaS3Storage
from .pia_meta import PiaMetaClient, PiaMetaError, extract_meta_messages, extract_meta_statuses
from .pia_repository import PiaRepository
from .pia_tn import PiaTiendaNube


PIA_API_VERSION = "0.5.3-complete-catalog"
_MAX_WORKBOOK_BYTES = 15 * 1024 * 1024
_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
_MEDIA_SCHEMA = Path(__file__).resolve().parents[1] / "migrations" / "20260722_pia_media.sql"
_META_SCHEMA = Path(__file__).resolve().parents[1] / "migrations" / "20260722_pia_meta.sql"
_SHIPPING_SETTINGS_SCHEMA = Path(__file__).resolve().parents[1] / "migrations" / "20260723_pia_shipping_settings.sql"
_ORIGIN_POSTAL_SCHEMA = Path(__file__).resolve().parents[1] / "migrations" / "20260723_pia_origin_postal_code.sql"


class ConversationCreateIn(BaseModel):
    display_name: str = Field(default="Cliente", min_length=1, max_length=120)
    channel: str = Field(default="INTERNO", min_length=1, max_length=40)
    external_contact_id: Optional[str] = Field(default=None, max_length=200)
    initial_message: Optional[str] = Field(default=None, max_length=4000)


class CustomerMessageIn(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)
    source: str = Field(default="INTERNAL_TEST", max_length=80)


class HumanMessageIn(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)
    operator: str = Field(default="Gonzalo", min_length=1, max_length=120)


class TakeoverIn(BaseModel):
    operator: str = Field(default="Gonzalo", min_length=1, max_length=120)


class PiaSettingsIn(BaseModel):
    paused: Optional[bool] = None
    shipping_markup_type: Optional[str] = Field(default=None, pattern="^(none|percent|fixed)$")
    shipping_markup_value: Optional[float] = Field(default=None, ge=0, le=10000000)


class KnowledgeCorrectionIn(BaseModel):
    correction: str = Field(..., min_length=1, max_length=5000)
    skill_id: Optional[str] = Field(default=None, max_length=80)
    question_text: Optional[str] = Field(default=None, max_length=4000)
    proposed_answer: Optional[str] = Field(default=None, max_length=4000)


def _configured_token() -> str:
    return os.getenv("PIA_ADMIN_TOKEN", "").strip()


def _authorize(request: Request, x_pia_token: Optional[str]) -> None:
    expected = _configured_token()
    if not expected:
        raise HTTPException(status_code=503, detail="PIA_ADMIN_TOKEN no configurado")
    authorization = str(request.headers.get("authorization") or "").strip()
    bearer = authorization[7:].strip() if authorization.lower().startswith("bearer ") else ""
    supplied = str(x_pia_token or bearer or "").strip()
    if not supplied or not secrets.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Acceso privado de Pia invalido")


@lru_cache(maxsize=1)
def _repository() -> PiaRepository:
    repository = PiaRepository(os.getenv("PIA_DATABASE_URL", ""))
    repository.apply_schema(_MEDIA_SCHEMA)
    repository.apply_schema(_META_SCHEMA)
    repository.apply_schema(_SHIPPING_SETTINGS_SCHEMA)
    repository.apply_schema(_ORIGIN_POSTAL_SCHEMA)
    return repository


@lru_cache(maxsize=1)
def _llm() -> PiaOpenAI:
    return PiaOpenAI(
        api_key=os.getenv("OPENAI_API_KEY", ""),
        model=os.getenv("PIA_OPENAI_MODEL", os.getenv("OPENAI_MODEL", "gpt-4.1-mini")),
        reasoning_effort=os.getenv("PIA_REASONING_EFFORT", ""),
        timeout_seconds=float(os.getenv("PIA_OPENAI_TIMEOUT_SECONDS", "30")),
        transcription_model=os.getenv("PIA_TRANSCRIPTION_MODEL", "gpt-4o-mini-transcribe"),
        vision_model=os.getenv("PIA_VISION_MODEL", ""),
    )


@lru_cache(maxsize=1)
def _tn() -> PiaTiendaNube:
    return PiaTiendaNube(
        store_id=(
            os.getenv("PIA_TN_STORE_ID")
            or os.getenv("TN_PRODUCTS_STORE_ID")
            or os.getenv("TN_SYNC_STORE_ID")
            or os.getenv("TN_STORE_ID")
            or os.getenv("TN_USER_ID")
            or ""
        ),
        access_token=(
            os.getenv("PIA_TN_ACCESS_TOKEN")
            or os.getenv("TN_TOKEN")
            or os.getenv("TN_ACCESS_TOKEN")
            or ""
        ),
        timeout_seconds=float(os.getenv("PIA_TN_TIMEOUT_SECONDS", "6")),
    )


@lru_cache(maxsize=1)
def _correo() -> XeleriaCorreoClient:
    return XeleriaCorreoClient(
        username=os.getenv("PIA_CORREO_API_USER") or os.getenv("MICORREO_USER", ""),
        password=os.getenv("PIA_CORREO_API_PASSWORD") or os.getenv("MICORREO_CLAVE", ""),
        customer_id=os.getenv("PIA_CORREO_CUSTOMER_ID") or os.getenv("MICORREO_CUSTOMER_ID", ""),
        origin_postal_code=(
            os.getenv("PIA_CORREO_ORIGIN_POSTAL_CODE")
            or os.getenv("MICORREO_CP_ORIGEN", "")
        ),
        base_url=os.getenv("PIA_CORREO_BASE_URL", DEFAULT_BASE_URL),
        timeout_seconds=float(os.getenv("PIA_CORREO_TIMEOUT_SECONDS", "12")),
        account_email=os.getenv("PIA_CORREO_ACCOUNT_EMAIL") or os.getenv("MICORREO_EMAIL", ""),
        account_password=(
            os.getenv("PIA_CORREO_ACCOUNT_PASSWORD")
            or os.getenv("MICORREO_PASSWORD", "")
        ),
    )


@lru_cache(maxsize=1)
def _storage() -> PiaS3Storage:
    return PiaS3Storage(
        bucket=os.getenv("PIA_S3_BUCKET", ""),
        region=os.getenv("PIA_S3_REGION", os.getenv("AWS_REGION", "us-east-2")),
        catalog_prefix=os.getenv("PIA_S3_CATALOG_PREFIX", "pia/catalogo"),
        attachments_prefix=os.getenv("PIA_S3_ATTACHMENTS_PREFIX", "pia/adjuntos"),
        signed_url_seconds=int(os.getenv("PIA_S3_SIGNED_URL_SECONDS", "3600")),
    )


@lru_cache(maxsize=1)
def _media() -> PiaMediaService:
    return PiaMediaService(_repository(), _llm(), _tn(), _storage())


@lru_cache(maxsize=1)
def _meta() -> PiaMetaClient:
    return PiaMetaClient(
        access_token=os.getenv("PIA_META_ACCESS_TOKEN", ""),
        phone_number_id=os.getenv("PIA_META_PHONE_NUMBER_ID", ""),
        verify_token=os.getenv("PIA_META_VERIFY_TOKEN", ""),
        app_secret=os.getenv("PIA_META_APP_SECRET", ""),
        graph_version=os.getenv("PIA_META_GRAPH_VERSION", "v25.0"),
    )


@lru_cache(maxsize=1)
def _engine() -> PiaEngine:
    return PiaEngine(_repository(), _llm(), _tn(), _correo())


def _conversation_detail(conversation_id: str) -> Optional[Dict[str, Any]]:
    item = _repository().conversation_detail(conversation_id)
    return _media().decorate_conversation(item)


def _not_found() -> HTTPException:
    return HTTPException(status_code=404, detail="Conversacion inexistente")


def install_pia_routes(router: Any) -> None:
    def auth(request: Request, x_pia_token: Optional[str]) -> None:
        _authorize(request, x_pia_token)

    def process_incoming(
        conversation: Dict[str, Any],
        incoming: Dict[str, Any],
        transport: str = "internal",
    ) -> Dict[str, Any]:
        repository = _repository()
        conversation_id = str(conversation.get("id") or "")
        settings = repository.settings()
        if conversation.get("status") == "HUMAN" or settings.get("bot_paused"):
            return {
                "ok": True,
                "incoming": incoming,
                "bot_reply": None,
                "skipped": "human" if conversation.get("status") == "HUMAN" else "paused",
                "conversation": _conversation_detail(conversation_id),
            }
        try:
            result = _engine().process_incoming(conversation_id, incoming)
        except PiaModelUnavailable as exc:
            return {
                "ok": False,
                "incoming": incoming,
                "bot_reply": None,
                "error": str(exc),
                "conversation": _conversation_detail(conversation_id),
            }
        delivery: Dict[str, Any] = {}
        send_error = ""
        if transport == "meta":
            try:
                delivery = _meta().send_text(
                    str(conversation.get("external_contact_id") or ""),
                    result["reply"],
                )
            except PiaMetaError as exc:
                send_error = str(exc)
        reply = repository.add_message(
            conversation_id,
            "BOT",
            result["reply"],
            raw={
                "source": "pia",
                "transport": transport,
                "skill_id": (result.get("analysis") or {}).get("skill_id"),
                "active_skills": (result.get("analysis") or {}).get("active_skills") or ["GENERAL"],
                "primary_sku": (result.get("analysis") or {}).get("primary_sku"),
                "meta_response": delivery.get("response"),
                "send_error": send_error or None,
            },
            external_message_id=delivery.get("external_id"),
            delivery_status="failed" if send_error else delivery.get("status"),
        )
        return {
            "ok": not send_error,
            "incoming": incoming,
            "bot_reply": reply,
            "analysis": result.get("analysis"),
            "send_error": send_error or None,
            "conversation": _conversation_detail(conversation_id),
        }

    def process_meta_event(external_id: str) -> None:
        repository = _repository()
        event = repository.claim_meta_event(external_id)
        if not event:
            return
        message = dict(event.get("payload") or {})
        try:
            conversation = repository.conversation_for_channel(
                "WHATSAPP",
                str(message.get("from") or ""),
                str(message.get("display_name") or "Cliente"),
            )
            conversation_id = str(conversation.get("id") or "")
            kind = str(message.get("type") or "").lower()
            raw = {
                "source": "WHATSAPP",
                "transport": "meta",
                "meta_type": kind,
                "meta_timestamp": message.get("timestamp"),
                "meta_raw": message.get("raw") or {},
            }
            if kind == "image" and message.get("media_id"):
                media = _meta().download_media(str(message.get("media_id")))
                incoming = _media().create_incoming_attachment(
                    conversation_id=conversation_id,
                    filename=str(message.get("filename") or media.get("filename") or "imagen-meta"),
                    content_type=str(media.get("content_type") or "image/jpeg"),
                    content=bytes(media.get("content") or b""),
                    caption=str(message.get("text") or ""),
                    raw_context=raw,
                    external_message_id=external_id,
                )
            elif kind == "audio":
                repository.add_message(
                    conversation_id,
                    "IN",
                    "Audio recibido: pendiente de revision humana",
                    raw={**raw, "audio_supported": False},
                    external_message_id=external_id,
                    delivery_status="received",
                )
                repository.set_status(conversation_id, "HUMAN", "Gonzalo")
                repository.add_message(
                    conversation_id,
                    "SYSTEM",
                    "Pia no procesa audios de Meta; conversacion derivada para revision",
                    raw={"source": "pia", "transport": "internal"},
                )
                repository.finish_meta_event(external_id)
                return
            elif kind in {"text", "button", "interactive"} and str(message.get("text") or "").strip():
                incoming = repository.add_message(
                    conversation_id,
                    "IN",
                    str(message.get("text") or "").strip(),
                    raw=raw,
                    external_message_id=external_id,
                    delivery_status="received",
                )
            else:
                repository.add_message(
                    conversation_id,
                    "IN",
                    f"Mensaje {kind or 'no compatible'} recibido: pendiente de revision humana",
                    raw={**raw, "supported": False},
                    external_message_id=external_id,
                    delivery_status="received",
                )
                repository.set_status(conversation_id, "HUMAN", "Gonzalo")
                repository.finish_meta_event(external_id)
                return
            process_incoming(conversation, incoming, transport="meta")
            repository.finish_meta_event(external_id)
        except Exception as exc:
            repository.finish_meta_event(external_id, str(exc))

    def receive_customer_message(conversation_id: str, body: CustomerMessageIn) -> Dict[str, Any]:
        repository = _repository()
        conversation = repository.conversation(conversation_id)
        if not conversation:
            raise _not_found()
        incoming = repository.add_message(
            conversation_id,
            "IN",
            body.body,
            raw={"source": body.source, "transport": "internal"},
        )
        return process_incoming(conversation, incoming)

    @router.get("/pia/meta/webhook")
    def pia_meta_webhook_verify(request: Request):
        challenge = _meta().challenge(
            str(request.query_params.get("hub.mode") or ""),
            str(request.query_params.get("hub.verify_token") or ""),
            str(request.query_params.get("hub.challenge") or ""),
        )
        if challenge is None:
            raise HTTPException(status_code=403, detail="Verificacion de Meta invalida")
        return Response(content=challenge, media_type="text/plain")

    @router.post("/pia/meta/webhook")
    async def pia_meta_webhook_receive(request: Request, background_tasks: BackgroundTasks):
        raw_body = await request.body()
        if not _meta().verify_signature(
            raw_body,
            str(request.headers.get("x-hub-signature-256") or ""),
        ):
            raise HTTPException(status_code=403, detail="Firma de Meta invalida")
        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except Exception as exc:
            raise HTTPException(status_code=400, detail="Payload de Meta invalido") from exc
        if not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail="Payload de Meta invalido")

        repository = _repository()
        statuses = extract_meta_statuses(payload)
        for status in statuses:
            repository.update_message_delivery(
                str(status.get("external_id") or ""),
                "failed" if status.get("errors") else str(status.get("status") or ""),
                status,
            )

        queued = 0
        duplicates = 0
        for message in extract_meta_messages(payload):
            external_id = str(message.get("external_id") or "")
            if repository.enqueue_meta_event(external_id, str(message.get("type") or "message"), message):
                background_tasks.add_task(process_meta_event, external_id)
                queued += 1
            else:
                duplicates += 1
        return {
            "ok": True,
            "queued": queued,
            "duplicates": duplicates,
            "statuses": len(statuses),
        }

    @router.get("/pia/health")
    def pia_health(
        request: Request,
        x_pia_token: Optional[str] = Header(default=None),
    ):
        auth(request, x_pia_token)
        database = _repository().health()
        status = _repository().knowledge_status()
        settings = _repository().settings()
        return {
            "ok": True,
            "version": PIA_API_VERSION,
            "database": database.get("database"),
            "knowledge": status,
            "settings": settings,
            "meta_enabled": _meta().configured,
            "meta": _meta().status(),
            "media": _media().status(),
            "correo_argentino": _correo().status(),
        }

    @router.get("/pia/conversations")
    def pia_conversations(
        request: Request,
        q: str = Query(default="", max_length=120),
        state: str = Query(default="all", pattern="^(all|attention|identified)$"),
        limit: int = Query(default=100, ge=1, le=200),
        x_pia_token: Optional[str] = Header(default=None),
    ):
        auth(request, x_pia_token)
        items = _repository().list_conversations(q, state, limit)
        return {"ok": True, "items": items, "total": len(items), "version": PIA_API_VERSION}

    @router.post("/pia/conversations")
    def pia_conversation_create(
        body: ConversationCreateIn,
        request: Request,
        x_pia_token: Optional[str] = Header(default=None),
    ):
        auth(request, x_pia_token)
        conversation = _repository().create_conversation(
            body.display_name, body.channel, body.external_contact_id,
        )
        if body.initial_message and body.initial_message.strip():
            result = receive_customer_message(
                str(conversation["id"]),
                CustomerMessageIn(body=body.initial_message, source="INTERNAL_TEST"),
            )
            return {**result, "created": True}
        return {"ok": True, "created": True, "conversation": conversation}

    @router.get("/pia/conversations/{conversation_id}")
    def pia_conversation_detail(
        conversation_id: str,
        request: Request,
        x_pia_token: Optional[str] = Header(default=None),
    ):
        auth(request, x_pia_token)
        item = _conversation_detail(conversation_id)
        if not item:
            raise _not_found()
        return {"ok": True, "item": item, "version": PIA_API_VERSION}

    @router.delete("/pia/conversations/{conversation_id}")
    def pia_conversation_delete(
        conversation_id: str,
        request: Request,
        x_pia_token: Optional[str] = Header(default=None),
    ):
        auth(request, x_pia_token)
        repository = _repository()
        if not repository.conversation(conversation_id):
            raise _not_found()
        keys = repository.attachment_keys(conversation_id)
        if keys:
            try:
                _storage().delete_many(keys)
            except Exception as exc:
                raise HTTPException(status_code=503, detail=f"No se pudieron borrar los adjuntos: {exc}") from exc
        repository.delete_conversation(conversation_id)
        return {"ok": True, "deleted": conversation_id}

    @router.post("/pia/conversations/{conversation_id}/customer-messages")
    def pia_customer_message(
        conversation_id: str,
        body: CustomerMessageIn,
        request: Request,
        x_pia_token: Optional[str] = Header(default=None),
    ):
        auth(request, x_pia_token)
        return receive_customer_message(conversation_id, body)

    @router.post("/pia/conversations/{conversation_id}/attachments")
    async def pia_customer_attachment(
        conversation_id: str,
        request: Request,
        file: UploadFile = File(...),
        caption: str = Form(default="", max_length=4000),
        x_pia_token: Optional[str] = Header(default=None),
    ):
        auth(request, x_pia_token)
        conversation = _repository().conversation(conversation_id)
        if not conversation:
            raise _not_found()
        try:
            content = await file.read(_MAX_ATTACHMENT_BYTES + 1)
        finally:
            await file.close()
        if not content:
            raise HTTPException(status_code=400, detail="El adjunto esta vacio")
        if len(content) > _MAX_ATTACHMENT_BYTES:
            raise HTTPException(status_code=413, detail="El adjunto supera 25 MB")
        content_type = str(file.content_type or mimetypes.guess_type(file.filename or "")[0] or "")
        try:
            incoming = _media().create_incoming_attachment(
                conversation_id=conversation_id,
                filename=str(file.filename or "adjunto"),
                content_type=content_type,
                content=content,
                caption=caption,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except PiaModelUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"No se pudo procesar el adjunto: {exc}") from exc
        return process_incoming(conversation, incoming)

    @router.post("/pia/catalog-media/refresh")
    def pia_catalog_media_refresh(
        request: Request,
        limit: int = Query(default=500, ge=1, le=2000),
        force: bool = Query(default=False),
        x_pia_token: Optional[str] = Header(default=None),
    ):
        auth(request, x_pia_token)
        try:
            return {**_media().refresh_catalog(limit=limit, force=force), "version": PIA_API_VERSION}
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"No se pudo actualizar el catalogo visual: {exc}") from exc

    @router.post("/pia/conversations/{conversation_id}/human-messages")
    def pia_human_message(
        conversation_id: str,
        body: HumanMessageIn,
        request: Request,
        x_pia_token: Optional[str] = Header(default=None),
    ):
        auth(request, x_pia_token)
        conversation = _repository().conversation(conversation_id)
        if not conversation:
            raise _not_found()
        if conversation.get("status") != "HUMAN":
            raise HTTPException(status_code=409, detail="Primero toma la conversacion")
        delivery: Dict[str, Any] = {}
        if str(conversation.get("channel") or "").upper() == "WHATSAPP":
            try:
                delivery = _meta().send_text(
                    str(conversation.get("external_contact_id") or ""),
                    body.body,
                )
            except PiaMetaError as exc:
                _repository().add_message(
                    conversation_id,
                    "HUMAN",
                    body.body,
                    raw={"operator": body.operator, "transport": "meta", "send_error": str(exc)},
                    delivery_status="failed",
                )
                raise HTTPException(status_code=502, detail=str(exc)) from exc
        message = _repository().add_message(
            conversation_id, "HUMAN", body.body,
            raw={
                "operator": body.operator,
                "transport": "meta" if delivery else "internal",
                "meta_response": delivery.get("response"),
            },
            external_message_id=delivery.get("external_id"),
            delivery_status=delivery.get("status"),
        )
        return {"ok": True, "message": message, "conversation": _conversation_detail(conversation_id)}

    @router.post("/pia/conversations/{conversation_id}/takeover")
    def pia_takeover(
        conversation_id: str,
        body: TakeoverIn,
        request: Request,
        x_pia_token: Optional[str] = Header(default=None),
    ):
        auth(request, x_pia_token)
        item = _repository().set_status(conversation_id, "HUMAN", body.operator)
        if not item:
            raise _not_found()
        _repository().add_message(conversation_id, "SYSTEM", f"Conversacion tomada por {body.operator}")
        return {"ok": True, "conversation": item}

    @router.post("/pia/conversations/{conversation_id}/release")
    def pia_release(
        conversation_id: str,
        request: Request,
        x_pia_token: Optional[str] = Header(default=None),
    ):
        auth(request, x_pia_token)
        item = _repository().set_status(conversation_id, "BOT", None)
        if not item:
            raise _not_found()
        _repository().add_message(conversation_id, "SYSTEM", "Conversacion liberada al bot")
        return {"ok": True, "conversation": item}

    @router.get("/pia/settings")
    def pia_settings_get(
        request: Request,
        x_pia_token: Optional[str] = Header(default=None),
    ):
        auth(request, x_pia_token)
        return {"ok": True, "settings": _repository().settings()}

    @router.put("/pia/settings")
    def pia_settings_put(
        body: PiaSettingsIn,
        request: Request,
        x_pia_token: Optional[str] = Header(default=None),
    ):
        auth(request, x_pia_token)
        current = _repository().settings()
        return {
            "ok": True,
            "settings": _repository().update_settings(
                paused=body.paused if body.paused is not None else bool(current.get("bot_paused")),
                shipping_markup_type=body.shipping_markup_type or current.get("shipping_markup_type") or "none",
                shipping_markup_value=(
                    body.shipping_markup_value
                    if body.shipping_markup_value is not None
                    else current.get("shipping_markup_value") or 0
                ),
            ),
        }

    @router.post("/pia/conversations/{conversation_id}/knowledge/{target}")
    def pia_knowledge_correction(
        conversation_id: str,
        target: str,
        body: KnowledgeCorrectionIn,
        request: Request,
        x_pia_token: Optional[str] = Header(default=None),
    ):
        auth(request, x_pia_token)
        detail = _conversation_detail(conversation_id)
        if not detail:
            raise _not_found()
        clean_target = str(target or "").strip().lower()
        if clean_target not in {"general", "skill"}:
            raise HTTPException(status_code=400, detail="El destino debe ser general o skill")
        skill_id = "GENERAL" if clean_target == "general" else str(body.skill_id or "").strip().upper()
        if clean_target == "skill":
            active_skills = {
                str(value or "").strip().upper()
                for value in (detail.get("activated_skills") or [])
            }
            if not skill_id or skill_id == "GENERAL":
                raise HTTPException(status_code=400, detail="Elegí el skill de producto que querés corregir")
            if skill_id not in active_skills or not _repository().skill_exists(skill_id):
                raise HTTPException(status_code=409, detail=f"El skill {skill_id} no esta activo en esta conversacion")
        existing = _repository().skill_instruction_records(skill_id)
        prompt = (
            "Converti la correccion humana en UNA regla breve, inequivoca, imperativa y reusable "
            "para la atencion comercial de Pia. No agregues informacion que el humano no haya escrito. "
            "Si corrige o mejora una regla existente, usa action='replace' y su posicion de la lista; "
            "si es conocimiento nuevo, usa action='add' y replace_position=null.\n"
            + json.dumps({
                "target_skill": skill_id,
                "human_correction": body.correction,
                "question": body.question_text,
                "proposed_answer": body.proposed_answer,
                "existing_rules": existing,
            }, ensure_ascii=False)
        )
        try:
            translated = _llm().complete(prompt, "correction")
        except PiaModelUnavailable as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        instruction = str(translated.get("instruction") or "").strip()
        if not instruction:
            raise HTTPException(status_code=502, detail="OpenAI no devolvio una regla para Pia")
        replace_position = (
            translated.get("replace_position")
            if str(translated.get("action") or "").lower() == "replace"
            else None
        )
        saved = _repository().save_skill_instruction(skill_id, instruction, replace_position)
        return {
            "ok": True,
            "skill_id": skill_id,
            "rule": saved,
            "version": PIA_API_VERSION,
        }

    @router.get("/pia/knowledge/status")
    def pia_knowledge_status(
        request: Request,
        x_pia_token: Optional[str] = Header(default=None),
    ):
        auth(request, x_pia_token)
        return {"ok": True, **_repository().knowledge_status()}

    @router.get("/pia/knowledge.xlsx")
    def pia_knowledge_download(
        request: Request,
        x_pia_token: Optional[str] = Header(default=None),
    ):
        auth(request, x_pia_token)
        content = build_knowledge_workbook(_repository().knowledge_workbook())
        return Response(
            content=content,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="conocimiento_Pia.xlsx"'},
        )

    @router.post("/pia/knowledge.xlsx")
    async def pia_knowledge_upload(
        request: Request,
        file: UploadFile = File(...),
        x_pia_token: Optional[str] = Header(default=None),
    ):
        auth(request, x_pia_token)
        if not str(file.filename or "").lower().endswith(".xlsx"):
            raise HTTPException(status_code=400, detail="El archivo debe ser .xlsx")
        try:
            content = await file.read()
        finally:
            await file.close()
        if not content:
            raise HTTPException(status_code=400, detail="El archivo esta vacio")
        if len(content) > _MAX_WORKBOOK_BYTES:
            raise HTTPException(status_code=413, detail="El archivo supera 15 MB")
        parsed = parse_knowledge_workbook(content)
        if not parsed.valid:
            raise HTTPException(status_code=422, detail={"message": "La planilla tiene errores", "errors": parsed.errors})
        result = _repository().replace_knowledge(parsed, str(file.filename or "conocimiento_Pia.xlsx"))
        return {**result, "version": PIA_API_VERSION}
