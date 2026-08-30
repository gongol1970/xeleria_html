from pathlib import Path


HTML = Path(__file__).resolve().parents[1] / "admin_erp.html"


def test_tn_customer_import_is_a_separate_configuration_card():
    text = HTML.read_text(encoding="utf-8")

    assert 'id="tnCustomerImportCard"' in text
    assert "#inventoryImportCard{order:10}" in text
    assert "#tnCustomerImportCard{order:15}" in text
    assert "#xeliInitialConfigurationCard{order:20}" in text
    assert "Importar clientes de TN" in text


def test_tn_customer_import_calls_dedicated_endpoint_and_reports_skips():
    text = HTML.read_text(encoding="utf-8")

    assert "fetchJson('/admin/customers/import/tn',{method:'POST'})" in text
    assert "omitidos sin documento" in text
    assert "con documento procesados ${d.with_document||0}" in text
    assert "Los clientes sin documento se omiten" in text
    assert "No modifica ventas, publicaciones, stock ni inventario" in text


def test_customer_directory_paginates_and_shares_the_alphabet_in_all_views():
    text = HTML.read_text(encoding="utf-8")

    assert "function ensureCustomerNavigation(ch)" in text
    assert "function renderCustomerNavigation(ch,total,visible)" in text
    assert "'Ñ'" in text
    assert "&offset=${encodeURIComponent(page.offset)}" in text
    assert "&initial=${encodeURIComponent(page.initial)}" in text
    assert "Página ${current} de ${pages}" in text
    assert "loadCustomers('ML')" in text
    assert "loadCustomers('TN')" in text
    assert "loadCustomers('ALL')" in text
