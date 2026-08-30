from pathlib import Path


HTML = Path(__file__).resolve().parents[1] / "admin_erp.html"


def test_customer_editor_offers_an_explicit_delete_action():
    text = HTML.read_text(encoding="utf-8")

    assert ">Eliminar cliente</button>" in text
    assert "async function deleteCustomer(ch,id)" in text
    assert "class=\"customerDeleteButton\"" in text


def test_customer_delete_is_confirmed_and_uses_the_dedicated_endpoint():
    text = HTML.read_text(encoding="utf-8")

    assert "¿Eliminar de XelerIA a ${name} (${document})?" in text
    assert "No borra el cliente en Mercado Libre o Tienda Nube" in text
    assert "ni elimina ventas o comprobantes" in text
    assert "fetchJson('/admin/customers/'+encodeURIComponent(id),{method:'DELETE'})" in text
