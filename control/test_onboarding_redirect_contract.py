from pathlib import Path
import re
import unittest


HTML = (Path(__file__).resolve().parents[1] / "admin_erp.html").read_text(encoding="utf-8")
INDEX_HTML = (Path(__file__).resolve().parents[1] / "index.html").read_text(encoding="utf-8")
INICIO_HTML = (Path(__file__).resolve().parents[1] / "inicio.html").read_text(encoding="utf-8")


def function_body(name: str) -> str:
    match = re.search(rf"function {re.escape(name)}\([^)]*\)\{{", HTML)
    if not match:
        raise AssertionError(f"No se encontro {name}")
    start = match.start()
    next_function = HTML.find("\nfunction ", match.end())
    if next_function < 0:
        next_function = len(HTML)
    return HTML[start:next_function]


class OnboardingRedirectContract(unittest.TestCase):
    def test_public_plan_names_and_base_prices_are_explicit(self):
        for name in ("Gestión", "Profesional", "Senior", "Personalizado"):
            self.assertIn(f'<h3 class="planName">{name}</h3>', INICIO_HTML)

        for price in ("$16.000", "$35.000", "$62.000"):
            self.assertIn(price, INICIO_HTML)
        self.assertEqual(INICIO_HTML.count('<span class="planPriceTax">+ IVA</span>'), 3)
        self.assertNotIn('<span class="planPriceValue">A definir</span>', INICIO_HTML)

    def test_disconnected_tenant_stays_in_xeleria_to_connect_a_channel(self):
        body = function_body("gateIfNoConnectedChannels")

        self.assertIn("Conectá Mercado Libre o Tienda Nube para comenzar.", body)
        self.assertNotIn("redirectToInicio", body)
        self.assertIn("return false;", body)

    def test_login_redirect_never_exposes_tenant_id_in_query_string(self):
        body = function_body("redirectToInicio")

        self.assertNotIn("tenant_id", body)
        self.assertNotIn("tenantParam", body)
        self.assertIn("new URLSearchParams({next:next})", body)
        self.assertIn("if(reason)p.set('reason',reason)", body)

    def test_api_urls_keep_tenant_identity_out_of_the_query_string(self):
        self.assertIn("function url(path){return `${apiBase()}${path}`}", HTML)
        self.assertNotIn("tenant_id=${encodeURIComponent(tenantId())}", HTML)

    def test_legacy_tenant_query_is_removed_and_never_used_as_identity(self):
        self.assertIn("'tenant_id','tenant'", HTML)
        tenant_function = function_body("tenantId")
        self.assertNotIn("location.search", tenant_function)
        self.assertNotIn("URLSearchParams", tenant_function)

    def test_root_without_session_opens_clean_login_directly(self):
        self.assertIn("localStorage.getItem('xeleria_session_token')", INDEX_HTML)
        self.assertIn("sessionStorage.getItem('xeleria_session_token')", INDEX_HTML)
        self.assertIn("activeSession ? './admin_erp.html' : './inicio.html'", INDEX_HTML)

    def test_expired_session_returns_silently_without_red_message(self):
        expired_message = "Tu sesión venció. Elegí ML o TN para identificar tu comercio y volver a entrar."

        self.assertNotIn(expired_message, INICIO_HTML)
        self.assertNotIn("redirectToInicio('session_expired')", HTML)
        self.assertNotIn("redirectToInicio('session_invalid')", HTML)
        self.assertNotIn("setBusy(true,'Sesión expirada'", HTML)


if __name__ == "__main__":
    unittest.main()
