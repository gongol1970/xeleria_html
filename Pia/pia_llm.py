from __future__ import annotations

import json
import base64
from typing import Any, Dict, Mapping


class PiaModelUnavailable(RuntimeError):
    pass


_DISCOVERY_SCHEMA = {
    "type": "object",
    "properties": {
        "stage": {"type": "string", "enum": ["discovery"]},
        "detected": {"type": "boolean"},
        "primary_sku": {"type": ["string", "null"]},
        "skill_id": {"type": ["string", "null"]},
        "confidence": {"type": "number"},
        "matched_title_terms": {"type": "array", "items": {"type": "string"}},
        "matched_tags": {"type": "array", "items": {"type": "string"}},
        "candidate_skus": {"type": "array", "items": {"type": "string"}},
        "missing_signal": {"type": "string"},
        "reply": {"type": "string"},
    },
    "required": [
        "stage", "detected", "primary_sku", "skill_id", "confidence",
        "matched_title_terms", "matched_tags", "candidate_skus", "missing_signal", "reply",
    ],
    "additionalProperties": False,
}

_INTERPRETATION_SCHEMA = {
    "type": "object",
    "properties": {
        "standalone_query": {"type": "string"},
        "intent": {"type": "string"},
        "continues_previous_subject": {"type": "boolean"},
        "switches_product": {"type": "boolean"},
    },
    "required": [
        "standalone_query", "intent", "continues_previous_subject", "switches_product",
    ],
    "additionalProperties": False,
}

_SALES_SCHEMA = {
    "type": "object",
    "properties": {
        "stage": {"type": "string", "enum": ["sales"]},
        "product_switch_suspected": {"type": "boolean"},
        "reply": {"type": "string"},
        "used_skill_ids": {"type": "array", "items": {"type": "string"}},
        "used_facts": {"type": "array", "items": {"type": "string"}},
        "next_step": {"type": "string"},
    },
    "required": [
        "stage", "product_switch_suspected", "reply", "used_skill_ids",
        "used_facts", "next_step",
    ],
    "additionalProperties": False,
}

_IMAGE_DESCRIPTION_SCHEMA = {
    "type": "object",
    "properties": {
        "description": {"type": "string"},
        "visible_text": {"type": "string"},
    },
    "required": ["description", "visible_text"],
    "additionalProperties": False,
}

_IMAGE_COMPARISON_SCHEMA = {
    "type": "object",
    "properties": {
        "primary_sku": {"type": ["string", "null"]},
        "confidence": {"type": "number"},
        "candidates": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"sku": {"type": "string"}, "score": {"type": "number"}},
                "required": ["sku", "score"],
                "additionalProperties": False,
            },
        },
        "notes": {"type": "string"},
    },
    "required": ["primary_sku", "confidence", "candidates", "notes"],
    "additionalProperties": False,
}

_CORRECTION_SCHEMA = {
    "type": "object",
    "properties": {
        "action": {"type": "string", "enum": ["add", "replace"]},
        "replace_position": {"type": ["integer", "null"]},
        "instruction": {"type": "string"},
    },
    "required": ["action", "replace_position", "instruction"],
    "additionalProperties": False,
}


class PiaOpenAI:
    def __init__(
        self,
        api_key: str,
        model: str = "gpt-4.1-mini",
        reasoning_effort: str = "",
        timeout_seconds: float = 30,
        transcription_model: str = "gpt-4o-mini-transcribe",
        vision_model: str = "",
    ):
        self.api_key = str(api_key or "").strip()
        self.model = str(model or "gpt-4.1-mini").strip()
        self.reasoning_effort = str(reasoning_effort or "").strip().lower()
        if self.reasoning_effort not in {"", "none", "minimal", "low", "medium", "high", "xhigh"}:
            raise ValueError("PIA_REASONING_EFFORT invalido")
        self.timeout_seconds = max(5.0, float(timeout_seconds))
        self.transcription_model = str(transcription_model or "gpt-4o-mini-transcribe").strip()
        self.vision_model = str(vision_model or self.model).strip()

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    def _generation_options(self, model: str, temperature: float) -> Dict[str, Any]:
        if self.reasoning_effort and str(model or "").lower().startswith("gpt-5"):
            return {"reasoning_effort": self.reasoning_effort}
        return {"temperature": temperature}

    def complete(self, prompt: str, stage: str) -> Dict[str, Any]:
        if not self.available:
            raise PiaModelUnavailable("OPENAI_API_KEY no configurada para Pia")
        try:
            from openai import OpenAI
        except Exception as exc:
            raise PiaModelUnavailable(f"Cliente OpenAI no disponible: {exc}") from exc

        schema = {
            "sales": _SALES_SCHEMA,
            "interpretation": _INTERPRETATION_SCHEMA,
            "correction": _CORRECTION_SCHEMA,
        }.get(stage, _DISCOVERY_SCHEMA)
        client = OpenAI(api_key=self.api_key)
        try:
            response = client.chat.completions.create(
                model=self.model,
                messages=[{"role": "system", "content": prompt}],
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": f"pia_{stage}_result",
                        "strict": True,
                        "schema": schema,
                    },
                },
                timeout=self.timeout_seconds,
                **self._generation_options(self.model, 0.2),
            )
        except Exception as exc:
            raise PiaModelUnavailable(f"OpenAI no pudo responder para Pia: {exc}") from exc
        content = response.choices[0].message.content or "{}"
        try:
            parsed = json.loads(content)
        except Exception as exc:
            raise RuntimeError("OpenAI devolvio una respuesta no estructurada para Pia") from exc
        if not isinstance(parsed, dict):
            raise RuntimeError("OpenAI devolvio un formato invalido para Pia")
        return parsed

    def _client(self) -> Any:
        if not self.available:
            raise PiaModelUnavailable("OPENAI_API_KEY no configurada para Pia")
        try:
            from openai import OpenAI
        except Exception as exc:
            raise PiaModelUnavailable(f"Cliente OpenAI no disponible: {exc}") from exc
        return OpenAI(api_key=self.api_key)

    @staticmethod
    def _image_url(content: bytes) -> str:
        encoded = base64.b64encode(content).decode("ascii")
        return f"data:image/webp;base64,{encoded}"

    def transcribe_audio(self, content: bytes, filename: str, content_type: str) -> str:
        try:
            response = self._client().audio.transcriptions.create(
                model=self.transcription_model,
                file=(filename, content, content_type),
                timeout=self.timeout_seconds,
            )
        except Exception as exc:
            raise PiaModelUnavailable(f"OpenAI no pudo transcribir el audio para Pia: {exc}") from exc
        return str(getattr(response, "text", "") or "").strip()

    def _vision_json(self, content: list[dict[str, Any]], schema: Dict[str, Any], name: str) -> Dict[str, Any]:
        try:
            response = self._client().chat.completions.create(
                model=self.vision_model,
                messages=[{"role": "user", "content": content}],
                response_format={
                    "type": "json_schema",
                    "json_schema": {"name": name, "strict": True, "schema": schema},
                },
                timeout=self.timeout_seconds,
                **self._generation_options(self.vision_model, 0.1),
            )
        except Exception as exc:
            raise PiaModelUnavailable(f"OpenAI no pudo analizar la imagen para Pia: {exc}") from exc
        try:
            parsed = json.loads(response.choices[0].message.content or "{}")
        except Exception as exc:
            raise RuntimeError("OpenAI devolvio una vision no estructurada para Pia") from exc
        if not isinstance(parsed, dict):
            raise RuntimeError("OpenAI devolvio un formato visual invalido para Pia")
        return parsed

    def describe_product_image(self, content: bytes) -> Dict[str, Any]:
        prompt = (
            "Describe solo el producto principal visible para buscarlo en un catalogo de hogar, "
            "muebles, organizacion, pileta y ferreteria. Inclui tipo de objeto, forma, material, "
            "color y rasgos distintivos. Transcribi por separado cualquier marca o texto visible."
        )
        return self._vision_json(
            [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": self._image_url(content), "detail": "low"}},
            ],
            _IMAGE_DESCRIPTION_SCHEMA,
            "pia_image_description",
        )

    def compare_product_images(
        self,
        incoming: bytes,
        candidates: list[Mapping[str, Any]],
    ) -> Dict[str, Any]:
        if not candidates:
            return {"primary_sku": None, "confidence": 0, "candidates": [], "notes": "Sin candidatos"}
        content: list[dict[str, Any]] = [{
            "type": "text",
            "text": (
                "La primera imagen es la enviada por el comprador. Las siguientes son fotos de "
                "catalogo rotuladas con SKU. Compara forma, estructura, material, color y detalles; "
                "elegi solo entre esos SKU. Si no hay coincidencia suficiente, primary_sku debe ser null."
            ),
        }, {"type": "image_url", "image_url": {"url": self._image_url(incoming), "detail": "low"}}]
        for candidate in candidates[:5]:
            content.append({"type": "text", "text": f"Candidato SKU {candidate.get('sku')}: {candidate.get('title') or ''}"})
            content.append({
                "type": "image_url",
                "image_url": {"url": self._image_url(bytes(candidate.get("content") or b"")), "detail": "low"},
            })
        return self._vision_json(content, _IMAGE_COMPARISON_SCHEMA, "pia_image_comparison")
