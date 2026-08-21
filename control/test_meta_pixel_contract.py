from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


def test_shared_pixel_is_loaded_only_on_the_conversion_funnel():
    for name in ("inicio.html", "suscripcion.html", "renovar.html", "admin_erp.html"):
        assert './meta-pixel.js?v=1' in read(name)
    assert "1452913843369062" in read("meta-pixel.js")
    assert "2.97.43-meta-pixel-conversions" in read("admin_erp.html")
    assert "inicio-v37-meta-pixel-conversions" in read("inicio.html")
    assert "suscripcion-v4-meta-pixel-conversions" in read("suscripcion.html")
    assert "renovar-v2-meta-pixel-conversions" in read("renovar.html")


def test_purchase_requires_recent_approved_payment_and_is_idempotent():
    pixel = read("meta-pixel.js")
    assert "status !== 'approved'" in pixel
    assert "last_payment_approved_at" in pixel
    assert "PURCHASE_MAX_AGE_MS" in pixel
    assert "trackOnce('purchase:'" in pixel
    assert "transaction_id" in pixel


def test_checkout_and_privacy_contracts_are_explicit():
    for name in ("suscripcion.html", "renovar.html"):
        assert "InitiateCheckout" in read(name)
    privacy = read("privacidad.html")
    assert "píxel de Meta" in privacy
    assert "efectivamente acreditada" in privacy
    assert "no envía a Meta datos de tarjeta" in privacy
